/**
 * Test Workflow Telemetry - Demonstrates Connected Trace Hierarchies
 *
 * This script shows how to create the connected workflow traces
 * that will appear in Dash0 like the OpenTelemetry demo.
 */

import Redis from 'ioredis';
import { WorkflowTelemetryClient, EmpWorkflows, EmpOperations } from '@emp/core';

// Mock event emitter that sends to Redis Stream
function createWorkflowEventEmitter(redis: Redis) {
  return async (span: any) => {
    await redis.xadd('telemetry:events', '*',
      'eventType', 'workflow.span',
      'data', JSON.stringify(span),
      'timestamp', Date.now().toString(),
      'service', 'emp-api'
    );
  };
}

async function demonstrateJobSubmissionWorkflow() {
  console.log('🎯 Demonstrating Job Submission Workflow Trace...');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const workflowClient = new WorkflowTelemetryClient(createWorkflowEventEmitter(redis), 'emp-api');

  try {
    // Start Job Submission Workflow (ROOT TRACE)
    const workflowContext = workflowClient.startWorkflow(EmpWorkflows.JOB_SUBMISSION, {
      jobId: 'job-test-12345',
      userId: 'user-67890',
      jobType: 'comfyui-image-generation',
      priority: 'high'
    });

    console.log(`📊 Started workflow trace: ${workflowContext.traceId}`);

    // Execute workflow with connected spans
    await workflowClient.withSpan(
      EmpOperations.API_REQUEST,
      workflowContext,
      async (apiSpan, apiContext) => {
        // Add request details
        workflowClient.updateSpanAttributes(apiSpan.spanId, {
          'http.method': 'POST',
          'http.route': '/api/jobs/submit',
          'http.status_code': 200,
          'user.id': 'user-67890'
        });

        // Job Validation (nested span)
        await workflowClient.withSpan(
          EmpOperations.JOB_VALIDATION,
          apiContext,
          async (validationSpan) => {
            // Simulate validation time
            await new Promise(resolve => setTimeout(resolve, 50));

            workflowClient.updateSpanAttributes(validationSpan.spanId, {
              'validation.schema_version': '1.2',
              'validation.rules_applied': 12,
              'validation.result': 'passed'
            });

            workflowClient.addSpanEvent(validationSpan.spanId, 'validation.completed', {
              'validation.duration_ms': 50
            });
          }
        );

        // Redis Operation (nested span)
        await workflowClient.withRedisSpan(
          EmpOperations.REDIS_OPERATION,
          apiContext,
          async (redisSpan) => {
            await new Promise(resolve => setTimeout(resolve, 25));

            workflowClient.updateSpanAttributes(redisSpan.spanId, {
              'redis.operation': 'HMSET',
              'redis.key': 'job:job-test-12345',
              'redis.database': 0
            });
          }
        );

        // Job Queued (nested span)
        await workflowClient.withSpan(
          EmpOperations.JOB_QUEUED,
          apiContext,
          async (queueSpan) => {
            await new Promise(resolve => setTimeout(resolve, 15));

            workflowClient.updateSpanAttributes(queueSpan.spanId, {
              'queue.name': 'jobs:pending',
              'queue.priority': 'high',
              'queue.position': 3
            });

            workflowClient.addSpanEvent(queueSpan.spanId, 'job.queued', {
              'queue.size_after': 4
            });
          }
        );
      },
      {
        'api.endpoint': '/api/jobs/submit',
        'request.size_bytes': 1024
      }
    );

    console.log('✅ Job Submission Workflow completed successfully');

  } catch (error) {
    console.error('❌ Workflow failed:', error);
  } finally {
    await redis.quit();
  }
}

