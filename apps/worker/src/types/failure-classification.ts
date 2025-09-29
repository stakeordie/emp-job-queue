/**
 * Structured failure classification system for job failure attestations
 *
 * Two-tiered approach:
 * - failure_type: High-level category of failure
 * - failure_reason: Specific reason within that category
 */

export interface FailureClassification {
  failure_type: FailureType;
  failure_reason: FailureReason;
  failure_description?: string; // Human-readable description
}

// High-level failure categories
export enum FailureType {
  // Content generation was refused due to policy violations
  GENERATION_REFUSAL = 'generation_refusal',

  // Service or infrastructure issues
  SERVICE_ERROR = 'service_error',

  // Processing timeouts
  TIMEOUT = 'timeout',

  // Invalid input or configuration
  VALIDATION_ERROR = 'validation_error',

  // Resource constraints (memory, storage, etc.)
  RESOURCE_LIMIT = 'resource_limit',

  // Authentication or authorization failures
  AUTH_ERROR = 'auth_error',

  // Rate limiting from external services
  RATE_LIMIT = 'rate_limit',

  // Network connectivity issues
  NETWORK_ERROR = 'network_error',

  // Unexpected service responses or data format issues
  RESPONSE_ERROR = 'response_error',

  // Internal system errors
  SYSTEM_ERROR = 'system_error'
}

// Specific reasons within each category
export enum FailureReason {
  // GENERATION_REFUSAL reasons
  VIOLENCE_DETECTED = 'violence_detected',
  COPYRIGHT_BLOCKER = 'copyright_blocker',
  NSFW_CONTENT = 'nsfw_content',
  HATE_SPEECH = 'hate_speech',
  PERSONAL_INFO = 'personal_info',
  SAFETY_FILTER = 'safety_filter',
  POLICY_VIOLATION = 'policy_violation',

  // SERVICE_ERROR reasons
  SERVICE_DOWN = 'service_down',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  MAINTENANCE_MODE = 'maintenance_mode',
  DEGRADED_PERFORMANCE = 'degraded_performance',

  // TIMEOUT reasons
  JOB_TIMEOUT = 'job_timeout',
  NETWORK_TIMEOUT = 'network_timeout',
  PROCESSING_TIMEOUT = 'processing_timeout',
  QUEUE_TIMEOUT = 'queue_timeout',

  // VALIDATION_ERROR reasons
  INVALID_PAYLOAD = 'invalid_payload',
  MISSING_REQUIRED_FIELD = 'missing_required_field',
  INVALID_FORMAT = 'invalid_format',
  UNSUPPORTED_OPERATION = 'unsupported_operation',
  MODEL_NOT_FOUND = 'model_not_found',
  COMPONENT_ERROR = 'component_error',

  // RESOURCE_LIMIT reasons
  OUT_OF_MEMORY = 'out_of_memory',
  DISK_SPACE_FULL = 'disk_space_full',
  GPU_MEMORY_FULL = 'gpu_memory_full',
  CONCURRENT_LIMIT = 'concurrent_limit',

  // AUTH_ERROR reasons
  INVALID_API_KEY = 'invalid_api_key',
  EXPIRED_TOKEN = 'expired_token',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  ACCOUNT_SUSPENDED = 'account_suspended',

  // RATE_LIMIT reasons
  REQUESTS_PER_MINUTE = 'requests_per_minute',
  TOKENS_PER_MINUTE = 'tokens_per_minute',
  DAILY_QUOTA_EXCEEDED = 'daily_quota_exceeded',
  CONCURRENT_REQUESTS = 'concurrent_requests',

  // NETWORK_ERROR reasons
  CONNECTION_FAILED = 'connection_failed',
  DNS_RESOLUTION = 'dns_resolution',
  SSL_CERTIFICATE = 'ssl_certificate',
  PROXY_ERROR = 'proxy_error',

  // RESPONSE_ERROR reasons
  INVALID_RESPONSE_FORMAT = 'invalid_response_format',
  UNEXPECTED_CONTENT_TYPE = 'unexpected_content_type',
  CORRUPTED_DATA = 'corrupted_data',
  MISSING_EXPECTED_DATA = 'missing_expected_data',

