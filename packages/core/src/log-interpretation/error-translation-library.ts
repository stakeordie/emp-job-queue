// Error Translation Library - Common patterns and user-friendly translations
// Provides reusable error patterns that can be shared across different service interpreters

import { LogPattern, InterpretedMessage, LogContext } from './base-log-interpreter.js';

/**
 * Common error patterns that appear across multiple services
 */
export const CommonErrorPatterns = {
  // Memory and resource errors
  OutOfMemory: {
    id: 'common_out_of_memory',
    name: 'Out of Memory',
    description: 'System or GPU out of memory',
    pattern: /(?:out of memory|OOM|memory.*(?:limit|exhausted)|CUDA.*memory|cannot allocate)/i,
    confidence: 0.9,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'The system ran out of memory while processing your request. Try reducing image size or complexity.',
      severity: 'error' as const,
      category: 'resource' as const,
      suggestedAction: 'Reduce image dimensions, lower quality settings, or try again later when resources are available',
      retryRecommended: true,
      errorCode: 'RESOURCE_MEMORY_EXHAUSTED',
      progressImpact: {
        shouldUpdateProgress: true,
        newProgressPercent: context?.progressPercent || 0
      }
    })
  } as LogPattern,

  NetworkTimeout: {
    id: 'common_network_timeout',
    name: 'Network Timeout',
    description: 'Network connection or request timeout',
    pattern: /(?:timeout|timed out|connection.*(?:refused|reset|failed)|network.*(?:error|unreachable))/i,
    confidence: 0.8,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Connection timeout occurred while processing your request.',
      severity: 'error' as const,
      category: 'service' as const,
      suggestedAction: 'Check your internet connection and try again',
      retryRecommended: true,
      errorCode: 'NETWORK_TIMEOUT'
    })
  } as LogPattern,

  FileNotFound: {
    id: 'common_file_not_found',
    name: 'File Not Found',
    description: 'Required file or resource missing',
    pattern: /(?:file not found|no such file|cannot find|missing.*file|FileNotFoundError)/i,
    confidence: 0.85,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'A required file or resource could not be found.',
      severity: 'error' as const,
      category: 'validation' as const,
      suggestedAction: 'Verify that all required files are available and accessible',
      retryRecommended: false,
      errorCode: 'RESOURCE_NOT_FOUND'
    })
  } as LogPattern,

  PermissionDenied: {
    id: 'common_permission_denied',
    name: 'Permission Denied',
    description: 'Access denied to resource',
    pattern: /(?:permission denied|access denied|unauthorized|forbidden|PermissionError)/i,
    confidence: 0.85,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Access was denied to a required resource.',
      severity: 'error' as const,
      category: 'system' as const,
      suggestedAction: 'Contact support to resolve permission issues',
      retryRecommended: false,
      errorCode: 'PERMISSION_DENIED'
    })
  } as LogPattern,

  InvalidInput: {
    id: 'common_invalid_input',
    name: 'Invalid Input',
    description: 'Input validation failed',
    pattern: /(?:invalid.*(?:input|parameter|value|format)|validation.*(?:failed|error)|bad.*(?:request|input))/i,
    confidence: 0.8,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'The provided input contains invalid or unsupported values.',
      severity: 'error' as const,
      category: 'validation' as const,
      suggestedAction: 'Review your input parameters and ensure they meet the required format',
      retryRecommended: false,
      errorCode: 'INVALID_INPUT'
    })
  } as LogPattern
};

/**
 * Progress and status patterns
 */
export const ProgressPatterns = {
  Starting: {
    id: 'progress_starting',
    name: 'Task Starting',
    description: 'Task initialization',
    pattern: /(?:starting|initializing|beginning|commencing)/i,
    confidence: 0.7,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Task is starting...',
      severity: 'info' as const,
      category: 'progress' as const,
      progressImpact: {
        shouldUpdateProgress: true,
        newProgressPercent: 5
      }
    })
  } as LogPattern,

  Processing: {
    id: 'progress_processing',
    name: 'Task Processing',
    description: 'Task in progress',
    pattern: /(?:processing|working|generating|computing|executing)/i,
    confidence: 0.6,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Processing your request...',
      severity: 'info' as const,
      category: 'progress' as const,
      progressImpact: {
        shouldUpdateProgress: true,
        newProgressPercent: Math.max(context?.progressPercent || 0, 30)
      }
    })
  } as LogPattern,

  Completing: {
    id: 'progress_completing',
    name: 'Task Completing',
    description: 'Task finishing up',
    pattern: /(?:completing|finishing|finalizing|saving|done)/i,
    confidence: 0.75,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Finalizing your request...',
      severity: 'info' as const,
      category: 'progress' as const,
      progressImpact: {
        shouldUpdateProgress: true,
        newProgressPercent: 90
      }
    })
  } as LogPattern
};

/**
 * Model and AI-specific patterns
 */
