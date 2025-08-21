import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import * as yaml from 'yaml';
import {
  Profile,
  Components,
  EnvironmentConfig,
  BuildResult,
  DockerServiceConfig,
} from './types.js';
import { ServiceInterfaceManager } from './service-interfaces.js';

export class EnvironmentBuilder {
  private configDir: string;
  private outputPath: string;
  private serviceInterfaces: ServiceInterfaceManager;

  constructor(
    configDir: string,
    outputPath: string,
    private envName?: string
  ) {
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
    outputPath?: string,
    currentEnv?: string
  ): Promise<void> {
    const serviceVars = this.serviceInterfaces.mapServiceVariables(serviceName, systemVars);
    // outputPath should already include the correct path and envName
    const serviceEnvPath = outputPath || `.env.${serviceName}`;

    // Split variables into public and secret based on service interface
    const { publicVars, secretVars } = this.splitVariablesByInterface(serviceName, serviceVars);

    // Add CURRENT_ENV to public vars if provided
    if (currentEnv) {
      publicVars['CURRENT_ENV'] = currentEnv;
    }

    // Write public variables to .env (baked into Docker image)
    const publicContent = Object.entries(publicVars)
      .map(([key, value]) => `${key}=${this.formatEnvValue(value)}`)
      .join('\n');
    await fs.promises.writeFile(serviceEnvPath, publicContent, 'utf8');

    // Write secret variables to .env.secret (runtime injection via compose)
    // Only create .env.secret if there are actually secret variables
    if (Object.keys(secretVars).length > 0) {
      // Create secret file path by replacing .env with .env.secret
      const secretPath = serviceEnvPath.replace('.env', '.env.secret');
      const secretContent = Object.entries(secretVars)
        .map(([key, value]) => `${key}=${this.formatEnvValue(value)}`)
        .join('\n');
      await fs.promises.writeFile(secretPath, secretContent, 'utf8');
    }
  }

  /**
   * Build service-first environments
   */
  private async buildServiceEnvironments(
    profile: Profile,
    profileName?: string
  ): Promise<BuildResult> {
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
        // Service interface location is required - no fallback
        if (!serviceInterface?.location) {
          throw new Error(
            `Service interface '${serviceName}' is missing required 'location' field`
          );
        }

        const baseLocation = serviceInterface.location;
        if (!this.envName) {
          throw new Error(
            `Environment name is required. Cannot create generic .env files - use profile-specific files like .env.production`
          );
        }

        const outputPath = `${baseLocation}/.env.${this.envName}`;

        // Ensure directory exists
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
          await fs.promises.mkdir(outputDir, { recursive: true });
        }

