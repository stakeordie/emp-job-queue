import { PuppeteerClient } from "../../../../clients/puppeteer-api";
import { StorageClient } from "../../../../clients/storage-client";
import { fetchWithRetry } from "../../../../utils/fetch";
import { Context, ImageNode } from ".";

export class P5ToVid extends ImageNode {
  name = "p52vid";

  private client: PuppeteerClient;

  constructor(storageClient: StorageClient, puppeteer: PuppeteerClient) {
    super(storageClient);
    this.client = puppeteer;
  }

  getMimeType(): string {
    return "video/mp4";
  }

  async execute(
    ctx: Context,
    payload: {
      code: string;
      duration?: number;
    },
  ) {
    const variablesNode = ctx.outputs.find((o) => o.nodeName === "variables");
    const variables: Record<string, string | number> =
      variablesNode?.nodeResponse?.data || {};
    const script = `
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
      ${payload.code}
    `;
    const image = await this.client.takeVideo(
      ctx.hash,
      script,
      payload.duration ? payload.duration * 1000 : undefined,
    );
    const path = this.getPath(ctx);
    await this.storeBase64({
      path,
      base64: image,
      mimeType: this.getMimeType(),
    });
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;
    await fetchWithRetry(src, { method: "HEAD" });
    return {
      src,
      mimeType: this.getMimeType(),
    };
  }
}
