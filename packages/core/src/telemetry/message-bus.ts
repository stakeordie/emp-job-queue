// Universal Message Bus - Operational message interpreter for all connector types
// Routes operational messages through intelligent pattern matching to trigger workflows

import { logger as baseLogger } from '../utils/logger.js';
import winston from 'winston';
import { FluentBitTransport } from './fluent-bit-transport-fixed.js';
import { sendTrace, startSpan } from './otel-client.js';

export interface ConnectorLogContext {
  machineId: string;
  workerId: string;
  serviceType: string;
  connectorId: string;
  jobId?: string;
  sessionId?: string;
}

export interface JobLogData {
  jobId: string;
  status?: 'received' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
  duration?: number;
  inputSize?: number;
  outputSize?: number;
  model?: string;
  [key: string]: any;
}

export interface MessagePattern {
  type: 'status_change' | 'completion' | 'failure' | 'validation_issue' | 'resource_event' | 'progress_update' | 'unknown';
  confidence: number; // 0.0 to 1.0
  extractedData: any;
}

export class MessageBus {
  private logger: winston.Logger;
  private context: ConnectorLogContext;
  private fluentBitTransport?: FluentBitTransport;

  constructor(context: ConnectorLogContext, enableFluentBit: boolean = true) {
    this.context = context;

    // Create a child logger with connector-specific defaults
    this.logger = baseLogger.child({
      machine_id: context.machineId,
      worker_id: context.workerId,
      service_type: context.serviceType,
      connector_id: context.connectorId,
      component: 'connector',
    });

    // Add Fluent Bit transport if enabled
    if (enableFluentBit && !process.env.DISABLE_FLUENT_BIT_LOGGING) {
      this.setupFluentBitTransport();
    }
  }

  private setupFluentBitTransport(): void {
    try {
      this.fluentBitTransport = new FluentBitTransport({
        machineId: this.context.machineId,
        workerId: this.context.workerId,
        serviceType: this.context.serviceType,
        connectorId: this.context.connectorId,
      });

      this.logger.add(this.fluentBitTransport);

      // Handle transport errors gracefully
      this.fluentBitTransport.on('error', error => {
        baseLogger.warn('Fluent Bit transport error', { error: error.message });
      });
    } catch (error) {
      baseLogger.warn('Failed to setup Fluent Bit transport', {
        error: error.message,
        connector_id: this.context.connectorId,
      });
    }
  }


  // Standard logging methods
  info(message: string, meta?: any): void {
    this.logger.info(message, { ...meta, ...this.getLogMeta() });
  }

  warn(message: string, meta?: any): void {
    this.logger.warn(message, { ...meta, ...this.getLogMeta() });
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta =
      error instanceof Error ? { error: error.message, stack: error.stack } : { error };

    this.logger.error(message, { ...errorMeta, ...meta, ...this.getLogMeta() });
  }

  debug(message: string, meta?: any): void {
    this.logger.debug(message, { ...meta, ...this.getLogMeta() });
  }

  // Specialized logging methods for common connector events

  jobReceived(jobData: JobLogData): void {
    this.info('Job received', {
      event_type: 'job_received',
      job_id: jobData.jobId,
      job_status: 'received',
      model: jobData.model,
      input_size: jobData.inputSize,
      ...this.normalizeJobData(jobData),
    });
  }

  jobStarted(jobData: JobLogData): void {
    this.info('Job processing started', {
      event_type: 'job_started',
      job_id: jobData.jobId,
      job_status: 'processing',
      model: jobData.model,
      ...this.normalizeJobData(jobData),
    });
  }

  jobProgress(jobData: JobLogData): void {
    this.info('Job progress update', {
      event_type: 'job_progress',
      job_id: jobData.jobId,
      job_status: 'processing',
      progress: jobData.progress,
      ...this.normalizeJobData(jobData),
    });
  }

