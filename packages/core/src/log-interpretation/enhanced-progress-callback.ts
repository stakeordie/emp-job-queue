// Enhanced Progress Callback - Integrates log interpretation with Redis progress updates
// Provides intelligent progress updates with user-friendly messages and actionable feedback

import { JobProgress, ProgressCallback } from '../types/connector.js';
import { BaseLogInterpreter, LogEntry, InterpretedMessage, LogContext } from './base-log-interpreter.js';
import { ComfyUILogInterpreter } from './comfyui-log-interpreter.js';
import { OpenAILogInterpreter } from './openai-log-interpreter.js';

/**
 * Enhanced progress data with intelligent interpretation
 */
export interface EnhancedJobProgress extends JobProgress {
  // Original progress fields preserved
  job_id: string;
  progress: number;
  message?: string;
  current_step?: string;
  total_steps?: number;
  estimated_completion_ms?: number;
  metadata?: Record<string, unknown>;

  // Enhanced fields
  interpreted_message?: InterpretedMessage;
  user_friendly_message?: string;
  severity?: 'info' | 'warning' | 'error' | 'critical';
  suggested_action?: string;
  retry_recommended?: boolean;
  error_code?: string;
  category?: 'progress' | 'resource' | 'validation' | 'service' | 'system';
  documentation_url?: string;
}

/**
 * Enhanced progress callback type
 */
export type EnhancedProgressCallback = (progress: EnhancedJobProgress) => Promise<void>;

/**
 * Factory for creating log interpreters by service type
 */
class LogInterpreterFactory {
  private static interpreters: Map<string, BaseLogInterpreter> = new Map();

  static getInterpreter(serviceType: string): BaseLogInterpreter | null {
    if (this.interpreters.has(serviceType)) {
      return this.interpreters.get(serviceType)!;
    }

    let interpreter: BaseLogInterpreter | null = null;

    switch (serviceType.toLowerCase()) {
      case 'comfyui':
        interpreter = new ComfyUILogInterpreter();
        break;
      case 'openai':
      case 'openai-image':
      case 'openai-img2img':
      case 'openai-text':
        interpreter = new OpenAILogInterpreter();
        break;
      default:
        // For unknown service types, return null - will use fallback behavior
        return null;
    }

    if (interpreter) {
      this.interpreters.set(serviceType, interpreter);
    }

    return interpreter;
  }

  static clearCache(): void {
    this.interpreters.clear();
  }
}

/**
 * Enhanced progress reporter that includes intelligent log interpretation
 */
export class EnhancedProgressReporter {
  private interpreter: BaseLogInterpreter | null;
  private originalCallback: ProgressCallback;
  private context: LogContext;
  private lastProgress: number = 0;
  private messageHistory: InterpretedMessage[] = [];

  constructor(
    serviceType: string,
    connectorId: string,
    originalCallback: ProgressCallback,
    jobId: string
  ) {
    this.interpreter = LogInterpreterFactory.getInterpreter(serviceType);
    this.originalCallback = originalCallback;
    this.context = {
      jobId,
      serviceType,
      connectorId,
      progressPercent: 0
    };
  }

  /**
   * Create an enhanced progress callback that includes log interpretation
   */
  createEnhancedCallback(): EnhancedProgressCallback {
    return async (progress: EnhancedJobProgress) => {
      try {
        // Update context with current progress
        this.context.progressPercent = progress.progress;
        this.context.currentStep = progress.current_step;
        this.context.metadata = progress.metadata;

        // If progress already has interpreted message, use it
        if (progress.interpreted_message) {
          await this.sendEnhancedProgress(progress);
          return;
        }

        // If we have a regular message, try to interpret it
        if (progress.message && this.interpreter) {
          const logEntry: LogEntry = {
            timestamp: new Date(),
            level: progress.severity === 'error' ? 'error' : 
                   progress.severity === 'warning' ? 'warn' : 'info',
            message: progress.message,
            source: this.context.connectorId
          };

          const interpretation = await this.interpreter.interpretLog(logEntry, this.context);
          if (interpretation) {
            progress.interpreted_message = interpretation;
            progress.user_friendly_message = interpretation.userMessage;
            progress.severity = interpretation.severity;
            progress.suggested_action = interpretation.suggestedAction;
            progress.retry_recommended = interpretation.retryRecommended;
            progress.error_code = interpretation.errorCode;
            progress.category = interpretation.category;
            progress.documentation_url = interpretation.documentationUrl;

            // Update progress if interpretation suggests it
            if (interpretation.progressImpact?.shouldUpdateProgress && 
                interpretation.progressImpact.newProgressPercent !== undefined) {
              progress.progress = Math.max(progress.progress, interpretation.progressImpact.newProgressPercent);
            }

            // Store in history for context
            this.messageHistory.push(interpretation);
            
            // Keep only last 10 messages
            if (this.messageHistory.length > 10) {
              this.messageHistory = this.messageHistory.slice(-10);
            }
          }
        }

        await this.sendEnhancedProgress(progress);
      } catch (error) {
        console.warn('Failed to enhance progress:', error);
        // Fall back to original progress callback
        await this.originalCallback(progress);
      }
    };
  }

