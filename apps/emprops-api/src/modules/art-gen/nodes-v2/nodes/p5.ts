import { PuppeteerClient } from "../../../../clients/puppeteer-api";
import { StorageClient } from "../../../../clients/storage-client";
import { fetchWithRetry } from "../../../../utils/fetch";
import { Context, ImageNode } from "./js.js";

export class P5JsNode extends ImageNode {
  name = "p5";

  private client: PuppeteerClient;

  constructor(storageClient: StorageClient, puppeteer: PuppeteerClient) {
    super(storageClient);
    this.client = puppeteer;
  }

  getPath(ctx: Context) {
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/${this.name}.png`;
  }

  async execute(
    ctx: Context,
    payload: {
      code: string;
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
    const image = await this.client.takeScreenshot(script);
    const path = this.getPath(ctx);
    await this.storeBase64({
      path,
      base64: image,
      mimeType: "image/png",
    });
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;
    await fetchWithRetry(src, { method: "HEAD" });
    return {
      src,
      mimeType: "image/png",
    };
  }
}
