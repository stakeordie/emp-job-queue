import * as fs from 'fs';
import * as path from 'path';

export interface ServiceInterface {
  name: string;
  location?: string; // Where to place the .env file (e.g., "apps/api")
  required: Record<string, string>; // app_var: system_var mapping
  optional?: Record<string, string>;
  secret?: Record<string, string>; // Sensitive variables for .env.secret
  defaults?: Record<string, string>;
}

export class ServiceInterfaceManager {
  private interfacesDir: string;
  private interfaces: Map<string, ServiceInterface> = new Map();

  constructor(configDir: string) {
    this.interfacesDir = path.join(configDir, 'config', 'environments', 'services');
  }

  /**
   * Initialize and load all service interfaces
   */
  async initialize(): Promise<void> {
    await this.loadInterfaces();
  }

  private async loadInterfaces(): Promise<void> {
    if (!fs.existsSync(this.interfacesDir)) {
      console.warn(`Service interfaces directory not found: ${this.interfacesDir}`);
      return;
    }

    const files = fs
      .readdirSync(this.interfacesDir)
      .filter(f => f.endsWith('.interface.ts') || f.endsWith('.interface.js'));

    for (const file of files) {
      try {
        const filePath = path.join(this.interfacesDir, file);
        const serviceName = file.replace(/\.interface\.(ts|js)$/, '');

        // Dynamic import for ES modules
        try {
          const module = await import(filePath);
          const interfaceName = `${serviceName.charAt(0).toUpperCase()}${serviceName.slice(1)}EnvInterface`;
          const serviceInterface = module[interfaceName];

          if (serviceInterface) {
            this.interfaces.set(serviceName, serviceInterface);
          }
        } catch (err: unknown) {
          console.warn(
            `Failed to load service interface ${file}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      } catch (error) {
        console.warn(`Error loading service interface ${file}:`, error);
      }
    }
  }

  /**
   * Validate that all required variables for a service are present
   */
  validateService(
    serviceName: string,
    systemVars: Record<string, string>
  ): {
    valid: boolean;
    missing: string[];
    warnings: string[];
  } {
    const serviceInterface = this.interfaces.get(serviceName);
    if (!serviceInterface) {
      return {
        valid: true, // If no interface defined, assume it's valid
        missing: [],
        warnings: [`No interface definition found for service: ${serviceName}`],
      };
    }

    const missing: string[] = [];
    const warnings: string[] = [];

    // Check required variables - only fail if key is missing, not if value is empty
    for (const [appVar, systemVar] of Object.entries(serviceInterface.required)) {
      if (!(systemVar in systemVars)) {
        missing.push(`${systemVar} (needed for ${appVar})`);
      }
    }

    // Check optional variables - only warn about missing keys, not empty values
    if (serviceInterface.optional) {
      for (const [appVar, systemVar] of Object.entries(serviceInterface.optional)) {
        if (!(systemVar in systemVars) && serviceInterface.defaults?.[appVar]) {
          warnings.push(
            `${systemVar} not set, using default for ${appVar}: ${serviceInterface.defaults[appVar]}`
          );
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing,
      warnings,
    };
  }

  /**
   * Map system variables to service-specific variables
   */
  mapServiceVariables(
    serviceName: string,
    systemVars: Record<string, string>
  ): Record<string, string> {
    const serviceInterface = this.interfaces.get(serviceName);
    if (!serviceInterface) {
      return {}; // No mapping if no interface
    }

    const serviceVars: Record<string, string> = {};

    // Map required variables
    for (const [appVar, systemVar] of Object.entries(serviceInterface.required)) {
      const value = systemVars[systemVar];
      if (value !== undefined) {
        serviceVars[appVar] = value;
      }
    }

    // Map optional variables
    if (serviceInterface.optional) {
      for (const [appVar, systemVar] of Object.entries(serviceInterface.optional)) {
        const value = systemVars[systemVar];
        if (value !== undefined) {
          serviceVars[appVar] = value;
        } else if (serviceInterface.defaults?.[appVar]) {
          serviceVars[appVar] = serviceInterface.defaults[appVar];
        }
      }
    }

    // Map secret variables (handled separately for .env.secret)
    if (serviceInterface.secret) {
      for (const [appVar, systemVar] of Object.entries(serviceInterface.secret)) {
        const value = systemVars[systemVar];
        if (value !== undefined) {
          serviceVars[appVar] = value;
        }
      }
    }

    // Add defaults for any missing optional vars
    if (serviceInterface.defaults) {
      for (const [appVar, defaultValue] of Object.entries(serviceInterface.defaults)) {
        if (serviceVars[appVar] === undefined) {
          serviceVars[appVar] = defaultValue;
        }
      }
    }

    return serviceVars;
  }

  /**
   * Get all loaded interfaces
   */
  getInterfaces(): Map<string, ServiceInterface> {
    return this.interfaces;
  }
}