  /**
   * Send enhanced progress to the original callback
   */
  private async sendEnhancedProgress(progress: EnhancedJobProgress): Promise<void> {
    // Ensure progress only increases (unless it's an error)
    if (progress.severity !== 'error' && progress.severity !== 'critical') {
      progress.progress = Math.max(this.lastProgress, progress.progress);
      this.lastProgress = progress.progress;
    }

    // Add enhanced metadata
    const enhancedMetadata = {
      ...progress.metadata,
      intelligent_interpretation_enabled: !!this.interpreter,
      service_type: this.context.serviceType,
      connector_id: this.context.connectorId,
      has_interpreted_message: !!progress.interpreted_message,
      message_history_count: this.messageHistory.length
    };

    // Create the final progress object
    const finalProgress: JobProgress = {
      job_id: progress.job_id,
      progress: progress.progress,
      message: progress.user_friendly_message || progress.message,
      current_step: progress.current_step,
      total_steps: progress.total_steps,
      estimated_completion_ms: progress.estimated_completion_ms,
      metadata: enhancedMetadata
    };

    // Send to original callback
    await this.originalCallback(finalProgress);
  }

  /**
   * Interpret a log message and send as progress update
   */
  async interpretAndReportLog(
    message: string, 
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
    source?: string
  ): Promise<void> {
    if (!this.interpreter) {
      return;
    }

    try {
      const logEntry: LogEntry = {
        timestamp: new Date(),
        level,
        message,
        source: source || this.context.connectorId
      };

      const interpretation = await this.interpreter.interpretLog(logEntry, this.context);
      if (interpretation) {
        const progress: EnhancedJobProgress = {
          job_id: this.context.jobId!,
          progress: this.context.progressPercent || 0,
          interpreted_message: interpretation,
          user_friendly_message: interpretation.userMessage,
          severity: interpretation.severity,
          suggested_action: interpretation.suggestedAction,
          retry_recommended: interpretation.retryRecommended,
          error_code: interpretation.errorCode,
          category: interpretation.category,
          documentation_url: interpretation.documentationUrl,
          current_step: interpretation.category,
          metadata: {
            log_level: level,
            original_message: message,
            interpretation_confidence: interpretation.technicalDetails?.confidence || 0.5
          }
        };

        // Apply progress impact if suggested
        if (interpretation.progressImpact?.shouldUpdateProgress && 
            interpretation.progressImpact.newProgressPercent !== undefined) {
          progress.progress = interpretation.progressImpact.newProgressPercent;
        }

        await this.sendEnhancedProgress(progress);
      }
    } catch (error) {
      console.warn('Failed to interpret and report log:', error);
    }
  }

  /**
   * Get message history for context
   */
  getMessageHistory(): InterpretedMessage[] {
    return [...this.messageHistory];
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.messageHistory = [];
  }

  /**
   * Check if interpreter is available for this service
   */
  hasInterpreter(): boolean {
    return this.interpreter !== null;
  }

  /**
   * Get the service type being interpreted
   */
  getServiceType(): string {
    return this.context.serviceType;
  }
}

/**
 * Factory function to create enhanced progress callback
 */
export function createEnhancedProgressCallback(
  serviceType: string,
  connectorId: string,
  originalCallback: ProgressCallback,
  jobId: string
): EnhancedProgressCallback {
  const reporter = new EnhancedProgressReporter(serviceType, connectorId, originalCallback, jobId);
  return reporter.createEnhancedCallback();
}

/**
 * Factory function to create enhanced progress reporter
 */
export function createEnhancedProgressReporter(
  serviceType: string,
  connectorId: string,
  originalCallback: ProgressCallback,
  jobId: string
): EnhancedProgressReporter {
  return new EnhancedProgressReporter(serviceType, connectorId, originalCallback, jobId);
}

/**
 * Utility function to interpret logs without progress reporting
 */
export async function interpretLogMessage(
  serviceType: string,
  message: string,
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
  context?: Partial<LogContext>
): Promise<InterpretedMessage | null> {
  const interpreter = LogInterpreterFactory.getInterpreter(serviceType);
  if (!interpreter) {
    return null;
  }

  const logEntry: LogEntry = {
    timestamp: new Date(),
    level,
    message,
    source: context?.connectorId || 'unknown'
  };

  const fullContext: LogContext = {
    serviceType,
    connectorId: 'unknown',
    ...context
  };

  return interpreter.interpretLog(logEntry, fullContext);
}