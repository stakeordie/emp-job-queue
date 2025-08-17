import * as fs from 'fs';
import * as path from 'path';

// Types for service mapping configuration
export interface ConnectorConfig {
  type: 'internal' | 'external';
  service: string | null;
  installer: string | null;
  is_gpu_bound: boolean;
  service_instances_per_gpu?: number;
  service_instances_per_machine?: number;
  ports?: number[];
  port_increment?: number;
  required_env?: string[];
  description: string;
}

export interface ServiceType {
  description: string;
  requires_installer: boolean;
  has_ports: boolean;
  has_pm2_process: boolean;
}

export interface ServiceMappingConfig {
  connectors: Record<string, ConnectorConfig>;
  service_types: Record<string, ServiceType>;
}

// Load configuration from JSON file with environment variable substitution
let serviceMapping: ServiceMappingConfig | null = null;

export function getServiceMapping(envVars: Record<string, string> = process.env): ServiceMappingConfig {
  if (!serviceMapping) {
    const configPath = path.join(__dirname, 'service-mapping.json');
    
    if (!fs.existsSync(configPath)) {
      throw new Error(`Service mapping configuration not found: ${configPath}`);
    }
    
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const configWithEnvVars = substituteEnvironmentVariables(configContent, envVars);
    serviceMapping = JSON.parse(configWithEnvVars) as ServiceMappingConfig;
  }
  
  return serviceMapping;
}

/**
 * Substitute environment variables in JSON content
 * Supports format: ${VAR_NAME:-default_value} or ${VAR_NAME}
 */
function substituteEnvironmentVariables(content: string, envVars: Record<string, string>): string {
  return content.replace(/\$\{([^}]+)\}/g, (match, varExpression) => {
    // Handle default values: VAR_NAME:-default_value
    const [varName, defaultValue] = varExpression.split(':-');
    
    // Get value from environment or use default
    let value = envVars[varName.trim()];
    
    if (value === undefined && defaultValue !== undefined) {
      value = defaultValue.trim();
    }
    
    if (value === undefined) {
      throw new Error(`Environment variable ${varName} is required but not set`);
    }
    
    // Handle numeric values - don't quote them in JSON
    if (!isNaN(Number(value)) && value.trim() !== '') {
      return value;
    }
    
    // Handle boolean values
    if (value === 'true' || value === 'false') {
      return value;
    }
    
    // For string values, return as-is (JSON will handle quoting)
    return value;
  });
}

// Helper functions for working with service mapping
export class ServiceMappingHelper {
  private config: ServiceMappingConfig;
  
  constructor(envVars: Record<string, string> = process.env) {
    this.config = getServiceMapping(envVars);
  }
  
  /**
   * Get connector configuration by name
   */
  getConnector(connectorName: string): ConnectorConfig | null {
    return this.config.connectors[connectorName] || null;
  }
  
  /**
   * Get all connectors of a specific type
   */
  getConnectorsByType(type: 'internal' | 'external'): Record<string, ConnectorConfig> {
    const result: Record<string, ConnectorConfig> = {};
    
    for (const [name, config] of Object.entries(this.config.connectors)) {
      if (config.type === type) {
        result[name] = config;
      }
    }
    
    return result;
  }
  
  /**
   * Get all connectors that use a specific service
   */
  getConnectorsByService(serviceName: string): Record<string, ConnectorConfig> {
    const result: Record<string, ConnectorConfig> = {};
    
    for (const [name, config] of Object.entries(this.config.connectors)) {
      if (config.service === serviceName) {
        result[name] = config;
      }
    }
    
    return result;
  }
  
  /**
   * Get all unique services that need to be installed
   */
  getRequiredServices(connectorNames: string[]): string[] {
    const services = new Set<string>();
    
    for (const connectorName of connectorNames) {
      const connector = this.getConnector(connectorName);
      if (connector && connector.type === 'internal' && connector.service) {
        services.add(connector.service);
      }
    }
    
    return Array.from(services);
  }
  
  /**
   * Get all required environment variables for connectors
   */
  getRequiredEnvVars(connectorNames: string[]): string[] {
    const envVars = new Set<string>();
    
    for (const connectorName of connectorNames) {
      const connector = this.getConnector(connectorName);
      if (connector && connector.required_env) {
        connector.required_env.forEach(env => envVars.add(env));
      }
    }
    
    return Array.from(envVars);
  }
  
  /**
   * Check if a connector exists and is valid
   */
  isValidConnector(connectorName: string): boolean {
    return connectorName in this.config.connectors;
  }
  
  
  /**
   * Get service type configuration
   */
  getServiceType(serviceType: 'internal' | 'external'): ServiceType | null {
    return this.config.service_types[serviceType] || null;
  }
  
  /**
   * Calculate port assignments for a service based on GPU/instance count
   */
  calculatePorts(connectorName: string, instanceCount: number): number[] {
    const connector = this.getConnector(connectorName);
    if (!connector || !connector.ports || connector.ports.length === 0) {
      return [];
    }
    
    const basePorts = connector.ports;
    const increment = connector.port_increment || 0;
    const ports: number[] = [];
    
    for (let i = 0; i < instanceCount; i++) {
      for (const basePort of basePorts) {
        ports.push(basePort + (i * increment));
      }
    }
    
    return ports;
  }
  
  /**
   * Validate connector configuration
   */
  validateConnectorConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Check for required fields
    for (const [name, config] of Object.entries(this.config.connectors)) {
      if (config.type === 'internal') {
        if (!config.service) {
          errors.push(`Internal connector '${name}' missing service name`);
        }
        if (!config.installer) {
          errors.push(`Internal connector '${name}' missing installer name`);
        }
      }
      
      if (config.type === 'external') {
        if (!config.required_env || config.required_env.length === 0) {
          errors.push(`External connector '${name}' missing required_env`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance (uses process.env by default)
export const serviceMappingHelper = new ServiceMappingHelper();

// Export factory function for custom environment variables
export function createServiceMappingHelper(envVars: Record<string, string>): ServiceMappingHelper {
  return new ServiceMappingHelper(envVars);
}