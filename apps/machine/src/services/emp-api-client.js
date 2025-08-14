/**
 * EMP API Client
 * 
 * Handles communication with the EMP API for component definitions,
 * custom nodes, models, and other resources needed for machine configuration.
 */
export class EMPApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.EMPROPS_API_URL || process.env.EMP_API_URL;
    this.apiKey = options.apiKey || process.env.EMPROPS_API_KEY;
    
    if (!this.baseUrl) {
      throw new Error('EMPROPS_API_URL environment variable is required');
    }
    
    this.logger = options.logger || console;
    
    this.logger.info('EMP API Client initialized', {
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey
    });
  }

  /**
   * Make request to EMP API (authentication optional)
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Skip authentication for now - API auth disabled
    // if (this.apiKey) {
    //   headers['Authorization'] = `Bearer ${this.apiKey}`;
    // }

    this.logger.info(`Making EMP API request: ${options.method || 'GET'} ${url}`);
    
    // Debug request body
    if (options.body) {
      let bodyLog;
      if (typeof options.body === 'string') {
        // Already a string, check if it's valid JSON
        try {
          JSON.parse(options.body);
          bodyLog = options.body; // Valid JSON string
        } catch {
          bodyLog = options.body; // Not JSON, just a string
        }
      } else {
        // Object, stringify it
        bodyLog = JSON.stringify(options.body);
      }
      this.logger.info(`Request body:`, bodyLog);
    }
    
    // Log full request details for debugging
    this.logger.info(`Full request details:`, {
      url,
      method: options.method || 'GET',
      headers: headers,
      bodyType: typeof options.body,
      bodyPresent: !!options.body
    });

    try {
      // Extract body from options to avoid spreading it and overriding our JSON
      const { body, method, headers: optionHeaders, ...otherOptions } = options;
      
      const response = await fetch(url, {
        method: method || 'GET',
        headers,
        body: body ? JSON.stringify(body) : undefined,
        ...otherOptions
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`EMP API request failed: ${url}`, {
          status: response.status,
          statusText: response.statusText,
          error: errorText.substring(0, 500), // Limit error text to first 500 chars
          requestMethod: method || 'GET',
          requestBody: body ? (typeof body === 'object' ? JSON.stringify(body) : body) : 'none'
        });
        
        // For 400 errors, log additional details to help with debugging
        if (response.status === 400) {
          this.logger.error(`HTTP 400 Bad Request details:`, {
            url,
            requestHeaders: headers,
            responseError: errorText
          });
        }
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        this.logger.error(`EMP API returned non-JSON response: ${url}`, {
          contentType,
          response: responseText.substring(0, 500)
        });
        throw new Error(`Expected JSON response but got: ${contentType}`);
      }

      const result = await response.json();
      this.logger.info(`EMP API request successful: ${url}`);
      
      return result;
    } catch (error) {
      // Don't log error details again if we already logged them above
      if (!error.message.includes('HTTP')) {
        this.logger.error(`EMP API request failed: ${url}`, error.message);
      }
      throw error;
    }
  }

  /**
   * Fetch workflow dependencies by names
   * Uses the new dependencies API endpoint
   */
  async getWorkflowDependencies(workflowNames) {
    this.logger.info(`Fetching dependencies for workflows: ${workflowNames.join(', ')}`);
    
    try {
      const result = await this.makeRequest('/workflows/dependencies', {
        method: 'POST',
        body: {
          workflow_names: workflowNames
        }
      });
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No dependencies data returned from API');
      }
      
      this.logger.info(`Successfully fetched dependencies for ${result.data.length} workflows`);
      
      return result.data;
    } catch (error) {
      this.logger.error(`Failed to fetch workflow dependencies for ${workflowNames.join(', ')}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch component definition by name (legacy method)
   * @deprecated Use getWorkflowDependencies instead
   */
  async getComponent(componentName) {
    this.logger.info(`Fetching component: ${componentName} (using dependencies API)`);
    
    try {
      const dependencies = await this.getWorkflowDependencies([componentName]);
      
      if (dependencies.length === 0) {
        throw new Error(`No workflow found with name: ${componentName}`);
      }
      
      const workflow = dependencies[0];
      
      // Convert to legacy format for compatibility
      const component = {
        id: workflow.workflow_id,
        name: workflow.workflow_name,
        custom_nodes: workflow.custom_nodes,
        models: workflow.models
      };
      
      this.logger.info(`Successfully fetched component: ${component.name}`, {
        hasModels: !!(component.models && component.models.length > 0),
        hasCustomNodes: !!(component.custom_nodes && component.custom_nodes.length > 0)
      });
      
      return component;
    } catch (error) {
      this.logger.error(`Failed to fetch component ${componentName}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch collection definition by ID
   * Returns collection with all its components
   */
  async getCollection(collectionId) {
    this.logger.info(`Fetching collection: ${collectionId}`);
    
    try {
      const result = await this.makeRequest(`/collections/${encodeURIComponent(collectionId)}`);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No collection data returned from API');
      }
      
      const collection = result.data;
      this.logger.info(`Successfully fetched collection: ${collection.name || collectionId}`, {
        componentsCount: collection.components?.length || 0
      });
      
      return collection;
    } catch (error) {
      this.logger.error(`Failed to fetch collection ${collectionId}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch custom node definition by name
   */
  async getCustomNode(nodeName) {
    this.logger.info(`Fetching custom node: ${nodeName}`);
    
    try {
      const result = await this.makeRequest(`/custom-nodes/name/${encodeURIComponent(nodeName)}`);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No custom node data returned from API');
      }
      
      const customNode = result.data;
      this.logger.info(`Successfully fetched custom node: ${customNode.name || nodeName}`, {
        repositoryUrl: customNode.repositoryUrl,
        branch: customNode.branch,
        hasEnv: !!(customNode.env && Object.keys(customNode.env).length > 0)
      });
      
      return customNode;
    } catch (error) {
      this.logger.error(`Failed to fetch custom node ${nodeName}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch model definition by name
   */
  async getModel(modelName) {
    this.logger.info(`Fetching model: ${modelName}`);
    
    try {
      const result = await this.makeRequest(`/models/name/${encodeURIComponent(modelName)}`);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      if (!result.data) {
        throw new Error('No model data returned from API');
      }
      
      const model = result.data;
      this.logger.info(`Successfully fetched model: ${model.name || modelName}`, {
        type: model.type,
        huggingfaceId: model.huggingface_id,
        status: model.status
      });
      
      return model;
    } catch (error) {
      this.logger.error(`Failed to fetch model ${modelName}:`, error.message);
      throw error;
    }
  }

  /**
   * List available components
   */
  async listComponents(options = {}) {
    this.logger.info('Listing components', options);
    
    const params = new URLSearchParams();
    if (options.search) params.set('search', options.search);
    if (options.limit) params.set('limit', options.limit);
    if (options.offset) params.set('offset', options.offset);
    
    const endpoint = `/workflows${params.toString() ? '?' + params.toString() : ''}`;
    
    try {
      const result = await this.makeRequest(endpoint);
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      const components = result.data || [];
      this.logger.info(`Listed ${components.length} components`);
      
      return components;
    } catch (error) {
      this.logger.error('Failed to list components:', error.message);
      throw error;
    }
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck() {
    try {
      // Simple endpoint to check connectivity
      await this.makeRequest('/health');
      this.logger.info('EMP API health check passed');
      return true;
    } catch (error) {
      this.logger.warn('EMP API health check failed:', error.message);
      return false;
    }
  }
}

export default EMPApiClient;