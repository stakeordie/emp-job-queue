# OpenTelemetry Trace Library

## Overview

The emp-job-queue system implements a hierarchical tracing architecture using OpenTelemetry, providing end-to-end observability across workflows, jobs, and service-specific processing. This document outlines the trace library structure and usage patterns.

## Architecture Hierarchy

```
Workflow Lifecycle    ← Top level (when jobs have workflow_id)
    ↓
Job Lifecycle        ← Core level (universal for all jobs)  
    ↓
Job Service Process  ← Service level (connector-specific)
```

## Workflow Lifecycle Instrumentation

**When**: Jobs that are part of a multi-step workflow (have `workflow_id`)
**Scope**: Tracks progress across multiple related jobs
**Usage**: EmProps workflows, multi-step image generation, batch processing

```typescript
export const WorkflowInstrumentation = {
  // Workflow orchestration
  start: (data: WorkflowStartData) => startSpan('workflow.start', data),
  stepSubmit: (data: WorkflowStepData, parent: SpanContext) => startSpan('workflow.step_submit', data, parent),
  stepComplete: (data: WorkflowStepData, parent: SpanContext) => startSpan('workflow.step_complete', data, parent),
  complete: (data: WorkflowCompleteData, parent: SpanContext) => startSpan('workflow.complete', data, parent),
  
  // Workflow error handling
  stepFail: (data: WorkflowStepFailData, parent: SpanContext) => startSpan('workflow.step_fail', data, parent),
  cancel: (data: WorkflowCancelData, parent: SpanContext) => startSpan('workflow.cancel', data, parent),
  timeout: (data: WorkflowTimeoutData, parent: SpanContext) => startSpan('workflow.timeout', data, parent),
}

interface WorkflowStartData {
  workflowId: string;
  totalSteps: number;
  userId?: string;
  workflowType: string;
}

interface WorkflowStepData {
  workflowId: string;
  stepNumber: number;
  totalSteps: number;
  jobId: string;
  stepType: string;
}
```

**Example Workflow Trace:**
```
workflow.start (workflow_id: wf_123, total_steps: 3)
├── workflow.step_submit (step: 1/3, job_id: job_abc)
│   └── [Job Lifecycle for job_abc]
├── workflow.step_submit (step: 2/3, job_id: job_def)  
│   └── [Job Lifecycle for job_def]
└── workflow.complete (workflow_id: wf_123)
```

## Job Lifecycle Instrumentation

**When**: Every job in the system
**Scope**: Universal job processing flow from submission to completion
**Usage**: Core job broker operations, queue management, worker assignment

```typescript
export const JobInstrumentation = {
  // Core lifecycle - every job goes through these
  submit: (data: JobSubmitData) => startSpan('job.submit', data),
  saveToRedis: (data: JobSaveData, parent: SpanContext) => startSpan('job.save_redis', data, parent),
  claim: (data: JobClaimData, parent: SpanContext) => startSpan('job.claim', data, parent),
  process: (data: JobProcessData, parent: SpanContext) => startSpan('job.process', data, parent),
  complete: (data: JobCompleteData, parent: SpanContext) => startSpan('job.complete', data, parent),
  sendCompleteMessage: (data: JobMessageData, parent: SpanContext) => startSpan('job.send_complete_msg', data, parent),
  archive: (data: JobArchiveData, parent: SpanContext) => startSpan('job.archive', data, parent),
  
  // Error handling - subset of jobs
  retry: (data: JobRetryData, parent: SpanContext) => startSpan('job.retry', data, parent),
  fail: (data: JobFailData, parent: SpanContext) => startSpan('job.fail', data, parent),
  timeout: (data: JobTimeoutData, parent: SpanContext) => startSpan('job.timeout', data, parent),
  requeue: (data: JobRequeueData, parent: SpanContext) => startSpan('job.requeue', data, parent),
}

interface JobSubmitData {
  jobId: string;
  jobType: string;
  priority: number;
  queueName?: string;
  submittedBy?: string;
  workflowId?: string;
  userId?: string;
}

interface JobClaimData {
  jobId: string;
  workerId: string;
  machineId: string;
  connectorId: string;
  serviceType: string;
  queueWaitTime: number;
}

interface JobProcessData {
  jobId: string;
  connectorId: string;
  serviceType: string;
  estimatedDuration?: number;
}
```