  // SYSTEM_ERROR reasons
  INTERNAL_ERROR = 'internal_error',
  CONFIG_ERROR = 'config_error',
  DEPENDENCY_ERROR = 'dependency_error',
  GPU_ERROR = 'gpu_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Utility class for classifying failures based on error messages and context
 */
export class FailureClassifier {
  /**
   * Classify a failure based on error message and context
   */
  static classify(
    errorMessage: string,
    context?: {
      serviceType?: string;
      httpStatus?: number;
      responseData?: any;
      timeout?: boolean;
    }
  ): FailureClassification {
    const error = errorMessage.toLowerCase();

    // Generation refusal patterns
    if (this.isGenerationRefusal(error)) {
      return this.classifyGenerationRefusal(error);
    }

    // Authentication errors
    if (this.isAuthError(error, context?.httpStatus)) {
      return this.classifyAuthError(error, context?.httpStatus);
    }

    // Rate limiting
    if (this.isRateLimit(error, context?.httpStatus)) {
      return this.classifyRateLimit(error);
    }

    // Network errors
    if (this.isNetworkError(error)) {
      return this.classifyNetworkError(error);
    }

    // Resource limits
    if (this.isResourceLimit(error)) {
      return this.classifyResourceLimit(error);
    }

    // Service errors
    if (this.isServiceError(error, context?.httpStatus)) {
      return this.classifyServiceError(error, context?.httpStatus);
    }

    // Timeout errors
    if (context?.timeout || this.isTimeout(error)) {
      return this.classifyTimeout(error);
    }

    // Validation errors
    if (this.isValidationError(error)) {
      return this.classifyValidationError(error);
    }

    // Response/content errors
    if (this.isResponseError(error)) {
      return this.classifyResponseError(error);
    }

    // System errors
    if (this.isSystemError(error)) {
      return this.classifySystemError(error);
    }

    // Default to system error
    return {
      failure_type: FailureType.SYSTEM_ERROR,
      failure_reason: FailureReason.UNKNOWN_ERROR,
      failure_description: 'Unclassified error'
    };
  }

  private static isGenerationRefusal(error: string): boolean {
    const refusalPatterns = [
      'cannot generate', 'unable to create', 'can\'t generate', 'cannot create',
      'policy violation', 'content policy', 'inappropriate', 'not allowed',
      'refused', 'declined', 'safety', 'harmful', 'violence', 'nsfw',
      'copyright', 'intellectual property', 'moderation_blocked', 'safety system',
      'blocked', 'adult content'
    ];
    return refusalPatterns.some(pattern => error.includes(pattern));
  }

  private static classifyGenerationRefusal(error: string): FailureClassification {
    // OpenAI moderation blocking
    if (error.includes('moderation_blocked') || error.includes('safety system')) {
      const requestIdMatch = error.match(/wfr_[a-zA-Z0-9]+/);
      const requestId = requestIdMatch ? requestIdMatch[0] : '';
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.SAFETY_FILTER,
        failure_description: `Content refused by safety system${requestId ? ` (request ID: ${requestId})` : ''}`
      };
    }

    if (error.includes('violence') || error.includes('violent')) {
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.VIOLENCE_DETECTED,
        failure_description: 'Content refused due to violence detection'
      };
    }