async function demonstrateJobProcessingWorkflow() {
  console.log('🔄 Demonstrating Job Processing Workflow Trace...');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const workflowClient = new WorkflowTelemetryClient(createWorkflowEventEmitter(redis), 'emp-worker');

  try {
    // Start Job Processing Workflow (ROOT TRACE)
    const workflowContext = workflowClient.startWorkflow(EmpWorkflows.JOB_PROCESSING, {
      jobId: 'job-test-12345',
      workerId: 'worker-gpu-01',
      machineId: 'salad-machine-789'
    });

    console.log(`🔄 Started processing trace: ${workflowContext.traceId}`);

    // Worker Claim Phase
    await workflowClient.withSpan(
      EmpOperations.WORKER_CLAIM,
      workflowContext,
      async (claimSpan, claimContext) => {

        // Redis atomic claim operation
        await workflowClient.withRedisSpan(
          EmpOperations.REDIS_OPERATION,
          claimContext,
          async (redisSpan) => {
            await new Promise(resolve => setTimeout(resolve, 30));

            workflowClient.updateSpanAttributes(redisSpan.spanId, {
              'redis.operation': 'EVAL',
              'redis.script': 'findMatchingJob',
              'redis.result': 'job_claimed'
            });
          }
        );

        workflowClient.updateSpanAttributes(claimSpan.spanId, {
          'worker.id': 'worker-gpu-01',
          'worker.capabilities': ['gpu', 'comfyui', 'sd15'],
          'claim.success': true
        });
      }
    );

    // Job Preparation Phase
    await workflowClient.withSpan(
      'job.preparation',
      workflowContext,
      async (prepSpan, prepContext) => {

        // Model Download with rich debugging context
        await workflowClient.withSpan(
          EmpOperations.MODEL_DOWNLOAD,
          prepContext,
          async (modelSpan) => {
            try {
              // Record step-by-step progress
              workflowClient.recordStepCompletion(modelSpan.spanId, 'validation', {
                'model.name': 'stable-diffusion-v1-5',
                'model.expected_size_mb': 4200,
                'model.source': 'huggingface',
                'validation.checksum': 'sha256:abc123...'
              });

              // Simulate network delay
              await new Promise(resolve => setTimeout(resolve, 100));

              workflowClient.recordStepCompletion(modelSpan.spanId, 'download_start', {
                'download.url': 'https://huggingface.co/runwayml/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.ckpt',
                'download.method': 'HTTP',
                'download.timeout_seconds': 300,
                'download.retry_count': 0
              });

              // Record resource usage during download
              workflowClient.recordResourceUsage(modelSpan.spanId, {
                disk_space_mb: 15000,
                memory_mb: 1200,
                network_bytes: 0
              });

              // Simulate download progress
              await new Promise(resolve => setTimeout(resolve, 100));

              workflowClient.recordStepCompletion(modelSpan.spanId, 'download_complete', {
                'download.actual_size_mb': 4203,
                'download.duration_ms': 200,
                'download.speed_mbps': 21.0,
                'download.checksum_verified': true
              });

              // Mark successful completion with detailed context
              workflowClient.markSpanSuccess(modelSpan.spanId, {
                'model.name': 'stable-diffusion-v1-5',
                'model.size_mb': 4203,
                'model.path': '/workspace/models/stable-diffusion-v1-5.ckpt',
                'download.source': 'huggingface',
                'download.cached': false,
                'download.verification': 'passed',
                'storage.available_mb': 10797
              });

            } catch (error) {
              // Rich error context for debugging
              workflowClient.markSpanError(modelSpan.spanId, error as Error, {
                'operation.type': 'model_download',
                'component.name': 'model_downloader',
                'model.name': 'stable-diffusion-v1-5',
                'model.url': 'https://huggingface.co/runwayml/stable-diffusion-v1-5',
                'download.retry_count': 3,
                'download.timeout_seconds': 300,
                'network.connection_type': 'wifi',
                'storage.available_mb': 800, // Low disk space causing issue
                'worker.id': 'worker-gpu-01',
                'worker.location': 'us-west-2',
                'request.user_agent': 'emp-worker/1.0.0',
                'system.load_average': 2.1
              });
              throw error;
            }
          }
        );

        // ComfyUI Initialize
        await workflowClient.withSpan(
          EmpOperations.COMFYUI_INITIALIZE,
          prepContext,
          async (comfySpan) => {
            await new Promise(resolve => setTimeout(resolve, 100));

            workflowClient.updateSpanAttributes(comfySpan.spanId, {
              'comfyui.version': '0.2.2',
              'comfyui.nodes_loaded': 64,
              'comfyui.memory_allocated_mb': 1200
            });
          }
        );
      }
    );

    // Job Execution Phase
    await workflowClient.withSpan(
      'job.execution',
      workflowContext,
      async (execSpan, execContext) => {

        // ComfyUI Workflow Execution
        await workflowClient.withSpan(
          EmpOperations.COMFYUI_WORKFLOW,
          execContext,
          async (workflowSpan) => {
            // Simulate processing time
            await new Promise(resolve => setTimeout(resolve, 1500));

            workflowClient.updateSpanAttributes(workflowSpan.spanId, {
              'workflow.steps': 12,
              'workflow.type': 'txt2img',
              'generation.width': 1024,
              'generation.height': 1024,
              'generation.steps': 20
            });

            // Add processing events
            workflowClient.addSpanEvent(workflowSpan.spanId, 'processing.started', {});
            workflowClient.addSpanEvent(workflowSpan.spanId, 'processing.step.completed', {
              'step': 10, 'progress': 0.5
            });
            workflowClient.addSpanEvent(workflowSpan.spanId, 'processing.completed', {
              'output.images': 1
            });
          }
        );

        workflowClient.updateSpanAttributes(execSpan.spanId, {
          'execution.success': true,
          'execution.duration_ms': 1500
        });
      }
    );

    console.log('✅ Job Processing Workflow completed successfully');

  } catch (error) {
    console.error('❌ Processing workflow failed:', error);
  } finally {
    await redis.quit();
  }
}

async function main() {
  console.log('🚀 Starting Workflow Telemetry Demonstration...');
  console.log('This will create connected trace hierarchies like the OpenTelemetry demo');

  // Demonstrate both workflows
  await demonstrateJobSubmissionWorkflow();
  await new Promise(resolve => setTimeout(resolve, 1000));
  await demonstrateJobProcessingWorkflow();

  console.log('');
  console.log('🎯 Check Dash0 for connected workflow traces:');
  console.log('   - emp.job.submission workflow with nested spans');
  console.log('   - emp.job.processing workflow with execution hierarchy');
  console.log('   - Parent-child relationships showing request flow');
  console.log('   - Span events for detailed operation tracking');
}

if (require.main === module) {
  main().catch(console.error);
}