import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

/**
 * ComfyUI Installer Service
 * 
 * Handles automatic ComfyUI installation including:
 * - Repository cloning (stakeordie fork with forward branch)
 * - Python dependency installation
 * - Custom nodes installation (58 packages)
 * - Environment variable injection
 * - Model path configuration
 * - Installation validation
 */
export default class ComfyUIInstallerService extends BaseService {
  constructor(options, config) {
    super('comfyui-installer', options);
    this.config = config;
    
    // Workspace paths from environment
    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.comfyuiPath = path.join(this.workspacePath, 'ComfyUI');
    this.sharedPath = path.join(this.workspacePath, 'shared');
    this.configPath = path.join(this.sharedPath, 'config_nodes.json');
    this.staticModelsPath = path.join(this.sharedPath, 'static-models.json');
    this.comfyDirConfigPath = path.join(this.sharedPath, 'comfy_dir_config.yaml');
    
    // Repository configuration from environment
    this.repoUrl = process.env.COMFYUI_REPO_URL || config.services['comfyui-installer']?.repo_url || 'https://github.com/stakeordie/ComfyUI.git';
    this.branch = process.env.COMFYUI_BRANCH || config.services['comfyui-installer']?.branch || 'forward';
    this.commit = process.env.COMFYUI_COMMIT || config.services['comfyui-installer']?.commit || null;
    
    // ComfyUI runtime configuration
    this.portStart = parseInt(process.env.COMFYUI_PORT_START || config.services['comfyui-installer']?.port_start || '8188');
    
    this.logger.info(`ComfyUI installer initialized:`, {
      repo: this.repoUrl,
      branch: this.branch,
      commit: this.commit,
      portStart: this.portStart,
      workspacePath: this.workspacePath,
      testMode: process.env.TEST_MODE === 'true'
    });
  }

  async onStart() {
    this.logger.info('Starting ComfyUI installation process...');
    
    try {
      // Check if ComfyUI is already installed
      if (await this.isComfyUIInstalled()) {
        this.logger.info('ComfyUI is already installed, validating installation...');
        await this.validateInstallation();
        this.logger.info('ComfyUI installation validation completed');
        return;
      }

      // Full installation sequence
      await this.installComfyUI();
      await this.validateInstallation();
      
      this.logger.info('ComfyUI installation completed successfully');
    } catch (error) {
      this.logger.error('ComfyUI installation failed:', error);
      throw error;
    }
  }

  async onStop() {
    this.logger.info('ComfyUI installer service stopping...');
    // No cleanup needed for installer service
  }

