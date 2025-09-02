import { PrismaClientType } from "@app/types/database";
import logger from "../../logger";
import { DefaultAzureCredential } from "@azure/identity";
import { CryptographyClient } from "@azure/keyvault-keys";

import { Request, Response } from "express";
import { z } from "zod";

const createApiKeySchema = z.object({
  alias: z.string().regex(/^[a-zA-Z0-9_]+$/),
  key: z.string().min(1),
  workflow_name: z.string().min(1),
});

export const listApiKeys =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const userId = req.headers["user_id"] as string;
      const apiKeys = await prisma.api_key.findMany({
        where: { user_id: userId },
      });
      const maskedApiKeys = apiKeys.map((apiKey) => ({
        ...apiKey,
        key: "********",
      }));
      return res.json({
        data: maskedApiKeys,
        error: null,
      });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const createApiKey =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const userId = req.headers["user_id"] as string;

      const validationResult = createApiKeySchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request body",
          details: validationResult.error,
        });
      }

      const { alias, key, workflow_name } = validationResult.data;

      const existingWorkflow = await prisma.workflow.findUnique({
        where: { name: workflow_name },
      });

      if (!existingWorkflow) {
        return res
          .status(400)
          .json({ data: null, error: "Workflow not found" });
      }

      const existingApiKey = await prisma.api_key.findFirst({
        where: { user_id: userId, OR: [{ alias }, { key }] },
      });

      if (existingApiKey != null) {
        return res
          .status(400)
          .json({ data: null, error: "API key already exists" });
      }

      // Encrypt API key with Azure Key Vault
      let base64Key: string;
      try {
        const credential = new DefaultAzureCredential();
        const keyVaultUrl = process.env.AZURE_KEY_VAULT_URL;
        const keyName = process.env.AZURE_KEY_VAULT_KEY_NAME;

        if (!keyVaultUrl || !keyName) {
          return res
            .status(500)
            .json({ data: null, error: "Azure Key Vault not configured" });
        }

        const cryptoClient = new CryptographyClient(
          `${keyVaultUrl}/keys/${keyName}`,
          credential,
        );

        const keyBuffer = Buffer.from(key, "utf-8");
        const encryptResult = await cryptoClient.encrypt("RSA-OAEP", keyBuffer);
        base64Key = Buffer.from(encryptResult.result).toString("base64");
      } catch (error) {
        logger.error("Failed to encrypt API key:", error);
        return res
          .status(500)
          .json({ data: null, error: "Failed to encrypt API key" });
      }

      const apiKey = await prisma.api_key.create({
        data: {
          alias,
          key: base64Key,
          user_id: userId,
          workflow_name,
        },
      });

      const result = {
        ...apiKey,
        key: "********",
      };

      return res.json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const deleteApiKey =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const userId = req.headers["user_id"] as string;

      if (!req.params.id) {
        return res
          .status(400)
          .json({ data: null, error: "API key ID is required" });
      }

      const apiKey = await prisma.api_key.findUnique({
        where: { id: req.params.id },
      });

      if (!apiKey || apiKey.user_id !== userId) {
        return res.status(404).json({ data: null, error: "API key not found" });
      }

      await prisma.api_key.delete({
        where: { id: req.params.id },
      });

      return res.status(204).json();
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };
