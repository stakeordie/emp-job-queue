// OpenAI Log Interpreter - Service-specific pattern matching for OpenAI API logs
// Handles OpenAI API responses, rate limits, model issues, and generation progress

import {
  BaseLogInterpreter,
  LogPattern,
  InterpretedMessage,
  LogContext,
} from './base-log-interpreter.js';
import { getAllCommonPatterns, createCustomPattern } from './error-translation-library.js';

export class OpenAILogInterpreter extends BaseLogInterpreter {
  constructor() {
    super('openai');
  }

  protected initializePatterns(): void {
    // Register common patterns first
    for (const pattern of getAllCommonPatterns()) {
      this.registerPattern(pattern);
    }

    // Register OpenAI-specific patterns
    this.registerOpenAIPatterns();
  }

  private registerOpenAIPatterns(): void {
    // API and authentication errors
    this.registerPattern(
      createCustomPattern(
        'openai_invalid_api_key',
        'Invalid API Key',
        /(?:invalid.*api.*key|incorrect api key|authentication.*failed|401.*unauthorized)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI API authentication failed. The API key may be invalid or expired.',
          severity: 'error' as const,
          category: 'service' as const,
          suggestedAction: 'Verify your OpenAI API key is correct and has sufficient credits',
          retryRecommended: false,
          errorCode: 'OPENAI_INVALID_API_KEY',
          documentationUrl: 'https://platform.openai.com/docs/quickstart',
        }),
        0.95
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_insufficient_quota',
        'Insufficient Quota',
        /(?:insufficient.*quota|exceeded.*quota|billing.*limit|quota.*exceeded)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI API quota exceeded. You may need to add billing credits.',
          severity: 'error' as const,
          category: 'service' as const,
          suggestedAction: 'Check your OpenAI billing dashboard and add credits if needed',
          retryRecommended: false,
          errorCode: 'OPENAI_INSUFFICIENT_QUOTA',
          documentationUrl: 'https://platform.openai.com/account/billing',
        }),
        0.95
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_rate_limit_exceeded',
        'Rate Limit Exceeded',
        /(?:rate.*limit.*exceeded|too many requests|429)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI API rate limit exceeded. Please wait before trying again.',
          severity: 'warning' as const,
          category: 'service' as const,
          suggestedAction: 'Wait 1-2 minutes before submitting another request',
          retryRecommended: true,
          errorCode: 'OPENAI_RATE_LIMIT_EXCEEDED',
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: context?.progressPercent || 0,
            estimatedTimeRemaining: 60000, // 1 minute
          },
        }),
        0.9
      )
    );

    // Model and input validation errors
    this.registerPattern(
      createCustomPattern(
        'openai_model_not_found',
        'Model Not Found',
        /(?:model.*(?:not found|does not exist)|invalid.*model|unknown.*model)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'The specified OpenAI model is not available or does not exist.',
          severity: 'error' as const,
          category: 'validation' as const,
          suggestedAction: 'Use a valid model name like gpt-4, gpt-3.5-turbo, or dall-e-3',
          retryRecommended: false,
          errorCode: 'OPENAI_MODEL_NOT_FOUND',
          documentationUrl: 'https://platform.openai.com/docs/models',
        }),
        0.9
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_content_policy_violation',
        'Content Policy Violation',
        /(?:content.*policy|safety.*system|violates.*policy|inappropriate.*content)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Your request was rejected due to OpenAI content policy.',
          severity: 'error' as const,
          category: 'validation' as const,
          suggestedAction: 'Modify your prompt to comply with OpenAI usage policies',
          retryRecommended: false,
          errorCode: 'OPENAI_CONTENT_POLICY_VIOLATION',
          documentationUrl: 'https://platform.openai.com/docs/usage-policies',
        }),
        0.95
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_prompt_too_long',
        'Prompt Too Long',
        /(?:prompt.*too long|exceeds.*(?:token|character).*limit|maximum.*length.*exceeded)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Your prompt exceeds the maximum length limit for this model.',
          severity: 'error' as const,
          category: 'validation' as const,
          suggestedAction: 'Shorten your prompt or use a model with higher token limits',
          retryRecommended: false,
          errorCode: 'OPENAI_PROMPT_TOO_LONG',
        }),
        0.9
      )
    );

    // Image generation specific patterns
    this.registerPattern(
      createCustomPattern(
        'openai_no_images_in_response',
        'No Images Found in Response',
        /(?:completed but no images found|no images found in output|response.*no.*images|output.*no.*images)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage:
            'OpenAI job completed but no images were generated. This usually indicates your request was rejected by content policy or an internal processing error.',
          severity: 'error' as const,
          category: 'service' as const,
          suggestedAction:
            'Try modifying your prompt to comply with OpenAI policies, or try again with a different request',
          retryRecommended: false,
          errorCode: 'OPENAI_NO_IMAGES_IN_RESPONSE',
          documentationUrl: 'https://platform.openai.com/docs/usage-policies',
          technicalDetails: {
            stopProcessing: true,
            contentPolicyLikely: true,
          },
        }),
        0.95
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_image_generation_failed',
        'Image Generation Failed',
        /(?:image.*generation.*failed|failed to generate|no.*images.*generated)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI failed to generate an image for your request.',
          severity: 'error' as const,
          category: 'service' as const,
          suggestedAction: 'Try modifying your prompt or try again in a few moments',
          retryRecommended: true,
          errorCode: 'OPENAI_IMAGE_GENERATION_FAILED',
        }),
        0.85
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_dalle_busy',
        'DALL-E Busy',
        /(?:dalle.*(?:busy|overloaded)|service.*(?:busy|unavailable)|try.*again.*later)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'DALL-E service is currently busy. Please try again shortly.',
          severity: 'warning' as const,
          category: 'service' as const,
          suggestedAction: 'Wait a few minutes and try your request again',
          retryRecommended: true,
          errorCode: 'OPENAI_DALLE_BUSY',
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: context?.progressPercent || 0,
            estimatedTimeRemaining: 120000, // 2 minutes
          },
        }),
        0.8
      )
    );

    // Progress and status patterns
    this.registerPattern(
      createCustomPattern(
        'openai_job_queued',
        'Job Queued',
        /(?:job.*queued|request.*queued|in.*queue)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Your OpenAI request has been queued for processing.',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 10,
          },
        }),
        0.7
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_job_in_progress',
        'Job In Progress',
        /(?:job.*(?:in progress|processing)|generating|creating)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI is processing your request...',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: Math.max(context?.progressPercent || 0, 30),
          },
        }),
        0.7
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_job_completed',
        'Job Completed',
        /(?:job.*(?:completed|finished|done)|generation.*(?:complete|successful))/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI request completed successfully.',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 90,
          },
        }),
        0.8
      )
    );

    // Polling and background job patterns
    this.registerPattern(
      createCustomPattern(
        'openai_polling_start',
        'Polling Started',
        /(?:starting.*poll|polling.*for.*completion|background.*job.*created)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Started monitoring OpenAI job progress...',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 15,
          },
        }),
        0.6
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_polling_timeout',
        'Polling Timeout',
        /(?:polling.*timeout|job.*timeout|background.*job.*timeout)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI job monitoring timed out. The job may still be processing.',
          severity: 'warning' as const,
          category: 'service' as const,
          suggestedAction: 'Check your request status or try again',
          retryRecommended: true,
          errorCode: 'OPENAI_POLLING_TIMEOUT',
        }),
        0.85
      )
    );

    // API response and connection issues
    this.registerPattern(
      createCustomPattern(
        'openai_server_error',
        'Server Error',
        /(?:server.*error|internal.*error|503|502|500|openai.*error)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'OpenAI servers encountered an internal error.',
          severity: 'error' as const,
          category: 'service' as const,
          suggestedAction: 'Try your request again in a few minutes',
          retryRecommended: true,
          errorCode: 'OPENAI_SERVER_ERROR',
        }),
        0.8
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_timeout',
        'Request Timeout',
        /(?:request.*timeout|openai.*timeout|connection.*timeout)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Request to OpenAI timed out.',
          severity: 'warning' as const,
          category: 'service' as const,
          suggestedAction: 'Check your internet connection and try again',
          retryRecommended: true,
          errorCode: 'OPENAI_REQUEST_TIMEOUT',
        }),
        0.8
      )
    );

    // Success patterns
    this.registerPattern(
      createCustomPattern(
        'openai_image_extracted',
        'Image Extracted',
        /(?:extracted.*image|image.*(?:found|received)|generated.*image)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Successfully generated and extracted image from OpenAI.',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 85,
          },
        }),
        0.8
      )
    );

    this.registerPattern(
      createCustomPattern(
        'openai_asset_saved',
        'Asset Saved',
        /(?:asset.*saved|image.*saved|file.*saved|upload.*success)/i,
        (match: RegExpMatchArray | string, context?: LogContext) => ({
          userMessage: 'Generated content saved successfully.',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 100,
          },
        }),
        0.8
      )
    );
  }

  /**
   * OpenAI-specific method to interpret API response status
   */
  async interpretAPIResponse(
    response: any,
    context?: LogContext
  ): Promise<InterpretedMessage | null> {
    try {
      // Handle HTTP status codes
      if (response.status) {
        return this.interpretStatusCode(response.status, response.statusText, context);
      }

      // Handle OpenAI API response structure
      if (response.error) {
        return this.interpretAPIError(response.error, context);
      }

      // Handle successful response with data
      if (response.data || response.choices || response.images) {
        return {
          userMessage: 'OpenAI API request completed successfully.',
          severity: 'info' as const,
          category: 'progress' as const,
          originalMessage: JSON.stringify(response),
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: 90,
          },
          technicalDetails: {
            responseType: 'success',
            hasData: !!response.data,
            hasChoices: !!response.choices,
            hasImages: !!response.images,
          },
        };
      }

      return null;
    } catch (error) {
      console.warn('Failed to interpret OpenAI API response:', error);
      return null;
    }
  }

  /**
   * Interpret HTTP status codes from OpenAI API
   */
  private interpretStatusCode(
    status: number,
    statusText?: string,
    context?: LogContext
  ): InterpretedMessage {
    switch (status) {
      case 401:
        return {
          userMessage: 'OpenAI API authentication failed.',
          severity: 'error' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_UNAUTHORIZED',
          suggestedAction: 'Check your API key and permissions',
          originalMessage: `HTTP ${status}: ${statusText || 'Unauthorized'}`,
        };

      case 429:
        return {
          userMessage: 'OpenAI API rate limit exceeded.',
          severity: 'warning' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_RATE_LIMITED',
          suggestedAction: 'Wait before retrying your request',
          retryRecommended: true,
          originalMessage: `HTTP ${status}: ${statusText || 'Too Many Requests'}`,
        };

      case 400:
        return {
          userMessage: 'Invalid request sent to OpenAI API.',
          severity: 'error' as const,
          category: 'validation' as const,
          errorCode: 'OPENAI_BAD_REQUEST',
          suggestedAction: 'Check your request parameters',
          originalMessage: `HTTP ${status}: ${statusText || 'Bad Request'}`,
        };

      case 500:
      case 502:
      case 503:
        return {
          userMessage: 'OpenAI servers are experiencing issues.',
          severity: 'error' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_SERVER_ERROR',
          suggestedAction: 'Try again in a few minutes',
          retryRecommended: true,
          originalMessage: `HTTP ${status}: ${statusText || 'Server Error'}`,
        };

      default:
        return {
          userMessage: `OpenAI API returned status ${status}.`,
          severity: status >= 400 ? ('error' as const) : ('info' as const),
          category: 'service' as const,
          originalMessage: `HTTP ${status}: ${statusText || 'Unknown'}`,
          technicalDetails: { httpStatus: status, httpStatusText: statusText },
        };
    }
  }

  /**
   * Interpret OpenAI API error objects
   */
  private interpretAPIError(error: any, context?: LogContext): InterpretedMessage {
    const errorMessage = error.message || error.error || 'Unknown OpenAI API error';
    const errorType = error.type || error.code || 'unknown_error';

    switch (errorType) {
      case 'invalid_request_error':
        return {
          userMessage: 'Invalid request parameters sent to OpenAI.',
          severity: 'error' as const,
          category: 'validation' as const,
          errorCode: 'OPENAI_INVALID_REQUEST',
          suggestedAction: 'Review and correct your request parameters',
          originalMessage: errorMessage,
          technicalDetails: { errorType, apiError: error },
        };

      case 'rate_limit_exceeded':
        return {
          userMessage: 'OpenAI API rate limit exceeded.',
          severity: 'warning' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_RATE_LIMITED',
          suggestedAction: 'Wait before retrying your request',
          retryRecommended: true,
          originalMessage: errorMessage,
          technicalDetails: { errorType, apiError: error },
        };

      case 'insufficient_quota':
        return {
          userMessage: 'OpenAI API quota exceeded.',
          severity: 'error' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_QUOTA_EXCEEDED',
          suggestedAction: 'Add billing credits to your OpenAI account',
          originalMessage: errorMessage,
          technicalDetails: { errorType, apiError: error },
        };

      default:
        return {
          userMessage: 'OpenAI API encountered an error.',
          severity: 'error' as const,
          category: 'service' as const,
          errorCode: 'OPENAI_API_ERROR',
          suggestedAction: 'Try your request again or contact support',
          originalMessage: errorMessage,
          technicalDetails: { errorType, apiError: error },
        };
    }
  }

  /**
   * Extract job ID from OpenAI logs for tracking
   */
  extractJobId(logMessage: string): string | null {
    // Look for OpenAI job ID patterns
    const jobIdMatch = logMessage.match(/(?:job|request).*id[:\s]+([a-zA-Z0-9_-]+)/i);
    if (jobIdMatch) {
      return jobIdMatch[1];
    }

    // Look for response ID patterns
    const responseIdMatch = logMessage.match(/response.*id[:\s]+([a-zA-Z0-9_-]+)/i);
    if (responseIdMatch) {
      return responseIdMatch[1];
    }

    return null;
  }
}
