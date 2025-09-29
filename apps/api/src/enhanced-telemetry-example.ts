/**
 * Enhanced Telemetry Examples - Rich Debugging Context
 *
 * Shows how to implement telemetry with debugging context like the OpenTelemetry demo
 */

import { WorkflowTelemetryClient, EmpWorkflows, EmpOperations } from '@emp/core/src/workflow-telemetry';
import Redis from 'ioredis';

// Example: Job Submission with Rich Context
export async function submitJobWithRichTelemetry(
  workflowClient: WorkflowTelemetryClient,
  jobData: any,
  userContext: any
) {
  const workflow = workflowClient.startWorkflow(EmpWorkflows.JOB_SUBMISSION, {
    jobId: jobData.id,
    userId: userContext.id,
    jobType: jobData.type,
    priority: jobData.priority,
    'user.plan': userContext.plan,
    'user.credits_remaining': userContext.credits,
    'request.ip': userContext.ip,
    'request.user_agent': userContext.userAgent
  });

  await workflowClient.withSpan(
    EmpOperations.JOB_VALIDATION,
    workflow,
    async (validationSpan) => {
      try {
        // Step 1: Schema validation
        workflowClient.recordStepCompletion(validationSpan.spanId, 'schema_validation', {
          'validation.schema_version': '2.1.0',
          'validation.rules_count': 24,
          'job.workflow_nodes': jobData.workflow?.nodes?.length || 0,
          'job.estimated_credits': jobData.estimatedCredits
        });

        // Step 2: User limits check
        workflowClient.recordStepCompletion(validationSpan.spanId, 'user_limits_check', {
          'user.daily_jobs': userContext.dailyJobCount,
          'user.monthly_credits_used': userContext.monthlyCreditsUsed,
          'user.max_concurrent_jobs': userContext.maxConcurrentJobs,
          'user.current_active_jobs': userContext.activeJobCount
        });

        // Step 3: Resource availability
        const resourceCheck = await checkResourceAvailability(jobData);
        workflowClient.recordStepCompletion(validationSpan.spanId, 'resource_check', {
          'resources.gpu_pool_available': resourceCheck.gpuAvailable,
          'resources.estimated_wait_minutes': resourceCheck.estimatedWait,
          'resources.queue_position': resourceCheck.queuePosition,
          'model.required': jobData.model,
          'model.size_gb': resourceCheck.modelSize
        });

        workflowClient.markSpanSuccess(validationSpan.spanId, {
          'validation.passed': true,
          'validation.duration_ms': 150,
          'job.approved_credits': jobData.approvedCredits,
          'queue.estimated_start_time': resourceCheck.estimatedStartTime
        });

      } catch (error) {
        // Rich error context for different failure scenarios
        const errorContext: Record<string, any> = {
          'operation.type': 'job_validation',
          'component.name': 'job_validator',
          'job.id': jobData.id,
          'job.type': jobData.type,
          'user.id': userContext.id,
          'user.plan': userContext.plan,
          'validation.step': 'unknown' // Will be overridden below
        };

        // Add specific context based on error type
        if (error.message.includes('schema')) {
          errorContext['validation.step'] = 'schema_validation';
          errorContext['validation.schema_version'] = '2.1.0';
          errorContext['job.workflow_invalid_nodes'] = jobData.invalidNodes;
        } else if (error.message.includes('credits')) {
          errorContext['validation.step'] = 'user_limits_check';
          errorContext['user.credits_remaining'] = userContext.credits;
          errorContext['job.required_credits'] = jobData.estimatedCredits;
          errorContext['user.plan_limits'] = userContext.planLimits;
        } else if (error.message.includes('resource')) {
          errorContext['validation.step'] = 'resource_check';
          errorContext['resources.gpu_available'] = 0;
          errorContext['resources.queue_full'] = true;
          errorContext['model.size_gb'] = resourceCheck?.modelSize;
        }

        workflowClient.markSpanError(validationSpan.spanId, error as Error, errorContext);
        throw error;
      }
    }
  );
}

