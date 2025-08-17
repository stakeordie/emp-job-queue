// Environment Variable Helper - ZERO FALLBACKS POLICY
// This enforces explicit configuration with clear error messages

import { logger } from './logger.js';

/**
 * Get required environment variable with NO FALLBACKS
 * Throws immediately if the variable is missing or empty
 * 
 * @param name - Environment variable name
 * @param description - Optional description for better error messages
 * @returns The environment variable value
 * @throws Error if variable is missing or empty
 */
export function getRequiredEnv(name: string, description?: string): string {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    const errorMsg = description 
      ? `FATAL: ${name} environment variable is required. ${description}`
      : `FATAL: ${name} environment variable is required. No defaults allowed.`;
    
    throw new Error(errorMsg);
  }
  
  return value.trim();
}

/**
 * Get required environment variable as integer with NO FALLBACKS
 * 
 * @param name - Environment variable name
 * @param description - Optional description for better error messages
 * @returns The environment variable value as integer
 * @throws Error if variable is missing, empty, or not a valid integer
 */
export function getRequiredEnvInt(name: string, description?: string): number {
  const value = getRequiredEnv(name, description);
  const intValue = parseInt(value, 10);
  
  if (isNaN(intValue)) {
    throw new Error(`FATAL: ${name} environment variable must be a valid integer. Got: "${value}"`);
  }
  
  return intValue;
}

/**
 * Get required environment variable as float with NO FALLBACKS
 * 
 * @param name - Environment variable name
 * @param description - Optional description for better error messages
 * @returns The environment variable value as float
 * @throws Error if variable is missing, empty, or not a valid number
 */
export function getRequiredEnvFloat(name: string, description?: string): number {
  const value = getRequiredEnv(name, description);
  const floatValue = parseFloat(value);
  
  if (isNaN(floatValue)) {
    throw new Error(`FATAL: ${name} environment variable must be a valid number. Got: "${value}"`);
  }
  
  return floatValue;
}

/**
 * Get required environment variable as boolean with NO FALLBACKS
 * Accepts: 'true', 'false', '1', '0', 'yes', 'no' (case insensitive)
 * 
 * @param name - Environment variable name
 * @param description - Optional description for better error messages
 * @returns The environment variable value as boolean
 * @throws Error if variable is missing, empty, or not a valid boolean
 */
export function getRequiredEnvBool(name: string, description?: string): boolean {
  const value = getRequiredEnv(name, description).toLowerCase();
  
  const trueValues = ['true', '1', 'yes', 'on', 'enabled'];
  const falseValues = ['false', '0', 'no', 'off', 'disabled'];
  
  if (trueValues.includes(value)) {
    return true;
  }
  
  if (falseValues.includes(value)) {
    return false;
  }
  
  throw new Error(`FATAL: ${name} environment variable must be a valid boolean. Got: "${value}". Valid values: ${[...trueValues, ...falseValues].join(', ')}`);
}

/**
 * Get required environment variable from a list of valid options with NO FALLBACKS
 * 
 * @param name - Environment variable name
 * @param validOptions - Array of valid option values
 * @param description - Optional description for better error messages
 * @returns The environment variable value
 * @throws Error if variable is missing, empty, or not in valid options
 */
export function getRequiredEnvEnum<T extends string>(
  name: string, 
  validOptions: readonly T[], 
  description?: string
): T {
  const value = getRequiredEnv(name, description);
  
  if (!validOptions.includes(value as T)) {
    throw new Error(`FATAL: ${name} environment variable must be one of: ${validOptions.join(', ')}. Got: "${value}"`);
  }
  
  return value as T;
}

/**
 * Get required environment variable as array (comma-separated) with NO FALLBACKS
 * 
 * @param name - Environment variable name
 * @param description - Optional description for better error messages
 * @param separator - Separator character (default: comma)
 * @returns Array of trimmed string values
 * @throws Error if variable is missing or empty
 */
