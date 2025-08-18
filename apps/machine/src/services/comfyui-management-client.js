/**
 * ComfyUI Management Client
 * 
 * Unified client that consolidates ALL ComfyUI installation complexity
 * Integrates and extends existing ComponentManager + EMPApiClient
 * Provides TelemetryClient-style interface for clean encapsulation
 */

import { BaseService } from './base-service.js';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import EMPApiClient from './emp-api-client.js';
import ComponentManagerService from './component-manager.js';
import { createSafeLogger } from '../utils/safe-logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ComfyUIManagementOptions configuration object structure:
// {
//   installMode?: 'full' | 'minimal' | 'runtime-only' | 'custom-nodes-only';
//   skipCustomNodes?: boolean;
//   skipModels?: boolean;
//   skipValidation?: boolean;
//   skipComponents?: boolean;
//   batchSize?: number;
//   timeouts?: {
//     clone?: number;
//     pip?: number;
//     customNode?: number;
//   };
// }

export class ComfyUIManagementClient {
  constructor(config, options = {}) {
    this.config = config;
    this.options = {
      installMode: 'full',
      skipCustomNodes: false,
      skipModels: false,
      skipValidation: false,
      skipComponents: false,
      batchSize: 5,
      timeouts: {
        clone: 120000,   // 2 minutes
        pip: 300000,     // 5 minutes
        customNode: 120000 // 2 minutes
      },
      ...options
    };

    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.comfyuiPath = path.join(this.workspacePath, 'ComfyUI');
    
    // Initialize logger (could be dependency injected)
    this.logger = createSafeLogger('comfyui-management-client');
    
    // Initialize existing managers - leverage what we already have
    this.empApi = new EMPApiClient({
      baseUrl: process.env.EMPROPS_API_URL || process.env.EMP_API_URL,
      apiKey: process.env.EMPROPS_API_KEY,
      logger: this.logger
    });
    
    this.componentManager = new ComponentManagerService({}, config);
    
    // Initialize focused sub-managers for specific tasks
    this.repositoryManager = new ComfyUIRepositoryManager(config, createSafeLogger('repository-manager'));
    this.dependencyManager = new ComfyUIDependencyManager(this.comfyuiPath, createSafeLogger('dependency-manager'));
    this.validationManager = new ComfyUIValidationManager(this.comfyuiPath, createSafeLogger('validation-manager'));
  }

  /**
   * Main installation entry point - orchestrates the entire ComfyUI setup
   * Integrates repository, dependencies, components, and validation
   */
  async install() {
    const startTime = Date.now();
    this.logger.info('🚀 ComfyUIManagementClient: Starting comprehensive ComfyUI installation...');
    
    const result = {
      success: false,
      duration: 0,
      steps: {
        repository: { success: false, duration: 0 },
        dependencies: { success: false, duration: 0 },
        empropsNodes: { success: false, duration: 0 },
        components: { success: false, duration: 0, defaultNodes: 0, additionalComponents: 0, customNodes: 0, models: 0 },
        validation: { success: false, duration: 0 }
      },
      errors: []
    };

    try {
      // Step 1: Repository Setup (unless custom-nodes-only mode)
      if (this.options.installMode !== 'custom-nodes-only') {
        result.steps.repository = await this.executeStep(
          'repository', () => this.repositoryManager.setup()
        );
      }

      // Step 2: Python Dependencies (unless custom-nodes-only mode)
      if (this.options.installMode !== 'custom-nodes-only') {
        result.steps.dependencies = await this.executeStep(
          'dependencies', () => this.dependencyManager.install()
        );
      }

      // Step 3: EmProps Custom Nodes (from monorepo)
      if (!this.options.skipCustomNodes) {
        result.steps.empropsNodes = await this.executeStep(
          'empropsNodes', () => this.installEmpropsCustomNodes()
        );
      }

      // Step 4: Component-based Installation (most complex - uses existing ComponentManager)
      if (!this.options.skipComponents) {
        result.steps.components = await this.executeStep(
          'components', () => this.componentManager.onStart()
        );
      }

      // Step 5: Validation
      if (!this.options.skipValidation) {
        result.steps.validation = await this.executeStep(
          'validation', () => this.validationManager.validate()
        );
      }

      result.success = this.allStepsSuccessful(result);
      result.duration = Date.now() - startTime;
      
      if (result.success) {
        this.logger.info(`✅ ComfyUIManagementClient: Installation completed successfully in ${result.duration}ms`);
      } else {
        this.logger.error(`❌ ComfyUIManagementClient: Installation failed after ${result.duration}ms`);
      }

      return result;
      
    } catch (error) {
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      this.logger.error('💥 ComfyUIManagementClient: Installation failed with error:', error);
      throw error;
    }
  }

