import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { z } from "zod";

const collectionDependenciesSchema = z.object({
  collection_ids: z.array(z.string().uuid()).min(1).max(100), // Limit to 100 collections
});

export function getCollectionDependencies(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    try {
      const validationResult = collectionDependenciesSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error:
            "Invalid request: " +
            validationResult.error.errors.map((e) => e.message).join(", "),
        });
      }

      const { collection_ids } = validationResult.data;

      // Single efficient query to get all models and custom nodes for these collections
      const result = await prisma.$queryRaw`
        WITH collection_workflows AS (
          -- Get workflows associated with these collections
          SELECT DISTINCT 
            c.id as collection_id,
            c.title as collection_title,
            (c.data->>'workflow')::uuid as workflow_id
          FROM collection c 
          WHERE c.id = ANY(${collection_ids}::uuid[])
            AND c.data->>'workflow' IS NOT NULL
        ),
        workflow_models AS (
          -- Get all models for these workflows
          SELECT DISTINCT
            cw.collection_id,
            cw.collection_title,
            cw.workflow_id,
            w.name as workflow_name,
            m.id as model_id,
            m.name as model_name,
            m.download_url as model_download_url,
            m.save_to as model_save_to,
            m.description as model_description,
            m.model_type,
            m.file_size,
            m.hash as model_hash,
            wm.is_required as model_is_required,
            'model' as dependency_type
          FROM collection_workflows cw
          JOIN workflow w ON w.id = cw.workflow_id
          JOIN workflow_models wm ON wm.workflow_id = w.id
          JOIN models m ON m.id = wm.model_id
        ),
        workflow_custom_nodes AS (
          -- Get all custom nodes for these workflows
          SELECT DISTINCT
            cw.collection_id,
            cw.collection_title,
            cw.workflow_id,
            w.name as workflow_name,
            cn.id as custom_node_id,
            cn.name as custom_node_name,
            cn.download_url as custom_node_download_url,
            cn.description as custom_node_description,
            cn.env_conf as custom_node_env_conf,
            cn.hash as custom_node_hash,
            cn.is_env_required as custom_node_is_env_required,
            'custom_node' as dependency_type
          FROM collection_workflows cw
          JOIN workflow w ON w.id = cw.workflow_id
          JOIN workflow_custom_nodes wcn ON wcn.workflow_id = w.id
          JOIN custom_nodes cn ON cn.id = wcn.custom_node_id
        )
        -- Combine models and custom nodes
        SELECT 
          collection_id,
          collection_title,
          workflow_id,
          workflow_name,
          model_id as dependency_id,
          model_name as dependency_name,
          model_download_url as download_url,
          model_save_to as save_to,
          model_description as description,
          model_type as type,
          file_size,
          model_hash as hash,
          model_is_required as is_required,
          NULL as env_conf,
          NULL as is_env_required,
          dependency_type
        FROM workflow_models
        
        UNION ALL
        
        SELECT 
          collection_id,
          collection_title,
          workflow_id,
          workflow_name,
          custom_node_id as dependency_id,
          custom_node_name as dependency_name,
          custom_node_download_url as download_url,
          NULL as save_to,
          custom_node_description as description,
          'custom_node' as type,
          NULL as file_size,
          custom_node_hash as hash,
          NULL as is_required,
          custom_node_env_conf as env_conf,
          custom_node_is_env_required as is_env_required,
          dependency_type
        FROM workflow_custom_nodes
        
        ORDER BY collection_id, dependency_type, dependency_name
      `;

      // Group results by collection
      const dependenciesByCollection = (result as any[]).reduce((acc, row) => {
        const collectionId = row.collection_id;

        if (!acc[collectionId]) {
          acc[collectionId] = {
            collection_id: collectionId,
            collection_title: row.collection_title,
            workflow_id: row.workflow_id,
            workflow_name: row.workflow_name,
            models: [],
            custom_nodes: [],
          };
        }

        if (row.dependency_type === "model") {
          acc[collectionId].models.push({
            id: row.dependency_id,
            name: row.dependency_name,
            downloadUrl: row.download_url,
            saveTo: row.save_to,
            description: row.description,
            modelType: row.type,
            fileSize: row.file_size,
            hash: row.hash,
            isRequired: row.is_required,
          });
        } else if (row.dependency_type === "custom_node") {
          acc[collectionId].custom_nodes.push({
            id: row.dependency_id,
            name: row.dependency_name,
            downloadUrl: row.download_url,
            description: row.description,
            hash: row.hash,
            envConf: row.env_conf,
            isEnvRequired: row.is_env_required,
          });
        }

        return acc;
      }, {});

      // Convert to array and include collections with no dependencies
      const collections = collection_ids.map((id) => {
        return (
          dependenciesByCollection[id] || {
            collection_id: id,
            collection_title: null,
            workflow_id: null,
            workflow_name: null,
            models: [],
            custom_nodes: [],
          }
        );
      });

      // Also provide a summary of all unique dependencies
      const allModels = new Map();
      const allCustomNodes = new Map();

      Object.values(dependenciesByCollection).forEach((collection: any) => {
        collection.models.forEach((model: any) => {
          allModels.set(model.id, model);
        });
        collection.custom_nodes.forEach((node: any) => {
          allCustomNodes.set(node.id, node);
        });
      });

      res.json({
        data: {
          collections,
          summary: {
            total_collections: collection_ids.length,
            collections_with_dependencies: Object.keys(dependenciesByCollection)
              .length,
            unique_models: Array.from(allModels.values()),
            unique_custom_nodes: Array.from(allCustomNodes.values()),
            total_unique_models: allModels.size,
            total_unique_custom_nodes: allCustomNodes.size,
          },
        },
        error: null,
      });
    } catch (error) {
      console.error("Error getting collection dependencies:", error);
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}
