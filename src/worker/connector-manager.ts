// Connector Manager - dynamic loading and management of service connectors
// Direct port from Python worker/connector_loader.py functionality

import { ConnectorInterface, ConnectorRegistry, ConnectorFactory } from '../core/types/connector.js';
import { logger } from '../core/utils/logger.js';

export class ConnectorManager implements ConnectorRegistry, ConnectorFactory {
  private connectors = new Map<string, ConnectorInterface>();
  private connectorsByServiceType = new Map<string, ConnectorInterface[]>();

  constructor() {}

  async loadConnectors(): Promise<void> {
    // Get connector list from environment (matches Python pattern)
    const connectorsEnv = process.env.WORKER_CONNECTORS || process.env.CONNECTORS || '';
    const connectorIds = connectorsEnv.split(',').map(s => s.trim()).filter(s => s);

    if (connectorIds.length === 0) {
      logger.warn('No connectors specified in WORKER_CONNECTORS environment variable');
      return;
    }

    logger.info(`Loading connectors: ${connectorIds.join(', ')}`);

    for (const connectorId of connectorIds) {
      try {
        await this.loadConnector(connectorId);
      } catch (error) {
        logger.error(`Failed to load connector ${connectorId}:`, error);
        // Continue loading other connectors even if one fails
      }
    }

    logger.info(`Successfully loaded ${this.connectors.size} connectors`);
  }

  private async loadConnector(connectorId: string): Promise<void> {
    // Dynamic import based on connector ID
    let ConnectorClass: any;
    
    try {
      switch (connectorId.toLowerCase()) {
        case 'simulation':
          const { SimulationConnector } = await import('./connectors/simulation-connector.js');
          ConnectorClass = SimulationConnector;
          break;
        case 'comfyui':
          const { ComfyUIConnector } = await import('./connectors/comfyui-connector.js');
          ConnectorClass = ComfyUIConnector;
          break;
        case 'a1111':
          const { A1111Connector } = await import('./connectors/a1111-connector.js');
          ConnectorClass = A1111Connector;
          break;
        case 'rest_sync':
          const { RestSyncConnector } = await import('./connectors/rest-sync-connector.js');
          ConnectorClass = RestSyncConnector;
          break;
        case 'rest_async':
          const { RestAsyncConnector } = await import('./connectors/rest-async-connector.js');
          ConnectorClass = RestAsyncConnector;
          break;
        case 'websocket':
          const { WebSocketConnector } = await import('./connectors/websocket-connector.js');
          ConnectorClass = WebSocketConnector;
          break;
        default:
          throw new Error(`Unknown connector type: ${connectorId}`);
      }

      // Create connector instance
      const connector = new ConnectorClass(connectorId);
      
      // Initialize the connector
      await connector.initialize();
      
      // Register the connector
      this.registerConnector(connector);
      
      logger.info(`Loaded connector: ${connectorId} (${connector.service_type})`);
      
    } catch (error) {
      logger.error(`Failed to load connector ${connectorId}:`, error);
      throw error;
    }
  }

  // ConnectorRegistry implementation
  registerConnector(connector: ConnectorInterface): void {
    this.connectors.set(connector.connector_id, connector);
    
    // Also index by service type
    if (!this.connectorsByServiceType.has(connector.service_type)) {
      this.connectorsByServiceType.set(connector.service_type, []);
    }
    this.connectorsByServiceType.get(connector.service_type)!.push(connector);
    
    logger.debug(`Registered connector ${connector.connector_id} for service ${connector.service_type}`);
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
    const connectors = this.getConnectorsByServiceType(serviceType);
    return connectors.length > 0 ? connectors[0] : undefined;
  }

  getAllConnectors(): ConnectorInterface[] {
    return Array.from(this.connectors.values());
  }

  getConnectorHealth(): Record<string, boolean> {
    const health: Record<string, boolean> = {};
    
    for (const [connectorId, connector] of this.connectors) {
      try {
        // Note: checkHealth is async but we're doing sync here for simplicity
        // In a real implementation, this should be cached or handled differently
        health[connectorId] = true; // Assume healthy for now
      } catch (error) {
        health[connectorId] = false;
      }
    }
    
    return health;
  }

  // ConnectorFactory implementation
  async createConnector(config: any): Promise<ConnectorInterface> {
    // This is a simplified implementation
    // In a real scenario, this would create connectors from configuration
    throw new Error('createConnector not implemented - use loadConnectors instead');
  }

  getSupportedServiceTypes(): string[] {
    return ['simulation', 'comfyui', 'a1111', 'rest_sync', 'rest_async', 'websocket'];
  }

  async validateConfig(config: any): Promise<boolean> {
    // Basic validation - could be enhanced
    return !!(config && config.connector_id && config.service_type);
  }

  // Connector lifecycle management
  async cleanup(): Promise<void> {
    logger.info('Cleaning up connectors...');
    
    const cleanupPromises = Array.from(this.connectors.values()).map(async (connector) => {
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
    
    const healthPromises = Array.from(this.connectors.entries()).map(async ([connectorId, connector]) => {
      try {
        const isHealthy = await connector.checkHealth();
        health[connectorId] = isHealthy;
      } catch (error) {
        logger.error(`Health check failed for connector ${connectorId}:`, error);
        health[connectorId] = false;
      }
    });
    
    await Promise.all(healthPromises);
    return health;
  }

  // Statistics
  getConnectorStatistics(): any {
    const connectors = Array.from(this.connectors.values());
    const serviceTypes = Array.from(this.connectorsByServiceType.keys());
    
    return {
      total_connectors: connectors.length,
      service_types: serviceTypes,
      connectors_by_service: Object.fromEntries(
        serviceTypes.map(type => [
          type, 
          this.connectorsByServiceType.get(type)!.length
        ])
      ),
      connector_ids: connectors.map(c => c.connector_id)
    };
  }
}