  /**
   * Runtime-only installation - leverages existing ComfyUIInstallerService logic
   * For containers that need fast startup without full reinstallation
   */
  async installRuntime() {
    this.logger.info('⚡ ComfyUIManagementClient: Starting runtime-only installation...');
    
    const startTime = Date.now();
    const result = {
      success: false,
      duration: 0,
      steps: {
        repository: { success: false, duration: 0 },
        dependencies: { success: false, duration: 0 },
        empropsNodes: { success: false, duration: 0 },
        components: { success: false, duration: 0, defaultNodes: 0, additionalComponents: 0, customNodes: 0, models: 0 },
        validation: { success: false, duration: 0 }
      },
      errors: []
    };

    try {
      // Runtime mode: Always fresh clone (fast) + dependencies + components
      result.steps.repository = await this.executeStep(
        'repository', () => this.repositoryManager.setup()
      );

      result.steps.dependencies = await this.executeStep(
        'dependencies', () => this.dependencyManager.install()
      );

      result.steps.empropsNodes = await this.executeStep(
        'empropsNodes', () => this.installEmpropsCustomNodes()
      );

      // Use ComponentManager for API-based custom nodes + models
      result.steps.components = await this.executeStep(
        'components', () => this.componentManager.onStart()
      );

      // Setup model symlinks
      await this.executeStep(
        'models', () => this.setupModelSymlinks()
      );

      result.success = true;
      result.duration = Date.now() - startTime;
      
      this.logger.info(`✅ ComfyUIManagementClient: Runtime installation completed in ${result.duration}ms`);
      return result;

    } catch (error) {
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;
      this.logger.error('💥 ComfyUIManagementClient: Runtime installation failed:', error);
      throw error;
    }
  }

  /**
   * Install EmProps custom nodes from monorepo
   * Extracted from existing ComfyUIInstallerService logic
   */
  async installEmpropsCustomNodes() {
    this.logger.info('🏢 ComfyUIManagementClient: Installing EmProps custom nodes from monorepo...');
    
    const customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
    const empropsSource = path.resolve(__dirname, '../../../packages/custom-nodes/src');
    const empropsTarget = path.join(customNodesPath, 'emprops_comfy_nodes');
    
    // Ensure target directory exists
    await fs.ensureDir(path.dirname(empropsTarget));
    
    // Copy our custom nodes
    await fs.copy(empropsSource, empropsTarget, { 
      overwrite: true,
      filter: (src) => !src.includes('__pycache__') && !src.includes('.pyc')
    });
    
    // Install requirements if they exist
    const requirementsPath = path.join(empropsTarget, 'requirements.txt');
    if (await fs.pathExists(requirementsPath)) {
      await execa('pip', ['install', '-r', requirementsPath], {
        cwd: empropsTarget,
        stdio: 'inherit'
      });
    }
    
    // Create .env file with environment variables
    await this.createEmpropsEnvFile(empropsTarget);
  }

  /**
   * Create .env file for EmProps custom nodes
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
   * Setup model symlinks - extracted from existing logic
   */
  async setupModelSymlinks() {
    this.logger.info('🔗 ComfyUIManagementClient: Setting up model symlinks...');
    
    const staticModelsPath = path.join(this.workspacePath, 'shared', 'static-models.json');
    
    if (!await fs.pathExists(staticModelsPath)) {
      this.logger.warn('⚠️  static-models.json not found, skipping model symlinks');
      return;
    }

    const staticModels = await fs.readJson(staticModelsPath);
    const models = staticModels.symlinks || [];
    
    for (const model of models) {
      const sourcePath = path.join(this.workspacePath, model.source);
      const targetPath = path.join(this.workspacePath, model.target);
      
      if (await fs.pathExists(sourcePath)) {
        await fs.ensureDir(path.dirname(targetPath));
        
        if (!await fs.pathExists(targetPath)) {
          await fs.symlink(sourcePath, targetPath);
          this.logger.info(`🔗 Created symlink: ${model.source} -> ${model.target}`);
        }
      }
    }
  }