**Example Job Trace:**
```
job.submit (job_id: job_123, type: openai_image, priority: 75)
├── job.save_redis (redis_key: job:job_123)
├── job.claim (worker: worker-001, machine: machine-abc, wait_time: 1250ms)
├── job.process (connector: OpenAIImageConnector)
│   └── [Job Service Process spans]
├── job.complete (status: success, duration: 15000ms)
├── job.send_complete_msg (event: job_completed)
└── job.archive (location: jobs:completed)
```

## Job Service Process Instrumentation

**When**: During connector-specific job processing
**Scope**: Service-specific implementation details
**Usage**: OpenAI API calls, ComfyUI WebSocket communication, asset uploads

```typescript
export const ProcessingInstrumentation = {
  // HTTP-based services (OpenAI, A1111, etc.)
  httpRequest: (data: HttpRequestData, parent: SpanContext) => startSpan('process.http_request', data, parent),
  pollForCompletion: (data: PollData, parent: SpanContext) => startSpan('process.poll_completion', data, parent),
  
  // WebSocket services (ComfyUI, etc.)  
  websocketConnect: (data: WsConnectData, parent: SpanContext) => startSpan('process.ws_connect', data, parent),
  websocketSend: (data: WsSendData, parent: SpanContext) => startSpan('process.ws_send', data, parent),
  websocketProgress: (data: WsProgressData, parent: SpanContext) => startSpan('process.ws_progress', data, parent),
  
  // Asset handling (all services)
  imageGeneration: (data: ImageGenData, parent: SpanContext) => startSpan('process.image_generation', data, parent),
  imageUpload: (data: ImageUploadData, parent: SpanContext) => startSpan('process.image_upload', data, parent),
  cdnTest: (data: CdnTestData, parent: SpanContext) => startSpan('process.cdn_test', data, parent),
  validateOutput: (data: ValidateData, parent: SpanContext) => startSpan('process.validate_output', data, parent),
  
  // Service-specific operations
  executeSimulation: (data: SimulationData, parent: SpanContext) => startSpan('process.execute_simulation', data, parent),
  downloadModel: (data: ModelDownloadData, parent: SpanContext) => startSpan('process.download_model', data, parent),
  executeComfyUI: (data: ComfyUIData, parent: SpanContext) => startSpan('process.execute_comfyui', data, parent),
}

interface HttpRequestData {
  jobId: string;
  method: string;
  url: string;
  requestSize: number;
  timeout: number;
}

interface PollData {
  jobId: string;
  pollUrl: string;
  pollInterval: number;
  maxAttempts: number;
}

interface ImageUploadData {
  jobId: string;
  imageCount: number;
  totalSize: number;
  storageProvider: string;
}
```

**Example OpenAI Processing Trace:**
```
process.http_request (POST https://api.openai.com/v1/images/generations)
├── process.poll_completion (poll_interval: 1000ms, max_attempts: 300)
├── process.image_generation (images_generated: 1, total_size: 1.2MB)
├── process.validate_output (validation: success, output_type: base64)
├── process.image_upload (provider: azure_blob, cdn_url: generated)
└── process.cdn_test (test_result: success, response_time: 250ms)
```

**Example ComfyUI Processing Trace:**
```
process.ws_connect (url: ws://comfyui:8188/ws)
├── process.ws_send (message_type: queue_prompt, prompt_id: abc123)
├── process.ws_progress (progress: 25%, current_node: "KSampler")
├── process.ws_progress (progress: 75%, current_node: "VAEDecode")  
├── process.image_generation (images_generated: 4, format: png)
├── process.image_upload (provider: azure_blob, images: 4)
└── process.cdn_test (cdn_urls: 4, all_accessible: true)
```

