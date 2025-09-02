import { PrismaClientType } from "@app/types/database";
import RedisServerClient from "../../../../clients/redis-server-client";
import { StorageClient } from "../../../../clients/storage-client";
import logger from "../../../../logger";

import EventEmitter from "events";
import { Context, NodeOutput } from "./js.js";
import { BaseWorkflowNode } from "./base-workflow-node";

export class DirectJobNode extends BaseWorkflowNode {
  private redisServerClient: RedisServerClient;

  constructor(
    public name: string,
    private outputMimeType: string,
    prisma: PrismaClientType,
    storageClient: StorageClient,
    private eventEmitter?: EventEmitter,
  ) {
    super(name, storageClient, prisma);
    this.redisServerClient = RedisServerClient.getInstance(
      process.env.REDIS_SERVER_URL,
      process.env.REDIS_SERVER_TOKEN,
      this.eventEmitter,
    );
  }

  async execute(ctx: Context, rawPayload: any): Promise<NodeOutput> {
    // Initialize workflow data
    await this.initializeWorkflow();

    if (!this.workflowData.job) {
      throw new Error(`Job configuration missing for workflow ${this.name}`);
    }

    // Clone the job template to avoid modifying the original
    let jobRequest = JSON.parse(JSON.stringify(this.workflowData.job));

    // Inject system-generated path values and storage config (like ComfyWorkflowNode does)
    const prefix = this.getPrefix(ctx);
    const filename = this.getFilename();
    const storageConfig = {
      bucket: process.env.AZURE_STORAGE_CONTAINER || "emprops-production",
      provider: process.env.STORAGE_PROVIDER || "azure",
      cdnUrl: process.env.CLOUDFRONT_URL || "",
    };

    logger.debug(
      `DirectJobNode: Generated prefix: ${prefix}, filename: ${filename}`,
    );
    const enhancedPayload = {
      ...rawPayload,
      prefix,
      filename,
      ...storageConfig,
    };

    // Preprocess all prompts (handles rich text editor format and variables)
    const processedPayload = await this.preprocessPrompts(ctx, enhancedPayload);

    // Map form inputs to job structure
    if (this.workflowData.inputs && Array.isArray(this.workflowData.inputs)) {
      jobRequest = await this.mapInputs(
        this.workflowData.inputs,
        processedPayload,
        jobRequest,
        ctx,
      );
    }

    // Add context information to the payload (including prefix and filename)
    if (!jobRequest.payload) {
      jobRequest.payload = {};
    }
    jobRequest.payload.ctx = {
      prefix,
      filename,
      ...storageConfig,
      workflow_name: this.name,
      user_id: ctx.userId,
      generation_context: {
        uid: ctx.uid,
        gid: ctx.gid,
        sid: ctx.sid,
      },
      workflow_context: ctx.workflowContext,
    };

    // Inject API keys if needed
    await this.injectApiKeys(jobRequest, ctx);

    // Calculate cost if credits script exists
    try {
      await this.calculateCost(processedPayload);
    } catch (error) {
      logger.warn(`Cost calculation failed for ${this.name}:`, error);
    }

    // Submit job to Redis queue
    try {
      logger.info(`Submitting direct job for workflow ${this.name}`);
      logger.debug(
        `Workflow data:`,
        JSON.stringify(this.workflowData, null, 2),
      );
      logger.debug(
        `Job service_required:`,
        this.workflowData.job?.service_required,
      );

      // Add context information to job request
      logger.debug(`DirectJobNode: Added storage info to payload.ctx:`, {
        prefix,
        filename,
        ...storageConfig,
      });
      const enrichedJobRequest = {
        ...jobRequest,
        service_required: this.workflowData.job.service_required, // Use service_required from job config
        metadata: {
          workflow_name: this.name,
          user_id: ctx.userId,
          generation_context: {
            uid: ctx.uid,
            gid: ctx.gid,
            sid: ctx.sid,
          },
          workflow_context: ctx.workflowContext,
        },
      };

      logger.info(
        `DirectJob: Submitting enriched job request for ${this.name}:`,
        JSON.stringify(enrichedJobRequest, null, 2),
      );

      const result = await this.redisServerClient.submitJob(
        enrichedJobRequest,
        ctx,
      );

      // Check if job was successful
      if (!result.success && result.status !== "success") {
        throw new Error(`Job failed: ${result.error || "Unknown error"}`);
      }

      // For text content, extract and store as file
      if (this.outputMimeType === "text/plain") {
        const outputField = this.workflowData.job.output_field;
        let textContent = result;

        if (outputField) {
          try {
            // Handle common path mistakes - if path starts with "result." but result doesn't have that property,
            // try without the "result." prefix
            let pathToUse = outputField;
            if (outputField.startsWith("result.") && !result.result) {
              pathToUse = outputField.substring(7); // Remove "result." prefix
            }
            textContent = this.getValueByPath(result, pathToUse);
          } catch (error) {
            logger.warn(
              `Failed to extract text from output field ${outputField}, using full result`,
            );
            textContent = result;
          }
        }

        if (typeof textContent === "string") {
          const path = `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/${this.name}.txt`;
          const textBuffer = Buffer.from(textContent, "utf8");
          const src = await this.storageClient.storeFile(
            path,
            this.outputMimeType,
            textBuffer,
          );
          return {
            src: src,
            mimeType: this.outputMimeType,
          };
        }
      }

      // For image/file outputs: construct URL from known prefix/filename (like ComfyUI does)
      // We trust that the worker saved the file at the expected location
      const path = `${prefix}/${filename}`;
      const src = `${process.env.CLOUDFRONT_URL}/${path}`;

      return {
        src,
        mimeType: this.outputMimeType,
      };
    } catch (error) {
      logger.error(`Direct job submission failed for ${this.name}:`, error);
      throw new Error(
        `Job submission failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  private async injectApiKeys(jobRequest: any, ctx: Context): Promise<void> {
    // Look for API key fields in the job payload
    const payload = jobRequest.payload || {};

    // Check if there's an api_key field that needs to be populated
    if (
      Object.prototype.hasOwnProperty.call(payload, "api_key") &&
      !payload.api_key
    ) {
      const apiKey = await this.getApiKey(ctx);
      if (apiKey) {
        payload.api_key = apiKey;
      }
    }
  }

  // Cleanup method for proper resource management
  destroy() {
    if (this.eventEmitter) {
      RedisServerClient.removeEventEmitter(this.eventEmitter);
    }
  }
}