// Example: Model Download with Network Context
export async function downloadModelWithTelemetry(
  workflowClient: WorkflowTelemetryClient,
  modelName: string,
  workerId: string
) {
  const workflow = workflowClient.startWorkflow(EmpWorkflows.JOB_PROCESSING, {
    modelName,
    workerId,
    'worker.location': 'us-west-2',
    'worker.provider': 'salad'
  });

  await workflowClient.withSpan(
    EmpOperations.MODEL_DOWNLOAD,
    workflow,
    async (downloadSpan) => {
      try {
        // Record system state before download
        workflowClient.recordResourceUsage(downloadSpan.spanId, {
          disk_space_mb: 15000,
          memory_mb: 2048,
          network_bytes: 0
        });

        // Step 1: Check cache
        workflowClient.recordStepCompletion(downloadSpan.spanId, 'cache_check', {
          'cache.enabled': true,
          'cache.hit': false,
          'model.cached_version': null,
          'model.required_version': 'v1.5',
          'cache.size_mb': 12000,
          'cache.available_space_mb': 3000
        });

        // Step 2: Download
        const downloadUrl = `https://huggingface.co/runwayml/${modelName}`;
        workflowClient.addSpanEvent(downloadSpan.spanId, 'download.started', {
          'download.url': downloadUrl,
          'download.method': 'HTTP',
          'download.expected_size_mb': 4200,
          'download.timeout_seconds': 600,
          'download.max_retries': 3
        });

        // Simulate download with progress events
        for (let progress = 0; progress <= 100; progress += 25) {
          await new Promise(resolve => setTimeout(resolve, 50));

          workflowClient.addSpanEvent(downloadSpan.spanId, 'download.progress', {
            'download.progress_percent': progress,
            'download.bytes_downloaded': (4200 * 1024 * 1024 * progress) / 100,
            'download.speed_mbps': 15.2,
            'network.latency_ms': 45
          });
        }

        // Step 3: Verification
        workflowClient.recordStepCompletion(downloadSpan.spanId, 'verification', {
          'verification.checksum_algorithm': 'sha256',
          'verification.expected_checksum': 'abc123...',
          'verification.actual_checksum': 'abc123...',
          'verification.passed': true,
          'file.size_bytes': 4203 * 1024 * 1024
        });

        workflowClient.markSpanSuccess(downloadSpan.spanId, {
          'model.name': modelName,
          'model.size_mb': 4203,
          'model.version': 'v1.5',
          'model.path': '/workspace/models/stable-diffusion-v1-5.ckpt',
          'download.total_duration_ms': 3200,
          'download.average_speed_mbps': 15.2,
          'storage.used_mb': 16203,
          'storage.available_mb': 8797
        });

      } catch (error) {
        workflowClient.markSpanError(downloadSpan.spanId, error as Error, {
          'operation.type': 'model_download',
          'component.name': 'model_downloader',
          'model.name': modelName,
          'model.url': downloadUrl,
          'download.bytes_completed': 2100 * 1024 * 1024, // Partial download
          'download.retry_count': 2,
          'download.last_error': 'Connection timeout',
          'network.provider': 'salad-network',
          'network.region': 'us-west-2',
          'storage.available_mb': 800, // Potential cause
          'worker.id': workerId,
          'worker.disk_io_speed_mbps': 45.2,
          'system.load_average': 3.4,
          'memory.available_mb': 512 // Low memory
        });
        throw error;
      }
    }
  );
}

// Example: ComfyUI Execution with Detailed Progress
export async function executeComfyUIWorkflowWithTelemetry(
  workflowClient: WorkflowTelemetryClient,
  workflowData: any,
  executionId: string
) {
  const workflow = workflowClient.startWorkflow(EmpWorkflows.JOB_PROCESSING, {
    executionId,
    'workflow.nodes': workflowData.nodes.length,
    'workflow.type': 'txt2img',
    'generation.width': 1024,
    'generation.height': 1024,
    'generation.steps': 20
  });

  await workflowClient.withSpan(
    EmpOperations.COMFYUI_WORKFLOW,
    workflow,
    async (executionSpan) => {
      try {
        // Record GPU state
        workflowClient.recordResourceUsage(executionSpan.spanId, {
          gpu_memory_mb: 8192,
          memory_mb: 4096,
          cpu_percent: 25
        });

        // Step-by-step execution with progress
        const steps = ['prompt_processing', 'noise_generation', 'denoising', 'upscaling', 'output_generation'];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const progressPercent = ((i + 1) / steps.length) * 100;

          await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work

          workflowClient.recordStepCompletion(executionSpan.spanId, step, {
            'step.index': i + 1,
            'step.total': steps.length,
            'progress.percent': progressPercent,
            'gpu.memory_used_mb': 6000 + (i * 400), // Increasing memory usage
            'gpu.utilization_percent': 85 + (i * 2),
            'estimated.remaining_seconds': (steps.length - i - 1) * 200 / 1000
          });
        }

        workflowClient.markSpanSuccess(executionSpan.spanId, {
          'execution.success': true,
          'execution.total_duration_ms': 1000,
          'output.images_generated': 1,
          'output.total_size_mb': 12.4,
          'output.format': 'PNG',
          'gpu.peak_memory_mb': 7600,
          'generation.actual_steps': 20,
          'generation.seed': 42,
          'quality.score': 0.92
        });

      } catch (error) {
        workflowClient.markSpanError(executionSpan.spanId, error as Error, {
          'operation.type': 'comfyui_execution',
          'component.name': 'comfyui_worker',
          'execution.id': executionId,
          'workflow.node_count': workflowData.nodes.length,
          'execution.step_failed': 'denoising', // Which step failed
          'execution.progress_percent': 60, // How far we got
          'gpu.memory_used_mb': 7800,
          'gpu.memory_available_mb': 400, // OOM error
          'gpu.utilization_percent': 98,
          'model.loaded': 'stable-diffusion-v1-5',
          'generation.parameters': JSON.stringify({
            width: 1024, height: 1024, steps: 20, cfg: 7.5
          }),
          'worker.version': 'comfyui-0.2.2',
          'cuda.version': '11.8',
          'system.temperature_c': 82 // Overheating?
        });
        throw error;
      }
    }
  );
}

// Helper function
async function checkResourceAvailability(jobData: any) {
  // Mock implementation
  return {
    gpuAvailable: 3,
    estimatedWait: 5,
    queuePosition: 12,
    modelSize: 4.2,
    estimatedStartTime: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
}