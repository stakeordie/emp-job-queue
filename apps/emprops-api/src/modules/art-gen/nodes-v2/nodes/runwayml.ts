import { StorageClient } from "../../../../clients/storage-client";
import { fetchBase64, fetchWithRetry } from "../../../../utils/fetch";
import { preprocessPrompt } from "../../../../utils/prompts";
import RunwayML from "@runwayml/sdk";
import { Context, ImageNode } from ".";

type Input = {
  promptImage: string;
  seed?: number;
  promptText: string;
  watermark: false;
  duration: 5 | 10;
  ratio: "1280:768" | "768:1280";
};

export class RunwayMLNode extends ImageNode {
  private client: RunwayML;

  name = "runwayml";

  constructor(protected storageClient: StorageClient) {
    super(storageClient);
    this.client = new RunwayML();
  }

  getMimeType() {
    return "video/mp4";
  }

  async execute(ctx: Context, payload: Input) {
    const promptText = await preprocessPrompt(payload.promptText, ctx);
    const seed = payload.seed || ctx.seed;
    const imageToVideo = await this.client.imageToVideo.create({
      model: "gen3a_turbo",
      ...payload,
      promptText,
      seed,
    });
    const taskId = imageToVideo.id;
    // Poll the task until it's complete
    let task: Awaited<ReturnType<typeof this.client.tasks.retrieve>>;
    do {
      // Wait for ten seconds before polling
      await new Promise((resolve) => setTimeout(resolve, 10000));
      task = await this.client.tasks.retrieve(taskId);
    } while (!["SUCCEEDED", "FAILED"].includes(task.status));
    if (task.status === "FAILED") {
      throw new Error(`Task ${taskId} failed: ${task.failure}`);
    }
    if (task.status !== "SUCCEEDED" || !task.output) {
      throw new Error(
        `Task ${taskId} is in an unexpected state: ${task.status}`,
      );
    }
    const base64 = await fetchBase64(task.output[0]);
    const path = this.getPath(ctx);
    await this.storeBase64({ path, base64 });
    await fetchWithRetry(`${process.env.CLOUDFRONT_URL}/${path}`);
    return {
      src: `${process.env.CLOUDFRONT_URL}/${path}`,
      mimeType: this.getMimeType(),
    };
  }
}
