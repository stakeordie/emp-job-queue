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
export { default as configNodes } from '../config_nodes.json' with { type: 'json' };
export { default as configNodesTest } from '../config_nodes_test.json' with { type: 'json' };
export { default as staticModels } from '../static-models.json' with { type: 'json' };
