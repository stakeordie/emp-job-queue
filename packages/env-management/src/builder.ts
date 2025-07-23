import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import { Profile, Components, EnvironmentConfig, BuildResult } from './types.js';
import { ServiceInterfaceManager } from './service-interfaces.js';

export class EnvironmentBuilder {
  private configDir: string;
  private outputPath: string;
  private serviceInterfaces: ServiceInterfaceManager;

  constructor(configDir: string, outputPath: string = '.env.local') {
    this.configDir = configDir;
    this.outputPath = outputPath;
    this.serviceInterfaces = new ServiceInterfaceManager(configDir);
  }

  /**
   * Initialize service interfaces (must be called before using)
   */
  async initialize(): Promise<void> {
    await this.serviceInterfaces.initialize();
  }

  /**
   * Generate service-specific .env file
   */
  async generateServiceEnvFile(
    serviceName: string,
    systemVars: Record<string, string>,
    outputPath?: string
  ): Promise<void> {
    const serviceVars = this.serviceInterfaces.mapServiceVariables(serviceName, systemVars);
    const serviceEnvPath = outputPath || `.env.${serviceName}`;

    const content = Object.entries(serviceVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.promises.writeFile(serviceEnvPath, content, 'utf8');
  }

  /**
   * Build service-first environments
   */
  private async buildServiceEnvironments(profile: Profile): Promise<BuildResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const generatedFiles: string[] = [];

    try {
      // Step 1: Load all component configurations into a pool
      const componentPool = await this.loadComponentPool(profile.components);

      // Step 2: Load ALL secrets automatically (no profile declaration needed)
      const secretsPath = path.join(
        this.configDir,
        'config',
        'environments',
        'secrets',
        '.env.secrets.local'
      );
      if (fs.existsSync(secretsPath)) {
        const secrets = this.loadEnvFile(secretsPath);
        Object.assign(componentPool, secrets);
      }

      // Step 3: Resolve all variables in the pool
      const resolvedPool = this.resolveVariables(componentPool);

      // Step 4: Generate .env files for all service interfaces that have corresponding components
      const availableInterfaces = this.serviceInterfaces.getInterfaces();
      const _profileComponents = Object.keys(profile.components);

      for (const [serviceName, _serviceInterface] of availableInterfaces) {
        // Only generate if we have components that might provide variables for this service
        // (This is a loose check - actual validation happens next)

        // Validate the service has all required variables
        const validation = this.serviceInterfaces.validateService(serviceName, resolvedPool);

        if (!validation.valid) {
          errors.push(
            `Service '${serviceName}' is missing required variables: ${validation.missing.join(', ')}`
          );
          // Don't continue - collect ALL errors first
        }

        if (validation.warnings.length > 0) {
          warnings.push(...validation.warnings.map(w => `[${serviceName}] ${w}`));
        }
      }

      // If any service failed validation, fail the entire build (atomic operation)
      if (errors.length > 0) {
        return {
          success: false,
          envPath: this.outputPath,
          errors,
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }

      // All services validated successfully - now generate all .env files
      for (const [serviceName, serviceInterface] of availableInterfaces) {
        // Generate the service's env file
        // Get location from interface, then default
        const interfaceLocation = serviceInterface?.location
          ? `${serviceInterface.location}/.env`
          : null;
        const defaultPath = `apps/${serviceName}/.env`;
        const outputPath = interfaceLocation || defaultPath;

        // Ensure directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          await fs.promises.mkdir(outputDir, { recursive: true });
        }

        await this.generateServiceEnvFile(serviceName, resolvedPool, outputPath);
        generatedFiles.push(outputPath);
      }

      return {
        success: true,
        envPath: generatedFiles.join(', '), // List all generated files
        profile,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        envPath: this.outputPath,
        errors: [`Failed to build service environments: ${error}`],
      };
    }
  }

  /**
   * Load all components into a single pool of variables
   */
  private async loadComponentPool(components: Components): Promise<Record<string, string>> {
    const pool: Record<string, string> = {};

    for (const [component, environments] of Object.entries(components)) {
      if (!environments) continue;

      const componentPath = path.join(
        this.configDir,
        'config',
        'environments',
        'components',
        `${component}.env`
      );

      if (!fs.existsSync(componentPath)) {
        throw new Error(`Component file not found: ${component}.env`);
      }

      const envList = Array.isArray(environments) ? environments : [environments];

      for (const environment of envList) {
        const componentConfig = this.loadComponentConfig(componentPath, environment);
        if (!componentConfig) {
          throw new Error(`Environment '${environment}' not found in ${component}.env`);
        }
        Object.assign(pool, componentConfig);
      }
    }

    return pool;
  }

  /**
   * Build environment from profile
   */
  async buildFromProfile(profileName: string): Promise<BuildResult> {
    try {
      // Initialize service interfaces first
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
          envPath: this.outputPath,
          errors: [`Profile '${profileName}' not found`],
        };
      }

      const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as Profile;

