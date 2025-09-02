import { PrismaClientType } from "@app/types/database";
import { buildDefaultPagedQuery } from "../../utils/queries";

import { Request, Response } from "express";
import { validate as isUUID } from "uuid";
import { z } from "zod";

// Utility function to detect if a workflow has API key fields
function hasApiKeyFields(workflowData: any): boolean {
  if (!workflowData?.inputs) return false;

  // Check all nodes in the workflow inputs
  for (const nodeId in workflowData.inputs) {
    const nodeInputs = workflowData.inputs[nodeId];
    if (!nodeInputs) continue;

    // Check all fields in each node
    for (const fieldName in nodeInputs) {
      const fieldDef = nodeInputs[fieldName];
      if (fieldDef?.type === "api_key") {
        return true;
      }
    }
  }

  return false;
}

export function getWorkflows(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const hasInclude = req.query.include === "eq.true";
    const requireApiKeys = req.query.require_api_keys === "true";
    const query = buildDefaultPagedQuery(req);

    let workflows;
    if (hasInclude) {
      workflows = await prisma.workflow.findMany({
        ...query,
      });
    } else {
      workflows = await prisma.workflow.findMany({
        ...query,
        select: {
          id: true,
          name: true,
          label: true,
          type: true,
          description: true,
          created_at: true,
          data: requireApiKeys, // Include data only when checking for API keys
        },
      });
    }

    // Filter for workflows that require API keys if requested
    if (requireApiKeys) {
      workflows = workflows.filter((workflow) => {
        // Include fetch_api type workflows (like RunwayML, Civitai)
        if (workflow.type === "fetch_api") {
          return true;
        }

        // Include direct_job type workflows
        if (workflow.type === "direct_job") {
          return true;
        }

        // Include ComfyUI workflows that have API key fields
        if (workflow.type === "comfy_workflow" && workflow.data) {
          return hasApiKeyFields(workflow.data);
        }

        return false;
      });

      // Remove data field from response if it was only included for filtering
      if (!hasInclude) {
        workflows = workflows.map(({ data: _data, ...workflow }) => workflow);
      }
    }

    res.json({ data: workflows, error: null });
  };
}

export function getWorkflowByName(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const name = req.params.name;
    const result = await prisma.workflow.findFirst({
      where: {
        name,
      },
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
    if (result == null) {
      return res.status(404).json({ data: null, error: "Workflow not found" });
    }

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

export function getWorkflowForms(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    if (!isUUID(req.params.id)) {
      return res.status(400).json({ data: null, error: "Invalid ID" });
    }
    const id = req.params.id;
    const response =
      (await prisma.$queryRaw`select id, name, data->'form' as form from workflow where id = ${id}::uuid`) as any[];
    if (!response || response.length === 0) {
      return res.status(404).json({ data: null, error: "Workflow not found" });
    }
    const result = response[0];
    if (!result.form) {
      return res.status(404).json({ data: null, error: "Form not found" });
    }
    const allFields = result.form;
    const confFileFields = allFields
      .filter((field: any) => field.conf_file)
      .map((field: any) => field.conf_file) as string[];
    const confFileFieldsSet = new Set(confFileFields);
    const config = await prisma.form_config.findMany({
      where: {
        name: {
          in: [...confFileFieldsSet],
        },
      },
    });
    for (const field of allFields) {
      if (field.conf_file) {
        field.conf_file_value = config.find((c) => c.name === field.conf_file)
          ?.data;
      }
    }
    res.json({ data: result.form, error: null });
  };
}

const workflowRequestSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  data: z.any(),
  output_mime_type: z.string(),
  type: z
    .enum(["basic", "comfy_workflow", "fetch_api", "direct_job"])
    .optional(),
  display: z.boolean().optional(),
  order: z.number().optional(),
  models: z.array(z.string()).optional(),
  custom_nodes: z.array(z.string()).optional(),
});

export function createWorkflow(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const validationResult = workflowRequestSchema.safeParse(req.body);
    if (validationResult.error) {
      return res
        .status(400)
        .json({ data: null, error: validationResult.error });
    }
    const body = validationResult.data;
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Create workflow (exclude models and custom_nodes from data)
        const { models, custom_nodes, ...workflowData } = body;
        const workflow = await tx.workflow.create({
          data: {
            name: workflowData.name,
            label: workflowData.label,
            description: workflowData.description,
            data: workflowData.data,
            output_mime_type: workflowData.output_mime_type,
            type: workflowData.type,
            display: workflowData.display,
            order: workflowData.order,
          },
        });

        // Create model relationships if provided
        if (models && models.length > 0) {
          // Find models by name
          const foundModels = await tx.model.findMany({
            where: { name: { in: models } },
          });

          if (foundModels.length !== models.length) {
            const foundNames = foundModels.map((m) => m.name);
            const missing = models.filter((name) => !foundNames.includes(name));
            throw new Error(`Models not found: ${missing.join(", ")}`);
          }

          // Create junction table entries
          await tx.workflowModel.createMany({
            data: foundModels.map((model) => ({
              workflowId: workflow.id,
              modelId: model.id,
              isRequired: true,
            })),
          });
        }

        // Create custom node relationships if provided
        if (custom_nodes && custom_nodes.length > 0) {
          // Find custom nodes by name
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

          // Create junction table entries
          await tx.workflow_custom_nodes.createMany({
            data: foundCustomNodes.map((customNode) => ({
              workflow_id: workflow.id,
              custom_node_id: customNode.id,
            })),
          });
        }

        return workflow;
      });

      res.json({ data: result, error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
}