  /**
   * Check if ComfyUI is already installed
   */
  async isComfyUIInstalled() {
    try {
      // Check if main ComfyUI files exist
      const mainPyExists = await fs.pathExists(path.join(this.comfyuiPath, 'main.py'));
      const requirementsExists = await fs.pathExists(path.join(this.comfyuiPath, 'requirements.txt'));
      
      if (mainPyExists && requirementsExists) {
        this.logger.info('ComfyUI base installation detected');
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('Error checking ComfyUI installation:', error);
      return false;
    }
  }

  /**
   * Full ComfyUI installation process
   */
  async installComfyUI() {
    this.logger.info('Starting full ComfyUI installation...');
    
    // Step 1: Clone ComfyUI repository
    await this.cloneRepository();
    
    // Step 2: Install Python dependencies
    await this.installPythonDependencies();
    
    // Step 3: Install custom nodes
    await this.installCustomNodes();
    
    // Step 4: Setup model symlinks
    await this.setupModelSymlinks();
    
    this.logger.info('ComfyUI installation completed');
  }

  /**
   * Clone ComfyUI repository with fork detection
   */
  async cloneRepository() {
    this.logger.info(`Cloning ComfyUI repository: ${this.repoUrl}`);
    
    try {
      // Remove existing directory if it exists
      if (await fs.pathExists(this.comfyuiPath)) {
        this.logger.info('Removing existing ComfyUI directory...');
        await fs.remove(this.comfyuiPath);
      }

      // Clone repository
      await execa('git', [
        'clone',
        this.repoUrl,
        this.comfyuiPath
      ], {
        stdio: 'inherit'
      });

      // Change to ComfyUI directory for git operations
      const gitOptions = { cwd: this.comfyuiPath, stdio: 'inherit' };

      // Fork detection and branch handling
      if (this.repoUrl.includes('stakeordie')) {
        this.logger.info(`Detected stakeordie fork, checking out ${this.branch} branch...`);
        await execa('git', ['checkout', this.branch], gitOptions);
      } else {
        this.logger.info(`Using base repository, resetting to commit ${this.commit}...`);
        await execa('git', ['reset', '--hard', this.commit], gitOptions);
      }

      this.logger.info('Repository cloning completed');
    } catch (error) {
      this.logger.error('Repository cloning failed:', error);
      throw new Error(`Failed to clone ComfyUI repository: ${error.message}`);
    }
  }

  /**
   * Install Python dependencies
   */
  async installPythonDependencies() {
    this.logger.info('Installing Python dependencies...');
    
    try {
      const requirementsPath = path.join(this.comfyuiPath, 'requirements.txt');
      
      if (!await fs.pathExists(requirementsPath)) {
        throw new Error('requirements.txt not found in ComfyUI directory');
      }

      // Skip PyTorch installation - already included in base image
      this.logger.info('PyTorch is pre-installed in the container image, skipping installation...');

      // Install ComfyUI requirements
      this.logger.info('Installing ComfyUI requirements...');
      await execa('python3', [
        '-m', 'pip', 'install',
        '-r', 'requirements.txt'
      ], {
        cwd: this.comfyuiPath,
        stdio: 'inherit'
      });

      this.logger.info('Python dependencies installation completed');
    } catch (error) {
      this.logger.error('Python dependencies installation failed:', error);
      throw new Error(`Failed to install Python dependencies: ${error.message}`);
    }
  }

  /**
   * Install custom nodes based on config_nodes.json
   */
  async installCustomNodes() {
    this.logger.info('Installing custom nodes...');
    
    try {
      // Read custom nodes configuration
      if (!await fs.pathExists(this.configPath)) {
        this.logger.warn('config_nodes.json not found, skipping custom nodes installation');
        return;
      }

      const config = await fs.readJson(this.configPath);
      const customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
      
      // Ensure custom_nodes directory exists
      await fs.ensureDir(customNodesPath);

      this.logger.info(`Installing ${Object.keys(config).length} custom nodes...`);
      
      // Install each custom node
      for (const [nodeName, nodeConfig] of Object.entries(config)) {
        await this.installCustomNode(nodeName, nodeConfig, customNodesPath);
      }

      this.logger.info('Custom nodes installation completed');
    } catch (error) {
      this.logger.error('Custom nodes installation failed:', error);
      throw new Error(`Failed to install custom nodes: ${error.message}`);
    }
  }

  /**
   * Install a single custom node
   */
  async installCustomNode(nodeName, nodeConfig, customNodesPath) {
    this.logger.info(`Installing custom node: ${nodeName}`);
    
    try {
      const nodePath = path.join(customNodesPath, nodeName);
      
      // Clone the node repository
      if (nodeConfig.url) {
        await execa('git', [
          'clone',
          nodeConfig.url,
          nodePath
        ], {
          stdio: 'inherit'
        });

        // Checkout specific branch or commit if specified
        if (nodeConfig.branch) {
          await execa('git', ['checkout', nodeConfig.branch], {
            cwd: nodePath,
            stdio: 'inherit'
          });
        }
        if (nodeConfig.commit) {
          await execa('git', ['reset', '--hard', nodeConfig.commit], {
            cwd: nodePath,
            stdio: 'inherit'
          });
        }
      }

      // Install node dependencies if requirements.txt exists
      const requirementsPath = path.join(nodePath, 'requirements.txt');
      if (await fs.pathExists(requirementsPath)) {
        this.logger.info(`Installing requirements for ${nodeName}...`);
        await execa('python3', [
          '-m', 'pip', 'install',
          '-r', 'requirements.txt'
        ], {
          cwd: nodePath,
          stdio: 'inherit'
        });
      }

      this.logger.info(`Custom node ${nodeName} installed successfully`);
    } catch (error) {
      this.logger.error(`Failed to install custom node ${nodeName}:`, error);
      // Continue with other nodes even if one fails
    }
  }

  /**
   * Setup model symlinks based on static-models.json
   */
  async setupModelSymlinks() {
    this.logger.info('Setting up model symlinks...');
    
    try {
      if (!await fs.pathExists(this.staticModelsPath)) {
        this.logger.warn('static-models.json not found, skipping model symlinks');
        return;
      }

      const staticModels = await fs.readJson(this.staticModelsPath);
      
      // Extract symlinks array from the JSON structure
      const models = staticModels.symlinks || [];
      
      for (const model of models) {
        const sourcePath = path.join(this.workspacePath, model.source);
        const targetPath = path.join(this.workspacePath, model.target);
        
        if (await fs.pathExists(sourcePath)) {
          // Ensure target directory exists
          await fs.ensureDir(path.dirname(targetPath));
          
          // Create symlink if it doesn't exist
          if (!await fs.pathExists(targetPath)) {
            await fs.symlink(sourcePath, targetPath);
            this.logger.info(`Created symlink: ${model.source} -> ${model.target}`);
          }
        } else {
          this.logger.warn(`Source model not found: ${sourcePath}`);
        }
      }

      this.logger.info('Model symlinks setup completed');
    } catch (error) {
      this.logger.error('Model symlinks setup failed:', error);
      // Don't fail installation for symlink errors
    }
  }

  /**
   * Validate ComfyUI installation
   */
  async validateInstallation() {
    this.logger.info('Validating ComfyUI installation...');
    
    try {
      // Check main files exist
      const requiredFiles = [
        'main.py',
        'requirements.txt',
        'comfy',
        'custom_nodes'
      ];

      for (const file of requiredFiles) {
        const filePath = path.join(this.comfyuiPath, file);
        if (!await fs.pathExists(filePath)) {
          throw new Error(`Required file/directory missing: ${file}`);
        }
      }

      // Test Python import
      try {
        await execa('python3', [
          '-c', 
          'import comfy; print("ComfyUI imports successfully")'
        ], {
          cwd: this.comfyuiPath,
          stdio: 'pipe'
        });
        this.logger.info('Python imports validation passed');
      } catch (error) {
        this.logger.warn('Python imports validation failed, but continuing:', error.message);
      }

      this.logger.info('ComfyUI installation validation completed');
    } catch (error) {
      this.logger.error('ComfyUI installation validation failed:', error);
      throw new Error(`ComfyUI installation validation failed: ${error.message}`);
    }
  }

  /**
   * Get installation status for health checks
   */
  async getInstallationStatus() {
    try {
      const isInstalled = await this.isComfyUIInstalled();
      
      if (!isInstalled) {
        return {
          status: 'not_installed',
          message: 'ComfyUI is not installed'
        };
      }

      // Check if installation is valid
      try {
        await this.validateInstallation();
        return {
          status: 'installed',
          message: 'ComfyUI is properly installed'
        };
      } catch (error) {
        return {
          status: 'corrupted',
          message: `ComfyUI installation is corrupted: ${error.message}`
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Error checking installation: ${error.message}`
      };
    }
  }
}