import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../../../clients/storage-client";
import logger from "../../../../logger";
import { preprocessPrompt } from "../../../../utils/prompts";
import { PrismaClient, workflow as Workflow } from '@emp/database';
import * as mime from "mime-types";
import { VM } from "vm2";
import { Context, GeneratorNode } from "./js.js";

/**
 * Base class for workflow-based nodes that share common functionality
 * like prompt preprocessing, API key management, and input mapping
 */
export abstract class BaseWorkflowNode extends GeneratorNode {
  protected workflow: Workflow | null = null;
  protected workflowData: any;

  constructor(
    public name: string,
    protected storageClient: StorageClient,
    protected prisma: PrismaClientType,
  ) {
    super(storageClient);
  }

  /**
   * Initialize workflow data - to be called by subclasses
   */
  protected async initializeWorkflow(): Promise<void> {
    if (!this.workflow) {
      this.workflow = await this.prisma.workflow.findFirst({
        where: { name: this.name },
      });
      if (!this.workflow) {
        throw new Error(`Workflow ${this.name} not found`);
      }
    }
    this.workflowData = this.workflow.data as any;
  }

  /**
   * Preprocess all prompt_editor fields in the payload
   */
  protected async preprocessPrompts(ctx: Context, payload: any): Promise<any> {
    const resultPayload = JSON.parse(JSON.stringify(payload));

    if (!this.workflowData?.form?.fields) {
      return resultPayload;
    }

    const promptFields = this.workflowData.form.fields.filter(
      (field: any) => field.type === "prompt_editor",
    );

    for (const promptField of promptFields) {
      if (
        resultPayload[promptField.id] &&
        typeof resultPayload[promptField.id] === "string"
      ) {
        resultPayload[promptField.id] = await preprocessPrompt(
          resultPayload[promptField.id],
          ctx,
        );
        logger.debug(
          `${this.name} - Preprocessed prompt for ${promptField.id}`,
        );
      }
    }

    return resultPayload;
  }

  /**
   * Get API key from user storage or environment
   */
  protected async getApiKey(
    ctx: Context,
    keyName?: string,
  ): Promise<string | undefined> {
    // Check for user-specific API key
    const userApiKey = await this.prisma.api_key.findFirst({
      where: {
        workflow_name: this.name,
        user_id: ctx.userId,
      },
    });

    if (userApiKey) {
      return this.decryptApiKey(userApiKey.key);
    }

    // Fallback to environment variable
    const envVarName =
      keyName || `${this.name.toUpperCase().replace(/-/g, "_")}_API_KEY`;
    const apiKey = process.env[envVarName];

    if (!apiKey) {
      logger.warn(`No API key found for workflow ${this.name}`);
    }

    return apiKey;
  }

  /**
   * Decrypt API key using Azure Key Vault (KMS functionality moved to Azure)
   */
  protected async decryptApiKey(encryptedKey: string): Promise<string> {
    // Azure Key Vault functionality is handled elsewhere in the system
    // For now, return the key as-is
    logger.warn("API key decryption handled by Azure Key Vault system");
    return encryptedKey;
  }

  /**
   * Calculate credits cost using workflow credits_script
   */
  protected async calculateCost(input: any): Promise<number> {
    if (!this.workflowData?.credits_script) {
      return 0;
    }

    try {
      const vm = new VM({
        timeout: 5000,
        sandbox: {
          console: {
            log: (...args: any[]) => logger.debug("Credits script:", ...args),
            warn: (...args: any[]) => logger.warn("Credits script:", ...args),
            error: (...args: any[]) => logger.error("Credits script:", ...args),
          },
        },
      });

      const computeCost = vm.run(
        this.workflowData.credits_script + "; computeCost",
      );

      if (typeof computeCost !== "function") {
        throw new Error("Credits script must export a computeCost function");
      }

      const result = computeCost(input);

      if (typeof result === "number") {
        return result;
      } else if (result && typeof result.cost === "number") {
        return result.cost;
      } else {
        logger.warn(
          `Invalid cost result from credits script: ${JSON.stringify(result)}`,
        );
        return 0;
      }
    } catch (error) {
      logger.error(`Error executing credits script for ${this.name}:`, error);
      return 0;
    }
  }

  /**
   * Get output mime type from workflow configuration
   */
  protected getMimeType(): string {
    if (!this.workflow) {
      throw new Error(`Workflow not initialized for ${this.name}`);
    }
    if (!this.workflow.output_mime_type) {
      throw new Error(`Mime type not set for workflow ${this.name}`);
    }
    return this.workflow.output_mime_type;
  }

