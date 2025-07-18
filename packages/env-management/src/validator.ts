import * as fs from 'fs';
import * as net from 'net';
import { Profile } from './types.js';

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  checks: {
    services: boolean;
    ports: boolean;
    network: boolean;
    variables: boolean;
  };
}

export class EnvironmentValidator {
  /**
   * Validate current environment setup
   */
  async validateEnvironment(
    envPath: string = '.env.local',
    profile?: Profile
  ): Promise<ValidationResult> {
    const result: ValidationResult = {
      success: true,
      errors: [],
      warnings: [],
      checks: {
        services: true,
        ports: true,
        network: true,
        variables: true,
      },
    };

    // Load environment variables
    const envVars = this.loadEnvFile(envPath);
    if (Object.keys(envVars).length === 0) {
      result.errors.push(`Environment file ${envPath} not found or empty`);
      result.success = false;
      return result;
    }

    // Validate required variables
    await this.validateVariables(envVars, result);

    // Validate profile-specific requirements
    if (profile?.validation) {
      await this.validateServices(profile.validation.required_services || [], result);
      await this.validatePorts(profile.validation.port_conflicts || [], result);
      await this.validateNetworkAccess(profile.validation.network_access || [], result);

      if (profile.validation.warnings) {
        result.warnings.push(...profile.validation.warnings);
      }
    }

    return result;
  }

  /**
   * Load environment file
   */
  private loadEnvFile(filePath: string): { [key: string]: string } {
    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }

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
    } catch (_error) {
      return {};
    }
  }

  /**
   * Validate required environment variables
   */
  private async validateVariables(
    envVars: { [key: string]: string },
    result: ValidationResult
  ): Promise<void> {
    const requiredVars = ['REDIS_URL', 'API_URL', 'MACHINE_ID'];

    for (const varName of requiredVars) {
      if (!envVars[varName]) {
        result.errors.push(`Missing required variable: ${varName}`);
        result.checks.variables = false;
        result.success = false;
      }
    }

    // Check for unresolved substitutions
    for (const [key, value] of Object.entries(envVars)) {
      if (value.includes('${') && value.includes('}')) {
        result.warnings.push(`Unresolved variable substitution in ${key}: ${value}`);
      }
    }
  }

  /**
   * Validate required services are running
   */
  private async validateServices(
    requiredServices: string[],
    result: ValidationResult
  ): Promise<void> {
    for (const service of requiredServices) {
      if (service === 'redis') {
        const isRunning = await this.checkRedisConnection();
        if (!isRunning) {
          result.errors.push('Redis service is not running locally');
          result.checks.services = false;
          result.success = false;
        }
      }
    }
  }

  /**
   * Validate port availability
   */
  private async validatePorts(ports: number[], result: ValidationResult): Promise<void> {
    for (const port of ports) {
      const isInUse = await this.checkPortInUse(port);
      if (isInUse) {
        result.warnings.push(`Port ${port} is already in use`);
      }
    }
  }

  /**
   * Validate network access to external services
   */
  private async validateNetworkAccess(hosts: string[], result: ValidationResult): Promise<void> {
    for (const host of hosts) {
      const isReachable = await this.checkHostReachable(host);
      if (!isReachable) {
        result.warnings.push(`Cannot reach external host: ${host}`);
      }
    }
  }

  /**
   * Check if Redis is accessible
   */
  private async checkRedisConnection(): Promise<boolean> {
    return new Promise(resolve => {
      const client = net.createConnection({ port: 6379, host: 'localhost' }, () => {
        client.end();
        resolve(true);
      });

      client.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        client.destroy();
        resolve(false);
      }, 1000);
    });
  }

  /**
   * Check if port is in use
   */
  private async checkPortInUse(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = net.createServer();

      server.listen(port, () => {
        server.close(() => {
          resolve(false);
        });
      });

      server.on('error', () => {
        resolve(true);
      });
    });
  }

  /**
   * Check if host is reachable
   */
  private async checkHostReachable(host: string, port: number = 80): Promise<boolean> {
    return new Promise(resolve => {
      const client = net.createConnection({ port, host }, () => {
        client.end();
        resolve(true);
      });

      client.on('error', () => {
        resolve(false);
      });

      setTimeout(() => {
        client.destroy();
        resolve(false);
      }, 3000);
    });
  }
}
