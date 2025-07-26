/**
 * Model Downloader Utility with Authentication Support
 *
 * This utility provides functions to download models with authentication support,
 * integrating with the EmProps_Asset_Downloader node system.
 */

import fs from 'fs';
import path from 'path';

export interface ModelConfig {
  name: string;
  download_url: string;
  save_to: string;
  description: string;
  file_size: string;
  model_type: string;
  hash?: string;
  is_auth_req: boolean;
  auth_env_var: string | null;
}

export interface ModelsRegistry {
  models: Record<string, ModelConfig>;
  _metadata: {
    version: string;
    description: string;
    last_updated: string;
  };
}

/**
 * Load the models registry from the component library
 */
export function loadModelsRegistry(modelsPath?: string): ModelsRegistry {
  const defaultPath = path.join(__dirname, '../../../component-library/models.json');
  const registryPath = modelsPath || defaultPath;

  if (!fs.existsSync(registryPath)) {
    throw new Error(`Models registry not found at: ${registryPath}`);
  }

  const content = fs.readFileSync(registryPath, 'utf8');
  return JSON.parse(content) as ModelsRegistry;
}

/**
 * Get model configuration by ID
 */
export function getModelConfig(modelId: string, registry?: ModelsRegistry): ModelConfig | null {
  const models = registry || loadModelsRegistry();
  return models.models[modelId] || null;
}

/**
 * Get all models that require authentication
 */
export function getAuthRequiredModels(registry?: ModelsRegistry): Record<string, ModelConfig> {
  const models = registry || loadModelsRegistry();

  return Object.fromEntries(
    Object.entries(models.models).filter(([_, config]) => config.is_auth_req)
  );
}

/**
 * Get models by authentication provider
 */
export function getModelsByAuthProvider(
  envVar: string,
  registry?: ModelsRegistry
): Record<string, ModelConfig> {
  const models = registry || loadModelsRegistry();

  return Object.fromEntries(
    Object.entries(models.models).filter(
      ([_, config]) => config.is_auth_req && config.auth_env_var === envVar
    )
  );
}

/**
 * Generate ComfyUI workflow node configuration for model download
 * This creates the configuration needed for the EmProps_Asset_Downloader node
 */
export function generateDownloadNodeConfig(
  modelId: string,
  nodeId: number = 1,
  registry?: ModelsRegistry
): object | null {
  const modelConfig = getModelConfig(modelId, registry);
  if (!modelConfig) {
    return null;
  }

  // Map auth_env_var to token provider names used by EmProps_Asset_Downloader
  const getTokenProvider = (envVar: string | null): string => {
    switch (envVar) {
      case 'HF_TOKEN':
        return 'Hugging Face';
      case 'CIVITAI_TOKEN':
        return 'CivitAI';
      case null:
        return 'None';
      default:
        return 'Custom';
    }
  };

  return {
    id: nodeId,
    type: 'EmProps_Asset_Downloader',
    pos: [100, 100],
    size: [274.98, 222],
    flags: {},
    order: 0,
    mode: 0,
    inputs: [
      { name: 'url', type: 'STRING', widget: { name: 'url' } },
      { name: 'save_to', type: 'COMBO', widget: { name: 'save_to' } },
      { name: 'filename', type: 'STRING', widget: { name: 'filename' } },
      { name: 'token_provider', type: 'COMBO', widget: { name: 'token_provider' } },
      { name: 'token', type: 'STRING', widget: { name: 'token' } },
      { name: 'test_with_copy', type: 'BOOLEAN', widget: { name: 'test_with_copy' } },
      { name: 'source_filename', type: 'STRING', widget: { name: 'source_filename' } },
    ],
    outputs: [
      { name: 'downloaded_path', type: 'STRING' },
      { name: 'ckpt_name', type: 'STRING' },
    ],
    properties: {
      'Node name for S&R': 'EmProps_Asset_Downloader',
    },
    widgets_values: [
      modelConfig.download_url, // url
      modelConfig.save_to, // save_to
      modelConfig.name, // filename
      getTokenProvider(modelConfig.auth_env_var), // token_provider
      '', // token (empty - uses env var)
      false, // test_with_copy
      '', // source_filename
    ],
  };
}

/**
 * Validate that required authentication environment variables are available
 */
export function validateAuthEnvironment(registry?: ModelsRegistry): {
  valid: boolean;
  missing: string[];
  available: string[];
} {
  const models = registry || loadModelsRegistry();
  const authRequired = getAuthRequiredModels(models);

  const requiredEnvVars = new Set<string>();
  Object.values(authRequired).forEach(model => {
    if (model.auth_env_var) {
      requiredEnvVars.add(model.auth_env_var);
    }
  });

  const missing: string[] = [];
  const available: string[] = [];

  requiredEnvVars.forEach(envVar => {
    if (process.env[envVar]) {
      available.push(envVar);
    } else {
      missing.push(envVar);
    }
  });

  return {
    valid: missing.length === 0,
    missing,
    available,
  };
}

/**
 * Get a summary of authentication requirements
 */
export function getAuthSummary(registry?: ModelsRegistry): {
  totalModels: number;
  authRequired: number;
  noAuth: number;
  byProvider: Record<string, number>;
} {
  const models = registry || loadModelsRegistry();
  const allModels = Object.values(models.models);

  const authRequired = allModels.filter(m => m.is_auth_req);
  const noAuth = allModels.filter(m => !m.is_auth_req);

  const byProvider: Record<string, number> = {};
  authRequired.forEach(model => {
    const provider = model.auth_env_var || 'Custom';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
  });

  return {
    totalModels: allModels.length,
    authRequired: authRequired.length,
    noAuth: noAuth.length,
    byProvider,
  };
}