  /**
   * Map form inputs to target object using paths
   */
  protected async mapInputs(
    inputs: any[],
    sourcePayload: any,
    targetObject: any,
    ctx: Context,
  ): Promise<any> {
    logger.info(`🔧 MAPPING INPUTS:`, {
      inputsCount: inputs.length,
      sourcePayloadKeys: Object.keys(sourcePayload),
      inputs: inputs,
    });

    const result = JSON.parse(JSON.stringify(targetObject));

    for (const inputMapping of inputs) {
      const { id, pathJq, is_required } = inputMapping;

      logger.info(
        `🎯 PROCESSING INPUT: ${id} -> ${pathJq} (required: ${is_required})`,
      );
      logger.info(
        `📋 SOURCE PAYLOAD HAS ${id}:`,
        Object.prototype.hasOwnProperty.call(sourcePayload, id),
      );
      logger.info(`📋 SOURCE PAYLOAD[${id}]:`, sourcePayload[id]);

      if (!Object.prototype.hasOwnProperty.call(sourcePayload, id) || !pathJq) {
        logger.warn(`⚠️ SKIPPING INPUT ${id}: missing property or pathJq`);
        continue;
      }

      try {
        let value = sourcePayload[id];

        // Handle seed specially
        if (id === "seed" && !value) {
          value = ctx.seed;
        }

        // Skip optional inputs that are empty/null/undefined
        if (
          !is_required &&
          (value === null || value === undefined || value === "")
        ) {
          logger.info(`⏭️ SKIPPING OPTIONAL INPUT ${id}: empty value`);
          continue;
        }

        logger.info(`✅ MAPPING ${id}=${value} to ${pathJq}`);
        // Set value by path
        this.setValueByPath(result, pathJq, value);
        logger.info(`✅ MAPPED SUCCESSFULLY`);
      } catch (error) {
        logger.error(`Failed to map input ${id} to ${pathJq}:`, error);
        throw new Error(`Invalid input mapping for field ${id}`);
      }
    }

    return result;
  }

  /**
   * Helper method to set values by path
   */
  protected setValueByPath(obj: any, path: string, value: any): void {
    const pathParts = this.parsePath(path.replace(/^\./, ""));

    let current = obj;
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (part.isArray && part.index !== undefined) {
        if (!Array.isArray(current[part.key])) {
          current[part.key] = [];
        }
        // Ensure array is long enough
        while (current[part.key].length <= part.index) {
          current[part.key].push(null);
        }
        if (!current[part.key][part.index]) {
          current[part.key][part.index] = {};
        }
        current = current[part.key][part.index];
      } else {
        if (!current[part.key]) {
          current[part.key] = {};
        }
        current = current[part.key];
      }
    }

    const finalPart = pathParts[pathParts.length - 1];
    if (finalPart.isArray && finalPart.index !== undefined) {
      if (!Array.isArray(current[finalPart.key])) {
        current[finalPart.key] = [];
      }
      // Ensure array is long enough
      while (current[finalPart.key].length <= finalPart.index) {
        current[finalPart.key].push(null);
      }
      current[finalPart.key][finalPart.index] = value;
    } else {
      current[finalPart.key] = value;
    }
  }

  /**
   * Parse a path like "payload.images[0].url" into structured parts
   */
  private parsePath(
    path: string,
  ): Array<{ key: string; isArray: boolean; index?: number }> {
    const parts = [];
    const segments = path.split(".");

    for (const segment of segments) {
      const arrayMatch = segment.match(/^([^[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        parts.push({
          key: arrayMatch[1],
          isArray: true,
          index: parseInt(arrayMatch[2], 10),
        });
      } else {
        parts.push({
          key: segment,
          isArray: false,
        });
      }
    }

    return parts;
  }

  /**
   * Helper method to get values by path
   */
  protected getValueByPath(obj: any, path: string): any {
    const pathParts = path.replace(/^\./, "").split(".");

    let current = obj;
    for (const part of pathParts) {
      if (current == null || typeof current !== "object") {
        throw new Error(`Cannot access property '${part}' of ${current}`);
      }
      if (!(part in current)) {
        throw new Error(`Property '${part}' not found in object`);
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Get prefix path for file storage
   */
  protected getPrefix(ctx: Context): string {
    return `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}`;
  }

  /**
   * Get filename with extension
   */
  protected getFilename(): string {
    const mimeType = this.getMimeType();
    const extension = mime.extension(mimeType);
    return `${this.name}.${extension}`;
  }
}
