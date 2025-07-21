export type {
  ComfyNodeConfig,
  ComfyNodesConfig,
  StaticModel,
  StaticModelsConfig,
  ComfyDirConfig,
} from './types.js';

export {
  ComfyNodeConfigSchema,
  ComfyNodesConfigSchema,
  StaticModelSchema,
  StaticModelsConfigSchema,
} from './types.js';

// Re-export configuration files
export { default as configNodes } from '../comfy-nodes/config_nodes.json' with { type: 'json' };
export { default as configNodesTest } from '../comfy-nodes/config_nodes_test.json' with { type: 'json' };
export { default as staticModels } from '../comfy-nodes/static-models.json' with { type: 'json' };

// Export model downloader utilities
export {
  type ModelConfig,
  type ModelsRegistry,
  loadModelsRegistry,
  getModelConfig,
  getAuthRequiredModels,
  getModelsByAuthProvider,
  generateDownloadNodeConfig,
  validateAuthEnvironment,
  getAuthSummary,
} from './model-downloader.js';
