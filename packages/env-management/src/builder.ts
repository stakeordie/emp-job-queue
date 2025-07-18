import * as fs from 'fs';
import * as path from 'path';
import * as ini from 'ini';
import { Profile, Components, EnvironmentConfig, BuildResult } from './types.js';

export class EnvironmentBuilder {
  private configDir: string;
  private outputPath: string;

  constructor(configDir: string, outputPath: string = '.env.local') {
    this.configDir = configDir;
    this.outputPath = outputPath;
  }

  /**
   * Build environment from profile
   */
  async buildFromProfile(profileName: string): Promise<BuildResult> {
    try {
      const profilePath = path.join(
        this.configDir,
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
      return this.buildFromComponents(profileData.components, profileData);
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
      for (const [component, environment] of Object.entries(components)) {
        const componentPath = path.join(
          this.configDir,
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

        const componentConfig = this.loadComponentConfig(componentPath, environment);
        if (!componentConfig) {
          return {
            success: false,
            envPath: this.outputPath,
            errors: [`Environment '${environment}' not found in ${component}.env`],
          };
        }

        // Merge component variables
        Object.assign(envVars, componentConfig);
      }

      // Load secrets
      const secretsPath = path.join(
        this.configDir,
        'environments',
        'secrets',
        '.env.secrets.local'
      );
      if (fs.existsSync(secretsPath)) {
        const secrets = this.loadEnvFile(secretsPath);
        Object.assign(envVars, secrets);
      } else if (profile?.secrets && profile.secrets.length > 0) {
        warnings.push('Secrets file not found - some variables may be missing');
      }

      // Substitute environment variables
      const resolvedVars = this.resolveVariables(envVars);

      // Write .env.local file
      await this.writeEnvFile(resolvedVars);

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

      return config[environment] || null;
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }
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
            vars[key.trim()] = valueParts.join('=').trim();
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
      const profilesDir = path.join(this.configDir, 'environments', 'profiles');
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
}
