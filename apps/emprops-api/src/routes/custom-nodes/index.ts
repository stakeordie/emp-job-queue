import { PrismaClientType } from "@app/types/database";
import { buildDefaultPagedQuery } from "../../utils/queries";

import { Request, Response } from "express";
import { z } from "zod";

const createCustomNodeSchema = z.object({
  name: z.string().min(1),
  repositoryUrl: z.string().url(),
  branch: z.string().nullable(),
  commit: z.string().nullable(),
  recursive: z.boolean().default(false),
  requirements: z.boolean().default(true),
  env: z.record(z.string()).nullable(),
  is_default: z.boolean().default(false),
  install_order: z.number().int().nullable(),
});

const updateCustomNodeSchema = z.object({
  name: z.string().min(1).optional(),
  repositoryUrl: z.string().url().optional(),
  branch: z.string().nullable().optional(),
  commit: z.string().nullable().optional(),
  recursive: z.boolean().optional(),
  requirements: z.boolean().optional(),
  env: z.record(z.string()).nullable().optional(),
  is_default: z.boolean().optional(),
  install_order: z.number().int().nullable().optional(),
});

// Helper functions to map between API and database fields
function mapApiToDb(apiData: any) {
  return {
    name: apiData.name,
    download_url: apiData.repositoryUrl,
    description: apiData.name, // Use name as description for now
    is_env_required: apiData.env !== null || false,
    env_conf: apiData.env, // Only environment variables for .env generation
    install_settings: {
      branch: apiData.branch,
      commit: apiData.commit,
      recursive: apiData.recursive,
      requirements: apiData.requirements,
    },
    is_default: apiData.is_default,
    install_order: apiData.install_order,
  };
}

function mapDbToApi(dbData: any) {
  const installSettings = dbData.install_settings || {};
  return {
    id: dbData.id,
    name: dbData.name,
    repositoryUrl: dbData.download_url,
    branch: installSettings.branch || null,
    commit: installSettings.commit || null,
    recursive: installSettings.recursive || false,
    requirements: installSettings.requirements || true,
    env: dbData.env_conf || null,
    is_default: dbData.is_default || false,
    install_order: dbData.install_order || null,
    createdAt: dbData.created_at,
    updatedAt: dbData.updated_at,
  };
}

// GET /custom-nodes
export function getCustomNodes(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { category, search } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          {
            name: {
              contains: search as string,
              mode: "insensitive",
            },
          },
          {
            description: {
              contains: search as string,
              mode: "insensitive",
            },
          },
        ];
      }

      if (category) {
        // Assuming category might be stored in description or env_conf
        // Adjust this based on your actual data structure
        where.description = {
          contains: category as string,
          mode: "insensitive",
        };
      }

      const query = buildDefaultPagedQuery(req);
      const customNodes = await prisma.custom_nodes.findMany({
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
        data: customNodes.map(mapDbToApi),
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

// GET /custom-nodes/:id
export function getCustomNode(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const customNode = await prisma.custom_nodes.findUnique({
        where: { id },
      });

      if (!customNode) {
        return res.status(404).json({
          data: null,
          error: "Custom node not found",
        });
      }

      res.json({
        data: customNode,
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

// GET /custom-nodes/name/:name
export function getCustomNodeByName(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const customNode = await prisma.custom_nodes.findFirst({
        where: {
          name: {
            equals: decodeURIComponent(name),
            mode: "insensitive",
          },
        },
      });

      if (!customNode) {
        return res.status(404).json({
          data: null,
          error: "Custom node not found",
        });
      }

      res.json({
        data: customNode,
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

// POST /custom-nodes
export function createCustomNode(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const validatedData = createCustomNodeSchema.parse(req.body);

      // Check if custom node with this name already exists
      const existingNode = await prisma.custom_nodes.findFirst({
        where: {
          name: {
            equals: validatedData.name,
            mode: "insensitive",
          },
        },
      });

      if (existingNode) {
        return res.status(409).json({
          data: null,
          error: "Custom node with this name already exists",
        });
      }

      const dbData = mapApiToDb(validatedData);
      const customNode = await prisma.custom_nodes.create({
        data: dbData,
      });

      res.status(201).json({
        data: mapDbToApi(customNode),
        error: null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          data: null,
          error:
            "Invalid data: " + error.errors.map((e) => e.message).join(", "),
        });
      }

      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

// PUT /custom-nodes/:id
export function updateCustomNode(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const validatedData = updateCustomNodeSchema.parse(req.body);

      // Check if custom node exists
      const existingNode = await prisma.custom_nodes.findUnique({
        where: { id },
      });

      if (!existingNode) {
        return res.status(404).json({
          data: null,
          error: "Custom node not found",
        });
      }

      // If updating name, check for duplicates
      if (validatedData.name) {
        const duplicateNode = await prisma.custom_nodes.findFirst({
          where: {
            name: {
              equals: validatedData.name,
              mode: "insensitive",
            },
            id: {
              not: id,
            },
          },
        });

        if (duplicateNode) {
          return res.status(409).json({
            data: null,
            error: "Custom node with this name already exists",
          });
        }
      }

      const customNode = await prisma.custom_nodes.update({
        where: { id },
        data: {
          ...validatedData,
          updated_at: new Date(),
        },
      });

      res.json({
        data: customNode,
        error: null,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          data: null,
          error:
            "Invalid data: " + error.errors.map((e) => e.message).join(", "),
        });
      }

      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

// DELETE /custom-nodes/:id
export function deleteCustomNode(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Check if custom node exists
      const existingNode = await prisma.custom_nodes.findUnique({
        where: { id },
      });

      if (!existingNode) {
        return res.status(404).json({
          data: null,
          error: "Custom node not found",
        });
      }

      await prisma.custom_nodes.delete({
        where: { id },
      });

      res.json({
        data: { message: "Custom node deleted successfully" },
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

// GET /custom-nodes/defaults
export function getDefaultCustomNodes(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const customNodes = await prisma.custom_nodes.findMany({
        where: { is_default: true },
        orderBy: [{ install_order: "asc" }, { name: "asc" }],
      });

      const transformedNodes = customNodes.map(mapDbToApi);

      res.json({
        data: transformedNodes,
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
