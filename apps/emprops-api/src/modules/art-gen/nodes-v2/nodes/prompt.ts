import { StorageClient } from "../../../../clients/storage-client";
import { fetchWithRetry } from "../../../../utils/fetch";
import { preprocessPrompt } from "../../../../utils/prompts";
import mime from "mime";
import { OpenAIApi } from "openai";
import { Context, GeneratorNode } from ".";

type Payload = {
  prompt: string;
  llmEnable?: boolean;
  llmPrompt?: string;
  llmTemperature?: number;
};

const defaultLlmPrompt =
  "Enhance this prompt for an AI image generation tool, just send back the result";

export class PromptNode extends GeneratorNode {
  name = "prompt";

  constructor(
    private openai: OpenAIApi,
    protected storageClient: StorageClient,
  ) {
    super(storageClient);
  }

  getMimeType() {
    return "text/plain";
  }

  getPath(ctx: Context) {
    const extension = mime.getExtension(this.getMimeType());
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/${this.name}.${extension}`;
  }

  async execute(ctx: Context, payload: Payload) {
    let result = await preprocessPrompt(payload.prompt, ctx);
    if (payload.llmEnable) {
      let llmPrompt = payload.llmPrompt ? payload.llmPrompt : defaultLlmPrompt;
      llmPrompt = await preprocessPrompt(llmPrompt, ctx);
      const completion = await this.openai.createChatCompletion({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: llmPrompt,
          },
          {
            role: "user",
            content: result,
          },
        ],
        temperature: payload.llmTemperature || 1,
      });
      const content = completion.data.choices[0].message?.content;
      result = content ? content : result;
    }
    const path = this.getPath(ctx);
    await this.storeTextFile({
      path,
      text: result,
      mimeType: "text/plain",
    });
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;
    await fetchWithRetry(src, { method: "HEAD" });
    return {
      src,
      data: result,
      mimeType: this.getMimeType(),
    };
  }
}
