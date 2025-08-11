// Connector Manager - dynamic loading and management of service connectors
// Direct port from Python worker/connector_loader.py functionality

import {
  ConnectorInterface,
  ConnectorRegistry,
  ConnectorFactory,
  ConnectorStatus,
  logger,
} from '@emp/core';
import Redis from 'ioredis';

export class ConnectorManager implements ConnectorRegistry, ConnectorFactory {
  private connectors = new Map<string, ConnectorInterface>();
  private connectorsByServiceType = new Map<string, ConnectorInterface[]>();
  private redis?: Redis;
  private workerId?: string;
  private machineId?: string;
  private parentWorker?: any; // Reference to parent worker for immediate status updates

  constructor() {}

  /**
   * Set Redis connection details to be injected into all connectors
   */
  setRedisConnection(redis: Redis, workerId: string, machineId?: string): void {
    this.redis = redis;
    this.workerId = workerId;
    this.machineId = machineId;
    logger.debug(`ConnectorManager received Redis connection for worker ${workerId}`);
  }

  /**
   * Set parent worker reference for immediate status updates
   */
  setParentWorker(worker: any): void {
    this.parentWorker = worker;

    // Update all existing connectors with parent worker reference
    for (const connector of this.connectors.values()) {
      if ('setParentWorker' in connector && typeof connector.setParentWorker === 'function') {
        (connector as any).setParentWorker(worker);
      }
    }

    logger.debug('ConnectorManager received parent worker reference');
  }

  async loadConnectors(): Promise<void> {
    // Get worker types from environment variable
    const workersEnv =
      process.env.WORKERS || process.env.WORKER_CONNECTORS || process.env.CONNECTORS || '';
    const workerSpecs = workersEnv
      .split(',')
      .map(s => s.trim())
      .filter(s => s)
      .map(spec => spec.split(':')[0]); // Extract type from "type:count"

    if (workerSpecs.length === 0) {
      logger.warn('No workers specified in WORKERS environment variable');
      return;
    }

    logger.debug(`Loading connectors for worker types: ${workerSpecs.join(', ')}`);

    // Load service mapping to get the actual connectors to load
    const connectorsToLoad = new Set<string>();

    try {
      const fs = await import('fs');
      const possiblePaths = [
        '/workspace/worker-bundled/src/config/service-mapping.json',
        '/service-manager/worker-bundled/src/config/service-mapping.json',
        '/workspace/src/config/service-mapping.json',
        '/service-manager/src/config/service-mapping.json',
        './src/config/service-mapping.json',
      ];

      let serviceMappingPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceMappingPath = p;
          break;
        }
      }

      if (!serviceMappingPath) {
        throw new Error(
          `SYSTEM IS FUCKED: service-mapping.json not found in any of these paths: ${possiblePaths.join(', ')}. Cannot determine what connectors to load.`
        );
      }

      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      const serviceMapping = JSON.parse(serviceMappingContent);

