import { PrismaClientType, Prisma } from "@app/types/database";
import RedisServerClient from "../clients/redis-server-client";
import logger from "../logger";
import { Context } from "../modules/art-gen/nodes-v2/nodes";
import { preprocessPrompts } from "../utils/prompts";
import { DefaultAzureCredential } from "@azure/identity";
import { CryptographyClient } from "@azure/keyvault-keys";

import EventEmitter from "events";
import { validate as isUUID } from "uuid";

export class ComfyWorkflowRunner {
  private redisServerClient: RedisServerClient;
  private cryptoClient: CryptographyClient | null = null;

  constructor(
    private prisma: PrismaClientType,
    private eventEmitter?: EventEmitter,
  ) {
    this.redisServerClient = RedisServerClient.getInstance(
      process.env.REDIS_SERVER_URL,
      process.env.REDIS_SERVER_TOKEN,
      this.eventEmitter,
    );
    this.initializeAzureKeyVault();
  }

  private async initializeAzureKeyVault() {
    if (
      !process.env.AZURE_KEY_VAULT_URL ||
      !process.env.AZURE_KEY_VAULT_KEY_NAME
    ) {
      logger.warn(
        "Azure Key Vault not configured. API key encryption will be unavailable.",
      );
      return;
    }

    try {
      const credential = new DefaultAzureCredential();
      const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;
      const keyName = process.env.AZURE_KEY_VAULT_KEY_NAME;

      // Create a CryptographyClient for the specific key
      this.cryptoClient = new CryptographyClient(
        `${keyVaultUrl}/keys/${keyName}`,
        credential,
      );

      logger.info("Azure Key Vault initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Azure Key Vault:", error);
    }
  }

  destroy() {
    if (this.eventEmitter) {
      RedisServerClient.removeEventEmitter(this.eventEmitter);
    }
  }

  async runWorkflow(
    workflow: Awaited<ReturnType<ComfyWorkflowRunner["getWorkflow"]>>,
    input: any,
    ctx?: Context,
    workflowContext?: {
      workflow_id: string;
      workflow_datetime: number;
      step_number: number;
      current_step: number;
      total_steps: number;
      workflow_priority: number;
    },
  ) {
    // I didn't know how to handle this.
    if (!workflow) return this.errorResponse("Workflow not found");
    if (!workflow.server) return this.errorResponse("Server not found");

    const workflowData = workflow.data as any;

    // Add seed to body if it's not present
    input.seed = input.seed || ctx?.seed;

    const workflowInputValidationResult = this.validateWorkflowInput(
      workflowData.inputs,
      input,
    );
    if (!workflowInputValidationResult.valid) {
      logger.error(
        "Workflow input has errors",
        workflowInputValidationResult.errors,
      );
      return this.errorResponse("Workflow input has errors", {
        details: workflowInputValidationResult.errors,
      });
    }

    const comfyPrompt = await this.resolveInputValues(workflowData, input, ctx);

    if (ctx) {
      // This function will mutate comfyPrompt
      await preprocessPrompts(workflowData, comfyPrompt, input, ctx);
    }

    try {
      console.log("Starting prompt...");
      await this.redisServerClient.runComfyPrompt(
        comfyPrompt,
        ctx,
        workflowContext,
      );
      return this.successResponse("success");
    } catch (error) {
      if (error instanceof Error) {
        return this.errorResponse(error.message);
      }
      return this.errorResponse("Unknown error");
    }
  }

  getWorkflow(idOrName: string): Promise<Prisma.workflowGetPayload<{ include: { server: true } }> | null> {
    let request: Record<string, string> = {
      name: idOrName,
    };
    if (isUUID(idOrName)) {
      request = {
        id: idOrName,
      };
    }
    return this.prisma.workflow.findFirst({
      where: {
        ...request,
      },
      include: { server: true },
    });
  }

  private successResponse(data: string) {
    return { data, error: null };
  }

  private errorResponse(error: string, details?: any) {
    return { data: null, error, details };
  }

  private validateWorkflowInput(workflowInput: any, input: any) {
    const errors = [];
    const nodeIds = Object.keys(workflowInput);
    for (const nodeId of nodeIds) {
      const fields = workflowInput[nodeId];
      const fieldNames = Object.keys(fields);
      for (const fieldName of fieldNames) {
        const field = fields[fieldName];
        // Skip validation for API key fields - they're resolved dynamically
        if (field.type === "api_key") continue;

        if (typeof input[field.value] === "undefined" && field.is_required) {
          errors.push(`${field.value} is required`);
        }
      }
    }
    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async resolveInputValues(
    workflowData: any,
    input: any,
    ctx?: Context,
  ) {
    const inputs = workflowData.inputs;
    const workflow = workflowData.workflow;
    const result = JSON.parse(JSON.stringify(workflow));

    const nodeIds = Object.keys(inputs);
    for (const nodeId of nodeIds) {
      const workflowNode = result[nodeId].inputs;
      const fields = Object.keys(workflowNode);
      for (const field of fields) {
        const fieldDef = inputs[nodeId][field];
        if (!fieldDef) continue;

        // Handle API key injection
        if (fieldDef.type === "api_key" && ctx) {
          try {
            const apiKey = await this.getApiKey(
              ctx,
              fieldDef.workflow_name || fieldDef.env_var_name,
            );
            workflowNode[field] = apiKey;
            continue;
          } catch (error) {
            logger.error(`Failed to get API key for field ${field}:`, error);
            // Continue with default value if API key fails
          }
        }

        const value = input[fieldDef.value];
        if (value) {
          workflowNode[field] = value;
        } else {
          workflowNode[field] = fieldDef.default;
        }
      }
    }

    return result;
  }

  private async getApiKey(ctx: Context, workflowName: string) {
    // First try to get user-specific API key
    const userApiKey = await this.prisma.api_key.findFirst({
      where: {
        workflow_name: workflowName,
        user_id: ctx.userId,
      },
    });

    if (userApiKey) {
      return this.decryptApiKey(userApiKey.key);
    }

    // Fallback to system environment variable
    const envVarName =
      workflowName.toUpperCase().replace(/-/g, "_") + "_API_KEY";
    const apiKey = process.env[envVarName];
    if (!apiKey) {
      throw new Error(
        `No API key found for workflow '${workflowName}'. Please add via /api-keys endpoint or set environment variable ${envVarName}`,
      );
    }

    return apiKey;
  }

  private async decryptApiKey(encryptedKey: string) {
    if (!this.cryptoClient) {
      throw new Error(
        "Azure Key Vault not configured. Cannot decrypt API keys.",
      );
    }

    try {
      const encryptedBuffer = Buffer.from(encryptedKey, "base64");
      const decryptResult = await this.cryptoClient.decrypt(
        "RSA-OAEP",
        encryptedBuffer,
      );
      return Buffer.from(decryptResult.result).toString("utf-8");
    } catch (error) {
      logger.error("Failed to decrypt API key:", error);
      throw new Error("Failed to decrypt API key");
    }
  }
}
