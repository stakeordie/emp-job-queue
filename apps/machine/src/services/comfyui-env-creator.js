import { BaseService } from './base-service.js';
import fs from 'fs-extra';
import path from 'path';
import { configNodes } from '@emp/service-config';

/**
 * ComfyUI Environment Creator Service
 * 
 * Lightweight service that only handles .env file creation for custom nodes.
 * This runs at runtime after custom nodes and requirements are already installed at build time.
 */
export default class ComfyUIEnvCreatorService extends BaseService {
  constructor(options, config) {
    super('comfyui-env-creator', options);
    this.config = config;
    
    this.workspaceDir = process.env.WORKSPACE_PATH || '/workspace';
    this.comfyDir = path.join(this.workspaceDir, 'ComfyUI');
    this.customNodesDir = path.join(this.comfyDir, 'custom_nodes');
    this.configPath = path.join(this.workspaceDir, 'config_nodes.json');
    
    this.logger.info('ComfyUI env creator initialized');
  }

  async onStart() {
    this.logger.info('Creating .env files for custom nodes...');
    
    try {
      // Create .env files for custom nodes that need them
      await this.createCustomNodeEnvFiles();
      
      // Copy EmProps custom nodes from monorepo (if needed)
      await this.setupEmpropsCustomNodes();
      
      this.logger.info('ComfyUI environment setup completed');
    } catch (error) {
      this.logger.error('Failed to setup ComfyUI environment:', error);
      throw error;
    }
  }

  /**
   * Create .env files for custom nodes that need environment variables
   */
  async createCustomNodeEnvFiles() {
    // Load configuration
    const config = await this.loadConfig();
    const nodes = config.nodes || config.custom_nodes || [];
    if (nodes.length === 0) {
      this.logger.warn('No custom nodes configuration found');
      return;
    }

    const nodesWithEnv = nodes.filter(node => node.env);
    this.logger.info(`Creating .env files for ${nodesWithEnv.length} custom nodes`);

    for (const node of nodesWithEnv) {
      try {
        const nodePath = path.join(this.customNodesDir, node.name);
        
        // Skip if node directory doesn't exist (should have been installed at build time)
        if (!await fs.pathExists(nodePath)) {
          this.logger.warn(`Node directory ${node.name} not found, skipping .env creation`);
          continue;
        }

        // Create .env file with templated environment variables
        const envPath = path.join(nodePath, '.env');
        const envContent = Object.entries(node.env)
          .map(([key, templateValue]) => {
            // Replace ${VAR_NAME} with actual environment variable value
            const actualValue = this.resolveEnvironmentVariable(templateValue);
            return `${key}=${actualValue}`;
          })
          .join('\n');

        await fs.writeFile(envPath, envContent);
        this.logger.info(`✅ Created .env file for ${node.name}`);
        
      } catch (error) {
        this.logger.error(`Failed to create .env for ${node.name}:`, error);
        // Continue with other nodes rather than failing completely
      }
    }
  }

  /**
   * Resolve environment variable templates like ${VAR_NAME} to actual values
   */
  resolveEnvironmentVariable(template) {
    if (typeof template !== 'string') {
      return template;
    }

    // Handle ${VAR_NAME} template syntax
    return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        this.logger.warn(`Environment variable ${varName} not found, using empty string`);
        return '';
      }
      return value;
    });
  }

  /**
   * Setup EmProps custom nodes from monorepo (if they exist)
   */
  async setupEmpropsCustomNodes() {
    // This would copy EmProps nodes from packages/custom-nodes/src if needed
    // For now, we'll skip this as it may not be needed for the current setup
    this.logger.debug('EmProps custom nodes setup skipped (not needed for current configuration)');
  }

  async loadConfig() {
    try {
      // Try to load from config_nodes.json first
      if (await fs.pathExists(this.configPath)) {
        const configData = await fs.readJson(this.configPath);
        return configData;
      }
      
      // Fallback to workspace package config
      return { custom_nodes: configNodes || [] };
    } catch (error) {
      this.logger.error('Failed to load configuration:', error);
      return { nodes: [] };
    }
  }
}