      // Extract connectors from worker specifications using NEW service mapping structure
      for (const workerType of workerSpecs) {
        const workerConfig = serviceMapping.workers?.[workerType];
        if (workerConfig && workerConfig.job_service_required_map) {
          // NEW structure: get connectors from the worker_service field in job_service_required_map
          for (const mapping of workerConfig.job_service_required_map) {
            if (mapping.worker_service) {
              // Map worker_service to connector name using service mapping
              const serviceConfig = serviceMapping.services?.[mapping.worker_service];
              if (serviceConfig && serviceConfig.connector) {
                connectorsToLoad.add(serviceConfig.connector);
              }
            }
          }
        } else {
          throw new Error(
            `SYSTEM IS FUCKED: Worker type '${workerType}' not found in service mapping or has no job_service_required_map. Available worker types: ${Object.keys(serviceMapping.workers || {}).join(', ')}`
          );
        }
      }
    } catch (error) {
      logger.error('Failed to load service mapping, falling back to worker type names:', error);
      // Fallback to using worker type names as connector names
      workerSpecs.forEach(spec => connectorsToLoad.add(spec));
    }

    logger.debug(`Loading connectors: ${Array.from(connectorsToLoad).join(', ')}`);

    for (const connectorName of connectorsToLoad) {
      try {
        await this.loadConnector(connectorName);
      } catch (error) {
        logger.error(`Failed to load connector ${connectorName}:`, error);
        // Continue loading other connectors even if one fails
      }
    }

    logger.info(`✅ Loaded ${this.connectors.size} connectors successfully`);
  }

  /**
   * Create an offline stub connector for services that failed to initialize
   */
  private async createOfflineConnector(
    connectorId: string,
    originalError: unknown
  ): Promise<ConnectorInterface> {
    // Import BaseConnector to create a minimal stub
    const { BaseConnector } = await import('./connectors/base-connector.js');

    // Determine service type from connector ID
    const serviceType = connectorId.toLowerCase();

    class OfflineStubConnector extends BaseConnector {
      public service_type = serviceType;
      public version = '1.0.0-offline';

      constructor() {
        super(connectorId, {
          connector_id: connectorId,
          service_type: serviceType,
          base_url: 'http://offline',
          timeout_seconds: 30,
          retry_attempts: 0,
          retry_delay_seconds: 1,
          health_check_interval_seconds: 60,
          max_concurrent_jobs: 0,
        });

        // Set to offline status
        this.currentStatus = 'offline';
      }

      async initializeService(): Promise<void> {
        // Do nothing - service is offline
        this.currentStatus = 'offline';
      }

      async checkHealth(): Promise<boolean> {
        return false;
      }

      async getAvailableModels(): Promise<string[]> {
        return [];
      }

      async getServiceInfo(): Promise<any> {
        return {
          service_name: `${serviceType} (Offline)`,
          service_version: 'offline',
          base_url: 'http://offline',
          status: 'offline',
          capabilities: {
            supported_formats: [],
            supported_models: [],
            features: [],
          },
        };
      }

      async canProcessJob(): Promise<boolean> {
        return false;
      }

      async processJob(): Promise<any> {
        throw new Error(`${serviceType} service is offline: ${originalError}`);
      }

      async cancelJob(): Promise<void> {
        // Do nothing
      }

      async updateConfiguration(): Promise<void> {
        // Do nothing
      }

      getConfiguration(): any {
        return this.config;
      }

      // Required abstract methods from BaseConnector
      async cleanupService(): Promise<void> {
        // Do nothing - service is offline
      }

      async processJobImpl(): Promise<any> {
        throw new Error(`${serviceType} service is offline: ${originalError}`);
      }
    }

    return new OfflineStubConnector();
  }

  private async loadConnector(connectorName: string): Promise<void> {
    // connectorName is the actual connector class name (e.g., "ComfyUIRemoteConnector")
    let ConnectorClass;

    try {
      // Load service mapping to get connector configuration
      const fs = await import('fs');
      const possiblePaths = [
        '/workspace/worker-bundled/src/config/service-mapping.json',
        '/service-manager/worker-bundled/src/config/service-mapping.json',
        '/workspace/src/config/service-mapping.json',
        '/service-manager/src/config/service-mapping.json',
        './src/config/service-mapping.json',
      ];

      let serviceMappingPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceMappingPath = p;
          break;
        }
      }

      if (!serviceMappingPath) {
        // Fallback to hardcoded mapping for basic connectors
        logger.warn(
          `service-mapping.json not found, using fallback for connector ${connectorName}`
        );
        ConnectorClass = await this.loadConnectorFallback(connectorName);
      } else {
        const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
        const serviceMapping = JSON.parse(serviceMappingContent);

        // Look for this connector name in the connectors section
        if (serviceMapping.connectors && serviceMapping.connectors[connectorName]) {
          const connectorConfig = serviceMapping.connectors[connectorName];
          const { path: modulePath } = connectorConfig;
          ConnectorClass = await this.loadConnectorFromPath(modulePath, connectorName);
        } else {
          throw new Error(
            `Connector ${connectorName} not found in connectors section of service mapping`
          );
        }
      }

      // Create connector instance
      const connector = new ConnectorClass(connectorName);

      // Inject Redis connection if available
      if (this.redis && this.workerId) {
        connector.setRedisConnection(this.redis, this.workerId, this.machineId);
        logger.debug(`Injected Redis connection into connector ${connectorName}`);
      } else {
        logger.debug(
          `No Redis connection available for connector ${connectorName} - status reporting may be limited`
        );
      }

      // Initialize the connector first - fail fast if it doesn't work
      await connector.initialize();

      // Only register the connector after successful initialization
      this.registerConnector(connector);

      logger.info(`✅ ${connectorName} (${connector.service_type})`);
    } catch (error) {
      logger.error(`❌ Failed to load connector ${connectorName}:`, error);

      // Fail fast with clear error message - don't register broken connectors
      throw new Error(
        `Connector ${connectorName} failed to initialize and cannot be used. ` +
          `Root cause: ${error.message}. ` +
          `This worker cannot start without a working ${connectorName} connector.`
      );
    }
  }

  private async loadConnectorFromPath(modulePath: string, className: string): Promise<any> {
    try {
      logger.debug(`Loading connector ${className} from ${modulePath}`);
      const module = await import(modulePath);
      const ConnectorClass = module[className];

      if (!ConnectorClass) {
        throw new Error(`Class ${className} not found in ${modulePath}`);
      }

      // Validation: Test instantiation and basic methods
      logger.debug(`Validating connector ${className}...`);
      try {
        // Test constructor
        const testInstance = new ConnectorClass(`test-${className.toLowerCase()}`);

        // Verify required properties exist
        if (typeof testInstance.service_type !== 'string') {
          throw new Error(`service_type property missing or invalid`);
        }
        if (typeof testInstance.connector_id !== 'string') {
          throw new Error(`connector_id property missing or invalid`);
        }

        // Verify required methods exist
        const requiredMethods = [
          'initializeService',
          'checkHealth',
          'processJobImpl',
          'cleanupService',
        ];
        for (const method of requiredMethods) {
          if (typeof testInstance[method] !== 'function') {
            throw new Error(`Required method ${method} missing or not a function`);
          }
        }

        logger.debug(`Connector ${className} validation passed`);
      } catch (validationError) {
        logger.error(`❌ Connector ${className} validation failed: ${validationError.message}`);
        throw new Error(`Connector validation failed: ${validationError.message}`);
      }

      // Validate environment variables for this connector
      if (typeof ConnectorClass.getRequiredEnvVars === 'function') {
        this.validateConnectorEnvironment(className, ConnectorClass);
      }

      logger.debug(`Successfully loaded and validated connector ${className} from ${modulePath}`);
      return ConnectorClass;
    } catch (error) {
      logger.error(`Failed to load connector from ${modulePath}:`, error);
      throw new Error(`Could not load connector from ${modulePath}: ${error.message}`);
    }
  }

  private async loadConnectorByNamingConvention(connectorId: string): Promise<any> {
    // Convert connector ID to class name and file name using naming convention
    // Examples:
    // - "comfyui-remote" -> "ComfyUIRemoteConnector" in "./connectors/comfyui-remote-connector.js"
    // - "simulation" -> "SimulationConnector" in "./connectors/simulation-connector.js"

    const fileName = `${connectorId}-connector.js`;
    const className = this.connectorIdToClassName(connectorId);

    try {
      const module = await import(`./connectors/${fileName}`);
      const ConnectorClass = module[className];

      if (!ConnectorClass) {
        throw new Error(`Class ${className} not found in ./connectors/${fileName}`);
      }

      logger.info(`Dynamically loaded connector ${className} from ${fileName}`);
      return ConnectorClass;
    } catch (error) {
      logger.error(`Failed to dynamically load connector ${connectorId}:`, error);
      throw new Error(`Could not load connector ${connectorId}: ${error.message}`);
    }
  }

  private connectorIdToClassName(connectorId: string): string {
    // Convert kebab-case connector ID to PascalCase class name
    // Examples:
    // - "comfyui-remote" -> "ComfyUIRemoteConnector"
    // - "simulation" -> "SimulationConnector"
    // - "a1111" -> "A1111Connector"

    const parts = connectorId.split('-');
    const pascalCased = parts
      .map(part => {
        // Handle special cases
        if (part.toLowerCase() === 'comfyui') return 'ComfyUI';
        if (part.toLowerCase() === 'a1111') return 'A1111';
        if (part.toLowerCase() === 'websocket') return 'WebSocket';

        // Standard PascalCase conversion
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('');

    return `${pascalCased}Connector`;
  }

  private async loadConnectorFallback(connectorId: string): Promise<any> {
    // Use barrel file for all connector imports - no more manual imports!
    const connectorClassName = this.connectorIdToClassName(connectorId);

    try {
      const connectorModule = await import('./connectors/index.js');
      const ConnectorClass = connectorModule[connectorClassName];

      if (!ConnectorClass) {
        throw new Error(
          `Connector class ${connectorClassName} not found in connectors barrel file`
        );
      }

      return ConnectorClass;
    } catch (error) {
      throw new Error(
        `Failed to load connector ${connectorId}: ${error.message}. ` +
          `Make sure ${connectorClassName} is exported from ./connectors/index.ts`
      );
    }
  }

  // ConnectorRegistry implementation
  registerConnector(connector: ConnectorInterface): void {
    this.connectors.set(connector.connector_id, connector);

    // Set parent worker reference for immediate status updates (if connector supports it)
    if ('setParentWorker' in connector && typeof connector.setParentWorker === 'function') {
      (connector as any).setParentWorker(this.parentWorker);
    }

    // Also index by service type
    if (!this.connectorsByServiceType.has(connector.service_type)) {
      this.connectorsByServiceType.set(connector.service_type, []);
    }
    const serviceConnectors = this.connectorsByServiceType.get(connector.service_type);
    if (serviceConnectors) {
      serviceConnectors.push(connector);
    }

    logger.debug(
      `Registered connector ${connector.connector_id} for service ${connector.service_type}`
    );
  }

  unregisterConnector(connectorId: string): void {
    const connector = this.connectors.get(connectorId);
    if (!connector) return;

    // Remove from main registry
    this.connectors.delete(connectorId);

    // Remove from service type index
    const serviceConnectors = this.connectorsByServiceType.get(connector.service_type);
    if (serviceConnectors) {
      const index = serviceConnectors.findIndex(c => c.connector_id === connectorId);
      if (index >= 0) {
        serviceConnectors.splice(index, 1);
      }

      // Clean up empty service type entries
      if (serviceConnectors.length === 0) {
        this.connectorsByServiceType.delete(connector.service_type);
      }
    }

    logger.debug(`Unregistered connector ${connectorId}`);
  }

  getConnector(connectorId: string): ConnectorInterface | undefined {
    return this.connectors.get(connectorId);
  }

  getConnectorsByServiceType(serviceType: string): ConnectorInterface[] {
    return this.connectorsByServiceType.get(serviceType) || [];
  }

  getConnectorByServiceType(serviceType: string): ConnectorInterface | undefined {
    // First try direct match
    const connectors = this.getConnectorsByServiceType(serviceType);
    if (connectors.length > 0) {
      return connectors[0];
    }

    // Handle service type mapping for simulation variants
    // e.g., "comfyui-sim", "a1111-sim" should map to "simulation" connector
    if (serviceType.endsWith('-sim') || serviceType.includes('sim')) {
      const simulationConnectors = this.getConnectorsByServiceType('simulation');
      if (simulationConnectors.length > 0) {
        logger.debug(`Mapping service type ${serviceType} to simulation connector`);
        return simulationConnectors[0];
      }
    }

    return undefined;
  }

  async getConnectorByService(serviceRequired: string): Promise<ConnectorInterface | undefined> {
    try {
      // Read service mapping file to find which connector handles this service
      const fs = await import('fs');
      const possiblePaths = [
        '/workspace/src/config/service-mapping.json',
        '/service-manager/src/config/service-mapping.json',
        './src/config/service-mapping.json',
      ];

      let serviceMappingPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          serviceMappingPath = p;
          break;
        }
      }

      if (!serviceMappingPath) {
        logger.warn('service-mapping.json not found, falling back to getConnectorByServiceType');
        return this.getConnectorByServiceType(serviceRequired);
      }

      const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
      const serviceMapping = JSON.parse(serviceMappingContent);

      // Search through workers to find one that can handle the required service
      for (const [workerId, workerConfig] of Object.entries(serviceMapping.workers)) {
        const config = workerConfig as any;

        // 🚨 CRITICAL FIX: Use job_service_required_map to translate job service to worker service
        if (config.job_service_required_map && Array.isArray(config.job_service_required_map)) {
          for (const mapping of config.job_service_required_map) {
            if (mapping.job_service_required === serviceRequired) {
              // Found mapping: serviceRequired ("simulation") → worker_service ("http-sim") 
              const workerServiceName = mapping.worker_service;
              logger.info(`🔄 Job service mapping: "${serviceRequired}" → "${workerServiceName}" (worker: ${workerId})`);
              
              // Look up the service config to get the connector class name
              const serviceConfig = serviceMapping.services?.[workerServiceName];
              if (serviceConfig && serviceConfig.connector) {
                const connectorClassName = serviceConfig.connector;
                logger.info(`🔗 Service "${workerServiceName}" uses connector: ${connectorClassName}`);
                
                // Get connector by class name (connector ID)
                const connector = this.connectors.get(connectorClassName);
                if (connector) {
                  logger.info(
                    `✅ Found connector "${connectorClassName}" for job service "${serviceRequired}" via worker service "${workerServiceName}"`
                  );
                  return connector;
                } else {
                  logger.warn(
                    `❌ Connector "${connectorClassName}" not loaded. Available connectors: ${Array.from(this.connectors.keys()).join(', ')}`
                  );
                }
              } else {
                logger.warn(`❌ Service config for "${workerServiceName}" not found or has no connector`);
              }
            }
          }
        }
      }

      logger.warn(`No connector found for service ${serviceRequired} in service mapping`);
      return undefined;
    } catch (error) {
      logger.error('Failed to read service mapping for connector lookup:', error);
      return this.getConnectorByServiceType(serviceRequired);
    }
  }

  getAllConnectors(): ConnectorInterface[] {
    return Array.from(this.connectors.values());
  }

  async getConnectorHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [connectorId, connector] of this.connectors) {
      try {
        health[connectorId] = await connector.checkHealth();
      } catch (error) {
        logger.warn(`Health check failed for connector ${connectorId}:`, error);
        health[connectorId] = false;
      }
    }

    return health;
  }

  async getConnectorStatuses(): Promise<Record<string, ConnectorStatus>> {
    const statuses: Record<string, ConnectorStatus> = {};

    for (const [connectorId, connector] of this.connectors) {
      try {
        const isHealthy = await connector.checkHealth();
        statuses[connectorId] = {
          connector_id: connectorId,
          status: isHealthy ? 'active' : 'inactive',
          health_check_at: new Date().toISOString(),
        };
      } catch (error) {
        logger.warn(`Health check failed for connector ${connectorId}:`, error);
        statuses[connectorId] = {
          connector_id: connectorId,
          status: 'error',
          health_check_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return statuses;
  }

  // ConnectorFactory implementation
  async createConnector(_config): Promise<ConnectorInterface> {
    // This is a simplified implementation
    // In a real scenario, this would create connectors from configuration
    throw new Error('createConnector not implemented - use loadConnectors instead');
  }

  getSupportedServiceTypes(): string[] {
    return [
      'simulation',
      'comfyui',
      'a1111',
      'rest_sync',
      'rest_async',
      'websocket',
      'stability',
      'elevenlabs',
    ];
  }

  async validateConfig(config): Promise<boolean> {
    // Basic validation - could be enhanced
    return !!(config && config.connector_id && config.service_type);
  }

  /**
   * Validate environment variables for a specific connector
   */
  private validateConnectorEnvironment(connectorName: string, ConnectorClass: any): void {
    logger.debug(`Validating environment variables for ${connectorName}...`);

    try {
      const requiredEnvVars = ConnectorClass.getRequiredEnvVars();
      const envVarNames = Object.keys(requiredEnvVars);

      if (envVarNames.length === 0) {
        logger.debug(`${connectorName}: No specific environment variables required`);
        return;
      }

      const present: string[] = [];
      const missing: string[] = [];
      const usingDefaults: string[] = [];

      for (const [key, template] of Object.entries(requiredEnvVars)) {
        // Ensure template is a string
        const templateStr = typeof template === 'string' ? template : String(template);

        // Extract the actual environment variable name from template: '${CLOUD_STORAGE_PROVIDER:-}' → 'CLOUD_STORAGE_PROVIDER'
        const envVarMatch = templateStr.match(/\$\{([^:}]+)/);
        const actualEnvVar = envVarMatch ? envVarMatch[1] : key;

        if (process.env[actualEnvVar] !== undefined && process.env[actualEnvVar] !== '') {
          present.push(actualEnvVar);
        } else {
          // Check if there's a default value in the template
          if (templateStr && templateStr.includes(':-')) {
            // Extract default value from ${VAR:-default} format
            const defaultMatch = templateStr.match(/\$\{[^:]*:-([^}]*)\}/);
            if (defaultMatch && defaultMatch[1]) {
              usingDefaults.push(`${actualEnvVar}=${defaultMatch[1]}`);
            } else {
              missing.push(actualEnvVar);
            }
          } else {
            missing.push(actualEnvVar);
          }
        }
      }

      // Log results
      const totalConfigured = present.length + usingDefaults.length;
      const totalRequired = Object.keys(requiredEnvVars).length;

      if (missing.length === 0) {
        logger.info(`  ✅ ${connectorName}: All ${totalRequired} env vars configured`);
      } else {
        logger.warn(
          `  ⚠️ ${connectorName}: Missing ${missing.length}/${totalRequired} env vars: ${missing.join(', ')}`
        );
      }

      if (present.length > 0) {
        logger.debug(`  Present: ${present.join(', ')}`);
      }

      if (usingDefaults.length > 0) {
        logger.debug(`  Using defaults: ${usingDefaults.join(', ')}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to validate environment for ${connectorName}:`, error);
    }
  }

  // Connector lifecycle management
  async cleanup(): Promise<void> {
    logger.info('Cleaning up connectors...');

    const cleanupPromises = Array.from(this.connectors.values()).map(async connector => {
      try {
        await connector.cleanup();
        logger.debug(`Cleaned up connector ${connector.connector_id}`);
      } catch (error) {
        logger.error(`Failed to cleanup connector ${connector.connector_id}:`, error);
      }
    });

    await Promise.all(cleanupPromises);

    this.connectors.clear();
    this.connectorsByServiceType.clear();

    logger.info('All connectors cleaned up');
  }

  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    const healthPromises = Array.from(this.connectors.entries()).map(
      async ([connectorId, connector]) => {
        try {
          const isHealthy = await connector.checkHealth();
          health[connectorId] = isHealthy;
        } catch (error) {
          logger.error(`Health check failed for connector ${connectorId}:`, error);
          health[connectorId] = false;
        }
      }
    );

    await Promise.all(healthPromises);
    return health;
  }

  // Status management for real-time updates
  async updateConnectorStatus(
    serviceType: string,
    status: string,
    errorMessage?: string
  ): Promise<void> {
    // Find connectors for this service type
    const serviceConnectors = this.connectorsByServiceType.get(serviceType);

    if (!serviceConnectors || serviceConnectors.length === 0) {
      logger.warn(`No connectors found for service type: ${serviceType}`);
      return;
    }

    // Update status on all connectors for this service type
    for (const connector of serviceConnectors) {
      try {
        // Check if connector supports setStatus (like BaseConnector)
        if ('setStatus' in connector && typeof connector.setStatus === 'function') {
          await (connector as any).setStatus(status, errorMessage);
        } else {
          logger.debug(`Connector ${connector.connector_id} does not support setStatus`);
        }
      } catch (error) {
        logger.warn(`Failed to update status for connector ${connector.connector_id}:`, error);
      }
    }
  }

  // Statistics
  getConnectorStatistics() {
    const connectors = Array.from(this.connectors.values());
    const serviceTypes = Array.from(this.connectorsByServiceType.keys());

    return {
      total_connectors: connectors.length,
      service_types: serviceTypes,
      connectors_by_service: Object.fromEntries(
        serviceTypes.map(type => [type, this.connectorsByServiceType.get(type)?.length || 0])
      ),
      connector_ids: connectors.map(c => c.connector_id),
    };
  }
}