  jobCompleted(jobData: JobLogData): void {
    this.info('Job completed successfully', {
      event_type: 'job_completed',
      job_id: jobData.jobId,
      job_status: 'completed',
      duration: jobData.duration,
      output_size: jobData.outputSize,
      ...this.normalizeJobData(jobData),
    });
  }

  jobFailed(jobData: JobLogData & { error: string }): void {
    this.error('Job failed', jobData.error, {
      event_type: 'job_failed',
      job_id: jobData.jobId,
      job_status: 'failed',
      duration: jobData.duration,
      error_type: this.classifyError(jobData.error),
      ...this.normalizeJobData(jobData),
    });
  }

  healthCheck(status: 'healthy' | 'unhealthy', details?: any): void {
    const level = status === 'healthy' ? 'info' : 'warn';
    this.logger.log(level, `Health check: ${status}`, {
      event_type: 'health_check',
      health_status: status,
      health_details: details,
      ...this.getLogMeta(),
    });
  }

  serviceEvent(eventType: string, message: string, meta?: any): void {
    this.info(message, {
      event_type: `service_${eventType}`,
      ...meta,
    });
  }

  // Universal Message Interpreter - Routes operational messages from ANY connector
  async interpretMessage(
    message: string,
    source: string, // e.g., 'openai_polling', 'comfyui_processing', 'simulation_execute'
    level: 'debug' | 'info' | 'warn' | 'error' = 'info',
    context: any = {}
  ): Promise<MessagePattern> {
    const startTime = Date.now();
    
    // Collect events and attributes for the span
    const events: Array<{ name: string; attributes?: Record<string, any> }> = [];
    const spanAttributes: Record<string, any> = {
      'message.source': source,
      'message.level': level,
      'message.length': message.length,
      'context.machine_id': this.context.machineId,
      'context.worker_id': this.context.workerId,
      'context.service_type': this.context.serviceType,
      'context.connector_id': this.context.connectorId,
    };

    try {
      // Record message input as span event
      events.push({
        name: 'message.received',
        attributes: {
          'message.text': message,
          'message.source': source,
          'message.level': level,
          'context.keys': Object.keys(context).join(','),
        }
      });

      // Identify universal message pattern
      const pattern = this.identifyMessagePattern(message);
      
      // Record pattern matching result
      events.push({
        name: 'pattern.identified',
        attributes: {
          'pattern.type': pattern.type,
          'pattern.confidence': pattern.confidence,
          'pattern.data': JSON.stringify(pattern.extractedData),
        }
      });

      // Update span attributes with pattern info
      spanAttributes['pattern.type'] = pattern.type;
      spanAttributes['pattern.confidence'] = pattern.confidence;
      
      // Extract workflow triggers based on pattern and source
      const workflowTriggers = this.extractWorkflowTriggers(pattern, source);
      
      // Record workflow triggers as span event
      events.push({
        name: 'workflow.triggers_extracted',
        attributes: {
          'workflow.triggers': workflowTriggers.join(','),
          'workflow.count': workflowTriggers.length,
          'workflow.confidence_threshold': pattern.confidence > 0.7 ? 'met' : 'not_met',
        }
      });

      // Update span with workflow info
      spanAttributes['workflow.triggers_count'] = workflowTriggers.length;
      spanAttributes['workflow.will_trigger'] = pattern.confidence > 0.7;
      
      // Send trace to collector and get IDs
      const { traceId, spanId } = await sendTrace('message-bus.interpret', spanAttributes, {
        duration_ms: Date.now() - startTime,
        events,
        status: 'ok'
      });
      
      // Create operational context with universal structure
      const operationalContext = {
        event_type: 'operational_message',
        message_source: source,
        message_pattern: pattern.type,
        message_level: level,
        workflow_triggers: workflowTriggers,
        suggested_actions: this.getSuggestedActions(pattern),
        pattern_confidence: pattern.confidence,
        trace_id: traceId,
        span_id: spanId,
        ...context,
        ...this.getLogMeta(),
      };

      // Record operational context creation
      events.push({
        name: 'operational_context.created',
        attributes: {
          'context.workflow_triggers': workflowTriggers.join(','),
          'context.suggested_actions': this.getSuggestedActions(pattern).join(','),
          'context.trace_id': traceId,
        }
      });

      // Route through standard logging with operational enhancement
      this.logger.log(level, message, operationalContext);
      
      // Record logging completion
      events.push({
        name: 'message.logged',
        attributes: {
          'log.level': level,
          'log.enriched_context_keys': Object.keys(operationalContext).length.toString(),
        }
      });

      // Trigger operational workflows if high confidence pattern match
      if (pattern.confidence > 0.7) {
        events.push({
          name: 'workflow.routing_started',
          attributes: {
            'workflow.triggers': workflowTriggers.join(','),
            'workflow.confidence': pattern.confidence,
          }
        });
        
        await this.routeToWorkflows(workflowTriggers, operationalContext);
        
        events.push({
          name: 'workflow.routing_completed',
          attributes: {
            'workflow.success': 'true',
          }
        });
        
        spanAttributes['workflow.routed'] = true;
        spanAttributes['workflow.triggers_executed'] = workflowTriggers.length;
      } else {
        events.push({
          name: 'workflow.routing_skipped',
          attributes: {
            'workflow.reason': 'low_confidence',
            'workflow.confidence': pattern.confidence,
            'workflow.threshold': 0.7,
          }
        });
        
        spanAttributes['workflow.routed'] = false;
        spanAttributes['workflow.skip_reason'] = 'low_confidence';
      }

      // Return the pattern for connector decision making
      return pattern;
      
    } catch (error) {
      // Record error event
      events.push({
        name: 'message.processing_failed',
        attributes: {
          'error.name': error.name,
          'error.message': error.message,
        }
      });
      
      // Send error trace to collector
      await sendTrace('message-bus.interpret', spanAttributes, {
        duration_ms: Date.now() - startTime,
        events,
        status: 'error'
      });
      
      // Still log the error through normal channels
      this.logger.error('MessageBus processing failed', {
        message,
        source,
        level,
        error: error.message,
        ...this.getLogMeta(),
      });
      
      // Return error pattern even on processing failure
      const errorPattern: MessagePattern = {
        type: 'unknown',
        confidence: 0.1,
        extractedData: { processing_error: error.message }
      };
      
      throw error;
    }
  }