        await this.generateServiceEnvFile(serviceName, resolvedPool, outputPath, profileName);
        generatedFiles.push(outputPath);
      }

      // Generate Docker Compose if profile has docker configuration
      if (profile.docker) {
        const dockerComposePath = await this.generateDockerCompose(profile, resolvedPool);
        if (dockerComposePath) {
          generatedFiles.push(dockerComposePath);
        }
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

      const envList = Array.isArray(environments) ? environments : [environments];

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
      return this.buildServiceEnvironments(profileData, profileName);
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
   * Write environment variables to .env and .env.secret files
   */
  private async writeEnvFile(_vars: { [key: string]: string }): Promise<void> {
    // For now, just write the .env.fun test file
    const funPath = this.outputPath.replace('.env', '.env.fun');
    await fs.promises.writeFile(funPath, 'fun', 'utf8');
  }

  /**
   * Split environment variables into public (.env) and secret (.env.secret) based on service interfaces
   */
  private splitVariablesByInterface(
    serviceName: string,
    vars: { [key: string]: string }
  ): {
    publicVars: { [key: string]: string };
    secretVars: { [key: string]: string };
  } {
    const publicVars: { [key: string]: string } = {};
    const secretVars: { [key: string]: string } = {};

    // Get secret variable names only from the specific service interface
    const secretVariableNames = new Set<string>();
    // Get the specific service interface
    const serviceInterface = this.serviceInterfaces.getInterfaces().get(serviceName);
    if (serviceInterface?.secret) {
      for (const appVar of Object.keys(serviceInterface.secret)) {
        secretVariableNames.add(appVar);
      }
    }

    // Split variables based on whether they're in the service's secrets list
    for (const [key, value] of Object.entries(vars)) {
      if (secretVariableNames.has(key)) {
        secretVars[key] = value;
      } else {
        publicVars[key] = value;
      }
    }

    return { publicVars, secretVars };
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

  /**
   * Generate Docker Compose file from profile configuration
   */
  private async generateDockerCompose(
    profile: Profile,
    resolvedVars: Record<string, string>
  ): Promise<string | null> {
    if (!profile.docker) return null;

    try {
      const dockerCompose = {
        version: '3.8',
        services: {} as Record<string, DockerServiceConfig>,
        networks: profile.docker.networks || {},
        volumes: profile.docker.volumes || {},
      };

      // Process each service with conditional logic
      for (const [serviceName, serviceConfig] of Object.entries(profile.docker.services)) {
        if (this.shouldIncludeService(serviceConfig, profile, resolvedVars)) {
          dockerCompose.services[serviceName] = this.processServiceConfig(
            serviceConfig,
            resolvedVars
          );
        }
      }

      // Write docker-compose.yaml
      const yamlContent = yaml.stringify(dockerCompose);
      const outputPath = './docker-compose.yaml';
      await fs.promises.writeFile(outputPath, yamlContent, 'utf8');

      return outputPath;
    } catch (error) {
      throw new Error(`Failed to generate Docker Compose: ${error}`);
    }
  }

  /**
   * Check if a service should be included based on conditions
   */
  private shouldIncludeService(
    serviceConfig: DockerServiceConfig,
    profile: Profile,
    resolvedVars: Record<string, string>
  ): boolean {
    if (!serviceConfig.condition) return true;

    // Evaluate condition like "components.redis === 'local'"
    return this.evaluateCondition(serviceConfig.condition, profile, resolvedVars);
  }

  /**
   * Process service configuration for Docker Compose
   */
  private processServiceConfig(
    serviceConfig: DockerServiceConfig,
    resolvedVars: Record<string, string>
  ): DockerServiceConfig {
    const processed = { ...serviceConfig };

    // Remove our custom fields
    delete processed.condition;

    // Process environment file references
    if (processed.environment) {
      processed.env_file = processed.environment;
      delete processed.environment;
    }

    // Add platform specification for cross-architecture compatibility
    if (processed.build || processed.image) {
      processed.platform = 'linux/amd64';
    }

    // Substitute variables in strings
    return this.substituteVariables(processed, resolvedVars) as DockerServiceConfig;
  }

  /**
   * Evaluate a condition string against profile and resolved variables
   */
  private evaluateCondition(
    condition: string,
    profile: Profile,
    _resolvedVars: Record<string, string>
  ): boolean {
    try {
      // Handle "includes" operator: "components.redis includes 'local'"
      const includesMatch = condition.match(/components\.(\w+)\s+includes\s+['"]([^'"]+)['"]/);
      if (includesMatch) {
        const [, componentName, expectedValue] = includesMatch;
        const componentValue = profile.components[componentName as keyof typeof profile.components];

        if (Array.isArray(componentValue)) {
          return componentValue.includes(expectedValue);
        }
        return componentValue === expectedValue;
      }

      // Handle "===" operator: "components.redis === 'local'"
      const equalsMatch = condition.match(/components\.(\w+)\s*===\s*['"]([^'"]+)['"]/);
      if (equalsMatch) {
        const [, componentName, expectedValue] = equalsMatch;
        const componentValue = profile.components[componentName as keyof typeof profile.components];

        // Handle both string and array values
        if (Array.isArray(componentValue)) {
          return componentValue.includes(expectedValue);
        }
        return componentValue === expectedValue;
      }

      // For now, default to true for unrecognized conditions
      console.warn(`Unrecognized condition: ${condition}`);
      return true;
    } catch (error) {
      console.warn(`Error evaluating condition "${condition}":`, error);
      return true;
    }
  }

  /**
   * Format environment variable value with proper quoting
   */
  private formatEnvValue(value: string): string {
    // Ensure value is a string
    const stringValue = typeof value === 'string' ? value : String(value);

    // If value is already quoted, return as-is
    if (
      (stringValue.startsWith('"') && stringValue.endsWith('"')) ||
      (stringValue.startsWith("'") && stringValue.endsWith("'"))
    ) {
      return stringValue;
    }

    // If value contains JSON-like content (starts with [ or {), quote it
    if (stringValue.trim().startsWith('[') || stringValue.trim().startsWith('{')) {
      return `'${stringValue}'`;
    }

    // If value contains spaces, special characters, or commas, quote it
    if (/[\s,;&|<>(){}[\]$`"'\\]/.test(stringValue)) {
      return `'${stringValue}'`;
    }

    // Simple values don't need quoting
    return stringValue;
  }

  /**
   * Substitute variables in an object recursively
   */
  private substituteVariables(obj: unknown, vars: Record<string, string>): unknown {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
        return vars[varName] || process.env[varName] || match;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteVariables(item, vars));
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteVariables(value, vars);
      }
      return result;
    }

    return obj;
  }
}
