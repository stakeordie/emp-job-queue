import { BaseService } from './base-service.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import EMPApiClient from './emp-api-client.js';
import TelemetryTracerDash0 from './telemetry-tracer-dash0.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Component Manager Service
 * 
 * Handles component-based machine configuration:
 * - Analyzes component requirements (custom nodes + models)
 * - Downloads and installs missing dependencies
 * - Updates worker capabilities based on component constraints
 * - Supports collections for multiple components
 */
export default class ComponentManagerService extends BaseService {
  constructor(options, config) {
    super('component-manager', options);
    this.config = config;
    this.workspacePath = process.env.WORKSPACE_PATH || '/workspace';
    this.comfyuiPath = path.join(this.workspacePath, 'ComfyUI');
    this.componentConfigPath = path.join(this.workspacePath, 'component-config.json');
    
    // Initialize EMP API client
    this.empApi = new EMPApiClient({
      baseUrl: process.env.EMPROPS_API_URL || process.env.EMP_API_URL,
      apiKey: process.env.EMPROPS_API_KEY,
      logger: this.logger
    });
    
    // Component configuration from environment
    this.components = this.parseComponentConfig();
    this.collections = this.parseCollectionConfig();
    
    // Initialize telemetry tracer
    this.tracer = new TelemetryTracerDash0(process.env.MACHINE_ID || 'unknown');

    this.logger.info('Component manager initialized', {
      components: this.components,
      collections: this.collections,
      workspacePath: this.workspacePath
    });
  }

  /**
   * Parse component configuration from environment variables
   * Supports:
   * - COMPONENTS="txt2img-flux,upscale-esrgan"
   * - COLLECTIONS="920b200a-4197-42c0-a9bd-7739bbdc4dfd"
   */
  parseComponentConfig() {
    const componentsEnv = process.env.COMPONENTS;
    if (!componentsEnv) return [];
    
    return componentsEnv.split(',').map(c => c.trim()).filter(Boolean);
  }

  parseCollectionConfig() {
    const collectionsEnv = process.env.COLLECTIONS;
    if (!collectionsEnv) return [];
    
    return collectionsEnv.split(',').map(c => c.trim()).filter(Boolean);
  }

  async onStart() {
    this.logger.info('Starting component-based configuration...');
    
    return this.tracer.traceComponentInstallation('component-manager-startup', async () => {
      try {
        // Step 1: Analyze all components and collections
        const allComponents = await this.gatherAllComponents();
        
        if (allComponents.length === 0) {
          this.logger.info('No components specified, skipping component-based configuration');
          return;
        }
        
        this.tracer.addAttributes({
          'components.count': allComponents.length,
          'components.names': allComponents.map(c => c.name).join(',')
        });
        
        this.logger.info(`Found ${allComponents.length} components to configure:`, allComponents.map(c => c.name));
        
        // Step 2: Analyze requirements
        const requirements = await this.analyzeRequirements(allComponents);
        
        this.tracer.addAttributes({
          'requirements.custom_nodes': requirements.customNodes.size,
          'requirements.models': requirements.models.size
        });
        
        // Step 3: Install missing dependencies
        await this.installMissingDependencies(requirements);
        
        // Step 4: Save component configuration for worker capabilities
        await this.saveComponentConfiguration(allComponents, requirements);
        
        this.logger.info('Component-based configuration completed successfully');
        
        return {
          components: allComponents.length,
          customNodes: requirements.customNodes.size,
          models: requirements.models.size
        };
      } catch (error) {
        this.logger.error('Component-based configuration failed:', error);
        throw error;
      }
    });
  }

  async onStop() {
    this.logger.info('Component manager stopping...');
    // No cleanup needed
  }

  /**
   * Gather all components from direct components and collections
   */
  async gatherAllComponents() {
    const allComponents = [];
    
    // Add direct components
    for (const componentName of this.components) {
      try {
        const component = await this.fetchComponent(componentName);
        allComponents.push(component);
      } catch (error) {
        this.logger.error(`Failed to fetch component ${componentName}:`, error.message);
        // Continue with other components
      }
    }
    
    // Add components from collections
    for (const collectionId of this.collections) {
      try {
        const collection = await this.fetchCollection(collectionId);
        for (const component of collection.components || []) {
          allComponents.push(component);
        }
      } catch (error) {
        this.logger.error(`Failed to fetch collection ${collectionId}:`, error.message);
        // Continue with other collections
      }
    }
    
    // Deduplicate by component ID
    const uniqueComponents = [];
    const seenIds = new Set();
    
    for (const component of allComponents) {
      if (!seenIds.has(component.id)) {
        seenIds.add(component.id);
        uniqueComponents.push(component);
      }
    }
    
    return uniqueComponents;
  }

