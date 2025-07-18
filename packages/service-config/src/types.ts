import { z } from 'zod';

// ComfyUI Node Configuration Types
export const ComfyNodeConfigSchema = z.object({
  url: z.string(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  recursive: z.boolean().optional(),
  requirements: z.boolean().optional(),
  env: z.record(z.string()).optional(),
});

export const ComfyNodesConfigSchema = z.record(ComfyNodeConfigSchema);

export type ComfyNodeConfig = z.infer<typeof ComfyNodeConfigSchema>;
export type ComfyNodesConfig = z.infer<typeof ComfyNodesConfigSchema>;

// Static Models Configuration
export const StaticModelSchema = z.object({
  name: z.string(),
  url: z.string(),
  size: z.string(),
  type: z.string(),
  subfolder: z.string().optional(),
});

export const StaticModelsConfigSchema = z.array(StaticModelSchema);

export type StaticModel = z.infer<typeof StaticModelSchema>;
export type StaticModelsConfig = z.infer<typeof StaticModelsConfigSchema>;

// Directory Configuration
export interface ComfyDirConfig {
  base_path: string;
  models: Record<string, string>;
  custom_nodes: string;
  workflows: string;
}