      // Always use service-first approach to generate .env files for available service interfaces
      return this.buildServiceEnvironments(profileData);
    } catch (error) {
      return {
        success: false,
        envPath: this.outputPath,
        errors: [`Failed to load profile: ${error}`],
      };
    }
  }

  /**
   * Build environment from individual component selections
   */
  async buildFromComponents(components: Components, profile?: Profile): Promise<BuildResult> {
    try {
      const envVars: { [key: string]: string } = {};
      const warnings: string[] = [];

      // Load component configurations
      for (const [component, environments] of Object.entries(components)) {
        // Skip undefined optional components
        if (!environments) continue;

        const componentPath = path.join(
          this.configDir,
          'config',
          'environments',
          'components',
          `${component}.env`
        );

        if (!fs.existsSync(componentPath)) {
          return {
            success: false,
            envPath: this.outputPath,
            errors: [`Component file not found: ${component}.env`],
          };
        }

        // Handle both string and array values
        const envList = Array.isArray(environments) ? environments : [environments];

        // Load each environment in order (later ones override earlier ones)
        for (const environment of envList) {
          const componentConfig = this.loadComponentConfig(componentPath, environment);
          if (!componentConfig) {
            return {
              success: false,
              envPath: this.outputPath,
              errors: [`Environment '${environment}' not found in ${component}.env`],
            };
          }

          // Merge component variables (later environments override earlier ones)
          Object.assign(envVars, componentConfig);
        }
      }

      // Load ALL secrets automatically (no profile declaration needed)
      const secretsPath = path.join(
        this.configDir,
        'config',
        'environments',
        'secrets',
        '.env.secrets.local'
      );
      if (fs.existsSync(secretsPath)) {
        const secrets = this.loadEnvFile(secretsPath);
        Object.assign(envVars, secrets);
      }

      // Substitute environment variables
      const resolvedVars = this.resolveVariables(envVars);

      // Write .env.local file
      await this.writeEnvFile(resolvedVars);

      // Validate services if profile includes them
      if (profile?.services) {
        const serviceValidation = this.validateServices(
          Object.keys(profile.services),
          resolvedVars
        );
        if (serviceValidation.warnings.length > 0) {
          warnings.push(...serviceValidation.warnings);
        }
        if (!serviceValidation.valid) {
          return {
            success: false,
            envPath: this.outputPath,
            errors: serviceValidation.errors,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        }
      }

      return {
        success: true,
        envPath: this.outputPath,
        profile,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        envPath: this.outputPath,
        errors: [`Build failed: ${error}`],
      };
    }
  }

  /**
   * Load component configuration for specific environment
   */
  private loadComponentConfig(
    filePath: string,
    environment: string
  ): { [key: string]: string } | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const config = ini.parse(content) as EnvironmentConfig;
      const quotedValues = this.extractQuotedValues(content, environment);

      const envConfig = config[environment];
      if (!envConfig) return null;

      // Get namespace from top-level config
      const namespace = config.NAMESPACE;

      // If no namespace, restore quotes and return as-is (backwards compatibility)
      if (!namespace) {
        const restoredConfig: { [key: string]: string } = {};
        for (const [key, value] of Object.entries(envConfig)) {
          restoredConfig[key] = quotedValues[key] || value;
        }
        return restoredConfig;
      }

      // Apply namespace to all variables and restore quotes
      const namespacedConfig: { [key: string]: string } = {};
      for (const [key, value] of Object.entries(envConfig)) {
        const namespacedKey = `${namespace}_${key}`;
        // Restore quotes if they were originally present
        const finalValue = quotedValues[key] || value;
        namespacedConfig[namespacedKey] = finalValue;
      }

      return namespacedConfig;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
  }

  /**
   * Extract quoted values from INI content before ini.parse strips them
   */
  private extractQuotedValues(content: string, environment: string): { [key: string]: string } {
    const quotedValues: { [key: string]: string } = {};
    const lines = content.split('\n');
    let inTargetSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section headers
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const sectionName = trimmed.slice(1, -1);
        inTargetSection = sectionName === environment;
        continue;
      }

      // Skip if not in target section
      if (!inTargetSection) continue;

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Look for quoted values
      const match = trimmed.match(/^([^=]+)="([^"]*)"$/);
      if (match) {
        const [, key, value] = match;
        quotedValues[key.trim()] = `"${value}"`;
      }
    }

    return quotedValues;
  }

  /**
   * Load simple .env file
   */
  private loadEnvFile(filePath: string): { [key: string]: string } {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const vars: { [key: string]: string } = {};

      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim();
            // Preserve quotes if they exist to maintain proper shell escaping
            vars[key.trim()] = value;
          }
        }
      }

      return vars;
    } catch (error) {
      throw new Error(`Failed to load ${filePath}: ${error}`);
    }
  }

  /**
   * Resolve ${VAR} substitutions
   */
  private resolveVariables(vars: { [key: string]: string }): { [key: string]: string } {
    const resolved: { [key: string]: string } = {};

    for (const [key, value] of Object.entries(vars)) {
      // Ensure value is a string
      const stringValue = typeof value === 'string' ? value : String(value);
      resolved[key] = stringValue.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return vars[varName] || process.env[varName] || match;
      });
    }

    return resolved;
  }

  /**
   * Write environment variables to .env.local file
   */
  private async writeEnvFile(vars: { [key: string]: string }): Promise<void> {
    const content = Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.promises.writeFile(this.outputPath, content, 'utf8');
  }

  /**
   * List available profiles
   */
  listProfiles(): { name: string; description: string }[] {
    try {
      const profilesDir = path.join(this.configDir, 'config', 'environments', 'profiles');
      const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));

      return files.map(file => {
        try {
          const content = fs.readFileSync(path.join(profilesDir, file), 'utf8');
          const profile = JSON.parse(content) as Profile;
          return {
            name: file.replace('.json', ''),
            description: profile.description,
          };
        } catch {
          return {
            name: file.replace('.json', ''),
            description: 'Invalid profile file',
          };
        }
      });
    } catch {
      return [];
    }
  }

  /**
   * Validate that all services have their required environment variables
   */
  private validateServices(
    serviceNames: string[],
    systemVars: Record<string, string>
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const serviceName of serviceNames) {
      const validation = this.serviceInterfaces.validateService(serviceName, systemVars);

      if (!validation.valid) {
        errors.push(
          `Service '${serviceName}' is missing required variables: ${validation.missing.join(', ')}`
        );
      }

      if (validation.warnings.length > 0) {
        warnings.push(...validation.warnings.map(w => `[${serviceName}] ${w}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