  /**
   * Fetch component details from EMP API using dependencies endpoint
   */
  async fetchComponent(componentName) {
    this.logger.info(`Fetching component dependencies: ${componentName}`);
    
    try {
      // Use the new dependencies API
      const dependencies = await this.empApi.getWorkflowDependencies([componentName]);
      
      if (dependencies.length === 0) {
        throw new Error(`No workflow found with name: ${componentName}`);
      }
      
      const workflow = dependencies[0];
      
      // Convert to component format
      const component = {
        id: workflow.workflow_id,
        name: workflow.workflow_name,
        custom_nodes: workflow.custom_nodes || [],
        models: workflow.models || []
      };
      
      this.logger.info(`Successfully fetched component: ${component.name}`, {
        customNodesCount: component.custom_nodes.length,
        modelsCount: component.models.length
      });
      
      return component;
    } catch (error) {
      this.logger.error(`Failed to fetch component ${componentName}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch collection details from API using ECLI tool
   */
  async fetchCollection(collectionId) {
    this.logger.info(`Fetching collection: ${collectionId}`);
    
    try {
      const collection = await this.empApi.getCollection(collectionId);
      this.logger.info(`Successfully fetched collection: ${collection.name || collectionId} with ${collection.components?.length || 0} components`);
      return collection;
    } catch (error) {
      this.logger.error(`Failed to fetch collection ${collectionId}:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze requirements from all components
   */
  async analyzeRequirements(components) {
    this.logger.info('Analyzing component requirements...');
    
    const requirements = {
      customNodes: new Map(),
      models: new Map(),
      supportedComponents: []
    };
    
    for (const component of components) {
      try {
        // Log what we received from API
        this.logger.info(`Component ${component.name} API data:`, {
          hasCustomNodes: !!component.custom_nodes,
          customNodesCount: component.custom_nodes?.length || 0,
          hasModels: !!component.models,
          modelsCount: component.models?.length || 0
        });
        
        // Get custom nodes directly from API response and process them
        const rawCustomNodes = component.custom_nodes || [];
        const processedNodes = this.processCustomNodes(rawCustomNodes);
        for (const node of processedNodes) {
          if (node.name) {
            this.logger.info(`Adding custom node: ${node.name}`, { url: node.url });
            requirements.customNodes.set(node.name, node);
          }
        }
        
        // Get models directly from API response and process them
        const rawModels = component.models || [];
        const processedModels = this.processModels(rawModels);
        for (const model of processedModels) {
          if (model.name) {
            this.logger.info(`Adding model: ${model.name}`, { url: model.url });
            requirements.models.set(model.name, model);
          }
        }
        
        // Track supported components for worker capabilities
        requirements.supportedComponents.push({
          id: component.id,
          name: component.name,
          type: component.type
        });
        
        this.logger.info(`Component ${component.name} requires:`, {
          customNodes: processedNodes.length,
          models: processedModels.length
        });
      } catch (error) {
        this.logger.error(`Failed to analyze component ${component.name}:`, error.message);
        // Continue with other components
      }
    }
    
    this.logger.info('Requirements analysis completed', {
      uniqueCustomNodes: requirements.customNodes.size,
      uniqueModels: requirements.models.size,
      supportedComponents: requirements.supportedComponents.length
    });
    
    return requirements;
  }

  /**
   * Process custom nodes from API response
   * The API returns custom_nodes array with all required data
   */
  processCustomNodes(customNodes) {
    if (!Array.isArray(customNodes)) {
      return [];
    }
    
    return customNodes.map(node => {
      // Use the new API spec field names
      const processedNode = {
        name: node.name,
        url: node.repositoryUrl,  // New API spec uses 'repositoryUrl'
        branch: node.branch,
        commit: node.commit,
        recursive: node.recursive,
        requirements: node.requirements,
        env: node.env,
        custom_script: node.custom_script,
        version: node.version,
        description: node.description
      };
      
      // Remove undefined fields
      Object.keys(processedNode).forEach(key => {
        if (processedNode[key] === undefined) {
          delete processedNode[key];
        }
      });
      
      return processedNode;
    });
  }

  /**
   * Process models from API response
   * The API returns models array with all required data
   */
  processModels(models) {
    if (!Array.isArray(models)) {
      return [];
    }
    
    return models.map(model => {
      // Handle both string and object formats
      if (typeof model === 'string') {
        return {
          name: model,
          isRequired: true
        };
      }
      
      return {
        name: model.name || model.filename,
        type: model.type,
        modelType: model.modelType || model.type,
        downloadUrl: model.downloadUrl || model.url || model.download_url,
        isRequired: model.isRequired !== false,
        size: model.size,
        hash: model.hash
      };
    });
  }

  /**
   * Install missing dependencies
   */
  async installMissingDependencies(requirements) {
    this.logger.info('Installing missing dependencies...');
    
    // Install custom nodes
    await this.installCustomNodes(Array.from(requirements.customNodes.values()));
    
    // Install/download models
    await this.installModels(Array.from(requirements.models.values()));
    
    this.logger.info('Dependency installation completed');
  }

  /**
   * Install custom nodes using the ComfyUI installer
   */
  async installCustomNodes(customNodes) {
    if (customNodes.length === 0) {
      this.logger.info('No custom nodes to install');
      return;
    }
    
    return this.tracer.traceComponentInstallation('custom-nodes-batch', async () => {
      this.tracer.addAttributes({
        'custom_nodes.count': customNodes.length,
        'custom_nodes.names': customNodes.map(n => n.name).join(',')
      });
      
      this.logger.info(`Installing ${customNodes.length} custom nodes...`);
      
      try {
        // Import and use the ComfyUI installer
        const ComfyUIInstallerService = (await import('./comfyui-installer.js')).default;
        const installer = new ComfyUIInstallerService({}, this.config);
        
        // Install each custom node
        const customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
        await fs.ensureDir(customNodesPath);
        
        for (const nodeConfig of customNodes) {
          // Each custom node gets its own trace span
          await this.tracer.traceComponentInstallation(`custom-node-${nodeConfig.name}`, async () => {
            this.tracer.addAttributes({
              'custom_node.name': nodeConfig.name,
              'custom_node.url': nodeConfig.url || nodeConfig.gitUrl,
              'custom_node.type': nodeConfig.url ? 'url' : 'git'
            });
            
            await installer.installCustomNode(nodeConfig.name, nodeConfig, customNodesPath);
            return { name: nodeConfig.name };
          });
        }
      
        this.logger.info('Custom nodes installation completed');
        return { customNodes: customNodes.length };
      } catch (error) {
        this.logger.error('Custom nodes installation failed:', error);
        throw error;
      }
    });
  }

  /**
   * Install/download models
   * For now, we'll just log the models that would be downloaded
   * In the future, this will integrate with the model management system
   */
  async installModels(models) {
    if (models.length === 0) {
      this.logger.info('No models to install');
      return;
    }
    
    this.logger.info(`Installing ${models.length} models using wget...`);
    
    for (const model of models) {
      try {
        await this.downloadModel(model);
      } catch (error) {
        this.logger.error(`Failed to download model ${model.name}:`, error.message);
        // Continue with other models even if one fails
      }
    }
    
    this.logger.info('Model installation completed');
  }

  /**
   * Download a single model using wget
   */
  async downloadModel(model) {
    const { name, downloadUrl, modelType } = model;
    
    return this.tracer.traceModelDownload(name, downloadUrl, async () => {
      if (!downloadUrl) {
        this.logger.warn(`No download URL for model ${name}, skipping`);
        return;
      }

      // Determine target directory based on model type and file extension
      const targetDir = this.getModelDirectory(name, modelType);
      const targetPath = `${targetDir}/${name}`;
      
      this.tracer.addAttributes({
        'model.type': modelType,
        'model.target_path': targetPath,
        'model.target_dir': targetDir
      });
      
      this.logger.info(`Downloading model ${name} to ${targetPath}`);
    
    // Create target directory if it doesn't exist
    const { execSync } = await import('child_process');
    try {
      execSync(`mkdir -p "${targetDir}"`, { encoding: 'utf8' });
    } catch (error) {
      throw new Error(`Failed to create directory ${targetDir}: ${error.message}`);
    }
    
    // Check if model already exists
    try {
      execSync(`test -f "${targetPath}"`, { encoding: 'utf8' });
      this.logger.info(`Model ${name} already exists, skipping download`);
      return;
    } catch (error) {
      // File doesn't exist, proceed with download
    }
    
    // Download using wget with progress and resume support
    const wgetCmd = [
      'wget',
      '--continue',                    // Resume partial downloads
      '--progress=bar:force:noscroll', // Show progress bar
      '--timeout=30',                  // Connection timeout
      '--tries=3',                     // Retry 3 times
      '--user-agent="ComfyUI-Machine/1.0"', // Identify as ComfyUI machine
      `--output-document="${targetPath}"`,   // Target file path
      `"${downloadUrl}"`               // Source URL
    ].join(' ');
    
    this.logger.info(`Running: ${wgetCmd}`);
    
    try {
      execSync(wgetCmd, { 
        encoding: 'utf8',
        stdio: 'inherit' // Show wget progress in console
      });
      
      this.logger.info(`✅ Successfully downloaded model ${name}`);
      
      // Verify the downloaded file exists and has content
      const stat = execSync(`stat -c '%s' "${targetPath}"`, { encoding: 'utf8' });
      const fileSize = parseInt(stat.trim());
      if (fileSize > 0) {
        this.logger.info(`Model ${name} downloaded successfully (${this.formatFileSize(fileSize)})`);
        
        // Add to inventory
        await this.addModelToInventory(model, targetPath, fileSize);
        
        return { size: fileSize };
      } else {
        throw new Error(`Downloaded file is empty`);
      }
      
    } catch (error) {
      // Clean up partial download on failure
      try {
        execSync(`rm -f "${targetPath}"`, { encoding: 'utf8' });
      } catch (cleanupError) {
        this.logger.warn(`Failed to clean up partial download: ${cleanupError.message}`);
      }
      
      throw new Error(`wget failed: ${error.message}`);
    }
    });
  }

  /**
   * Determine the correct ComfyUI directory for a model based on its name and type
   */
  getModelDirectory(modelName, modelType) {
    const lowerName = modelName.toLowerCase();
    
    // Map file extensions and names to ComfyUI directories
    if (lowerName.includes('vae') || lowerName.includes('ae.safetensors')) {
      return '/workspace/ComfyUI/models/vae';
    } else if (lowerName.includes('clip') || lowerName.includes('t5xxl')) {
      return '/workspace/ComfyUI/models/clip';
    } else if (lowerName.includes('controlnet')) {
      return '/workspace/ComfyUI/models/controlnet';
    } else if (lowerName.includes('upscale') || lowerName.includes('esrgan')) {
      return '/workspace/ComfyUI/models/upscale_models';
    } else if (lowerName.includes('lora')) {
      return '/workspace/ComfyUI/models/loras';
    } else if (lowerName.includes('embedding') || lowerName.includes('textual_inversion')) {
      return '/workspace/ComfyUI/models/embeddings';
    } else if (modelType === 'checkpoint' || lowerName.includes('.safetensors') || lowerName.includes('.ckpt')) {
      // Default to checkpoints for main model files
      return '/workspace/ComfyUI/models/checkpoints';
    } else {
      // Fallback to checkpoints directory
      return '/workspace/ComfyUI/models/checkpoints';
    }
  }

  /**
   * Format file size for human-readable output
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Save component configuration for worker capabilities
   */
  async saveComponentConfiguration(components, requirements) {
    const config = {
      timestamp: new Date().toISOString(),
      components: requirements.supportedComponents,
      customNodes: Array.from(requirements.customNodes.keys()),
      models: Array.from(requirements.models.keys()),
      capabilities: {
        // Worker will accept all jobs based on standard service mapping
        supported_component_names: components.map(c => c.name)
      }
    };
    
    await fs.writeJSON(this.componentConfigPath, config, { spaces: 2 });
    this.logger.info('Component configuration saved', {
      configPath: this.componentConfigPath,
      supportedComponents: config.components.length
    });
  }

  /**
   * Get component configuration for worker capabilities
   */
  async getComponentConfiguration() {
    try {
      if (await fs.pathExists(this.componentConfigPath)) {
        return await fs.readJSON(this.componentConfigPath);
      }
    } catch (error) {
      this.logger.warn('Failed to read component configuration:', error.message);
    }
    
    return {
      components: [],
      customNodes: [],
      models: [],
      capabilities: {
        job_service_required_map: ['comfyui'],
        supported_component_ids: [],
        supported_component_names: []
      }
    };
  }
}