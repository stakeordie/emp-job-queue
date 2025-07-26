import * as fs from 'fs';
import * as path from 'path';
import { ComposeInterfaceManager, ComposeInterface } from './compose-interfaces.js';
import { Profile } from './types.js';

export interface ComposeBuildResult {
  success: boolean;
  composePath: string;
  profile?: Profile;
  errors?: string[];
  warnings?: string[];
}

export interface ComposeFileResult {
  success: boolean;
  filePath: string;
  composeInterface: ComposeInterface;
  error?: string;
}

export class ComposeBuilder {
  private configDir: string;
  private composeInterfaces: ComposeInterfaceManager;

  constructor(configDir: string) {
    this.configDir = configDir;
    this.composeInterfaces = new ComposeInterfaceManager(configDir);
  }

  /**
   * Initialize compose interfaces
   */
  async initialize(): Promise<void> {
    await this.composeInterfaces.initialize();
  }

  /**
   * Generate machine-specific docker-compose file
   */
  async generateComposeFile(
    machineType: string,
    envVars?: Record<string, string>,
    outputPath?: string
  ): Promise<void> {
    const composeInterface = this.composeInterfaces.getInterface(machineType);
    if (!composeInterface) {
      throw new Error(`No compose interface found for machine type: ${machineType}`);
    }

    // Determine output path
    const location = composeInterface.location || 'apps/machine';
    const fileName = composeInterface.file_name || `docker-compose.${machineType}.yml`;
    const finalOutputPath = outputPath || path.join(location, fileName);

    // Generate YAML content with environment-based conditionals
    const yamlContent = this.generateYamlContent(composeInterface, envVars || {});

    // Ensure directory exists
    const outputDir = path.dirname(finalOutputPath);
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true });
    }

    // Write the compose file
    await fs.promises.writeFile(finalOutputPath, yamlContent, 'utf8');
  }

  /**
   * Generate YAML content from compose interface
   */
  private generateYamlContent(composeInterface: ComposeInterface, envVars: Record<string, string>): string {
    const envFile = composeInterface.file_name 
      ? composeInterface.file_name.replace('docker-compose.', '.env.').replace('.yml', '')
      : '.env';

    const yaml = `# This file is dynamically generated for ${composeInterface.name}
# Machine type: ${composeInterface.name}
# Generated on: ${new Date().toISOString()}

services:
  ${composeInterface.name.replace('_', '-')}:
    build:
      context: .
      dockerfile: ${composeInterface.dockerfile || 'Dockerfile'}
      args:
        CACHE_BUST: \${CACHE_BUST:-1}
        # Build args from environment
        AWS_ACCESS_KEY_ID: \${AWS_ACCESS_KEY_ID}
        AWS_SECRET_ACCESS_KEY_ENCODED: \${AWS_SECRET_ACCESS_KEY_ENCODED}
        AWS_DEFAULT_REGION: \${AWS_DEFAULT_REGION}
        AZURE_STORAGE_ACCOUNT: \${AZURE_STORAGE_ACCOUNT}
        AZURE_STORAGE_KEY: \${AZURE_STORAGE_KEY}
        CLOUD_STORAGE_CONTAINER: \${CLOUD_STORAGE_CONTAINER}
        CLOUD_PROVIDER: \${CLOUD_PROVIDER}
        HF_TOKEN: \${HF_TOKEN}
        CIVITAI_TOKEN: \${CIVITAI_TOKEN}
        OPENAI_API_KEY: \${OPENAI_API_KEY}
    image: \${MACHINE_IMAGE:-${composeInterface.name}:latest}
    platform: linux/amd64
    container_name: \${MACHINE_CONTAINER_NAME:-${composeInterface.name}}
    hostname: \${MACHINE_CONTAINER_NAME:-${composeInterface.name}}
    restart: "no"  # Controlled by API instead of Docker
    
    # Fast shutdown for elastic scaling
    stop_grace_period: 2s
    stop_signal: SIGTERM
    
    # Environment from ${envFile}
    env_file:
      - ${envFile}
    
    environment:
      # Docker runtime
      - NODE_ENV=production${composeInterface.gpu ? `
      # GPU access
      - NVIDIA_VISIBLE_DEVICES=all  
      - NVIDIA_DRIVER_CAPABILITIES=compute,utility` : ''}
${this.generatePortsSection(composeInterface, envVars)}${this.generateVolumesSection(composeInterface, envVars)}    
    working_dir: /workspace
    
    # Resource limits
    deploy:
      resources:
        limits:
          memory: ${composeInterface.resources?.memory || '8G'}
        reservations:
          memory: ${composeInterface.resources?.memory_reservation || '2G'}${composeInterface.gpu ? `
    
` : ''}
`;

    return yaml;
  }

  /**
   * Generate ports section with conditional logic
   */
  private generatePortsSection(composeInterface: ComposeInterface, envVars: Record<string, string>): string {
    // Check if entire ports section should be skipped
    if (composeInterface.conditionals?.ports) {
      const condition = composeInterface.conditionals.ports.condition;
      const includeWhen = composeInterface.conditionals.ports.include_when;
      const envValue = envVars[condition]?.toLowerCase();
      
      const shouldInclude = (includeWhen === "true" && envValue === "true") || 
                           (includeWhen === "false" && envValue === "false");
      
      if (!shouldInclude) {
        return ''; // Skip entire ports section
      }
    }

    // Handle both legacy simple ports and new conditional ports
    const ports: string[] = [];
    
    if (composeInterface.ports) {
      if (Array.isArray(composeInterface.ports)) {
        // Legacy format - simple array
        ports.push(...composeInterface.ports);
      } else {
        // New conditional format
        const conditionalPorts = composeInterface.ports as any;
        
        // Always include these ports
        if (conditionalPorts.always) {
          ports.push(...conditionalPorts.always);
        }
        
        // Process conditional ports
        if (conditionalPorts.conditional) {
          for (const conditional of conditionalPorts.conditional) {
            const envValue = envVars[conditional.condition]?.toLowerCase();
            
            if (envValue === "true" && conditional.when_true) {
              ports.push(...conditional.when_true);
            } else if (envValue === "false" && conditional.when_false) {
              ports.push(...conditional.when_false);
            }
          }
        }
      }
    }

    if (ports.length === 0) {
      return '';
    }

    let section = '\n    ports:\n';
    for (const port of ports) {
      section += `      - "${port}"\n`;
    }
    return section;
  }

  /**
   * Generate volumes section with conditional logic
   */
  private generateVolumesSection(composeInterface: ComposeInterface, envVars: Record<string, string>): string {
    // Check if entire volumes section should be skipped
    if (composeInterface.conditionals?.volumes) {
      const condition = composeInterface.conditionals.volumes.condition;
      const includeWhen = composeInterface.conditionals.volumes.include_when;
      const envValue = envVars[condition]?.toLowerCase();
      
      const shouldInclude = (includeWhen === "true" && envValue === "true") || 
                           (includeWhen === "false" && envValue === "false");
      
      if (!shouldInclude) {
        return ''; // Skip entire volumes section
      }
    }

    // Handle both legacy simple volumes and new conditional volumes
    const volumes: string[] = [];
    
    if (composeInterface.volumes) {
      if (Array.isArray(composeInterface.volumes)) {
        // Legacy format - simple array
        volumes.push(...composeInterface.volumes);
      } else {
        // New conditional format
        const conditionalVolumes = composeInterface.volumes as any;
        
        // Always include these volumes
        if (conditionalVolumes.always) {
          volumes.push(...conditionalVolumes.always);
        }
        
        // Process conditional volumes
        if (conditionalVolumes.conditional) {
          for (const conditional of conditionalVolumes.conditional) {
            const envValue = envVars[conditional.condition]?.toLowerCase();
            
            if (envValue === "true" && conditional.when_true) {
              volumes.push(...conditional.when_true);
            } else if (envValue === "false" && conditional.when_false) {
              volumes.push(...conditional.when_false);
            }
          }
        }
      }
    }

    if (volumes.length === 0) {
      return '';
    }

    let section = '\n    volumes:\n';
    for (const volume of volumes) {
      section += `      - ${volume}\n`;
    }
    return section;
  }

  /**
   * Build compose files from profile
   */
  async buildFromProfile(profileName: string): Promise<ComposeBuildResult> {
    try {
      await this.initialize();

      const profilePath = path.join(
        this.configDir,
        'config',
        'environments',
        'profiles',
        `${profileName}.json`
      );

      if (!fs.existsSync(profilePath)) {
        return {
          success: false,
          composePath: '',
          errors: [`Profile '${profileName}' not found`],
        };
      }

      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Profile;
      const generatedFiles: string[] = [];
      const warnings: string[] = [];

      // Generate compose files for all available interfaces
      const availableInterfaces = this.composeInterfaces.getInterfaces();
      
      for (const [machineName, composeInterface] of availableInterfaces) {
        try {
          await this.generateComposeFile(machineName);
          
          const location = composeInterface.location || 'apps/machine';
          const fileName = composeInterface.file_name || `docker-compose.${machineName}.yml`;
          const outputPath = path.join(location, fileName);
          
          generatedFiles.push(outputPath);
        } catch (error) {
          warnings.push(`Failed to generate compose file for ${machineName}: ${error}`);
        }
      }

      return {
        success: true,
        composePath: generatedFiles.join(', '),
        profile: profileData,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        composePath: '',
        errors: [`Failed to build compose files: ${error}`],
      };
    }
  }

  /**
   * Build compose files from profile and return individual file results
   */
  async buildComposeFilesFromProfile(profileName: string): Promise<ComposeFileResult[]> {
    try {
      await this.initialize();
      const profilePath = path.join(
        this.configDir,
        'config',
        'environments',
        'profiles',
        `${profileName}.json`
      );
      
      if (!fs.existsSync(profilePath)) {
        return [];
      }

      const results: ComposeFileResult[] = [];
      const availableInterfaces = this.composeInterfaces.getInterfaces();
      
      for (const [machineName, composeInterface] of availableInterfaces) {
        try {
          await this.generateComposeFile(machineName);
          
          const location = composeInterface.location || 'apps/machine';
          const fileName = composeInterface.file_name || `docker-compose.${machineName}.yml`;
          const outputPath = path.join(location, fileName);
          
          results.push({
            success: true,
            filePath: outputPath,
            composeInterface: composeInterface,
          });
        } catch (error) {
          results.push({
            success: false,
            filePath: '',
            composeInterface: composeInterface,
            error: `Failed to generate compose file for ${machineName}: ${error}`,
          });
        }
      }
      
      return results;
    } catch (error) {
      return [];
    }
  }
}