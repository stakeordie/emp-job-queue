import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { z } from "zod";

export function getWorkflow(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;

    // Validate UUID format
    const uuidSchema = z.string().uuid();
    const validation = uuidSchema.safeParse(id);

    if (!validation.success) {
      return res.status(400).json({
        data: null,
        error: "Invalid UUID format",
      });
    }

    const result = await prisma.workflow.findUnique({
      where: { id },
      include: {
        workflow_models: {
          include: {
            model: {
              select: {
                name: true,
              },
            },
          },
        },
        workflow_custom_nodes: {
          include: {
            custom_nodes: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });
    if (!result)
      return res.status(400).json({ data: null, error: "Workflow not found" });

    // Transform the result to include models and custom_nodes arrays
    const workflow = {
      ...result,
      models: result.workflow_models.map((wm: any) => wm.model.name),
      custom_nodes: result.workflow_custom_nodes.map(
        (wcn: any) => wcn.custom_nodes.name,
      ),
    };

    res.json({ data: workflow, error: null });
  };
}

const workflowUpdateSchema = z.object({
  description: z.string().optional(),
  data: z.any(),
  output_mime_type: z.string().optional(),
  type: z.string().optional(),
  display: z.boolean().optional(),
  label: z.string().optional(),
  order: z.number().optional(),
  models: z.array(z.string()).optional(),
  custom_nodes: z.array(z.string()).optional(),
});

export function updateWorkflow(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;
    const validationResult = workflowUpdateSchema.safeParse(req.body);
    if (validationResult.error) {
      res.status(400).json({ data: null, error: validationResult.error });
      return;
    }
    const body = validationResult.data;
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow)
      return res.status(400).json({ data: null, error: "Workflow not found" });
    const workflowData = workflow.data as any;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Update workflow (exclude models and custom_nodes from data)
        const { models, custom_nodes, ...updateData } = body;
        const updatedWorkflow = await tx.workflow.update({
          where: { id },
          data: {
            ...updateData,
            data: updateData.data
              ? {
                  ...workflowData,
                  ...updateData.data,
                }
              : workflowData,
          },
        });

        // Update model relationships if models array provided
        if (models !== undefined) {
          // Remove existing relationships
          await tx.workflowModel.deleteMany({
            where: { workflowId: id },
          });

          // Add new relationships if any models specified
          if (models.length > 0) {
            const foundModels = await tx.model.findMany({
              where: { name: { in: models } },
            });

            if (foundModels.length !== models.length) {
              const foundNames = foundModels.map((m) => m.name);
              const missing = models.filter(
                (name) => !foundNames.includes(name),
              );
              throw new Error(`Models not found: ${missing.join(", ")}`);
            }

            await tx.workflowModel.createMany({
              data: foundModels.map((model) => ({
                workflowId: id,
                modelId: model.id,
                isRequired: true,
              })),
            });
          }
        }

        // Update custom node relationships if custom_nodes array provided
        if (custom_nodes !== undefined) {
          // Remove existing relationships
          await tx.workflow_custom_nodes.deleteMany({
            where: { workflow_id: id },
          });

          // Add new relationships if any custom nodes specified
          if (custom_nodes.length > 0) {
            const foundCustomNodes = await tx.custom_nodes.findMany({
              where: { name: { in: custom_nodes } },
            });

            if (foundCustomNodes.length !== custom_nodes.length) {
              const foundNames = foundCustomNodes.map((cn) => cn.name);
              const missing = custom_nodes.filter(
                (name) => !foundNames.includes(name),
              );
              throw new Error(`Custom nodes not found: ${missing.join(", ")}`);
            }

            await tx.workflow_custom_nodes.createMany({
              data: foundCustomNodes.map((customNode) => ({
                workflow_id: id,
                custom_node_id: customNode.id,
              })),
            });
          }
        }

        return updatedWorkflow;
      });

      res.json({ data: result, error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
}

export function getWorkflowModels(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const workflow = await prisma.workflow.findUnique({
        where: { id },
        include: {
          workflow_models: {
            include: {
              model: true, // Include full model details
            },
          },
        },
      });

      if (!workflow) {
        return res.status(404).json({
          data: null,
          error: "Workflow not found",
        });
      }

      // Transform to include full model details with workflow-specific metadata
      const models = workflow.workflow_models.map((wm) => ({
        ...wm.model,
        isRequired: wm.isRequired,
        workflowModelId: wm.id,
        addedAt: wm.createdAt,
      }));

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

export function deleteWorkflow(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;
    const workflow = await prisma.workflow.findUnique({ where: { id } });
    if (!workflow)
      return res.status(400).json({ data: null, error: "Workflow not found" });
    try {
      await prisma.workflow.delete({ where: { id } });
      res.json({ data: "ok", error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
}
