import { BaseService } from './base-service.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

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
    
    // Component configuration from environment
    this.components = this.parseComponentConfig();
    this.collections = this.parseCollectionConfig();
    
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
    
    try {
      // Step 1: Analyze all components and collections
      const allComponents = await this.gatherAllComponents();
      
      if (allComponents.length === 0) {
        this.logger.info('No components specified, skipping component-based configuration');
        return;
      }
      
      this.logger.info(`Found ${allComponents.length} components to configure:`, allComponents.map(c => c.name));
      
      // Step 2: Analyze requirements
      const requirements = await this.analyzeRequirements(allComponents);
      
      // Step 3: Install missing dependencies
      await this.installMissingDependencies(requirements);
      
      // Step 4: Save component configuration for worker capabilities
      await this.saveComponentConfiguration(allComponents, requirements);
      
      this.logger.info('Component-based configuration completed successfully');
    } catch (error) {
      this.logger.error('Component-based configuration failed:', error);
      throw error;
    }
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
   * Fetch component details from API using ECLI tool
   */
  async fetchComponent(componentName) {
    this.logger.info(`Fetching component: ${componentName}`);
    
    try {
      // Use ECLI to get component details
      const { execa } = await import('execa');
      const componentLibraryPath = path.resolve(__dirname, '../../../../packages/component-library');
      
      const result = await execa('node', ['index.js', 'component', 'get', componentName], {
        cwd: componentLibraryPath,
        stdio: 'pipe'
      });
      
      // Parse the JSON output - find the JSON block after the description line
      const output = result.stdout;
      const jsonStartIndex = output.indexOf('{');
      
      if (jsonStartIndex === -1) {
        throw new Error('No JSON response found from ECLI component get command');
      }
      
      const jsonContent = output.substring(jsonStartIndex);
      const component = JSON.parse(jsonContent);
      this.logger.info(`Successfully fetched component: ${component.name}`);
      
      return component;
    } catch (error) {
      throw new Error(`Failed to fetch component ${componentName}: ${error.message}`);
    }
  }

  /**
   * Fetch collection details from API using ECLI tool
   */
  async fetchCollection(collectionId) {
    this.logger.info(`Fetching collection: ${collectionId}`);
    
    try {
      // Use ECLI to get collection details
      const { execa } = await import('execa');
      const componentLibraryPath = path.resolve(__dirname, '../../../packages/component-library');
      
      const result = await execa('node', ['index.js', 'collection', 'get', collectionId], {
        cwd: componentLibraryPath,
        stdio: 'pipe'
      });
      
      // Parse the JSON output
      const lines = result.stdout.split('\n');
      const jsonLine = lines.find(line => line.trim().startsWith('{'));
      
      if (!jsonLine) {
        throw new Error('No JSON response found from ECLI collection get command');
      }
      
      const collection = JSON.parse(jsonLine);
      this.logger.info(`Successfully fetched collection: ${collection.name} with ${collection.components?.length || 0} components`);
      
      return collection;
    } catch (error) {
      throw new Error(`Failed to fetch collection ${collectionId}: ${error.message}`);
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
        // Extract custom nodes from workflow
        const customNodes = this.extractCustomNodesFromWorkflow(component);
        for (const node of customNodes) {
          requirements.customNodes.set(node.name, node);
        }
        
        // Extract models from component
        const models = this.extractModelsFromComponent(component);
        for (const model of models) {
          requirements.models.set(model.name, model);
        }
        
        // Track supported components for worker capabilities
        requirements.supportedComponents.push({
          id: component.id,
          name: component.name,
          type: component.type
        });
        
        this.logger.info(`Component ${component.name} requires:`, {
          customNodes: customNodes.length,
          models: models.length
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
   * Extract custom nodes from component workflow
   */
  extractCustomNodesFromWorkflow(component) {
    const customNodes = [];
    const workflow = component.data?.workflow || {};
    
    // Known EmProps custom nodes that need to be installed
    const empropsNodeTypes = [
      'EmProps_Cloud_Storage_Saver',
      'EmProps_VAE_Loader',
      'EmProps_Asset_Downloader',
      'EmProps_DualCLIP_Loader',
      'EmProps_Diffusion_Model_Loader'
    ];
    
    // Scan workflow for custom node usage
    for (const nodeId in workflow) {
      const node = workflow[nodeId];
      const classType = node.class_type;
      
      if (empropsNodeTypes.includes(classType)) {
        // EmProps nodes are handled by the monorepo package
        if (!customNodes.find(n => n.name === 'emprops_comfy_nodes')) {
          customNodes.push({
            name: 'emprops_comfy_nodes',
            repositoryUrl: 'https://github.com/stakeordie/emprops_comfy_nodes.git',
            recursive: true,
            requirements: true,
            env: {
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
            }
          });
        }
      }
    }
    
    return customNodes;
  }

  /**
   * Extract models from component data
   */
  extractModelsFromComponent(component) {
    const models = [];
    
    // Get models from workflow_models if available
    if (component.workflow_models && Array.isArray(component.workflow_models)) {
      for (const workflowModel of component.workflow_models) {
        if (workflowModel.model?.name) {
          models.push({
            name: workflowModel.model.name,
            isRequired: workflowModel.isRequired || false,
            source: 'workflow_models'
          });
        }
      }
    }
    
    // Get models from data.models if available
    if (component.data?.models && Array.isArray(component.data.models)) {
      for (const modelName of component.data.models) {
        if (!models.find(m => m.name === modelName)) {
          models.push({
            name: modelName,
            isRequired: true,
            source: 'data.models'
          });
        }
      }
    }
    
    // Get models from models array if available
    if (component.models && Array.isArray(component.models)) {
      for (const modelName of component.models) {
        if (!models.find(m => m.name === modelName)) {
          models.push({
            name: modelName,
            isRequired: true,
            source: 'models'
          });
        }
      }
    }
    
    return models;
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
    
    this.logger.info(`Installing ${customNodes.length} custom nodes...`);
    
    try {
      // Import and use the ComfyUI installer
      const ComfyUIInstallerService = (await import('./comfyui-installer.js')).default;
      const installer = new ComfyUIInstallerService({}, this.config);
      
      // Install each custom node
      const customNodesPath = path.join(this.comfyuiPath, 'custom_nodes');
      await fs.ensureDir(customNodesPath);
      
      for (const nodeConfig of customNodes) {
        await installer.installCustomNode(nodeConfig.name, nodeConfig, customNodesPath);
      }
      
      this.logger.info('Custom nodes installation completed');
    } catch (error) {
      this.logger.error('Custom nodes installation failed:', error);
      throw error;
    }
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
    
    this.logger.info(`Models that would be downloaded: ${models.map(m => m.name).join(', ')}`);
    
    // TODO: Implement model downloading
    // This will integrate with the EmProps Asset Downloader or the model management system
    // For now, models are downloaded at runtime by the EmProps_Asset_Downloader nodes in the workflow
    
    this.logger.info('Model installation completed (handled at runtime)');
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