  /**
   * Create .env file from environment variables (reused utility)
   */
  async createEnvFile(nodeName, envConfig, nodePath) {
    const envLines = [];
    
    for (const [envKey, envVarTemplate] of Object.entries(envConfig)) {
      let envVarName = envVarTemplate;
      if (typeof envVarTemplate === 'string' && envVarTemplate.startsWith('${') && envVarTemplate.endsWith('}')) {
        envVarName = envVarTemplate.slice(2, -1);
      }
      
      const envValue = process.env[envVarName];
      if (envValue !== undefined) {
        envLines.push(`${envKey}=${envValue}`);
      } else {
        envLines.push(`${envKey}=`);
      }
    }
    
    if (envLines.length > 0) {
      const envFilePath = path.join(nodePath, '.env');
      await fs.writeFile(envFilePath, envLines.join('\n') + '\n');
    }
  }

  /**
   * Execute a single installation step with timing and error handling
   */
  async executeStep(stepName, stepFunction) {
    const stepStart = Date.now();
    this.logger.info(`🔧 ComfyUIManagementClient: Starting ${stepName} step...`);
    
    try {
      const stepResult = await stepFunction();
      const duration = Date.now() - stepStart;
      this.logger.info(`✅ ComfyUIManagementClient: ${stepName} completed in ${duration}ms`);
      
      return {
        success: true,
        duration,
        ...stepResult
      };
    } catch (error) {
      const duration = Date.now() - stepStart;
      this.logger.error(`❌ ComfyUIManagementClient: ${stepName} failed after ${duration}ms:`, error);
      
      return {
        success: false,
        duration,
        error: error.message
      };
    }
  }

  /**
   * Check if all required steps completed successfully
   */
  allStepsSuccessful(result) {
    const requiredSteps = [];
    
    if (this.options.installMode !== 'custom-nodes-only') {
      requiredSteps.push('repository', 'dependencies');
    }
    
    if (!this.options.skipCustomNodes) {
      requiredSteps.push('empropsNodes');
    }
    
    if (!this.options.skipComponents) {
      requiredSteps.push('components');
    }
    
    if (!this.options.skipValidation) {
      requiredSteps.push('validation');
    }

    return requiredSteps.every(step => result.steps[step]?.success);
  }

  /**
   * Get current installation status for health checks
   */
  async getStatus() {
    return await this.validationManager.getInstallationStatus();
  }

  /**
   * Clean installation (for fresh installs)
   */
  async clean() {
    this.logger.info('🧹 ComfyUIManagementClient: Cleaning previous installation...');
    
    if (await fs.pathExists(this.comfyuiPath)) {
      await fs.remove(this.comfyuiPath);
      this.logger.info('✅ ComfyUIManagementClient: Previous installation cleaned');
    }
  }

  /**
   * Validate installation without full reinstall
   */
  async validate() {
    try {
      await this.validationManager.validate();
      return true;
    } catch (error) {
      this.logger.error('❌ ComfyUIManagementClient: Validation failed:', error);
      return false;
    }
  }

  /**
   * Get component configuration (delegates to ComponentManager)
   */
  async getComponentConfiguration() {
    return await this.componentManager.getComponentConfiguration();
  }

  /**
   * Access to underlying managers for advanced usage
   */
  get managers() {
    return {
      empApi: this.empApi,
      componentManager: this.componentManager,
      repository: this.repositoryManager,
      dependency: this.dependencyManager,
      validation: this.validationManager
    };
  }
}

/**
 * Repository Manager - Handles Git operations (focused version)
 */
class ComfyUIRepositoryManager {

  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.comfyuiPath = path.join(process.env.WORKSPACE_PATH || '/workspace', 'ComfyUI');
    
