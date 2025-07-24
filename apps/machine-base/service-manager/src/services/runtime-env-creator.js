#!/usr/bin/env node

/**
 * Runtime Environment File Creator
 * 
 * Creates .env files for custom nodes at runtime using environment variables
 * This runs after the container starts but before ComfyUI services start
 */

import fs from 'fs-extra';
import path from 'path';

class RuntimeEnvCreator {
  constructor() {
    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.configPath = path.join(this.workspacePath, 'config_nodes.json');
    this.comfyuiPath = path.join(this.workspacePath, 'ComfyUI');
    this.customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
  }

  async createEnvFiles() {
    console.log('🌍 Creating runtime .env files for custom nodes...');
    
    try {
      // Read the config_nodes.json file
      if (!await fs.pathExists(this.configPath)) {
        console.log('⚠️  config_nodes.json not found, skipping .env file creation');
        return;
      }

      const configContent = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configContent);

      if (!config.custom_nodes || !Array.isArray(config.custom_nodes)) {
        console.log('⚠️  No custom_nodes found in config, skipping .env file creation');
        return;
      }

      let envFilesCreated = 0;
      
      // Process each custom node
      for (const nodeConfig of config.custom_nodes) {
        const nodeName = nodeConfig.name;
        
        // Skip if no env configuration
        if (!nodeConfig.env || typeof nodeConfig.env !== 'object') {
          continue;
        }

        const nodePath = path.join(this.customNodesPath, nodeName);
        
        // Check if the node directory exists
        if (!await fs.pathExists(nodePath)) {
          console.log(`⚠️  Node directory not found: ${nodePath}`);
          continue;
        }

        // Create .env file for this node
        await this.createEnvFile(nodeName, nodeConfig.env, nodePath);
        envFilesCreated++;
      }

      console.log(`✅ Runtime .env file creation completed: ${envFilesCreated} files created`);
      
    } catch (error) {
      console.error('❌ Error creating runtime .env files:', error);
      throw error;
    }
  }

  async createEnvFile(nodeName, envConfig, nodePath) {
    console.log(`📝 Creating .env file for ${nodeName}...`);
    
    try {
      const envLines = [];
      
      for (const [envKey, envVarTemplate] of Object.entries(envConfig)) {
        // Handle ${VAR} format by extracting the variable name
        let envVarName = envVarTemplate;
        if (typeof envVarTemplate === 'string' && envVarTemplate.startsWith('${') && envVarTemplate.endsWith('}')) {
          envVarName = envVarTemplate.slice(2, -1); // Remove ${ and }
        }
        
        const envValue = process.env[envVarName];
        if (envValue !== undefined) {
          envLines.push(`${envKey}=${envValue}`);
          console.log(`   ✓ ${envKey} (from ${envVarName})`);
        } else {
          console.log(`   ⚠️  Environment variable ${envVarName} not found for ${nodeName}.${envKey}`);
          // Still add the line but with empty value
          envLines.push(`${envKey}=`);
        }
      }
      
      if (envLines.length > 0) {
        const envFilePath = path.join(nodePath, '.env');
        await fs.writeFile(envFilePath, envLines.join('\n') + '\n');
        console.log(`   ✅ Created .env file: ${envFilePath} (${envLines.length} variables)`);
      }
    } catch (error) {
      console.error(`❌ Failed to create .env file for ${nodeName}:`, error);
      // Don't fail the entire process for individual .env errors
    }
  }
}

// Command line execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const creator = new RuntimeEnvCreator();
  creator.createEnvFiles()
    .then(() => {
      console.log('🎉 Runtime environment setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Runtime environment setup failed:', error);
      process.exit(1);
    });
}

export default RuntimeEnvCreator;