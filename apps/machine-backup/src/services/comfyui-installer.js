import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { configNodes } from '@emp/service-config';

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
    // Custom nodes config now imported from @emp/service-config package
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
    
    // Step 3: Setup EmProps custom nodes from monorepo
    await this.setupEmpropsCustomNodes();
    
    // Step 4: Install 3rd party custom nodes
    await this.installCustomNodes();
    
    // Step 5: Setup model symlinks
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
   * Setup EmProps custom nodes from monorepo package
   * Copies nodes from packages/custom-nodes/src to ComfyUI/custom_nodes/emprops_comfy_nodes
   * Creates .env file with environment variables
   */
  async setupEmpropsCustomNodes() {
    this.logger.info('Setting up EmProps custom nodes from monorepo...');
    
    try {
      const empropsSource = path.resolve(__dirname, '../../../packages/custom-nodes/src');
      const empropsTarget = path.join(this.comfyuiPath, 'custom_nodes', 'emprops_comfy_nodes');
      
      // Ensure target directory exists
      await fs.ensureDir(path.dirname(empropsTarget));
      
      // Copy our custom nodes
      await fs.copy(empropsSource, empropsTarget, { 
        overwrite: true,
        filter: (src) => !src.includes('__pycache__') && !src.includes('.pyc')
      });
      this.logger.info(`Copied EmProps custom nodes to ${empropsTarget}`);
      
      // Install requirements.txt if it exists
      const requirementsPath = path.join(empropsTarget, 'requirements.txt');
      if (await fs.pathExists(requirementsPath)) {
        this.logger.info('Installing EmProps custom nodes requirements...');
        await execa('pip', ['install', '-r', requirementsPath], {
          cwd: empropsTarget,
          stdio: 'inherit'
        });
      }
      
      // Create .env file with environment variables
      await this.createEmpropsEnvFile(empropsTarget);
      
      this.logger.info('EmProps custom nodes setup completed');
    } catch (error) {
      this.logger.error('Failed to setup EmProps custom nodes:', error);
      throw new Error(`EmProps custom nodes setup failed: ${error.message}`);
    }
  }

  /**
   * Create .env file for EmProps custom nodes with all required environment variables
   */
  async createEmpropsEnvFile(empropsTarget) {
    const envConfig = {
      "AWS_ACCESS_KEY_ID": "${AWS_ACCESS_KEY_ID}",
      "AWS_SECRET_ACCESS_KEY_ENCODED": "${AWS_SECRET_ACCESS_KEY_ENCODED}",
      "AWS_DEFAULT_REGION": "${AWS_DEFAULT_REGION}",
      "GOOGLE_APPLICATION_CREDENTIALS": "${GOOGLE_APPLICATION_CREDENTIALS}",
      "AZURE_STORAGE_ACCOUNT": "${AZURE_STORAGE_ACCOUNT}",
      "AZURE_STORAGE_KEY": "${AZURE_STORAGE_KEY}",
      "CLOUD_STORAGE_CONTAINER": "${CLOUD_STORAGE_CONTAINER}",
      "CLOUD_MODELS_CONTAINER": "${CLOUD_MODELS_CONTAINER}",
      "CLOUD_STORAGE_TEST_CONTAINER": "${CLOUD_STORAGE_TEST_CONTAINER}",
      "CLOUD_PROVIDER": "${CLOUD_PROVIDER}",
      "STATIC_MODELS": "${STATIC_MODELS}",
      "EMPROPS_DEBUG_LOGGING": "${EMPROPS_DEBUG_LOGGING}",
      "HF_TOKEN": "${HF_TOKEN}",
      "CIVITAI_TOKEN": "${CIVITAI_TOKEN}",
      "OLLAMA_HOST": "${OLLAMA_HOST}",
      "OLLAMA_PORT": "${OLLAMA_PORT}",
      "OLLAMA_DEFAULT_MODEL": "${OLLAMA_DEFAULT_MODEL}"
    };
    
    await this.createEnvFile('emprops_comfy_nodes', envConfig, empropsTarget);
  }

  /**
   * Install 3rd party custom nodes based on config_nodes.json
   */
  async installCustomNodes() {
    this.logger.info('Installing custom nodes...');
    
    try {
      // Read custom nodes configuration from service-config package
      this.logger.info('Loading custom nodes config from @emp/service-config package');
      const config = configNodes;
      const customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
      
      // Ensure custom_nodes directory exists
      await fs.ensureDir(customNodesPath);

      // Handle different config formats
      let nodeConfigs = [];
      if (config.custom_nodes && Array.isArray(config.custom_nodes)) {
        // Standard format: { "custom_nodes": [...] }
        nodeConfigs = config.custom_nodes;
        this.logger.info(`Installing ${config.custom_nodes.length} custom nodes from custom_nodes array...`);
      } else if (Array.isArray(config)) {
        // Direct array format: [...]
        nodeConfigs = config;
        this.logger.info(`Installing ${config.length} custom nodes from direct array...`);
      } else if (typeof config === 'object') {
        // Object format: each key is a node name
        nodeConfigs = Object.entries(config).map(([name, nodeConfig]) => ({
          ...nodeConfig,
          name: name
        }));
        this.logger.info(`Installing ${Object.keys(config).length} custom nodes from object...`);
      } else {
        throw new Error('config_nodes.json must contain an array, object, or {custom_nodes: [...]} structure');
      }
      
      // Install custom nodes in parallel batches for better performance
      const batchSize = 5; // Clone 5 repos at a time to avoid overwhelming the system
      this.logger.info(`Installing custom nodes in batches of ${batchSize}...`);
      
      for (let i = 0; i < nodeConfigs.length; i += batchSize) {
        const batch = nodeConfigs.slice(i, i + batchSize);
        this.logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(nodeConfigs.length / batchSize)} (${batch.length} nodes)`);
        
        // Process this batch in parallel
        const batchPromises = batch.map((nodeConfig, batchIndex) => {
          const nodeName = nodeConfig.name || `custom-node-${i + batchIndex}`;
          return this.installCustomNode(nodeName, nodeConfig, customNodesPath);
        });
        
        // Wait for the entire batch to complete before proceeding
        await Promise.all(batchPromises);
        
        this.logger.info(`Batch ${Math.floor(i / batchSize) + 1} completed`);
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
    this.logger.info(`Installing custom node: ${nodeName}`, {
      url: nodeConfig.url,
      recursive: nodeConfig.recursive,
      requirements: nodeConfig.requirements,
      hasEnv: !!nodeConfig.env
    });
    
    try {
      const nodePath = path.join(customNodesPath, nodeName);
      
      // Clone the node repository
      if (nodeConfig.url) {
        const cloneArgs = ['clone'];
        
        // Add recursive flag if specified
        if (nodeConfig.recursive === true) {
          cloneArgs.push('--recursive');
          this.logger.info(`Using recursive clone for ${nodeName}`);
        }
        
        // Clean up URL - remove "git clone" prefix if present
        let cleanUrl = nodeConfig.url.trim();
        if (cleanUrl.startsWith('git clone ')) {
          cleanUrl = cleanUrl.substring('git clone '.length).trim();
          this.logger.info(`Cleaned URL from "${nodeConfig.url}" to "${cleanUrl}"`);
        }
        
        cloneArgs.push(cleanUrl, nodePath);
        
        // Add timeout to prevent hanging on slow/dead repositories
        await execa('git', cloneArgs, {
          stdio: 'inherit',
          timeout: 120000, // 2 minute timeout
          signal: AbortSignal.timeout(120000)
        });

        // Checkout specific branch or commit if specified
        if (nodeConfig.branch) {
          await execa('git', ['checkout', nodeConfig.branch], {
            cwd: nodePath,
            stdio: 'inherit',
            timeout: 30000 // 30 second timeout
          });
        }
        if (nodeConfig.commit) {
          await execa('git', ['reset', '--hard', nodeConfig.commit], {
            cwd: nodePath,
            stdio: 'inherit',
            timeout: 30000 // 30 second timeout
          });
        }
      }

      // Create .env file if env configuration is provided (unless --skip-env flag is set)
      if (nodeConfig.env && typeof nodeConfig.env === 'object' && !this.skipEnv) {
        await this.createEnvFile(nodeName, nodeConfig.env, nodePath);
      } else if (this.skipEnv) {
        this.logger.info(`Skipping .env file creation for ${nodeName} (--skip-env flag set)`);
      }

      // Install node dependencies based on requirements flag
      if (nodeConfig.requirements === true) {
        const requirementsPath = path.join(nodePath, 'requirements.txt');
        if (await fs.pathExists(requirementsPath)) {
          this.logger.info(`Installing requirements for ${nodeName} (requirements: true)...`);
          await execa('python3', [
            '-m', 'pip', 'install',
            '-r', 'requirements.txt'
          ], {
            cwd: nodePath,
            stdio: 'inherit',
            timeout: 300000 // 5 minute timeout for pip installs
          });
        } else {
          this.logger.warn(`${nodeName} has requirements: true but no requirements.txt found`);
        }
      } else if (await fs.pathExists(path.join(nodePath, 'requirements.txt'))) {
        // Only install if explicitly marked with requirements: true
        this.logger.info(`${nodeName} has requirements.txt but requirements flag not set, skipping pip install`);
      }

      // Run custom script if provided
      if (nodeConfig.custom_script) {
        this.logger.info(`Running custom script for ${nodeName}: ${nodeConfig.custom_script}`);
        try {
          await execa('bash', ['-c', nodeConfig.custom_script], {
            cwd: nodePath,
            stdio: 'inherit'
          });
          this.logger.info(`Custom script completed successfully for ${nodeName}`);
        } catch (error) {
          this.logger.error(`Custom script failed for ${nodeName}:`, error);
          // Continue with installation even if custom script fails
        }
      }

      this.logger.info(`Custom node ${nodeName} installed successfully`);
    } catch (error) {
      if (error.signal === 'SIGTERM' || error.message.includes('timeout')) {
        this.logger.error(`Custom node ${nodeName} installation timed out - skipping and continuing with next node`);
      } else if (error.message.includes('clone')) {
        this.logger.error(`Custom node ${nodeName} clone failed (repository may be down) - skipping and continuing with next node:`, error.message);
      } else {
        this.logger.error(`Failed to install custom node ${nodeName} - skipping and continuing with next node:`, error.message);
      }
      // Continue with other nodes even if one fails
    }
  }

  /**
   * Create .env file for custom node from environment variables
   */
  async createEnvFile(nodeName, envConfig, nodePath) {
    this.logger.info(`Creating .env file for ${nodeName}`);
    
    try {
      const envLines = [];
      
      for (const [envKey, envVarTemplate] of Object.entries(envConfig)) {
        // Handle ${VAR} format by extracting the variable name
        let envVarName = envVarTemplate;
        if (typeof envVarTemplate === 'string' && envVarTemplate.startsWith('${') && envVarTemplate.endsWith('}')) {
          envVarName = envVarTemplate.slice(2, -1); // Remove ${ and }
          this.logger.info(`Extracted variable name "${envVarName}" from template "${envVarTemplate}"`);
        }
        
        const envValue = process.env[envVarName];
        if (envValue !== undefined) {
          envLines.push(`${envKey}=${envValue}`);
          this.logger.info(`Added ${envKey} to ${nodeName} .env (from ${envVarName})`);
        } else {
          this.logger.warn(`Environment variable ${envVarName} not found for ${nodeName}.${envKey}`);
          // Still add the line but with empty value
          envLines.push(`${envKey}=`);
        }
      }
      
      if (envLines.length > 0) {
        const envFilePath = path.join(nodePath, '.env');
        await fs.writeFile(envFilePath, envLines.join('\n') + '\n');
        this.logger.info(`Created .env file for ${nodeName} with ${envLines.length} variables`);
      }
    } catch (error) {
      this.logger.error(`Failed to create .env file for ${nodeName}:`, error);
      // Don't fail the installation for .env errors
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

// Command line execution for build-time installation
if (process.argv.includes('--build-time')) {
  const customNodesOnly = process.argv.includes('--custom-nodes-only');
  const skipEnv = process.argv.includes('--skip-env');
  console.log(`🔧 Running ComfyUI installer in build-time mode${customNodesOnly ? ' (custom nodes only)' : ''}${skipEnv ? ' (skip .env files)' : ''}...`);
  
  // Create minimal config for build-time
  const buildConfig = {
    services: {
      'comfyui-installer': {
        repo_url: process.env.COMFYUI_REPO_URL || 'https://github.com/stakeordie/ComfyUI.git',
        branch: process.env.COMFYUI_BRANCH || 'forward',
        commit: process.env.COMFYUI_COMMIT || null,
        port_start: '8188'
      }
    }
  };
  
  // Create installer (config now comes from @emp/service-config package)
  const installer = new ComfyUIInstallerService({}, buildConfig);
  installer.skipEnv = skipEnv; // Set the skip env flag
  
  // Run appropriate installation based on flags
  const installPromise = customNodesOnly ? 
    installer.installCustomNodes() : 
    installer.onStart();
  
  installPromise
    .then(() => {
      console.log(`✅ ComfyUI build-time installation completed successfully${customNodesOnly ? ' (custom nodes only)' : ''}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error(`❌ ComfyUI build-time installation failed${customNodesOnly ? ' (custom nodes only)' : ''}:`, error);
      process.exit(1);
    });
}