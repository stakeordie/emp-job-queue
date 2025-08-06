// ComfyUI Log Interpreter - Service-specific pattern matching for ComfyUI logs
// Handles ComfyUI WebSocket messages, execution errors, and node-specific issues

import { BaseLogInterpreter, LogPattern, InterpretedMessage, LogContext } from './base-log-interpreter.js';
import { getAllCommonPatterns, createCustomPattern } from './error-translation-library.js';

export class ComfyUILogInterpreter extends BaseLogInterpreter {
  constructor() {
    super('comfyui');
  }

  protected initializePatterns(): void {
    // Register common patterns first
    for (const pattern of getAllCommonPatterns()) {
      this.registerPattern(pattern);
    }

    // Register ComfyUI-specific patterns
    this.registerComfyUIPatterns();
  }

  private registerComfyUIPatterns(): void {
    // Workflow and node execution errors
    this.registerPattern(createCustomPattern(
      'comfyui_node_error',
      'Node Execution Error',
      /(?:Error occurred when executing|Node.*(?:failed|error)|Exception in node)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'A workflow node encountered an error during execution.',
        severity: 'error' as const,
        category: 'service' as const,
        suggestedAction: 'Check your workflow for invalid connections or missing inputs',
        retryRecommended: false,
        errorCode: 'COMFYUI_NODE_EXECUTION_ERROR',
        technicalDetails: {
          nodeError: true,
          rawMessage: typeof match === 'string' ? match : match[0]
        }
      }),
      0.9,
      'ComfyUI node execution failed'
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_missing_node',
      'Missing Node',
      /(?:Unknown node type|Node.*not found|Missing.*node|Cannot find node)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Your workflow contains a node type that is not installed on this machine.',
        severity: 'error' as const,
        category: 'validation' as const,
        suggestedAction: 'Install the required custom nodes or use a different workflow',
        retryRecommended: false,
        errorCode: 'COMFYUI_MISSING_NODE',
        documentationUrl: 'https://docs.comfy.org/essentials/custom_node_manager'
      }),
      0.95
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_invalid_workflow',
      'Invalid Workflow',
      /(?:Invalid workflow|Workflow.*(?:invalid|error)|Cannot parse workflow)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'The provided workflow format is invalid or corrupted.',
        severity: 'error' as const,
        category: 'validation' as const,
        suggestedAction: 'Verify your workflow file and ensure it was exported correctly from ComfyUI',
        retryRecommended: false,
        errorCode: 'COMFYUI_INVALID_WORKFLOW'
      }),
      0.9
    ));

    // Model loading and management
    this.registerPattern(createCustomPattern(
      'comfyui_checkpoint_missing',
      'Checkpoint Missing',
      /(?:Could not find checkpoint|Checkpoint.*(?:not found|missing)|No checkpoint)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'The required AI model checkpoint is not available on this machine.',
        severity: 'error' as const,
        category: 'resource' as const,
        suggestedAction: 'Use a different model or ensure the checkpoint is properly installed',
        retryRecommended: true,
        errorCode: 'COMFYUI_CHECKPOINT_MISSING',
        documentationUrl: 'https://docs.comfy.org/essentials/model_formats'
      }),
      0.95
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_vae_error',
      'VAE Error',
      /(?:VAE.*(?:error|failed|missing)|Could not.*VAE|VAE.*(?:not found|incompatible))/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'There was an issue with the VAE (Variational Autoencoder) model.',
        severity: 'error' as const,
        category: 'resource' as const,
        suggestedAction: 'Check that the VAE model is compatible with your checkpoint',
        retryRecommended: false,
        errorCode: 'COMFYUI_VAE_ERROR'
      }),
      0.9
    ));

    // Connection and WebSocket issues
    this.registerPattern(createCustomPattern(
      'comfyui_websocket_disconnect',
      'WebSocket Disconnected',
      /(?:WebSocket.*(?:disconnected|closed|error)|Connection.*(?:lost|closed))/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Lost connection to ComfyUI service during processing.',
        severity: 'warning' as const,
        category: 'service' as const,
        suggestedAction: 'The job may continue processing. Check status in a moment.',
        retryRecommended: true,
        errorCode: 'COMFYUI_WEBSOCKET_DISCONNECT',
        progressImpact: {
          shouldUpdateProgress: true,
          newProgressPercent: context?.progressPercent || 0
        }
      }),
      0.85
    ));

    // Image and output processing
    this.registerPattern(createCustomPattern(
      'comfyui_image_processing_error',
      'Image Processing Error',
      /(?:Error.*(?:processing|saving|loading).*image|Image.*(?:error|failed)|Cannot.*image)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Failed to process or save the generated image.',
        severity: 'error' as const,
        category: 'service' as const,
        suggestedAction: 'Check image format settings and available disk space',
        retryRecommended: true,
        errorCode: 'COMFYUI_IMAGE_PROCESSING_ERROR'
      }),
      0.8
    ));

    // Progress and execution status
    this.registerPattern(createCustomPattern(
      'comfyui_prompt_queued',
      'Prompt Queued',
      /(?:prompt.*queued|added to queue|queue position)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Your request has been queued for processing.',
        severity: 'info' as const,
        category: 'progress' as const,
        progressImpact: {
          shouldUpdateProgress: true,
          newProgressPercent: 10
        }
      }),
      0.8
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_execution_start',
      'Execution Started',
      /(?:Prompt executed|Starting execution|Execution started)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'ComfyUI has started processing your workflow.',
        severity: 'info' as const,
        category: 'progress' as const,
        progressImpact: {
          shouldUpdateProgress: true,
          newProgressPercent: 20
        }
      }),
      0.85
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_node_progress',
      'Node Progress',
      /(?:Executing node|Processing.*node|Node.*(?:complete|finished))/i,
      (match: RegExpMatchArray | string, context?: LogContext) => {
        // Try to extract progress percentage if available
        const progressMatch = typeof match === 'string' ? match : match[0];
        const percentMatch = progressMatch.match(/(\d+)%/);
        const extractedPercent = percentMatch ? parseInt(percentMatch[1]) : undefined;
        
        return {
          userMessage: 'Processing workflow nodes...',
          severity: 'info' as const,
          category: 'progress' as const,
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: extractedPercent || Math.min((context?.progressPercent || 20) + 5, 80)
          }
        };
      },
      0.7
    ));

    // Custom node and extension issues
    this.registerPattern(createCustomPattern(
      'comfyui_custom_node_error',
      'Custom Node Error',
      /(?:Custom node.*(?:error|failed)|Extension.*(?:error|failed)|Plugin.*(?:error|failed))/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'A custom node or extension encountered an error.',
        severity: 'error' as const,
        category: 'service' as const,
        suggestedAction: 'Try using built-in nodes or update your custom nodes',
        retryRecommended: false,
        errorCode: 'COMFYUI_CUSTOM_NODE_ERROR',
        documentationUrl: 'https://docs.comfy.org/essentials/custom_node_manager'
      }),
      0.85
    ));

    // Resource and performance issues
    this.registerPattern(createCustomPattern(
      'comfyui_cuda_out_of_memory',
      'CUDA Out of Memory',
      /(?:CUDA.*out of memory|GPU.*memory.*(?:error|full)|RuntimeError.*memory)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'The GPU ran out of memory while processing your request.',
        severity: 'error' as const,
        category: 'resource' as const,
        suggestedAction: 'Reduce image size, use CPU processing, or try a simpler workflow',
        retryRecommended: true,
        errorCode: 'COMFYUI_CUDA_OOM',
        technicalDetails: {
          memoryError: true,
          gpuRelated: true
        }
      }),
      0.95
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_execution_timeout',
      'Execution Timeout',
      /(?:Execution.*timeout|Workflow.*timeout|Processing.*timeout)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Workflow execution timed out. The request may be too complex.',
        severity: 'error' as const,
        category: 'service' as const,
        suggestedAction: 'Simplify your workflow or increase timeout settings',
        retryRecommended: true,
        errorCode: 'COMFYUI_EXECUTION_TIMEOUT'
      }),
      0.9
    ));

    // Success patterns
    this.registerPattern(createCustomPattern(
      'comfyui_execution_complete',
      'Execution Complete',
      /(?:Prompt executed successfully|Execution completed|Workflow finished)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Workflow execution completed successfully.',
        severity: 'info' as const,
        category: 'progress' as const,
        progressImpact: {
          shouldUpdateProgress: true,
          newProgressPercent: 95
        }
      }),
      0.9
    ));

    this.registerPattern(createCustomPattern(
      'comfyui_image_saved',
      'Image Saved',
      /(?:Image.*saved|Output.*saved|File.*saved)/i,
      (match: RegExpMatchArray | string, context?: LogContext) => ({
        userMessage: 'Generated image has been saved successfully.',
        severity: 'info' as const,
        category: 'progress' as const,
        progressImpact: {
          shouldUpdateProgress: true,
          newProgressPercent: 100
        }
      }),
      0.85
    ));
  }

  /**
   * ComfyUI-specific method to interpret WebSocket messages
   */
  async interpretWebSocketMessage(message: any, context?: LogContext): Promise<InterpretedMessage | null> {
    try {
      // Handle structured ComfyUI WebSocket messages
      if (typeof message === 'object' && message.type) {
        return this.interpretStructuredMessage(message, context);
      }

      // Handle string messages
      if (typeof message === 'string') {
        return this.interpretLog({
          timestamp: new Date(),
          level: 'info',
          message,
          source: 'comfyui_websocket'
        }, context);
      }

      return null;
    } catch (error) {
      console.warn('Failed to interpret ComfyUI WebSocket message:', error);
      return null;
    }
  }

  /**
   * Interpret structured ComfyUI WebSocket messages
   */
  private interpretStructuredMessage(message: any, context?: LogContext): InterpretedMessage | null {
    switch (message.type) {
      case 'status':
        return {
          userMessage: `ComfyUI status: ${message.data?.status || 'unknown'}`,
          severity: 'info' as const,
          category: 'progress' as const,
          originalMessage: JSON.stringify(message),
          technicalDetails: {
            messageType: 'status',
            statusData: message.data
          }
        };

      case 'progress':
        const progressPercent = message.data?.value || 0;
        const maxValue = message.data?.max || 100;
        const actualPercent = Math.round((progressPercent / maxValue) * 100);
        
        return {
          userMessage: `Processing: ${actualPercent}% complete`,
          severity: 'info' as const,
          category: 'progress' as const,
          originalMessage: JSON.stringify(message),
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: Math.max(20, actualPercent)
          },
          technicalDetails: {
            messageType: 'progress',
            value: progressPercent,
            max: maxValue,
            node: message.data?.node
          }
        };

      case 'executing':
        if (message.data?.node) {
          return {
            userMessage: `Executing node: ${message.data.node}`,
            severity: 'info' as const,
            category: 'progress' as const,
            originalMessage: JSON.stringify(message),
            technicalDetails: {
              messageType: 'executing',
              currentNode: message.data.node
            }
          };
        }
        break;

      case 'execution_error':
        return {
          userMessage: 'Workflow execution failed with an error.',
          severity: 'error' as const,
          category: 'service' as const,
          originalMessage: JSON.stringify(message),
          errorCode: 'COMFYUI_EXECUTION_ERROR',
          suggestedAction: 'Check your workflow for invalid nodes or connections',
          technicalDetails: {
            messageType: 'execution_error',
            errorData: message.data
          }
        };

      case 'executed':
        return {
          userMessage: 'Workflow node executed successfully.',
          severity: 'info' as const,
          category: 'progress' as const,
          originalMessage: JSON.stringify(message),
          progressImpact: {
            shouldUpdateProgress: true,
            newProgressPercent: Math.min((context?.progressPercent || 40) + 10, 90)
          },
          technicalDetails: {
            messageType: 'executed',
            nodeData: message.data
          }
        };
    }

    return null;
  }

  /**
   * Extract progress percentage from ComfyUI logs
   */
  extractProgressFromLog(logMessage: string): number | null {
    // Look for percentage patterns
    const percentMatch = logMessage.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      return parseFloat(percentMatch[1]);
    }

    // Look for node execution patterns
    const nodeMatch = logMessage.match(/(?:executing|processing).*node.*(\d+).*of.*(\d+)/i);
    if (nodeMatch) {
      const current = parseInt(nodeMatch[1]);
      const total = parseInt(nodeMatch[2]);
      return Math.round((current / total) * 100);
    }

    return null;
  }
}