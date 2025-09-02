import logger from "../logger";
import { Context } from "../modules/art-gen/nodes-v2/nodes";
import EventEmitter from "events";
import { WebSocket } from "ws";

type PromptRequest = {
  prompt: any;
  context?: Context;
};

class ComfyClient {
  constructor(
    private hostname: string,
    private eventEmitter?: EventEmitter,
  ) {}

  private getCredentials() {
    const username = process.env.STABLE_DIFFUSION_USERNAME;
    const password = process.env.STABLE_DIFFUSION_PASSWORD;
    return Buffer.from(`${username}:${password}`).toString("base64");
  }

  async runPrompt(prompt: PromptRequest, context?: Context): Promise<void> {
    logger.debug(`Running prompt on comfy server: ${this.hostname}`);
    const ws = new WebSocket(`wss://${this.hostname}/ws`, {
      headers: {
        Authorization: `Basic ${this.getCredentials()}`,
        "X-User-Id": context?.userId,
      },
    });
    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "prompt", data: { prompt } }));
      });
      ws.on("message", async (message: string | Buffer) => {
        if (message instanceof Buffer) {
          const parsedMessage = JSON.parse(message.toString());
          if (parsedMessage.type !== "crystools.monitor") {
            logger.debug("Received message from comfy server", parsedMessage);
          }
          if (
            parsedMessage.type === "progress" &&
            this.eventEmitter &&
            context
          ) {
            const { value, max } = parsedMessage.data;
            const percent = Math.round((value / max) * 100);
            this.eventEmitter.emit("node_progress", {
              context,
              value: percent,
            });
          }
          if (parsedMessage.type === "error") {
            ws.close();
            reject(new Error(parsedMessage.data.error.message));
          }
          if (parsedMessage.type === "executing" && !parsedMessage.data.node) {
            ws.close();
            resolve();
          }
        }
      });
    });
  }
}

export default ComfyClient;
