import { PrismaClientType } from "@app/types/database";
import { buildDefaultPagedQuery } from "../../utils/queries";

import { Request, Response } from "express";
import { z } from "zod";

// GET /models
export function getModels(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { auth_only, search } = req.query;

      const where: any = {};

      if (auth_only === "true") {
        where.isAuthReq = true;
      }

      if (search) {
        where.name = {
          contains: search as string,
          mode: "insensitive",
        };
      }

      const query = buildDefaultPagedQuery(req);
      const models = await prisma.model.findMany({
        ...query,
        where: {
          ...query.where,
          ...where,
        },
        orderBy:
          query.orderBy && Object.keys(query.orderBy).length > 0
            ? query.orderBy
            : { name: "asc" },
      });

      res.json({
        data: models,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

// GET /models/:id
export function getModel(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const model = await prisma.model.findUnique({
        where: { id },
        include: {
          workflowModels: {
            include: {
              workflow: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                },
              },
            },
          },
        },
      });

      if (!model) {
        return res.status(404).json({
          data: null,
          error: "Model not found",
        });
      }

      res.json({
        data: model,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

// GET /models/name/:name
export function getModelByName(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const model = await prisma.model.findUnique({
        where: { name },
        include: {
          workflowModels: {
            include: {
              workflow: {
                select: {
                  id: true,
                  name: true,
                  label: true,
                },
              },
            },
          },
        },
      });

      if (!model) {
        return res.status(404).json({
          data: null,
          error: `Model '${name}' not found`,
        });
      }

      res.json({
        data: model,
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

const createModelSchema = z.object({
  name: z.string().min(1),
  downloadUrl: z.string().url(),
  saveTo: z.string().min(1),
  description: z.string().optional(),
  fileSize: z.string().optional(),
  hash: z.string().optional(),
  isAuthReq: z.boolean().default(false),
  authEnvVar: z.string().optional(),
});

// POST /models
export function createModel(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const validationResult = createModelSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      // Validate auth configuration
      if (data.isAuthReq && !data.authEnvVar) {
        return res.status(400).json({
          data: null,
          error: "auth_env_var is required when is_auth_req is true",
        });
      }

      const model = await prisma.model.create({
        data: {
          name: data.name,
          downloadUrl: data.downloadUrl,
          saveTo: data.saveTo,
          description: data.description,
          fileSize: data.fileSize,
          hash: data.hash,
          isAuthReq: data.isAuthReq,
          authEnvVar: data.authEnvVar,
        },
      });

      res.status(201).json({
        data: model,
        error: null,
      });
    } catch (error: any) {
      if (error.code === "P2002" && error.meta?.target?.includes("name")) {
        res.status(409).json({
          data: null,
          error: "Model name already exists",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "An error occurred";
        res.status(500).json({
          data: null,
          error: message,
        });
      }
    }
  };
}

const updateModelSchema = z.object({
  name: z.string().min(1).optional(),
  downloadUrl: z.string().url().optional(),
  saveTo: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  fileSize: z.string().nullable().optional(),
  hash: z.string().nullable().optional(),
  status: z.enum(["available", "downloading", "failed"]).optional(),
  isAuthReq: z.boolean().optional(),
  authEnvVar: z.string().nullable().optional(),
});

// PUT /models/:id
export function updateModel(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validationResult = updateModelSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const data = validationResult.data;

      // Validate auth configuration
      if (data.isAuthReq === true && !data.authEnvVar) {
        return res.status(400).json({
          data: null,
          error: "auth_env_var is required when is_auth_req is true",
        });
      }

      const model = await prisma.model.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      res.json({
        data: model,
        error: null,
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        res.status(404).json({
          data: null,
          error: "Model not found",
        });
      } else if (
        error.code === "P2002" &&
        error.meta?.target?.includes("name")
      ) {
        res.status(409).json({
          data: null,
          error: "Model name already exists",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "An error occurred";
        res.status(500).json({
          data: null,
          error: message,
        });
      }
    }
  };
}

// DELETE /models/:id
export function deleteModel(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Check if model is used by any workflows
      const workflowModels = await prisma.workflowModel.findMany({
        where: { modelId: id },
        include: {
          workflow: {
            select: {
              name: true,
            },
          },
        },
      });

      if (workflowModels.length > 0) {
        const workflowNames = workflowModels
          .map((wm) => wm.workflow.name)
          .join(", ");
        return res.status(409).json({
          data: null,
          error: `Cannot delete model. It is used by workflows: ${workflowNames}`,
        });
      }

      await prisma.model.delete({
        where: { id },
      });

      res.json({
        data: { success: true },
        error: null,
      });
    } catch (error: any) {
      if (error.code === "P2025") {
        res.status(404).json({
          data: null,
          error: "Model not found",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "An error occurred";
        res.status(500).json({
          data: null,
          error: message,
        });
      }
    }
  };
}

const batchModelsSchema = z.object({
  model_names: z.array(z.string()).min(1).max(100), // Limit to 100 models per batch
  model_ids: z.array(z.string()).optional(), // Alternative: lookup by IDs
});

// POST /models/batch
export function getBatchModels(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const validationResult = batchModelsSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const { model_names, model_ids } = validationResult.data;

      const whereClause: any = {};
      let requestedItems: string[] = [];

      if (model_names) {
        whereClause.name = { in: model_names };
        requestedItems = model_names;
      } else if (model_ids) {
        whereClause.id = { in: model_ids };
        requestedItems = model_ids;
      }

      const models = await prisma.model.findMany({
        where: whereClause,
        orderBy: { name: "asc" },
      });

      // Determine which items were not found
      const foundItems = model_names
        ? models.map((m) => m.name)
        : models.map((m) => m.id);

      const notFound = requestedItems.filter(
        (item) => !foundItems.includes(item),
      );

      res.json({
        data: {
          models,
          found_count: models.length,
          not_found: notFound,
          not_found_count: notFound.length,
          total_requested: requestedItems.length,
        },
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

// POST /models/validate-auth
export function validateModelAuth(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const modelsWithAuth = await prisma.model.findMany({
        where: {
          isAuthReq: true,
          authEnvVar: { not: null },
        },
      });

      const validationResults = modelsWithAuth.map((model) => {
        const envVarValue = process.env[model.authEnvVar!];
        return {
          modelId: model.id,
          modelName: model.name,
          authEnvVar: model.authEnvVar,
          isAvailable: !!envVarValue,
          hasValue: envVarValue ? "[PRESENT]" : "[MISSING]",
        };
      });

      const missingAuth = validationResults.filter((r) => !r.isAvailable);

      res.json({
        data: {
          results: validationResults,
          allValid: missingAuth.length === 0,
          missingCount: missingAuth.length,
          totalAuthRequired: validationResults.length,
        },
        error: null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}