    if (error.includes('copyright') || error.includes('intellectual property')) {
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.COPYRIGHT_BLOCKER,
        failure_description: 'Content refused due to copyright concerns'
      };
    }

    if (error.includes('nsfw') || error.includes('explicit') || error.includes('adult content') || (error.includes('blocked') && error.includes('adult'))) {
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.NSFW_CONTENT,
        failure_description: 'Content refused due to NSFW content'
      };
    }

    if (error.includes('hate') || error.includes('discrimination')) {
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.HATE_SPEECH,
        failure_description: 'Content refused due to hate speech detection'
      };
    }

    if (error.includes('personal') || error.includes('private')) {
      return {
        failure_type: FailureType.GENERATION_REFUSAL,
        failure_reason: FailureReason.PERSONAL_INFO,
        failure_description: 'Content refused due to personal information'
      };
    }

    // Default generation refusal
    return {
      failure_type: FailureType.GENERATION_REFUSAL,
      failure_reason: FailureReason.POLICY_VIOLATION,
      failure_description: 'Content refused due to policy violation'
    };
  }

  private static isAuthError(error: string, httpStatus?: number): boolean {
    return httpStatus === 401 || httpStatus === 403 ||
           error.includes('authentication') || error.includes('unauthorized') ||
           error.includes('api key') || error.includes('token') ||
           error.includes('permission');
  }

  private static classifyAuthError(error: string, httpStatus?: number): FailureClassification {
    if (error.includes('api key') || error.includes('invalid key')) {
      return {
        failure_type: FailureType.AUTH_ERROR,
        failure_reason: FailureReason.INVALID_API_KEY,
        failure_description: 'Authentication failed due to invalid API key'
      };
    }

    if (error.includes('expired') || error.includes('token')) {
      return {
        failure_type: FailureType.AUTH_ERROR,
        failure_reason: FailureReason.EXPIRED_TOKEN,
        failure_description: 'Authentication failed due to expired token'
      };
    }

    if (httpStatus === 403 || error.includes('permission')) {
      return {
        failure_type: FailureType.AUTH_ERROR,
        failure_reason: FailureReason.INSUFFICIENT_PERMISSIONS,
        failure_description: 'Authentication failed due to insufficient permissions'
      };
    }

    if (error.includes('suspended') || error.includes('disabled')) {
      return {
        failure_type: FailureType.AUTH_ERROR,
        failure_reason: FailureReason.ACCOUNT_SUSPENDED,
        failure_description: 'Authentication failed due to suspended account'
      };
    }

    return {
      failure_type: FailureType.AUTH_ERROR,
      failure_reason: FailureReason.INVALID_API_KEY,
      failure_description: 'Authentication failed'
    };
  }

  private static isRateLimit(error: string, httpStatus?: number): boolean {
    return httpStatus === 429 || error.includes('rate limit') ||
           error.includes('quota') || error.includes('too many requests');
  }

  private static classifyRateLimit(error: string): FailureClassification {
    if (error.includes('daily') || error.includes('quota')) {
      return {
        failure_type: FailureType.RATE_LIMIT,
        failure_reason: FailureReason.DAILY_QUOTA_EXCEEDED,
        failure_description: 'Rate limited due to daily quota exceeded'
      };
    }

    if (error.includes('concurrent')) {
      return {
        failure_type: FailureType.RATE_LIMIT,
        failure_reason: FailureReason.CONCURRENT_REQUESTS,
        failure_description: 'Rate limited due to concurrent requests'
      };
    }

    if (error.includes('token')) {
      return {
        failure_type: FailureType.RATE_LIMIT,
        failure_reason: FailureReason.TOKENS_PER_MINUTE,
        failure_description: 'Rate limited due to tokens per minute'
      };
    }

    return {
      failure_type: FailureType.RATE_LIMIT,
      failure_reason: FailureReason.REQUESTS_PER_MINUTE,
      failure_description: 'Rate limited due to requests per minute'
    };
  }

  private static isNetworkError(error: string): boolean {
    return error.includes('network') || error.includes('connection') ||
           error.includes('dns') || error.includes('ssl') ||
           error.includes('econnrefused') || error.includes('enotfound') ||
           error.includes('timeout');
  }

  private static classifyNetworkError(error: string): FailureClassification {
    if (error.includes('dns') || error.includes('enotfound')) {
      return {
        failure_type: FailureType.NETWORK_ERROR,
        failure_reason: FailureReason.DNS_RESOLUTION,
        failure_description: 'Network error due to DNS resolution failure'
      };
    }

    if (error.includes('ssl') || error.includes('certificate')) {
      return {
        failure_type: FailureType.NETWORK_ERROR,
        failure_reason: FailureReason.SSL_CERTIFICATE,
        failure_description: 'Network error due to SSL certificate issues'
      };
    }

    if (error.includes('proxy')) {
      return {
        failure_type: FailureType.NETWORK_ERROR,
        failure_reason: FailureReason.PROXY_ERROR,
        failure_description: 'Network error due to proxy issues'
      };
    }

    if (error.includes('timeout')) {
      return {
        failure_type: FailureType.NETWORK_ERROR,
        failure_reason: FailureReason.NETWORK_TIMEOUT,
        failure_description: 'Network connection timed out'
      };
    }

    return {
      failure_type: FailureType.NETWORK_ERROR,
      failure_reason: FailureReason.CONNECTION_FAILED,
      failure_description: 'Network connection failed'
    };
  }

  private static isResourceLimit(error: string): boolean {
    return error.includes('memory') || error.includes('disk space') ||
           error.includes('storage') || error.includes('limit') ||
           error.includes('capacity');
  }

  private static classifyResourceLimit(error: string): FailureClassification {
    if (error.includes('memory')) {
      if (error.includes('gpu') || error.includes('cuda')) {
        return {
          failure_type: FailureType.RESOURCE_LIMIT,
          failure_reason: FailureReason.GPU_MEMORY_FULL,
          failure_description: 'Resource limit exceeded due to GPU memory'
        };
      }
      return {
        failure_type: FailureType.RESOURCE_LIMIT,
        failure_reason: FailureReason.OUT_OF_MEMORY,
        failure_description: 'Resource limit exceeded due to memory'
      };
    }

    if (error.includes('disk') || error.includes('storage')) {
      return {
        failure_type: FailureType.RESOURCE_LIMIT,
        failure_reason: FailureReason.DISK_SPACE_FULL,
        failure_description: 'Resource limit exceeded due to disk space'
      };
    }

    if (error.includes('concurrent')) {
      return {
        failure_type: FailureType.RESOURCE_LIMIT,
        failure_reason: FailureReason.CONCURRENT_LIMIT,
        failure_description: 'Resource limit exceeded due to concurrent operations'
      };
    }

    return {
      failure_type: FailureType.RESOURCE_LIMIT,
      failure_reason: FailureReason.OUT_OF_MEMORY,
      failure_description: 'Resource limit exceeded'
    };
  }

  private static isServiceError(error: string, httpStatus?: number): boolean {
    return (httpStatus && httpStatus >= 500) ||
           error.includes('service') || error.includes('server error') ||
           error.includes('maintenance') || error.includes('unavailable');
  }

  private static classifyServiceError(error: string, httpStatus?: number): FailureClassification {
    if (error.includes('maintenance')) {
      return {
        failure_type: FailureType.SERVICE_ERROR,
        failure_reason: FailureReason.MAINTENANCE_MODE,
        failure_description: 'Service error due to maintenance mode'
      };
    }

    if (error.includes('unavailable') || httpStatus === 503) {
      return {
        failure_type: FailureType.SERVICE_ERROR,
        failure_reason: FailureReason.SERVICE_UNAVAILABLE,
        failure_description: 'Service temporarily unavailable'
      };
    }

    if (error.includes('degraded')) {
      return {
        failure_type: FailureType.SERVICE_ERROR,
        failure_reason: FailureReason.DEGRADED_PERFORMANCE,
        failure_description: 'Service error due to degraded performance'
      };
    }

    return {
      failure_type: FailureType.SERVICE_ERROR,
      failure_reason: FailureReason.SERVICE_DOWN,
      failure_description: 'Service is down or experiencing issues'
    };
  }

  private static isTimeout(error: string): boolean {
    return error.includes('timeout') || error.includes('timed out');
  }

  private static classifyTimeout(error: string): FailureClassification {
    if (error.includes('network')) {
      return {
        failure_type: FailureType.TIMEOUT,
        failure_reason: FailureReason.NETWORK_TIMEOUT,
        failure_description: 'Operation timed out due to network issues'
      };
    }

    if (error.includes('processing')) {
      return {
        failure_type: FailureType.TIMEOUT,
        failure_reason: FailureReason.PROCESSING_TIMEOUT,
        failure_description: 'Operation timed out during processing'
      };
    }

    if (error.includes('queue')) {
      return {
        failure_type: FailureType.TIMEOUT,
        failure_reason: FailureReason.QUEUE_TIMEOUT,
        failure_description: 'Operation timed out in queue'
      };
    }

    return {
      failure_type: FailureType.TIMEOUT,
      failure_reason: FailureReason.JOB_TIMEOUT,
      failure_description: 'Job processing timed out'
    };
  }

  private static isValidationError(error: string): boolean {
    return error.includes('validation') || error.includes('invalid') ||
           error.includes('missing') || error.includes('required') ||
           error.includes('format') || error.includes('component') ||
           error.includes('model') || error.includes('does not exist');
  }

  private static classifyValidationError(error: string): FailureClassification {
    // Component errors
    if (error.includes('error in component')) {
      const componentMatch = error.match(/component ['"]([^'"]+)['"]/);
      const componentName = componentMatch ? componentMatch[1] : 'unknown';
      return {
        failure_type: FailureType.VALIDATION_ERROR,
        failure_reason: FailureReason.COMPONENT_ERROR,
        failure_description: `Error in component ${componentName}`
      };
    }

    // Model not found errors
    if (error.includes('model') && (error.includes('does not exist') || error.includes('not found'))) {
      return {
        failure_type: FailureType.VALIDATION_ERROR,
        failure_reason: FailureReason.MODEL_NOT_FOUND,
        failure_description: 'Model not found or does not exist'
      };
    }

    if (error.includes('missing') || error.includes('required')) {
      return {
        failure_type: FailureType.VALIDATION_ERROR,
        failure_reason: FailureReason.MISSING_REQUIRED_FIELD,
        failure_description: 'Validation failed due to missing required field'
      };
    }

    if (error.includes('format')) {
      return {
        failure_type: FailureType.VALIDATION_ERROR,
        failure_reason: FailureReason.INVALID_FORMAT,
        failure_description: 'Validation failed due to invalid format'
      };
    }

    if (error.includes('unsupported')) {
      return {
        failure_type: FailureType.VALIDATION_ERROR,
        failure_reason: FailureReason.UNSUPPORTED_OPERATION,
        failure_description: 'Validation failed due to unsupported operation'
      };
    }

    return {
      failure_type: FailureType.VALIDATION_ERROR,
      failure_reason: FailureReason.INVALID_PAYLOAD,
      failure_description: 'Validation failed due to invalid payload'
    };
  }

  private static isResponseError(error: string): boolean {
    return error.includes('response') || error.includes('content type') ||
           error.includes('corrupted') || error.includes('expected');
  }

  private static classifyResponseError(error: string): FailureClassification {
    if (error.includes('content type')) {
      return {
        failure_type: FailureType.RESPONSE_ERROR,
        failure_reason: FailureReason.UNEXPECTED_CONTENT_TYPE,
        failure_description: 'Response error due to unexpected content type'
      };
    }

    if (error.includes('corrupted')) {
      return {
        failure_type: FailureType.RESPONSE_ERROR,
        failure_reason: FailureReason.CORRUPTED_DATA,
        failure_description: 'Response error due to corrupted data'
      };
    }

    if (error.includes('missing') || error.includes('expected')) {
      return {
        failure_type: FailureType.RESPONSE_ERROR,
        failure_reason: FailureReason.MISSING_EXPECTED_DATA,
        failure_description: 'Response error due to missing expected data'
      };
    }

    return {
      failure_type: FailureType.RESPONSE_ERROR,
      failure_reason: FailureReason.INVALID_RESPONSE_FORMAT,
      failure_description: 'Response error due to invalid format'
    };
  }

  private static isSystemError(error: string): boolean {
    // Don't classify network errors as system errors
    if (error.includes('dns') || error.includes('enotfound') || error.includes('network') || error.includes('timeout')) {
      return false;
    }
    return error.includes('cuda') || error.includes('gpu') ||
           error.includes('internal') || error.includes('config') ||
           error.includes('dependency');
  }

  private static classifySystemError(error: string): FailureClassification {
    if (error.includes('cuda') || error.includes('gpu')) {
      return {
        failure_type: FailureType.SYSTEM_ERROR,
        failure_reason: FailureReason.GPU_ERROR,
        failure_description: 'System error due to GPU/CUDA issues'
      };
    }

    if (error.includes('config')) {
      return {
        failure_type: FailureType.SYSTEM_ERROR,
        failure_reason: FailureReason.CONFIG_ERROR,
        failure_description: 'System error due to configuration issues'
      };
    }

    if (error.includes('dependency')) {
      return {
        failure_type: FailureType.SYSTEM_ERROR,
        failure_reason: FailureReason.DEPENDENCY_ERROR,
        failure_description: 'System error due to dependency issues'
      };
    }

    return {
      failure_type: FailureType.SYSTEM_ERROR,
      failure_reason: FailureReason.INTERNAL_ERROR,
      failure_description: 'Internal system error'
    };
  }
}