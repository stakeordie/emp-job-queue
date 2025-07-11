#!/usr/bin/env node

/**
 * Setup shared directories matching base_machine EXACTLY
 * Based on base_machine start.sh logic
 */

import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('shared-setup');

const ROOT = process.env.WORKSPACE_PATH || '/workspace';
const SHARED_DIR = `${ROOT}/shared`;

/**
 * Create base_machine compatible shared directory structure
 */
async function setupBaseSharedDirectories() {
  logger.info('Setting up base_machine compatible shared directories...');

  // Core shared directories (matching base_machine)
  const directories = [
    SHARED_DIR,
    `${SHARED_DIR}/custom_nodes`,           // ComfyUI custom nodes (shared)
    `${SHARED_DIR}/models`,                 // ComfyUI models directory
    `${SHARED_DIR}/models/checkpoints`,     // Main checkpoint models (symlinks)
    `${SHARED_DIR}/models/loras`,           // LoRA models
    `${SHARED_DIR}/models/controlnet`,      // ControlNet models
    `${SHARED_DIR}/models/clip_vision`,     // CLIP vision models
    `${SHARED_DIR}/models/vae`,             // VAE models
    `${SHARED_DIR}/models/upscale_models`,  // Upscale models
    `${SHARED_DIR}/sd_models`,              // A1111 models directory (actual storage)
    `${SHARED_DIR}/sd_models/Stable-diffusion`, // Where models are actually stored
    `${SHARED_DIR}/workflows`,              // ComfyUI workflows (shared)
  ];

  for (const dir of directories) {
    await fs.ensureDir(dir);
    logger.debug(`Created directory: ${dir}`);
  }

  // Set permissions matching base_machine
  await fs.chmod(SHARED_DIR, 0o755);
  
  logger.info('Base shared directory structure created');
}

/**
 * Download and setup configuration files from emprops_shared
 */
async function setupConfigurationFiles() {
  const empropsSharedRepo = 'https://github.com/stakeordie/emprops_shared.git';
  const tempDir = '/tmp/emprops_shared_clone';
  
  logger.info('Downloading configuration files from emprops_shared...');
  
  try {
    // Clean up any existing temp directory
    await fs.remove(tempDir);
    
    // Clone repository to temp location
    await execa('git', ['clone', empropsSharedRepo, tempDir]);
    
    // Copy configuration files to shared directory
    const configFiles = [
      'comfy_dir_config.yaml',
      'config_nodes.json', 
      'static-models.json'
    ];
    
    for (const file of configFiles) {
      const sourcePath = path.join(tempDir, file);
      const targetPath = path.join(SHARED_DIR, file);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.copy(sourcePath, targetPath);
        logger.info(`Copied ${file} to shared directory`);
      } else {
        logger.warn(`Configuration file ${file} not found in emprops_shared`);
      }
    }
    
    // Copy workflows if they exist
    const workflowsSource = path.join(tempDir, 'workflows');
    const workflowsTarget = path.join(SHARED_DIR, 'workflows');
    
    if (await fs.pathExists(workflowsSource)) {
      await fs.copy(workflowsSource, workflowsTarget, { overwrite: true });
      logger.info('Copied workflows to shared directory');
    }
    
    // Clean up temp directory
    await fs.remove(tempDir);
    
    logger.info('Configuration files setup completed');
  } catch (error) {
    logger.error('Failed to setup configuration files:', error);
    // Don't fail the whole setup, just warn
  }
}

/**
 * Setup ComfyUI directory configuration
 */
async function setupComfyDirConfig() {
  const configPath = path.join(SHARED_DIR, 'comfy_dir_config.yaml');
  
  // Default config matching base_machine
  const defaultConfig = `comfyui:
    base_path: ${SHARED_DIR}
    checkpoints: models/checkpoints/
    vae: models/vae/
    loras: models/loras/
    controlnet: models/controlnet/
    clip_vision: models/clip_vision/
    upscale_models: models/upscale_models/
`;

  if (!await fs.pathExists(configPath)) {
    await fs.writeFile(configPath, defaultConfig);
    logger.info('Created default comfy_dir_config.yaml');
  }
}

/**
 * Setup static model configuration
 */
async function setupStaticModelsConfig() {
  const configPath = path.join(SHARED_DIR, 'static-models.json');
  
  // Default model symlink configuration matching base_machine
  const defaultConfig = {
    "model_symlinks": {
      "checkpoints": [
        {
          "source": "sd_models/Stable-diffusion/",
          "target": "models/checkpoints/",
          "pattern": "*.safetensors"
        },
        {
          "source": "sd_models/Stable-diffusion/", 
          "target": "models/checkpoints/",
          "pattern": "*.ckpt"
        }
      ]
    }
  };

  if (!await fs.pathExists(configPath)) {
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    logger.info('Created default static-models.json');
  }
}

/**
 * Setup custom nodes configuration
 */
async function setupCustomNodesConfig() {
  const configPath = path.join(SHARED_DIR, 'config_nodes.json');
  
  // Default nodes configuration matching base_machine
  const defaultConfig = {
    "nodes": [
      {
        "name": "ComfyUI-Manager",
        "url": "https://github.com/ltdrdata/ComfyUI-Manager",
        "requirements": true,
        "env": {}
      },
      {
        "name": "emprops_comfy_nodes", 
        "url": "https://github.com/stakeordie/emprops_comfy_nodes",
        "requirements": true,
        "env": {
          "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
          "OPENAI_API_KEY": "${OPENAI_API_KEY}"
        }
      }
    ]
  };

  if (!await fs.pathExists(configPath)) {
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    logger.info('Created default config_nodes.json');
  }
}

/**
 * Main setup function matching base_machine logic
 */
async function main() {
  try {
    logger.info('Starting base_machine compatible shared directory setup...');
    
    // Step 1: Create directory structure
    await setupBaseSharedDirectories();
    
    // Step 2: Download configuration files
    await setupConfigurationFiles();
    
    // Step 3: Ensure configuration files exist
    await setupComfyDirConfig();
    await setupStaticModelsConfig(); 
    await setupCustomNodesConfig();
    
    logger.info('Base_machine compatible shared directory setup completed successfully');
    
    // Log the structure for verification
    logger.info('Created shared directory structure:');
    logger.info(`  ${SHARED_DIR}/custom_nodes/     # ComfyUI custom nodes`);
    logger.info(`  ${SHARED_DIR}/models/           # ComfyUI model symlinks`);
    logger.info(`  ${SHARED_DIR}/sd_models/        # Actual model storage`);
    logger.info(`  ${SHARED_DIR}/workflows/        # Shared workflows`);
    logger.info(`  ${SHARED_DIR}/*.yaml/*.json     # Configuration files`);
    
  } catch (error) {
    logger.error('Shared directory setup failed:', error);
    throw error;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as setupBaseSharedDirectories };