  // Universal pattern matching - works for any connector
  private identifyMessagePattern(message: string): MessagePattern {
    const lowerMessage = message.toLowerCase();
    
    // Status change patterns
    if (lowerMessage.includes('status changed to:') || lowerMessage.includes('status:')) {
      const statusMatch = message.match(/status.+?(?:changed to:?\s*|:\s*)([a-zA-Z_]+)/i);
      return {
        type: 'status_change',
        confidence: statusMatch ? 0.9 : 0.7,
        extractedData: { status: statusMatch?.[1] || 'unknown' }
      };
    }

    // Completion patterns  
    if (lowerMessage.includes('completed') || lowerMessage.includes('finished') || lowerMessage.includes('done') || 
        lowerMessage.includes('extracted') || lowerMessage.includes('successfully')) {
      const durationMatch = message.match(/(\d+(?:\.\d+)?)\s*(ms|seconds?|minutes?)/i);
      return {
        type: 'completion',
        confidence: 0.8,
        extractedData: { 
          duration: durationMatch ? parseFloat(durationMatch[1]) : null,
          unit: durationMatch?.[2] || null
        }
      };
    }

    // Failure patterns
    if (lowerMessage.includes('failed') || lowerMessage.includes('error') || lowerMessage.includes('timeout') || 
        lowerMessage.includes('cancelled') || lowerMessage.includes('no image was generated') || 
        lowerMessage.includes('❌')) {
      const errorTypeMatch = message.match(/(timeout|memory|network|validation|connection|model|generation)/i);
      let errorType = errorTypeMatch?.[1] || 'unknown';
      
      // Specific error type for image generation failures
      if (lowerMessage.includes('no image was generated') || lowerMessage.includes('generated text instead')) {
        errorType = 'generation_output_mismatch';
      }
      
      return {
        type: 'failure',
        confidence: 0.85,
        extractedData: { 
          error_type: errorType,
          recoverable: this.isRecoverableError(lowerMessage),
          should_terminate: lowerMessage.includes('no image was generated') // This should end the job
        }
      };
    }

    // Validation issue patterns
    if (lowerMessage.includes('no ') || lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('missing')) {
      return {
        type: 'validation_issue',
        confidence: 0.75,
        extractedData: { validation_type: 'output_validation' }
      };
    }

    // Resource event patterns
    if (lowerMessage.includes('started') || lowerMessage.includes('stopped') || lowerMessage.includes('resource') || lowerMessage.includes('memory') || lowerMessage.includes('cpu')) {
      return {
        type: 'resource_event',
        confidence: 0.6,
        extractedData: { event_type: 'resource_change' }
      };
    }

    // Progress patterns
    if (lowerMessage.includes('progress') || lowerMessage.includes('polling') || lowerMessage.includes('waiting')) {
      const progressMatch = message.match(/(\d+)%|poll\s*(\d+)|attempt\s*(\d+)/i);
      return {
        type: 'progress_update',
        confidence: 0.7,
        extractedData: { 
          progress: progressMatch ? parseInt(progressMatch[1] || progressMatch[2] || progressMatch[3]) : null
        }
      };
    }

    // Unknown pattern
    return {
      type: 'unknown',
      confidence: 0.1,
      extractedData: {}
    };
  }

