import * as fs from 'fs';
import * as path from 'path';

export interface ComposeInterface {
  name: string;
  location?: string; // Where to place the compose file (e.g., "apps/machine")
  file_name?: string; // Custom filename (e.g., "docker-compose.api.yml")
  dockerfile?: string; // Which Dockerfile to use (e.g., "Dockerfile.api")
  services: ComposeService[];
  ports?: ConditionalPorts; // Port mappings with conditionals
  volumes?: ConditionalVolumes; // Volume mappings with conditionals
  environment?: Record<string, string>; // Environment variable mappings
  resources?: ResourceLimits;
  gpu?: boolean; // Whether GPU access is needed
  conditionals?: ComposeConditionals; // Environment-based conditional logic
}

export interface ConditionalPorts {
  always?: string[]; // Always include these ports
  conditional?: {
    condition: string; // Environment variable to check (e.g., "MACHINE_EXPOSE_PORTS")
    when_true?: string[]; // Ports to include when condition is "true"
    when_false?: string[]; // Ports to include when condition is "false"
  }[];
}

export interface ConditionalVolumes {
  always?: string[]; // Always include these volumes
  conditional?: {
    condition: string; // Environment variable to check
    when_true?: string[]; // Volumes to include when condition is "true"
    when_false?: string[]; // Volumes to include when condition is "false"
  }[];
}

export interface ComposeConditionals {
  ports?: {
    condition: string; // Environment variable (e.g., "MACHINE_EXPOSE_PORTS")
    include_when: "true" | "false"; // When to include the entire ports section
  };
  volumes?: {
    condition: string;
    include_when: "true" | "false";
  };
  gpu_runtime?: {
    condition: string;
    include_when: "true" | "false";
  };
}

export interface ComposeService {
  name: string;
  enabled_flag?: string; // Environment variable that controls if service is enabled
  ports?: string[]; // Service-specific ports
  depends_on?: string[]; // Service dependencies
}

export interface ResourceLimits {
  memory?: string;
  memory_reservation?: string;
  cpus?: string;
}

export class ComposeInterfaceManager {
  private interfacesDir: string;
  private interfaces: Map<string, ComposeInterface> = new Map();

  constructor(configDir: string) {
    this.interfacesDir = path.join(configDir, 'config', 'compose', 'interfaces');
  }

  /**
   * Initialize and load all compose interfaces
   */
  async initialize(): Promise<void> {
    await this.loadInterfaces();
  }

  private async loadInterfaces(): Promise<void> {
    if (!fs.existsSync(this.interfacesDir)) {
      console.warn(`Compose interfaces directory not found: ${this.interfacesDir}`);
      return;
    }

    const files = fs
      .readdirSync(this.interfacesDir)
      .filter(f => f.endsWith('.compose.ts') || f.endsWith('.compose.js'));

    for (const file of files) {
      try {
        const filePath = path.join(this.interfacesDir, file);
        const serviceName = file.replace(/\.compose\.(ts|js)$/, '');

        // Dynamic import for ES modules
        try {
          // Convert to file:// URL for proper import
          const fileUrl = `file://${path.resolve(filePath)}`;
          const module = await import(fileUrl);
          const interfaceName = `${serviceName.charAt(0).toUpperCase()}${serviceName.slice(1)}ComposeInterface`;
          const composeInterface = module[interfaceName];

          if (composeInterface) {
            this.interfaces.set(serviceName, composeInterface);
          }
        } catch (err: unknown) {
          console.warn(
            `Failed to load compose interface ${file}:`,
            err instanceof Error ? err.message : String(err)
          );
        }
      } catch (error) {
        console.warn(`Error loading compose interface ${file}:`, error);
      }
    }
  }

  /**
   * Get all loaded interfaces
   */
  getInterfaces(): Map<string, ComposeInterface> {
    return this.interfaces;
  }

  /**
   * Get specific interface by name
   */
  getInterface(name: string): ComposeInterface | undefined {
    return this.interfaces.get(name);
  }
}