    this.repoUrl = process.env.COMFYUI_REPO_URL || 
                   config.services?.comfyui?.installer_config?.repo_url || 
                   'https://github.com/stakeordie/ComfyUI.git';
    this.branch = process.env.COMFYUI_BRANCH || 
                  config.services?.comfyui?.installer_config?.branch || 
                  'forward';
    this.commit = process.env.COMFYUI_COMMIT || 
                  config.services?.comfyui?.installer_config?.commit || 
                  null;
  }

  async setup() {
    this.logger.info(`📥 RepositoryManager: Cloning ${this.repoUrl}`);
    
    // Remove existing directory
    if (await fs.pathExists(this.comfyuiPath)) {
      await fs.remove(this.comfyuiPath);
    }

    // Clone repository
    await execa('git', ['clone', this.repoUrl, this.comfyuiPath], {
      stdio: 'inherit',
      timeout: 120000
    });

    // Handle fork-specific branching
    if (this.repoUrl.includes('stakeordie')) {
      await execa('git', ['checkout', this.branch], {
        cwd: this.comfyuiPath,
        stdio: 'inherit'
      });
    } else if (this.commit) {
      await execa('git', ['reset', '--hard', this.commit], {
        cwd: this.comfyuiPath,
        stdio: 'inherit'
      });
    }
  }
}

/**
 * Dependency Manager - Handles Python dependencies (focused version)
 */
class ComfyUIDependencyManager {

  constructor(comfyuiPath, logger) {
    this.comfyuiPath = comfyuiPath;
    this.logger = logger;
  }

  async install() {
    this.logger.info('📦 DependencyManager: Installing Python dependencies...');
    
    const requirementsPath = path.join(this.comfyuiPath, 'requirements.txt');
    
    if (!await fs.pathExists(requirementsPath)) {
      throw new Error('requirements.txt not found in ComfyUI directory');
    }

    await execa('python3', ['-m', 'pip', 'install', '-r', 'requirements.txt'], {
      cwd: this.comfyuiPath,
      stdio: 'inherit',
      timeout: 300000
    });
  }
}

/**
 * Validation Manager - Handles installation validation (focused version)
 */
class ComfyUIValidationManager {

  constructor(comfyuiPath, logger) {
    this.comfyuiPath = comfyuiPath;
    this.logger = logger;
  }

  async validate() {
    this.logger.info('✅ ValidationManager: Validating ComfyUI installation...');
    
    // Check required files
    const requiredFiles = ['main.py', 'requirements.txt', 'comfy', 'custom_nodes'];
    
    for (const file of requiredFiles) {
      const filePath = path.join(this.comfyuiPath, file);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`Required file/directory missing: ${file}`);
      }
    }

    // Test Python imports (non-blocking)
    try {
      await execa('python3', ['-c', 'import comfy; print("ComfyUI imports successfully")'], {
        cwd: this.comfyuiPath,
        stdio: 'pipe'
      });
    } catch (error) {
      this.logger.warn('⚠️  Python imports validation failed, but continuing:', error.message);
    }
  }

  async getInstallationStatus() {
    try {
      const mainPyExists = await fs.pathExists(path.join(this.comfyuiPath, 'main.py'));
      const requirementsExists = await fs.pathExists(path.join(this.comfyuiPath, 'requirements.txt'));
      
      if (!mainPyExists || !requirementsExists) {
        return {
          status: 'not_installed',
          message: 'ComfyUI is not installed'
        };
      }

      try {
        await this.validate();
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

// Type definitions for JSDoc
/**
 * @typedef {Object} ComfyUIManagementResult
 * @property {boolean} success
 * @property {number} duration
 * @property {Object} steps
 * @property {string[]} errors
 */

/**
 * @typedef {Object} ComfyUIInstallationStatus
 * @property {'not_installed'|'installed'|'corrupted'|'error'} status
 * @property {string} message
 */

/**
 * Factory function to create ComfyUIManagementClient (similar to createTelemetryClient)
 */
export function createComfyUIManagementClient(config, options = {}) {
  return new ComfyUIManagementClient(config, options);
}

export default ComfyUIManagementClient;