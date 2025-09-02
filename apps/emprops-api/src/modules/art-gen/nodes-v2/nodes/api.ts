import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../../../clients/storage-client";
import logger from "../../../../logger";
import { fetchBase64, fetchWithRetry } from "../../../../utils/fetch";
import { preprocessPrompt } from "../../../../utils/prompts";
import { PrismaClient, workflow as Workflow } from '@emp/database';
import * as jq from "node-jq";
import { VM } from "vm2";
import { Context, ImageNode, ImageNodeOutput } from ".";

type BaseConfig = {
  url: string;
  method: string;
  headers: Record<string, string>;
  successResponseCode: number | number[];
};

type PollingConfig = {
  fetchType: "polling";
  polling: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    params?: Record<string, { exprJq: string }>;
    continueWhenExpr: string;
    stopWhenExpr: string;
    outputExprJq: string;
    successResponseCode: number;
    timeout: number;
  };
} & BaseConfig;

type WaitConfig = {
  fetchType: "wait";
  wait: {
    outputExprJq: string;
  };
} & BaseConfig;

type Config = PollingConfig | WaitConfig;

export class ThirdPartyApiComponent extends ImageNode {
  constructor(
    public name: string,
    private workflow: Workflow,
    protected storageClient: StorageClient,
    private prisma: PrismaClientType,
  ) {
    super(storageClient);
  }

  async execute(ctx: Context, rawPayload: any): Promise<ImageNodeOutput> {
    const workflowData = this.workflow.data as any;
    const config = workflowData.api as Config;
    const basePayload = await this.preprocessPrompts(
      workflowData,
      ctx,
      rawPayload,
    );
    const finalPayload = await this.getBasePayload(
      ctx,
      workflowData.body,
      workflowData.inputs,
      basePayload,
    );
    let responseUrl: string | undefined;
    if (config.fetchType === "polling") {
      responseUrl = await this.doPollingFetch(finalPayload, config, ctx);
    } else if (config.fetchType === "wait") {
      responseUrl = await this.doWaitFetch(finalPayload, config, ctx);
    }
    if (!responseUrl) {
      throw new Error(`Failed to fetch response from underlying API`);
    }
    await fetchWithRetry(responseUrl, { method: "GET" });
    const base64 = await fetchBase64(responseUrl);
    const path = this.getPath(ctx);
    await this.storeBase64({
      path,
      base64,
    });
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;
    await fetchWithRetry(src, { method: "HEAD" });
    return { src: src, mimeType: this.getMimeType() };
  }

  async getBasePayload(
    ctx: Context,
    body: any,
    inputs: any[],
    payload: any,
  ): Promise<Body> {
    let updatedBody = { ...body };

    for (const input of inputs) {
      const { id, pathJq } = input;

      if (id === "seed") {
        const filter = `${pathJq} = ${JSON.stringify(
          payload.seed || ctx.seed,
        )}`;
        updatedBody = await jq.run(filter, updatedBody, {
          input: "json",
          output: "json",
        });
        continue;
      }

      // eslint-disable-next-line no-prototype-builtins
      if (payload.hasOwnProperty(id)) {
        const value = payload[id];

        // Use jq to update the body
        const filter = `${pathJq} = ${JSON.stringify(value)}`;
        const result = await jq.run(filter, updatedBody, {
          input: "json",
          output: "json",
        });

        updatedBody = result;
      }
    }

    return updatedBody;
  }

  async getSecurityHeaders(ctx: Context, config: Config) {
    const headers = { ...config.headers };
    const authorizationHeader = headers["Authorization"];
    if (authorizationHeader) {
      const envVarName = authorizationHeader.match(/{{(.*?)}}/)?.[1];
      if (!envVarName) throw new Error("Authorization header not set");
      const apiKey = await this.getApiKey(ctx, envVarName);
      headers["Authorization"] = authorizationHeader.replace(
        `{{${envVarName}}}`,
        apiKey,
      );
    }
    return headers;
  }

