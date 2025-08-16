// Connector Integration Example - How to use intelligent log interpretation in connectors
// This demonstrates how existing connectors can be enhanced with log interpretation

import { JobData, ProgressCallback } from '../types/connector.js';
import {
  createEnhancedProgressReporter,
  EnhancedProgressReporter,
  interpretLogMessage,
} from './enhanced-progress-callback.js';

/**
 * Example of how to enhance an existing connector with intelligent log interpretation
 * This can be mixed into any BaseConnector subclass
 */
export class IntelligentLogMixin {
  protected logReporter?: EnhancedProgressReporter;
  protected service_type: string = 'unknown';
  protected connector_id: string = 'unknown';

  /**
   * Initialize intelligent logging for a job
   * Call this at the start of processJobImpl
   */
  protected initializeIntelligentLogging(
    jobData: JobData,
    progressCallback: ProgressCallback
  ): void {
    this.logReporter = createEnhancedProgressReporter(
      this.service_type,
      this.connector_id,
      progressCallback,
      jobData.id
    );
  }

  /**
   * Get an enhanced progress callback that includes log interpretation
   * Use this instead of the original progressCallback
   */
  protected getEnhancedProgressCallback(): ProgressCallback | undefined {
    return this.logReporter?.createEnhancedCallback();
  }

  /**
   * Report a log message with intelligent interpretation
   * Use this for important log messages that should be translated for users
   */
  protected async reportIntelligentLog(
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info',
    source?: string
  ): Promise<void> {
    if (this.logReporter) {
      await this.logReporter.interpretAndReportLog(message, level, source);
    }
  }

  /**
   * Interpret a log message without reporting progress
   * Useful for analyzing error messages before deciding how to handle them
   */
  protected async interpretLog(
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal' = 'info'
  ) {
    return interpretLogMessage(this.service_type, message, level, {
      connectorId: this.connector_id,
      serviceType: this.service_type,
    });
  }

  /**
   * Clean up logging resources
   * Call this at the end of processJobImpl or in error handlers
   */
  protected cleanupIntelligentLogging(): void {
    if (this.logReporter) {
      this.logReporter.clearHistory();
      this.logReporter = undefined;
    }
  }
}

/**
 * Example of how a ComfyUI connector would use intelligent logging
 */
export class ExampleComfyUIConnectorWithIntelligentLogs extends IntelligentLogMixin {
  protected service_type = 'comfyui';
  protected connector_id = 'comfyui-example';

  async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<any> {
    // Initialize intelligent logging
    this.initializeIntelligentLogging(jobData, progressCallback);
    const enhancedCallback = this.getEnhancedProgressCallback();

    try {
      // Report initial progress with intelligent interpretation
      await this.reportIntelligentLog('Starting ComfyUI workflow execution', 'info');

      // Simulate some processing with various log messages
      await this.reportIntelligentLog('Loading required models', 'info');

      // Simulate a warning that would be interpreted
      await this.reportIntelligentLog('CUDA out of memory, falling back to CPU', 'warn');

      // Simulate progress with a standard callback
      if (enhancedCallback) {
        await enhancedCallback({
          job_id: jobData.id,
          progress: 50,
          message: 'Executing workflow nodes',
          current_step: 'processing',
        });
      }

      // Simulate an error that would be interpreted
      await this.reportIntelligentLog(
        'Node execution failed: Unknown node type "CustomNode"',
        'error'
      );

      return { success: true };
    } catch (error) {
      // Interpret the error before handling it
      const interpretation = await this.interpretLog(error.message, 'error');

      if (interpretation && enhancedCallback) {
        await enhancedCallback({
          job_id: jobData.id,
          progress: 0,
          message: interpretation.userMessage,
          current_step: 'error',
          metadata: {
            interpreted_message: interpretation,
            severity: interpretation.severity,
            suggested_action: interpretation.suggestedAction,
          },
        });
      }

      throw error;
    } finally {
      // Clean up
      this.cleanupIntelligentLogging();
    }
  }
}

/**
 * Example of how an OpenAI connector would use intelligent logging
 */
export class ExampleOpenAIConnectorWithIntelligentLogs extends IntelligentLogMixin {
  protected service_type = 'openai';
  protected connector_id = 'openai-example';

  async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<any> {
    this.initializeIntelligentLogging(jobData, progressCallback);
    const enhancedCallback = this.getEnhancedProgressCallback();

    try {
      await this.reportIntelligentLog('Creating OpenAI background request', 'info');

      // Simulate API response interpretation
      await this.reportIntelligentLog('OpenAI job queued for processing', 'info');

      if (enhancedCallback) {
        await enhancedCallback({
          job_id: jobData.id,
          progress: 30,
          message: 'Polling for job completion',
          current_step: 'waiting',
        });
      }

      // Simulate various OpenAI scenarios
      await this.reportIntelligentLog('Rate limit exceeded, retrying in 60 seconds', 'warn');
      await this.reportIntelligentLog('OpenAI job completed successfully', 'info');
      await this.reportIntelligentLog('Image extracted from response', 'info');

      return { success: true };
    } catch (error) {
      const interpretation = await this.interpretLog(error.message, 'error');

      if (interpretation && enhancedCallback) {
        await enhancedCallback({
          job_id: jobData.id,
          progress: 0,
          message: interpretation.userMessage,
          current_step: 'error',
          metadata: {
            interpreted_message: interpretation,
            severity: interpretation.severity,
            error_code: interpretation.errorCode,
            suggested_action: interpretation.suggestedAction,
            documentation_url: interpretation.documentationUrl,
          },
        });
      }

      throw error;
    } finally {
      this.cleanupIntelligentLogging();
    }
  }
}

/**
 * Utility function to enhance any existing progress callback
 */
export function enhanceExistingProgressCallback(
  originalCallback: ProgressCallback,
  serviceType: string,
  connectorId: string,
  jobId: string
): ProgressCallback {
  const reporter = createEnhancedProgressReporter(
    serviceType,
    connectorId,
    originalCallback,
    jobId
  );
  return reporter.createEnhancedCallback();
}

/**
 * Quick helper for standalone log interpretation
 */
export async function quickInterpretLog(
  serviceType: string,
  message: string,
  connectorId?: string
) {
  return interpretLogMessage(serviceType, message, 'info', {
    connectorId: connectorId || 'unknown',
    serviceType,
  });
}
