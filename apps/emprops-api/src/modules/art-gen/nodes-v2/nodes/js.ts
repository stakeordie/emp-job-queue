import { PuppeteerClient } from "../../../../clients/puppeteer-api";
import { StorageClient } from "../../../../clients/storage-client";
import { fetchWithRetry } from "../../../../utils/fetch";
import { NodeStepOutput } from "..";
import * as crypto from "crypto";
import * as mime from "mime-types";

export type ImageNodeOutput = {
  src: string;
  mimeType: string;
  altSrc?: string;
  altMimeType?: string;
};

type StoreBase64ImageRequest = {
  path?: string;
  base64: string;
  mimeType?: string;
};

type StoreTextFileRequest = {
  path: string;
  text: string;
  mimeType: string;
};

export type Context = {
  uid: string;
  gid: number;
  sid: number;
  userId: string;
  hash: string;
  seed: number;
  outputs: NodeStepOutput[];
  currentNodeName: string;
  workflowContext?: {
    workflow_id: string;
    workflow_datetime: number;
    step_number: number;
    current_step: number;
    total_steps: number;
    workflow_priority: number;
  };
};

type GenericNodeOutput = {
  data: any;
  mimeType: string | null;
};

export type NodeOutput = ImageNodeOutput | GenericNodeOutput;

export abstract class GeneratorNode {
  public name = "";

  constructor(protected storageClient: StorageClient) {}

  abstract execute(ctx: Context, payload: any): Promise<NodeOutput>;

  protected async storeTextFile(request: StoreTextFileRequest) {
    await this.storageClient.storeFile(
      request.path,
      request.mimeType,
      Buffer.from(request.text),
    );
  }
}

export abstract class ImageNode extends GeneratorNode {
  protected constructor(protected storageClient: StorageClient) {
    super(storageClient);
  }

  abstract execute(ctx: Context, payload: any): Promise<ImageNodeOutput>;

  protected getMimeType() {
    return "image/png";
  }

  getPath(ctx: Context) {
    const extension = mime.extension(this.getMimeType());
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/${this.name}.${extension}`;
  }

  getPrefix(ctx: Context) {
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}`;
  }

  getFilename() {
    const extension = mime.extension(this.getMimeType());
    return `${this.name}.${extension}`;
  }

  protected async storeBase64(request: StoreBase64ImageRequest) {
    if (!request.path) {
      throw new Error("Path is required");
    }
    await this.storageClient.storeFile(
      request.path,
      this.getMimeType(),
      Buffer.from(request.base64, "base64"),
    );
  }

  protected deterministicHash(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex");
  }
}

export class JsNode extends ImageNode {
  name = "js";

  private client: PuppeteerClient;

  constructor(storageClient: StorageClient, puppeteer: PuppeteerClient) {
    super(storageClient);
    this.client = puppeteer;
  }
  getCustomPath(ctx: Context, extension: string) {
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/${this.name}.${extension}`;
  }

  buildHTMLFile(ctx: Context, payload: any) {
    const variablesNode = ctx.outputs.find((o) => o.nodeName === "variables");
    const variables: Record<string, string | number> =
      variablesNode?.nodeResponse?.data || {};
    const values = ctx.outputs
      .map((o) => o.id)
      .map((id) => `${id}: '${payload[id]}'`)
      .join(", ");
    const script = `
      const outputs = {
        ${values}
      };
      const hash = "${ctx.hash}";
      const variables = ${JSON.stringify(variables)};
      function getVariable(name) {
        return variables[name];
      }
      const components = ${JSON.stringify(ctx.outputs)};
      function getComponentOutput(name) {
        const result = components.find((component) => component.nodeAlias === name);
        if (!result) return;
        return result.nodeResponse.src;
      }
      ${payload.script}
    `;
    return `${payload.body
      .replace("%style%", `<style>${payload.style}</style>`)
      .replace("%script%", `<script>${script}</script>`)}`.trim();
  }

  async execute(ctx: Context, payload: any) {
    // Generate HTML
    const html = this.buildHTMLFile(ctx, payload);
    const htmlPath = this.getCustomPath(ctx, "html");
    await this.storeTextFile({
      path: htmlPath,
      text: html,
      mimeType: "text/html",
    });
    const htmlSrc = `${process.env.CLOUDFRONT_URL}/${htmlPath}`;
    await fetchWithRetry(htmlSrc, { method: "HEAD" });

    // Generate image/png of HTML
    const image = await this.client.executeCode(htmlSrc, "image/png");
    const imagePath = this.getCustomPath(ctx, "png");
    await this.storeBase64({
      path: imagePath,
      base64: image,
      mimeType: "image/png",
    });
    const imageSrc = `${process.env.CLOUDFRONT_URL}/${imagePath}`;
    await fetchWithRetry(imageSrc, { method: "HEAD" });

    if (payload.outputMimetype === "text/html") {
      return {
        src: htmlSrc,
        mimeType: "text/html",
        altSrc: imageSrc,
        altMimeType: "image/png",
      };
    } else {
      return {
        src: imageSrc,
        mimeType: "image/png",
      };
    }
  }
}