export const ModelPatterns = {
  ModelLoading: {
    id: 'model_loading',
    name: 'Model Loading',
    description: 'AI model being loaded',
    pattern: /(?:loading.*model|model.*loading|downloading.*model)/i,
    confidence: 0.8,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Loading AI model for processing...',
      severity: 'info' as const,
      category: 'progress' as const,
      suggestedAction: 'This may take a moment for first-time model loading',
      progressImpact: {
        shouldUpdateProgress: true,
        newProgressPercent: 15,
        estimatedTimeRemaining: 30000 // 30 seconds
      }
    })
  } as LogPattern,

  ModelNotFound: {
    id: 'model_not_found',
    name: 'Model Not Found',
    description: 'Required AI model missing',
    pattern: /(?:model.*(?:not found|missing|unavailable)|cannot.*(?:load|find).*model)/i,
    confidence: 0.9,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'The required AI model is not available on this machine.',
      severity: 'error' as const,
      category: 'resource' as const,
      suggestedAction: 'Try a different model or wait for the model to become available',
      retryRecommended: true,
      errorCode: 'MODEL_NOT_FOUND'
    })
  } as LogPattern,

  IncompatibleModel: {
    id: 'model_incompatible',
    name: 'Incompatible Model',
    description: 'Model version or format incompatibility',
    pattern: /(?:incompatible.*model|model.*(?:version|format).*(?:error|mismatch)|unsupported.*model)/i,
    confidence: 0.85,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'The specified model is not compatible with your request.',
      severity: 'error' as const,
      category: 'validation' as const,
      suggestedAction: 'Choose a different model that supports your request type',
      retryRecommended: false,
      errorCode: 'MODEL_INCOMPATIBLE'
    })
  } as LogPattern
};

/**
 * Service-specific connection patterns
 */
export const ConnectionPatterns = {
  ServiceUnavailable: {
    id: 'service_unavailable',
    name: 'Service Unavailable',
    description: 'External service is down or unreachable',
    pattern: /(?:service.*(?:unavailable|down|offline)|server.*(?:error|unreachable)|503|502|504)/i,
    confidence: 0.85,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'The processing service is temporarily unavailable.',
      severity: 'error' as const,
      category: 'service' as const,
      suggestedAction: 'Please try again in a few minutes',
      retryRecommended: true,
      errorCode: 'SERVICE_UNAVAILABLE'
    })
  } as LogPattern,

  APIRateLimit: {
    id: 'api_rate_limit',
    name: 'API Rate Limit',
    description: 'API rate limit exceeded',
    pattern: /(?:rate.*limit|too many requests|quota.*exceeded|429)/i,
    confidence: 0.9,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Request rate limit exceeded. Please wait before trying again.',
      severity: 'warning' as const,
      category: 'service' as const,
      suggestedAction: 'Wait a few minutes before submitting another request',
      retryRecommended: true,
      errorCode: 'RATE_LIMIT_EXCEEDED'
    })
  } as LogPattern,

  AuthenticationFailed: {
    id: 'auth_failed',
    name: 'Authentication Failed',
    description: 'API authentication or authorization failed',
    pattern: /(?:authentication.*failed|invalid.*(?:token|key|credentials)|unauthorized|401)/i,
    confidence: 0.9,
    interpreter: (match: RegExpMatchArray, context?: LogContext): InterpretedMessage => ({
      userMessage: 'Authentication failed with the external service.',
      severity: 'error' as const,
      category: 'service' as const,
      suggestedAction: 'Contact support to verify service credentials',
      retryRecommended: false,
      errorCode: 'AUTHENTICATION_FAILED'
    })
  } as LogPattern
};

/**
 * Get all common patterns as an array
 */
export function getAllCommonPatterns(): LogPattern[] {
  return [
    ...Object.values(CommonErrorPatterns),
    ...Object.values(ProgressPatterns),
    ...Object.values(ModelPatterns),
    ...Object.values(ConnectionPatterns)
  ];
}

/**
 * Get patterns by category
 */
export function getPatternsByCategory(category: 'error' | 'progress' | 'model' | 'connection'): LogPattern[] {
  switch (category) {
    case 'error':
      return Object.values(CommonErrorPatterns);
    case 'progress':
      return Object.values(ProgressPatterns);
    case 'model':
      return Object.values(ModelPatterns);
    case 'connection':
      return Object.values(ConnectionPatterns);
    default:
      return [];
  }
}

/**
 * Helper function to create custom patterns
 */
export function createCustomPattern(
  id: string,
  name: string,
  pattern: RegExp | ((message: string) => boolean),
  interpreter: (match: RegExpMatchArray | string, context?: LogContext) => InterpretedMessage,
  confidence: number = 0.8,
  description?: string
): LogPattern {
  return {
    id,
    name,
    description: description || name,
    pattern,
    confidence,
    interpreter
  };
}