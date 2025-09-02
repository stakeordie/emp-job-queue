import logger from "../logger";
import { Context } from "../modules/art-gen/nodes-v2/nodes";
import EventEmitter from "events";
import { v4 as uuid } from "uuid";
import { WebSocket } from "ws";

type WorkflowPayload = any;

type ParsedMessage = {
  type: string;
  timestamp: number;
  job_id: string;
  worker_id: string;
  result: any;
  progress: number;
};

type JobContext = {
  jobId: string;
  context?: Context;
  resolve: (value: any) => void;
  reject: (error: any) => void;
};

class RedisServerClient {
  private static instance: RedisServerClient | null = null;
  private static eventEmitters: Map<string, EventEmitter> = new Map();

  private ws: WebSocket | null = null;
  private wsPromise: Promise<WebSocket> | null = null;
  private activeJobs: Map<string, JobContext> = new Map();

  private constructor(
    private url: string,
    private token: string,
    private eventEmitter?: EventEmitter,
  ) {
    const clientId = process.env.REDIS_SERVER_ID || "client-id";
    logger.info(
      `RedisServerClient: Singleton instance initialized with URL: ${url}, Token: ${
        token ? "[REDACTED]" : "undefined"
      }, Client ID: ${clientId}`,
    );
  }

  static getInstance(
    url?: string,
    token?: string,
    eventEmitter?: EventEmitter,
  ): RedisServerClient {
    if (!RedisServerClient.instance) {
      if (!url || !token) {
        throw new Error(
          "URL and token required for first RedisServerClient initialization",
        );
      }
      RedisServerClient.instance = new RedisServerClient(
        url,
        token,
        eventEmitter,
      );
    }

    // Register additional event emitters for multi-instance support
    if (
      eventEmitter &&
      eventEmitter !== RedisServerClient.instance.eventEmitter
    ) {
      const emitterId = Math.random().toString(36);
      RedisServerClient.eventEmitters.set(emitterId, eventEmitter);
      logger.info(
        `RedisServerClient: Registered additional event emitter (${emitterId})`,
      );
    }

    return RedisServerClient.instance;
  }

  static removeEventEmitter(emitter: EventEmitter) {
    for (const [id, em] of RedisServerClient.eventEmitters.entries()) {
      if (em === emitter) {
        RedisServerClient.eventEmitters.delete(id);
        logger.info(`RedisServerClient: Removed event emitter (${id})`);
        break;
      }
    }
  }