  // Extract workflow triggers based on pattern and source
  private extractWorkflowTriggers(pattern: MessagePattern, source: string): string[] {
    const triggers: string[] = [];
    
    switch (pattern.type) {
      case 'status_change':
        triggers.push('update_status', 'notify_status_change');
        if (pattern.extractedData.status === 'completed') {
          triggers.push('process_completion');
        }
        break;

      case 'completion':
        triggers.push('process_completion', 'update_job_status', 'notify_completion');
        break;

      case 'failure':
        triggers.push('handle_failure', 'log_error');
        if (pattern.extractedData.recoverable) {
          triggers.push('attempt_recovery', 'retry_operation');
        } else {
          triggers.push('mark_failed', 'notify_failure');
        }
        break;

      case 'validation_issue':
        triggers.push('validate_input', 'check_requirements', 'notify_validation_issue');
        break;

      case 'resource_event':
        triggers.push('monitor_resources', 'update_capacity');
        break;

      case 'progress_update':
        triggers.push('update_progress', 'monitor_operation');
        break;
    }

    // Add source-specific triggers
    if (source.includes('openai')) {
      triggers.push('openai_workflow');
    } else if (source.includes('comfyui')) {
      triggers.push('comfyui_workflow');
    } else if (source.includes('simulation')) {
      triggers.push('simulation_workflow');
    }

    return triggers;
  }

  // Get suggested actions based on pattern
  private getSuggestedActions(pattern: MessagePattern): string[] {
    switch (pattern.type) {
      case 'status_change':
        return ['monitor_transition', 'update_dashboard'];
      case 'completion':
        return ['archive_job', 'cleanup_resources', 'process_results'];
      case 'failure':
        return pattern.extractedData.recoverable 
          ? ['retry_with_backoff', 'check_dependencies', 'validate_inputs']
          : ['mark_permanent_failure', 'alert_operators', 'cleanup_resources'];
      case 'validation_issue':
        return ['validate_requirements', 'check_inputs', 'provide_feedback'];
      case 'resource_event':
        return ['check_resource_limits', 'scale_if_needed', 'optimize_allocation'];
      case 'progress_update':
        return ['update_ui', 'check_timeout', 'monitor_performance'];
      default:
        return ['log_for_analysis'];
    }
  }