## Usage Patterns

### Basic Job Processing
```typescript
// API Server
const jobSpan = JobInstrumentation.submit({ 
  jobId, 
  jobType: 'openai_image', 
  priority: 75 
});

const saveSpan = JobInstrumentation.saveToRedis({ 
  jobId, 
  redisKey: `job:${jobId}` 
}, jobSpan.context);
saveSpan.end();
jobSpan.end();
```

### Workflow with Multiple Jobs
```typescript
// Workflow Orchestrator
const workflowSpan = WorkflowInstrumentation.start({
  workflowId: 'wf_123',
  totalSteps: 3,
  workflowType: 'image_pipeline'
});

// For each step
const stepSpan = WorkflowInstrumentation.stepSubmit({
  workflowId: 'wf_123',
  stepNumber: 1,
  totalSteps: 3,
  jobId: 'job_abc',
  stepType: 'base_image'
}, workflowSpan.context);

// Submit job with workflow context
const jobSpan = JobInstrumentation.submit({
  jobId: 'job_abc',
  workflowId: 'wf_123',
  jobType: 'openai_image'
}, stepSpan.context);
```

### Service-Specific Processing
```typescript
// In OpenAI Connector
const processSpan = JobInstrumentation.process({
  jobId,
  connectorId: 'OpenAIImageConnector',
  serviceType: 'openai'
}, parentContext);

const httpSpan = ProcessingInstrumentation.httpRequest({
  jobId,
  method: 'POST',
  url: 'https://api.openai.com/v1/images/generations',
  requestSize: 1024
}, processSpan.context);

const pollSpan = ProcessingInstrumentation.pollForCompletion({
  jobId,
  pollUrl: pollEndpoint,
  pollInterval: 1000,
  maxAttempts: 300
}, httpSpan.context);
```

## Context Propagation

### Redis Context Passing (Implemented)
```typescript
// API Server - Store trace context in Redis job data
await redis.hmset(`job:${jobId}`, {
  // ... job data ...
  job_trace_id: submitSpanContext.traceId,
  job_span_id: submitSpanContext.spanId,
  workflow_trace_id: workflowStepSpanContext?.traceId || '',
  workflow_span_id: workflowStepSpanContext?.spanId || '',
});

// Worker - Retrieve and use context
const jobData = await redis.hgetall(`job:${jobId}`);
const jobParentContext = {
  traceId: jobData.job_trace_id,
  spanId: jobData.job_span_id
};

// Use context for job assignment tracing
const claimSpan = await JobInstrumentation.claim(claimData, jobParentContext);
```

### WebSocket Context Passing
```typescript
// Include trace context in WebSocket messages
ws.send(JSON.stringify({
  type: 'job_progress',
  job_id: jobId,
  trace_context: {
    trace_id: span.traceId,
    span_id: span.spanId
  }
}));
```

## Implementation Status

- [x] **OTel Client Foundation** - Basic `sendTrace`, `sendMetric`, `startSpan`
- [x] **Workflow Instrumentation** - Multi-job workflow tracing ✅
- [x] **Job Instrumentation** - Universal job lifecycle tracing ✅
- [x] **Processing Instrumentation** - Service-specific processing tracing ✅
- [x] **Context Propagation** - Trace context through Redis and WebSocket ✅
- [x] **API Server Integration** - Job submission and workflow tracing ✅
- [ ] **Worker Integration** - Job assignment and processing tracing
- [ ] **Connector Integration** - Service-specific processing tracing
- [ ] **Integration Testing** - End-to-end trace validation

## Next Steps

1. **Implement Job Instrumentation** - Core job lifecycle spans
2. **Add Context Propagation** - Store/retrieve trace IDs through Redis
3. **Integrate with Existing Code** - Add instrumentation to API, Worker, Connectors
4. **Add Processing Instrumentation** - Service-specific tracing
5. **Implement Workflow Instrumentation** - Multi-job workflow support
6. **Validation and Testing** - Verify end-to-end trace correlation