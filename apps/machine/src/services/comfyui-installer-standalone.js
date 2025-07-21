#!/usr/bin/env node
/**
 * Standalone ComfyUI Custom Nodes Installer
 * 
 * This is a bundled version with minimal dependencies for Docker build-time use.
 * It doesn't inherit from BaseService to avoid dependency on utils/logger.js
 */

import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { configNodes } from '@emp/service-config';

// Simple console logger instead of winston
const logger = {
  info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
  debug: (msg, ...args) => console.log(`[DEBUG] ${msg}`, ...args)
};

class StandaloneComfyUIInstaller {
  constructor() {
    this.workspaceDir = process.env.WORKSPACE_DIR || '/workspace';
    this.comfyDir = path.join(this.workspaceDir, 'ComfyUI');
    this.customNodesDir = path.join(this.comfyDir, 'custom_nodes');
    this.configPath = process.env.CONFIG_NODES_PATH || path.join(this.workspaceDir, 'config_nodes.json');
    this.isBuildTime = process.argv.includes('--build-time');
    this.customNodesOnly = process.argv.includes('--custom-nodes-only');
    this.skipEnv = process.argv.includes('--skip-env');
  }

  async run() {
    try {
      logger.info('Starting standalone ComfyUI installer...');
      
      if (this.customNodesOnly) {
        await this.installCustomNodes();
      } else {
        await this.fullInstall();
      }

      logger.info('Installation completed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Installation failed:', error);
      process.exit(1);
    }
  }

  async fullInstall() {
    logger.info('Performing full ComfyUI installation');
    // Add full installation logic here if needed
    await this.installCustomNodes();
  }

  async installCustomNodes() {
    logger.info('Installing custom nodes...');
    
    // Ensure custom nodes directory exists
    await fs.ensureDir(this.customNodesDir);
    
    // Load configuration
    const config = await this.loadConfig();
    if (!config || !config.nodes || config.nodes.length === 0) {
      logger.warn('No custom nodes configuration found');
      return;
    }

    logger.info(`Found ${config.nodes.length} custom nodes to install`);
    
    // Install nodes in batches
    const batchSize = 5;
    const batches = this.chunkArray(config.nodes, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.info(`Installing batch ${i + 1}/${batches.length} (${batch.length} nodes)`);
      
      const promises = batch.map(node => this.installNode(node));
      const results = await Promise.allSettled(promises);
      
      // Log results
      results.forEach((result, idx) => {
        const node = batch[idx];
        if (result.status === 'fulfilled') {
          logger.info(`✅ ${node.name} installed successfully`);
        } else {
          logger.error(`❌ ${node.name} failed:`, result.reason);
        }
      });
    }
    
    logger.info('Custom nodes installation completed');
  }

  async installNode(node) {
    const nodePath = path.join(this.customNodesDir, node.name);
    
    try {
      // Skip if already exists (for build-time caching)
      if (await fs.pathExists(nodePath)) {
        logger.debug(`Node ${node.name} already exists, skipping`);
        return;
      }

      // Clone repository
      if (node.url.startsWith('git clone ')) {
        const gitUrl = node.url.replace('git clone ', '');
        await execa('git', ['clone', gitUrl, nodePath], {
          cwd: this.customNodesDir,
          timeout: 120000 // 2 minute timeout
        });
      } else {
        await execa('git', ['clone', node.url, nodePath], {
          cwd: this.customNodesDir,
          timeout: 120000
        });
      }

      logger.debug(`✅ Cloned ${node.name}`);

      // Install requirements if specified and not skipping
      if (node.requirements && !this.skipEnv) {
        const requirementsPath = path.join(nodePath, 'requirements.txt');
        if (await fs.pathExists(requirementsPath)) {
          logger.debug(`Installing requirements for ${node.name}`);
          await execa('pip', ['install', '-r', requirementsPath], {
            cwd: nodePath,
            timeout: 300000 // 5 minute timeout
          });
        }
      }

      // Create .env file if specified and not skipping
      if (node.env && !this.skipEnv) {
        const envPath = path.join(nodePath, '.env');
        const envContent = Object.entries(node.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n');
        await fs.writeFile(envPath, envContent);
        logger.debug(`✅ Created .env for ${node.name}`);
      }

      return { success: true, node: node.name };
    } catch (error) {
      throw new Error(`Failed to install ${node.name}: ${error.message}`);
    }
  }

  async loadConfig() {
    try {
      // Try to load from config_nodes.json first
      if (await fs.pathExists(this.configPath)) {
        const configData = await fs.readJson(this.configPath);
        return configData;
      }
      
      // Fallback to workspace package config
      return { nodes: configNodes || [] };
    } catch (error) {
      logger.error('Failed to load configuration:', error);
      return { nodes: [] };
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const installer = new StandaloneComfyUIInstaller();
  await installer.run();
}