  // Route to operational workflows (placeholder for future workflow integration)
  private async routeToWorkflows(triggers: string[], context: any): Promise<void> {
    const startTime = Date.now();
    
    // Collect events for the workflow span
    const events: Array<{ name: string; attributes?: Record<string, any> }> = [];
    const attributes = {
      'workflow.triggers_count': triggers.length,
      'workflow.triggers': triggers.join(','),
      'workflow.context_keys': Object.keys(context).join(','),
    };

    try {
      // Record each trigger as a span event
      triggers.forEach((trigger, index) => {
        events.push({
          name: 'workflow.trigger',
          attributes: {
            'trigger.name': trigger,
            'trigger.index': index.toString(),
            'trigger.source': context.message_source || 'unknown',
          }
        });
      });

      // Send workflow span to collector
      const { traceId } = await sendTrace('message-bus.route_workflows', attributes, {
        duration_ms: Date.now() - startTime,
        events,
        status: 'ok',
        parent_trace_id: context.trace_id
      });

      // This is where we would integrate with workflow systems
      // For now, just enhance the logging with workflow context
      this.debug('Operational workflows triggered', {
        event_type: 'workflow_routing',
        triggered_workflows: triggers,
        workflow_context: context,
        trace_id: traceId,
        parent_trace_id: context.trace_id,
      });

      // Future: Route to workflow orchestration system
      // await this.workflowOrchestrator.trigger(triggers, context);
      
    } catch (error) {
      // Send error trace
      await sendTrace('message-bus.route_workflows', attributes, {
        duration_ms: Date.now() - startTime,
        events: [...events, {
          name: 'workflow.routing_failed',
          attributes: {
            'error.name': error.name,
            'error.message': error.message,
          }
        }],
        status: 'error',
        parent_trace_id: context.trace_id
      });
      
      throw error;
    }
  }

  // Helper method to determine if an error is recoverable
  private isRecoverableError(message: string): boolean {
    const recoverablePatterns = ['timeout', 'network', 'connection', 'temporary', 'retry'];
    const nonRecoverablePatterns = ['validation', 'invalid', 'missing', 'permission', 'authentication'];
    
    const hasRecoverable = recoverablePatterns.some(pattern => message.includes(pattern));
    const hasNonRecoverable = nonRecoverablePatterns.some(pattern => message.includes(pattern));
    
    return hasRecoverable && !hasNonRecoverable;
  }

  // Update context (useful for job-specific logging)
  withJobContext(jobId: string, sessionId?: string): MessageBus {
    const newContext = { ...this.context, jobId, sessionId };
    return new MessageBus(newContext, !!this.fluentBitTransport);
  }

  private getLogMeta(): any {
    return {
      timestamp: new Date().toISOString(),
      job_id: this.context.jobId,
      session_id: this.context.sessionId,
    };
  }

  private normalizeJobData(jobData: JobLogData): any {
    // Remove undefined values and normalize field names
    const normalized: any = {};

    Object.entries(jobData).forEach(([key, value]) => {
      if (value !== undefined) {
        normalized[key] = value;
      }
    });

    return normalized;
  }

  private classifyError(error: string): string {
    // Basic error classification for analytics
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('memory') || error.includes('OOM')) return 'memory';
    if (error.includes('connection') || error.includes('network')) return 'network';
    if (error.includes('model') || error.includes('load')) return 'model';
    if (error.includes('validation') || error.includes('invalid')) return 'validation';
    return 'unknown';
  }
}

// Backward compatibility export - ConnectorLogger is now MessageBus
export const ConnectorLogger = MessageBus;
export type ConnectorLogger = MessageBus;
