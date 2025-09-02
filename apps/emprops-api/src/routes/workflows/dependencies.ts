import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { z } from "zod";

// Schema for the request body
const workflowDependenciesSchema = z
  .object({
    workflow_ids: z.array(z.string()).optional(),
    workflow_names: z.array(z.string()).optional(),
  })
  .refine((data) => data.workflow_ids || data.workflow_names, {
    message: "Either workflow_ids or workflow_names must be provided",
  });

// POST /workflows/dependencies
export function getWorkflowDependencies(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    console.log("=== WORKFLOWS DEPENDENCIES REQUEST ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    console.log("Request headers:", req.headers);

    try {
      const validationResult = workflowDependenciesSchema.safeParse(req.body);

      if (!validationResult.success) {
        console.log("❌ Validation failed:", validationResult.error.errors);
        const errorResponse = {
          data: null,
          error: validationResult.error.errors.map((e) => e.message).join(", "),
        };
        console.log("Response:", JSON.stringify(errorResponse, null, 2));
        return res.status(400).json(errorResponse);
      }

      const { workflow_ids, workflow_names } = validationResult.data;
      console.log("✅ Validation passed. Input data:", {
        workflow_ids,
        workflow_names,
      });

      // Build where clause for workflows lookup
      const workflowWhere: any = {};
      if (workflow_ids && workflow_ids.length > 0) {
        workflowWhere.id = { in: workflow_ids };
      }
      if (workflow_names && workflow_names.length > 0) {
        if (workflowWhere.id) {
          // If both IDs and names provided, use OR condition
          workflowWhere.OR = [
            { id: { in: workflow_ids } },
            { name: { in: workflow_names } },
          ];
          delete workflowWhere.id;
        } else {
          workflowWhere.name = { in: workflow_names };
        }
      }

      console.log(
        "🔍 Database query where clause:",
        JSON.stringify(workflowWhere, null, 2),
      );

      // Fetch workflows with their model and custom node relationships
      const workflows = await prisma.workflow.findMany({
        where: workflowWhere,
        include: {
          workflow_models: {
            include: {
              model: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  downloadUrl: true,
                  saveTo: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
          workflow_custom_nodes: {
            include: {
              custom_nodes: {
                select: {
                  id: true,
                  name: true,
                  download_url: true,
                  description: true,
                  install_settings: true,
                  env_conf: true,
                  is_default: true,
                  install_order: true,
                  created_at: true,
                  updated_at: true,
                },
              },
            },
          },
        },
      });

      console.log(`📊 Found ${workflows.length} workflows from database`);
      console.log("Raw workflows data:", JSON.stringify(workflows, null, 2));

      // Transform the data to match the expected format
      const result = workflows.map((workflow: any) => {
        const models =
          workflow.workflow_models?.map((wm: any) => ({
            id: wm.model.id,
            name: wm.model.name,
            description: wm.model.description,
            downloadUrl: wm.model.downloadUrl,
            saveTo: wm.model.saveTo,
            status: wm.model.status,
            createdAt: wm.model.createdAt,
            updatedAt: wm.model.updatedAt,
          })) || [];

        const custom_nodes =
          workflow.workflow_custom_nodes
            ?.map((wcn: any) => {
              const node = wcn.custom_nodes;
              const installSettings = node.install_settings || {};

              return {
                id: node.id,
                name: node.name,
                repositoryUrl: node.download_url,
                description: node.description,
                branch: installSettings.branch || null,
                commit: installSettings.commit || null,
                recursive: installSettings.recursive || false,
                requirements: installSettings.requirements || true,
                env: node.env_conf || null,
                is_default: node.is_default || false,
                install_order: node.install_order || null,
                created_at: node.created_at,
                updated_at: node.updated_at,
              };
            })
            .sort((a: any, b: any) => {
              // Sort by install_order (nulls last), then by name
              if (a.install_order === null && b.install_order === null)
                return a.name.localeCompare(b.name);
              if (a.install_order === null) return 1;
              if (b.install_order === null) return -1;
              return a.install_order - b.install_order;
            }) || [];

        return {
          workflow_id: workflow.id,
          workflow_name: workflow.name,
          models,
          custom_nodes,
        };
      });

      console.log(`✅ Transformed ${result.length} workflows for response`);
      console.log("Final response data:", JSON.stringify(result, null, 2));

      const response = {
        data: result,
        error: null,
      };

      res.json(response);
    } catch (error) {
      console.log("❌ Error in workflows/dependencies:", error);
      const message =
        error instanceof Error ? error.message : "An error occurred";
      const errorResponse = {
        data: null,
        error: message,
      };
      console.log("Error response:", JSON.stringify(errorResponse, null, 2));
      res.status(500).json(errorResponse);
    }
  };
}
