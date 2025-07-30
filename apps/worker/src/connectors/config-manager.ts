// Configuration Manager Utility
// Standardizes environment variable parsing and validation for connectors

import { logger } from '@emp/core';

export interface EnvVarDefinition {
  key: string;
  template: string;
  type: 'string' | 'number' | 'boolean' | 'url';
  required?: boolean;
  default?: string | number | boolean;
  validator?: (value: any) => boolean;
  description?: string;
}

export interface ParsedConfig {
  [key: string]: string | number | boolean;
}

/**
 * Utility for managing connector configurations from environment variables
 */
export class ConfigManager {
  /**
   * Parse environment variables into typed configuration object
   */
  static parseConfig(definitions: EnvVarDefinition[]): ParsedConfig {
    const config: ParsedConfig = {};
    const missingRequired: string[] = [];

    for (const def of definitions) {
      const rawValue = process.env[def.key];
      let parsedValue: string | number | boolean;

      // Handle missing values
      if (rawValue === undefined || rawValue === '') {
        if (def.required && def.default === undefined) {
          missingRequired.push(def.key);
          continue;
        }
        parsedValue = def.default !== undefined ? def.default : '';
      } else {
        // Type conversion
        switch (def.type) {
          case 'string':
          case 'url':
            parsedValue = rawValue;
            break;
          case 'number':
            parsedValue = parseInt(rawValue, 10);
            if (isNaN(parsedValue)) {
              logger.warn(`Invalid number for ${def.key}: ${rawValue}, using default`);
              parsedValue = (def.default as number) || 0;
            }
            break;
          case 'boolean':
            parsedValue = rawValue.toLowerCase() === 'true' || rawValue === '1';
            break;
          default:
            parsedValue = rawValue;
        }
      }

      // Validation
      if (def.validator && !def.validator(parsedValue)) {
        logger.warn(`Validation failed for ${def.key}: ${parsedValue}, using default`);
        parsedValue = def.default !== undefined ? def.default : '';
      }

      // URL validation
      if (def.type === 'url' && parsedValue && typeof parsedValue === 'string') {
        try {
          new URL(parsedValue);
        } catch {
          logger.warn(`Invalid URL for ${def.key}: ${parsedValue}`);
          if (def.required && def.default === undefined) {
            missingRequired.push(def.key);
            continue;
          }
          parsedValue = (def.default as string) || '';
        }
      }

      config[def.key] = parsedValue;
    }

    if (missingRequired.length > 0) {
      throw new Error(`Missing required environment variables: ${missingRequired.join(', ')}`);
    }

    return config;
  }

  /**
   * Generate environment variable templates for worker validation
   */
  static generateEnvVarTemplates(definitions: EnvVarDefinition[]): Record<string, string> {
    const templates: Record<string, string> = {};

    for (const def of definitions) {
      templates[def.key] = def.template;
    }

    return templates;
  }

  /**
   * Common OpenAI configuration definitions
   */
  static getOpenAIConfigDefinitions(envPrefix: string, defaultModel: string): EnvVarDefinition[] {
    return [
      {
        key: `${envPrefix}_API_KEY`,
        template: `\${${envPrefix}_API_KEY:-\${OPENAI_API_KEY:-}}`,
        type: 'string',
        required: true,
        description: 'OpenAI API key',
      },
      {
        key: `${envPrefix}_BASE_URL`,
        template: `\${${envPrefix}_BASE_URL:-\${OPENAI_BASE_URL:-https://api.openai.com/v1}}`,
        type: 'url',
        default: 'https://api.openai.com/v1',
        description: 'OpenAI API base URL',
      },
      {
        key: `${envPrefix}_MODEL`,
        template: `\${${envPrefix}_MODEL:-${defaultModel}}`,
        type: 'string',
        default: defaultModel,
        description: 'Default model to use',
      },
      {
        key: `${envPrefix}_TIMEOUT_SECONDS`,
        template: `\${${envPrefix}_TIMEOUT_SECONDS:-\${OPENAI_TIMEOUT_SECONDS:-120}}`,
        type: 'number',
        default: 120,
        validator: val => val > 0 && val <= 600,
        description: 'Request timeout in seconds',
      },
      {
        key: `${envPrefix}_RETRY_ATTEMPTS`,
        template: `\${${envPrefix}_RETRY_ATTEMPTS:-\${OPENAI_RETRY_ATTEMPTS:-3}}`,
        type: 'number',
        default: 3,
        validator: val => val >= 0 && val <= 10,
        description: 'Number of retry attempts',
      },
      {
        key: `${envPrefix}_RETRY_DELAY_SECONDS`,
        template: `\${${envPrefix}_RETRY_DELAY_SECONDS:-\${OPENAI_RETRY_DELAY_SECONDS:-5}}`,
        type: 'number',
        default: 5,
        validator: val => val >= 1 && val <= 60,
        description: 'Delay between retries in seconds',
      },
      {
        key: `${envPrefix}_HEALTH_CHECK_INTERVAL`,
        template: `\${${envPrefix}_HEALTH_CHECK_INTERVAL:-\${OPENAI_HEALTH_CHECK_INTERVAL:-120}}`,
        type: 'number',
        default: 120,
        validator: val => val >= 30 && val <= 600,
        description: 'Health check interval in seconds',
      },
      {
        key: `${envPrefix}_MAX_CONCURRENT_JOBS`,
        template: `\${${envPrefix}_MAX_CONCURRENT_JOBS:-3}`,
        type: 'number',
        default: 3,
        validator: val => val >= 1 && val <= 20,
        description: 'Maximum concurrent jobs',
      },
    ];
  }