export function getRequiredEnvArray(name: string, description?: string, separator: string = ','): string[] {
  const value = getRequiredEnv(name, description);
  return value.split(separator).map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Validate all required environment variables at startup
 * Call this early in your application to fail fast if any required vars are missing
 * 
 * @param requiredVars - Array of environment variable names that must be present
 * @throws Error with comprehensive message listing all missing variables
 */
export function validateRequiredEnvVars(requiredVars: string[]): void {
  const missing: string[] = [];
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value.trim() === '') {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    const errorMsg = `
❌ FATAL ERROR: Missing required environment variables!

The following environment variables are required but not set:
${missing.map(name => `  - ${name}`).join('\n')}

Current environment variables containing relevant keywords:
${Object.keys(process.env)
  .filter(k => missing.some(m => k.includes(m.split('_')[0])))
  .map(k => `  - ${k}=${process.env[k]}`)
  .join('\n') || '  (none found)'}

Please set these variables before starting the application.
`;
    
    console.error(errorMsg);
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Export types for better TypeScript support
export type RequiredEnvConfig = {
  [key: string]: string | number | boolean | string[];
};

/**
 * Get environment variable with fallback (LOGS WARNING WHEN FALLBACK IS USED)
 * Use this ONLY when you have a legitimate reason for a fallback
 * 
 * @param name - Environment variable name
 * @param fallback - Fallback value (WARNING will be logged)
 * @param description - Description for logging
 * @returns The environment variable value or fallback
 */
export function getEnvWithFallback(name: string, fallback: string, description?: string): string {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    const warningMsg = `⚠️  WARNING: Using fallback for ${name}="${fallback}". ${description || 'Consider setting this explicitly.'}`;
    console.warn(warningMsg);
    logger.warn(warningMsg, { 
      env_var: name, 
      fallback_value: fallback,
      reason: 'environment_variable_missing'
    });
    return fallback;
  }
  
  return value.trim();
}

/**
 * Get environment variable as integer with fallback (LOGS WARNING WHEN FALLBACK IS USED)
 * 
 * @param name - Environment variable name
 * @param fallback - Fallback integer value
 * @param description - Description for logging
 * @returns The environment variable value or fallback as integer
 */
export function getEnvIntWithFallback(name: string, fallback: number, description?: string): number {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    const warningMsg = `⚠️  WARNING: Using fallback for ${name}=${fallback}. ${description || 'Consider setting this explicitly.'}`;
    console.warn(warningMsg);
    logger.warn(warningMsg, { 
      env_var: name, 
      fallback_value: fallback,
      reason: 'environment_variable_missing'
    });
    return fallback;
  }
  
  const intValue = parseInt(value, 10);
  if (isNaN(intValue)) {
    const warningMsg = `⚠️  WARNING: Invalid integer for ${name}="${value}", using fallback ${fallback}. ${description || ''}`;
    console.warn(warningMsg);
    logger.warn(warningMsg, { 
      env_var: name, 
      invalid_value: value,
      fallback_value: fallback,
      reason: 'invalid_integer'
    });
    return fallback;
  }
  
  return intValue;
}

/**
 * Get environment variable as boolean with fallback (LOGS WARNING WHEN FALLBACK IS USED)
 * 
 * @param name - Environment variable name
 * @param fallback - Fallback boolean value
 * @param description - Description for logging
 * @returns The environment variable value or fallback as boolean
 */
export function getEnvBoolWithFallback(name: string, fallback: boolean, description?: string): boolean {
  const value = process.env[name];
  
  if (!value || value.trim() === '') {
    const warningMsg = `⚠️  WARNING: Using fallback for ${name}=${fallback}. ${description || 'Consider setting this explicitly.'}`;
    console.warn(warningMsg);
    logger.warn(warningMsg, { 
      env_var: name, 
      fallback_value: fallback,
      reason: 'environment_variable_missing'
    });
    return fallback;
  }
  
  const lowerValue = value.toLowerCase();
  const trueValues = ['true', '1', 'yes', 'on', 'enabled'];
  const falseValues = ['false', '0', 'no', 'off', 'disabled'];
  
  if (trueValues.includes(lowerValue)) return true;
  if (falseValues.includes(lowerValue)) return false;
  
  const warningMsg = `⚠️  WARNING: Invalid boolean for ${name}="${value}", using fallback ${fallback}. ${description || ''}`;
  console.warn(warningMsg);
  logger.warn(warningMsg, { 
    env_var: name, 
    invalid_value: value,
    fallback_value: fallback,
    reason: 'invalid_boolean'
  });
  return fallback;
}

/**
 * Create a typed configuration object from environment variables
 * 
 * @param envMap - Object mapping config keys to environment variable specs
 * @returns Typed configuration object
 */
export function createEnvConfig<T extends RequiredEnvConfig>(envMap: {
  [K in keyof T]: {
    envVar: string;
    type: 'string' | 'int' | 'float' | 'bool' | 'array';
    description?: string;
    validOptions?: readonly string[];
    fallback?: T[K];
  }
}): T {
  const config = {} as T;
  
  for (const [configKey, spec] of Object.entries(envMap)) {
    switch (spec.type) {
      case 'string':
        if (spec.fallback !== undefined) {
          config[configKey as keyof T] = getEnvWithFallback(spec.envVar, spec.fallback as string, spec.description) as any;
        } else if (spec.validOptions) {
          config[configKey as keyof T] = getRequiredEnvEnum(spec.envVar, spec.validOptions, spec.description) as any;
        } else {
          config[configKey as keyof T] = getRequiredEnv(spec.envVar, spec.description) as any;
        }
        break;
      case 'int':
        if (spec.fallback !== undefined) {
          config[configKey as keyof T] = getEnvIntWithFallback(spec.envVar, spec.fallback as number, spec.description) as any;
        } else {
          config[configKey as keyof T] = getRequiredEnvInt(spec.envVar, spec.description) as any;
        }
        break;
      case 'float':
        config[configKey as keyof T] = getRequiredEnvFloat(spec.envVar, spec.description) as any;
        break;
      case 'bool':
        if (spec.fallback !== undefined) {
          config[configKey as keyof T] = getEnvBoolWithFallback(spec.envVar, spec.fallback as boolean, spec.description) as any;
        } else {
          config[configKey as keyof T] = getRequiredEnvBool(spec.envVar, spec.description) as any;
        }
        break;
      case 'array':
        config[configKey as keyof T] = getRequiredEnvArray(spec.envVar, spec.description) as any;
        break;
      default:
        throw new Error(`Unknown environment variable type: ${spec.type}`);
    }
  }
  
  return config;
}