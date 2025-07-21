import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { configNodes, staticModels } from '@emp/service-config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ComfyUI Installer Service - Monorepo Version
 * 
 * Simplified architecture that uses monorepo packages directly:
 * - Config from @emp/service-config package
 * - Custom nodes from @emp/custom-nodes package
 * - No shared folder needed (PM2 processes share filesystem)
 */
export default class ComfyUIInstallerService extends BaseService {
  constructor(options, config) {
    super('comfyui-installer', options);
    this.config = config;
    
    // Workspace paths
    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.comfyuiPath = path.join(this.workspacePath, 'ComfyUI');
    
    // Monorepo package paths
    this.customNodesPackagePath = path.resolve(__dirname, '../../../../packages/custom-nodes/src');
    this.serviceConfigPath = path.resolve(__dirname, '../../../../packages/service-config');
    
    // ComfyUI paths
    this.customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
    this.empropsNodesPath = path.join(this.customNodesPath, 'emprops_nodes');
    
    // Config from packages
    this.customNodesConfig = configNodes;
    this.staticModelsConfig = staticModels;
  }

  async onStart() {
    try {
      this.log('Starting ComfyUI installation process...');
      
      // 1. Clone/Update ComfyUI
      await this.cloneComfyUI();
      
      // 2. Install Python dependencies
      await this.installPythonDependencies();
      
      // 3. Setup EmProps custom nodes
      await this.setupEmpropsCustomNodes();
      
      // 4. Install third-party custom nodes
      await this.installCustomNodes();
      
      // 5. Create model directories
      await this.createModelDirectories();
      
      // 6. Write configuration files
      await this.writeConfigFiles();
      
      this.log('ComfyUI installation completed successfully');
      
      // Exit after installation
      process.exit(0);
    } catch (error) {
      this.error('ComfyUI installation failed:', error);
      process.exit(1);
    }
  }

  async setupEmpropsCustomNodes() {
    try {
      this.log('Setting up EmProps custom nodes...');
      
      // Option 1: Symlink (development friendly)
      if (process.env.NODE_ENV === 'development') {
        await fs.ensureSymlink(this.customNodesPackagePath, this.empropsNodesPath);
        this.log('Created symlink to EmProps custom nodes package');
      } 
      // Option 2: Copy (production)
      else {
        await fs.copy(this.customNodesPackagePath, this.empropsNodesPath, {
          overwrite: true,
          filter: (src) => !src.includes('__pycache__') && !src.includes('.pyc')
        });
        this.log('Copied EmProps custom nodes to ComfyUI');
      }
      
      // Install any Python requirements for custom nodes
      const requirementsPath = path.join(this.empropsNodesPath, 'requirements.txt');
      if (await fs.pathExists(requirementsPath)) {
        await execa('pip', ['install', '-r', requirementsPath], {
          cwd: this.empropsNodesPath,
          stdio: 'inherit'
        });
      }
    } catch (error) {
      throw new Error(`Failed to setup EmProps custom nodes: ${error.message}`);
    }
  }

  async writeConfigFiles() {
    try {
      this.log('Writing configuration files...');
      
      // Write config_nodes.json for reference (though we use it from package)
      const configNodesPath = path.join(this.workspacePath, 'config_nodes.json');
      await fs.writeJson(configNodesPath, this.customNodesConfig, { spaces: 2 });
      
      // Write static-models.json
      const staticModelsPath = path.join(this.workspacePath, 'static-models.json');
      await fs.writeJson(staticModelsPath, this.staticModelsConfig, { spaces: 2 });
      
      // Copy comfy_dir_config.yaml
      const comfyDirConfigSource = path.join(this.serviceConfigPath, 'shared-configs', 'comfy_dir_config.yaml');
      const comfyDirConfigTarget = path.join(this.workspacePath, 'comfy_dir_config.yaml');
      await fs.copy(comfyDirConfigSource, comfyDirConfigTarget);
      
      // Copy workflows (optional - for reference)
      const workflowsSource = path.join(this.serviceConfigPath, 'shared-configs', 'workflows');
      const workflowsTarget = path.join(this.workspacePath, 'workflows');
      await fs.copy(workflowsSource, workflowsTarget);
      
      this.log('Configuration files written successfully');
    } catch (error) {
      throw new Error(`Failed to write config files: ${error.message}`);
    }
  }

  async installCustomNodes() {
    const nodes = this.customNodesConfig.custom_nodes || [];
    const enableCustomNodes = process.env.COMFYUI_INSTALL_CUSTOM_NODES === 'true';
    
    if (!enableCustomNodes || nodes.length === 0) {
      this.log('Custom nodes installation disabled or no nodes configured');
      return;
    }
    
    this.log(`Installing ${nodes.length} custom node packages...`);
    
    // Process in parallel batches
    const batchSize = 5;
    for (let i = 0; i < nodes.length; i += batchSize) {
      const batch = nodes.slice(i, i + batchSize);
      await Promise.all(batch.map(node => this.installCustomNode(node)));
      this.log(`Progress: ${Math.min(i + batchSize, nodes.length)}/${nodes.length} nodes installed`);
    }
  }

  // ... rest of the methods remain similar but use monorepo structure ...
}