  async getApiKey(ctx: Context, envVarName: string) {
    const userApiKey = await this.prisma.api_key.findFirst({
      where: {
        workflow_name: this.workflow.name,
        user_id: ctx.userId,
      },
    });
    if (userApiKey) return userApiKey.key;
    const apiKey = process.env[envVarName];
    if (!apiKey) throw new Error(`Environment variable ${envVarName} not set`);
    return apiKey;
  }


  async preprocessPrompts(workflowData: any, ctx: Context, body: any) {
    const resultBody = JSON.parse(JSON.stringify(body));
    const allFields = workflowData.form.fields;
    const promptFields = allFields.filter(
      (field: any) => field.type === "prompt_editor",
    );
    for (const promptField of promptFields) {
      resultBody[promptField.id] = await preprocessPrompt(
        body[promptField.id],
        ctx,
      );
    }
    return resultBody;
  }

  validateResponse(config: Config, response: Response) {
    if (
      Array.isArray(config.successResponseCode)
        ? !config.successResponseCode.includes(response.status)
        : response.status !== config.successResponseCode
    ) {
      throw new Error(
        `Failed to fetch underlying API: Response code ${response.status}`,
      );
    }
  }

  async doWaitFetch(payload: any, config: WaitConfig, ctx: Context) {
    const body = JSON.stringify(payload);
    const securityHeaders = await this.getSecurityHeaders(ctx, config);
    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        ...config.headers,
        ...securityHeaders,
      },
      body,
    });
    this.validateResponse(config, response);
    const json = await response.json();
    return (await jq.run(config.wait.outputExprJq, json, {
      input: "json",
      raw: true,
    })) as string;
  }

  async doPollingFetch(payload: any, config: PollingConfig, ctx: Context) {
    const body = JSON.stringify(payload);
    const securityHeaders = await this.getSecurityHeaders(ctx, config);
    const headers = {
      ...config.headers,
      ...securityHeaders,
    };
    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body,
    });
    this.validateResponse(config, response);
    const json = await response.json();
    logger.info("Fetched initial response", JSON.stringify(json, null, 2));
    const params = await this.resolveParamsValues(json, config);
    const url = await this.resolvePollingURL(params, config);
    let shouldContinuePolling = false;
    let pollingJson;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const pollingResponse = await fetch(url, {
        method: config.polling.method,
        headers: {
          ...(config.polling.headers || {}),
          ...headers,
        },
      });
      if (pollingResponse.status !== config.polling.successResponseCode) {
        throw new Error(`Failed to fetch ${url}`);
      }
      pollingJson = await pollingResponse.json();
      logger.info(
        "Fetched polling response",
        JSON.stringify(pollingJson, null, 2),
      );
      const vm = new VM({
        timeout: 5000,
        sandbox: {
          data: pollingJson,
        },
      });
      const stop = vm.run(config.polling.stopWhenExpr);
      if (stop) {
        throw new Error("Polling stopped");
      }
      shouldContinuePolling = vm.run(config.polling.continueWhenExpr);
    } while (shouldContinuePolling);

    return (await jq.run(config.polling.outputExprJq, pollingJson, {
      input: "json",
      raw: true,
    })) as string;
  }

  async resolveParamsValues(json: any, config: PollingConfig) {
    if (!config.polling.params) return {};
    const keys = Object.keys(config.polling.params);
    const params = {} as Record<string, any>;
    for (const key of keys) {
      const expr = config.polling.params[key].exprJq;
      const value = await jq.run(expr, json, {
        input: "json",
        raw: true,
      });
      params[key] = value;
    }
    return params;
  }

  async resolvePollingURL(params: Record<string, any>, config: PollingConfig) {
    let url = config.polling.url;
    const keys = Object.keys(params);
    for (const key of keys) {
      url = url.replace(`{${key}}`, params[key]);
    }
    return url;
  }

  getMimeType() {
    if (!this.workflow.output_mime_type) throw new Error("Mime type not set");
    return this.workflow.output_mime_type;
  }
}