  /**
   * Common REST API configuration definitions
   */
  static getRestConfigDefinitions(
    envPrefix: string,
    defaultPort: number = 8080
  ): EnvVarDefinition[] {
    return [
      {
        key: `${envPrefix}_HOST`,
        template: `\${${envPrefix}_HOST:-localhost}`,
        type: 'string',
        default: 'localhost',
        description: 'Service host',
      },
      {
        key: `${envPrefix}_PORT`,
        template: `\${${envPrefix}_PORT:-${defaultPort}}`,
        type: 'number',
        default: defaultPort,
        validator: val => val > 0 && val <= 65535,
        description: 'Service port',
      },
      {
        key: `${envPrefix}_USERNAME`,
        template: `\${${envPrefix}_USERNAME:-}`,
        type: 'string',
        description: 'Authentication username (optional)',
      },
      {
        key: `${envPrefix}_PASSWORD`,
        template: `\${${envPrefix}_PASSWORD:-}`,
        type: 'string',
        description: 'Authentication password (optional)',
      },
      {
        key: `${envPrefix}_API_KEY`,
        template: `\${${envPrefix}_API_KEY:-}`,
        type: 'string',
        description: 'API key for authentication (optional)',
      },
      {
        key: `${envPrefix}_TIMEOUT_SECONDS`,
        template: `\${${envPrefix}_TIMEOUT_SECONDS:-300}`,
        type: 'number',
        default: 300,
        validator: val => val > 0 && val <= 3600,
        description: 'Request timeout in seconds',
      },
      {
        key: `${envPrefix}_MAX_CONCURRENT_JOBS`,
        template: `\${${envPrefix}_MAX_CONCURRENT_JOBS:-1}`,
        type: 'number',
        default: 1,
        validator: val => val >= 1 && val <= 10,
        description: 'Maximum concurrent jobs',
      },
    ];
  }

  /**
   * WebSocket configuration definitions
   */
  static getWebSocketConfigDefinitions(
    envPrefix: string,
    defaultPort: number = 8188
  ): EnvVarDefinition[] {
    const baseConfig = this.getRestConfigDefinitions(envPrefix, defaultPort);

    return [
      ...baseConfig,
      {
        key: `${envPrefix}_WS_URL`,
        template: `\${${envPrefix}_WS_URL:-}`,
        type: 'url',
        description: 'WebSocket URL (optional, will be constructed from host/port if not provided)',
      },
      {
        key: `${envPrefix}_SECURE`,
        template: `\${${envPrefix}_SECURE:-false}`,
        type: 'boolean',
        default: false,
        description: 'Use secure WebSocket (wss://)',
      },
      {
        key: `${envPrefix}_HEARTBEAT_MS`,
        template: `\${${envPrefix}_HEARTBEAT_MS:-30000}`,
        type: 'number',
        default: 30000,
        validator: val => val >= 5000 && val <= 300000,
        description: 'Heartbeat interval in milliseconds',
      },
      {
        key: `${envPrefix}_RECONNECT_DELAY_MS`,
        template: `\${${envPrefix}_RECONNECT_DELAY_MS:-5000}`,
        type: 'number',
        default: 5000,
        validator: val => val >= 1000 && val <= 60000,
        description: 'Reconnection delay in milliseconds',
      },
      {
        key: `${envPrefix}_MAX_RECONNECT`,
        template: `\${${envPrefix}_MAX_RECONNECT:-5}`,
        type: 'number',
        default: 5,
        validator: val => val >= 0 && val <= 20,
        description: 'Maximum reconnection attempts',
      },
    ];
  }

  /**
   * Validate configuration against definitions
   */
  static validateConfig(
    config: ParsedConfig,
    definitions: EnvVarDefinition[]
  ): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const def of definitions) {
      const value = config[def.key];

      // Required check
      if (def.required && (value === undefined || value === '')) {
        errors.push(`Missing required configuration: ${def.key}`);
        continue;
      }

      // Type check
      if (value !== undefined && value !== '') {
        const expectedType = def.type === 'url' ? 'string' : def.type;
        if (typeof value !== expectedType) {
          errors.push(`Invalid type for ${def.key}: expected ${expectedType}, got ${typeof value}`);
        }

        // Custom validation
        if (def.validator && !def.validator(value)) {
          warnings.push(`Validation warning for ${def.key}: value may be invalid`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Log configuration summary (without sensitive values)
   */
  static logConfigSummary(config: ParsedConfig, connectorId: string): void {
    const sensitiveKeys = ['API_KEY', 'PASSWORD', 'SECRET', 'TOKEN'];

    logger.info(`Configuration summary for ${connectorId}:`);

    for (const [key, value] of Object.entries(config)) {
      const isSensitive = sensitiveKeys.some(sensitive => key.includes(sensitive));
      const displayValue = isSensitive ? '[REDACTED]' : value;
      logger.info(`  ${key}: ${displayValue}`);
    }
  }
}