  private emitToAllEmitters(event: string, data: any) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, data);
    }

    RedisServerClient.eventEmitters.forEach((emitter) => {
      emitter.emit(event, data);
    });
  }

  private generateJobId(): string {
    const id = uuid();
    return `job-test-${id}`;
  }

  private getUrl() {
    const clientId = process.env.REDIS_SERVER_ID || "client-id";
    const fullUrl = `${this.url}/ws/client/${clientId}?token=${this.token}`;
    logger.info(`RedisServerClient: Connecting to URL: ${fullUrl}`);
    return fullUrl;
  }

  private async getWebSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    if (this.wsPromise) {
      return this.wsPromise;
    }

    this.wsPromise = new Promise<WebSocket>((resolve, reject) => {
      const url = this.getUrl();
      logger.info(
        `RedisServerClient: Creating WebSocket connection to: ${url}`,
      );
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        logger.info(
          "RedisServerClient: WebSocket connection opened successfully",
        );
        resolve(this.ws as WebSocket);
      });

      this.ws.on("error", (error) => {
        logger.error("RedisServerClient: WebSocket connection error:", error);
        this.ws = null;
        this.wsPromise = null;
        reject(error);
      });

      this.ws.on("close", (code, reason) => {
        logger.warn(
          `RedisServerClient: WebSocket connection closed. Code: ${code}, Reason: ${reason}`,
        );
        this.ws = null;
        this.wsPromise = null;
      });

      this.ws.on("message", async (message: string | Buffer) => {
        if (!(message instanceof Buffer)) return;

        const parsedMessage = JSON.parse(message.toString()) as ParsedMessage;

        // Suppress received message logs - only log sending
        // logger.info("RedisServerClient: Received message from redis server", parsedMessage);

        const jobId = parsedMessage.job_id;
        const jobContext = this.activeJobs.get(jobId);

        if (parsedMessage.type === "update_job_progress" && jobContext) {
          this.emitToAllEmitters("node_progress", {
            context: jobContext.context,
            value: parsedMessage.progress,
          });
        }

        if (parsedMessage.type === "ping") {
          // Respond to ping with pong to keep connection alive
          const pongResponse = {
            type: "pong",
            client_id: process.env.REDIS_SERVER_ID || "client-id",
            timestamp: Date.now(),
          };
          this.ws?.send(JSON.stringify(pongResponse));
          logger.info("RedisServerClient: Sent pong response to server ping");
          return;
        }

        if (parsedMessage.type === "complete_job" && jobContext) {
          const { result } = parsedMessage;

          if (result.status === "failed") {
            jobContext.reject(result.error);
          } else {
            jobContext.resolve(result);
          }

          // Remove the job from active jobs
          this.activeJobs.delete(jobId);
        }
      });
    });

    return this.wsPromise;
  }

  async runAuto1111Prompt(
    payload: any,
    endpoint: string,
    context?: Context,
    workflowContext?: {
      workflow_id: string;
      workflow_datetime: number;
      step_number: number;
      current_step: number;
      total_steps: number;
      workflow_priority: number;
    },
  ): Promise<any> {
    // eslint-disable-next-line
    return new Promise(async (resolve, reject) => {
      try {
        const jobId = this.generateJobId();

        // Store job context
        this.activeJobs.set(jobId, {
          jobId,
          context,
          resolve,
          reject,
        });

        const ws = await this.getWebSocket();

        let init_images = [] as string[];
        if (payload.image && endpoint === "img2img") {
          init_images = [payload.image];
          delete payload.image;
        }

        const convertedPayload = {
          ...payload,
          init_images,
        };

        logger.debug("Run Auto1111 prompt", convertedPayload);
        logger.debug("Endpoint", endpoint);
        logger.debug("Context", context);

        const request = {
          job_type: "a1111",
          message_id: jobId,
          service_required: "a1111",
          payload: {
            method: "POST",
            endpoint,
            payload: convertedPayload,
          },
          priority: workflowContext?.workflow_priority ?? 5,
          timestamp: new Date().getTime(),
          type: "submit_job",
          ...(workflowContext && {
            workflow_id: workflowContext.workflow_id,
            workflow_datetime: workflowContext.workflow_datetime,
            step_number: workflowContext.current_step,
            current_step: workflowContext.current_step,
            total_steps: workflowContext.total_steps,
            workflow_priority: workflowContext.workflow_priority,
          }),
        };
        logger.info("SENDING Auto1111 Job:", JSON.stringify(request, null, 2));
        ws.send(JSON.stringify(request));
      } catch (error) {
        reject(error);
      }
    });
  }

  async runComfyPrompt(
    workflowPayload: WorkflowPayload,
    context?: Context,
    workflowContext?: {
      workflow_id: string;
      workflow_datetime: number;
      step_number: number;
      current_step: number;
      total_steps: number;
      workflow_priority: number;
    },
  ): Promise<void> {
    // eslint-disable-next-line
    return new Promise(async (resolve, reject) => {
      try {
        const jobId = this.generateJobId();
        logger.info(
          `RedisServerClient: Starting ComfyUI job with ID: ${jobId}`,
        );

        // Store job context
        this.activeJobs.set(jobId, {
          jobId,
          context,
          resolve,
          reject,
        });

        logger.info(
          "RedisServerClient: Attempting to get WebSocket connection...",
        );
        const ws = await this.getWebSocket();
        logger.info(
          "RedisServerClient: WebSocket connection obtained successfully",
        );

        const request = {
          job_type: "comfyui",
          message_id: jobId,
          service_required: "comfyui",
          payload: workflowPayload,
          priority: workflowContext?.workflow_priority ?? 5,
          timestamp: new Date().getTime(),
          type: "submit_job",
          ...(workflowContext && {
            workflow_id: workflowContext.workflow_id,
            workflow_datetime: workflowContext.workflow_datetime,
            step_number: workflowContext.current_step,
            current_step: workflowContext.current_step,
            total_steps: workflowContext.total_steps,
            workflow_priority: workflowContext.workflow_priority,
          }),
        };
        logger.info("SENDING ComfyUI Job:", JSON.stringify(request, null, 2));
        ws.send(JSON.stringify(request));
        logger.info("RedisServerClient: Job request sent successfully");
      } catch (error) {
        logger.error("RedisServerClient: Error in runComfyPrompt:", error);
        reject(error);
      }
    });
  }

  async submitJob(jobRequest: any, context?: Context): Promise<any> {
    // eslint-disable-next-line
    return new Promise(async (resolve, reject) => {
      try {
        const jobId = this.generateJobId();
        logger.info(`RedisServerClient: Starting direct job with ID: ${jobId}`);

        // Store job context
        this.activeJobs.set(jobId, {
          jobId,
          context,
          resolve,
          reject,
        });

        logger.info(
          "RedisServerClient: Attempting to get WebSocket connection...",
        );
        const ws = await this.getWebSocket();
        logger.info(
          "RedisServerClient: WebSocket connection obtained successfully",
        );

        // Validate that service_required is provided
        if (!jobRequest.service_required) {
          throw new Error("service_required is required in job configuration");
        }

        // Clean payload by removing job_type field that shouldn't be in payload
        const cleanPayload = { ...jobRequest.payload };
        delete cleanPayload.job_type;

        // Extract workflow context from nested metadata structure (normalize like ComfyUI)
        const workflowContext = jobRequest.metadata?.workflow_context;

        // Use flat structure for submit_job message (no data wrapper)
        const request = {
          message_id: jobId,
          timestamp: new Date().getTime(),
          type: "submit_job", // Always use submit_job for WebSocket message type
          service_required: jobRequest.service_required, // For worker matching
          job_type: jobRequest.service_required, // Job categorization
          payload: cleanPayload, // Clean job payload without job_type
          priority: jobRequest.priority || 5,
          output_field: jobRequest.output_field,
          requirements: jobRequest.requirements || {},
          metadata: jobRequest.metadata || {},
          max_retries: 3,

          // ADD TOP-LEVEL WORKFLOW METADATA (normalize like ComfyUI format)
          ...(workflowContext && {
            workflow_id: workflowContext.workflow_id,
            workflow_datetime: workflowContext.workflow_datetime,
            step_number: workflowContext.step_number,
            current_step: workflowContext.current_step,
            total_steps: workflowContext.total_steps,
            workflow_priority: workflowContext.workflow_priority,
          }),
        };

        logger.info("SENDING Direct Job:", JSON.stringify(request, null, 2));
        ws.send(JSON.stringify(request));
        logger.info("RedisServerClient: Direct job request sent successfully");
      } catch (error) {
        logger.error("RedisServerClient: Error in submitJob:", error);
        reject(error);
      }
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionStats() {
    return {
      activeJobs: this.activeJobs.size,
      connectionState: this.ws?.readyState || "CLOSED",
      registeredEmitters:
        RedisServerClient.eventEmitters.size + (this.eventEmitter ? 1 : 0),
      isSingleton: true,
    };
  }
}

export default RedisServerClient;
