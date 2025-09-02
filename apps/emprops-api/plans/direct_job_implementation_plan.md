# Direct Job Component Implementation Plan

## Overview

This plan outlines the implementation of a new component type called `direct_job` that submits jobs directly to the emp-job-queue system with real-time WebSocket updates. This replaces `fetch_api` components that bypass the job queue.

## Component Structure Analysis

Based on the provided example (`openai_text` workflow), direct_job components have this structure:

```json
{
  "job": {
    "service_required": "text_generation",
    "priority": 5,
    "payload": {
      "job_type": "openai_text",
      "prompt": "",
      "max_tokens": 200,
      "temperature": 0.7,
      "model": "gpt-4o-mini",
      "api_key": ""
    },
    "requirements": {
      "service_type": "text_generation", 
      "timeout_minutes": 1
    }
  },
  "form": { /* form configuration */ },
  "inputs": [
    {"id": "prompt", "pathJq": ".payload.prompt"},
    {"id": "max_tokens", "pathJq": ".payload.max_tokens"},
    {"id": "temperature", "pathJq": ".payload.temperature"},
    {"id": "model", "pathJq": ".payload.model"}
  ],
  "credits_script": "function computeCost(context) { /* cost calculation */ }"
}
```

## Key Differences from Existing Components

| Aspect | comfy_workflow | fetch_api | direct_job |
|--------|----------------|-----------|------------|
| **Job Processing** | Redis queue via ComfyUI | Direct API calls | Redis queue via job system |
| **Structure** | workflow.json + inputs.json + form.json | payload.json + form.json | job.json + inputs.json + form.json |
| **Real-time Updates** | WebSocket via ComfyUI | None | WebSocket via job events |
| **API Keys** | Injected via inputs.json | Manual handling | Injected via job payload |
| **Cost Calculation** | Built-in credits system | credits.js script | credits.js script |

## Implementation Tasks

### 1. Database and Type System Updates

**Files to modify:**
- `prisma/schema.prisma` - Update workflow type enum
- `src/routes/workflows/index.ts` - Add validation for direct_job type

**Changes:**
```typescript
// Add to workflow type validation
type: z.enum(["basic", "comfy_workflow", "fetch_api", "direct_job"]).optional()
```

### 2. Workflow Registration Updates

**Files to modify:**
- `src/modules/art-gen/nodes-v2/index.ts`

**Changes:**
```typescript
// Update registerComfyWorkflows method
this.workflows = await this.prisma.workflow.findMany({
  where: {
    type: {
      in: ["comfy_workflow", "fetch_api", "direct_job"], // Add direct_job
    },
  },
});

// Add case for direct_job in switch statement
case "direct_job":
  this.nodes.push(
    new DirectJobNode(
      workflow.name,
      workflow.output_mime_type,
      this.prisma,
      this.storageClient,
      this.eventEmitter,
    ),
  );
  break;
```

### 3. Create DirectJobNode Class

**New file:** `src/modules/art-gen/nodes-v2/nodes/direct-job.ts`

**Key responsibilities:**
- Implement GeneratorNode interface
- Map form inputs to job structure using JSONPath (inputs configuration)
- Submit jobs to Redis queue via RedisServerClient
- Handle API key injection into job payload
- Execute credits.js script for cost calculation
- Emit progress events via WebSocket

**Core methods:**
```typescript
export class DirectJobNode implements GeneratorNode {
  async execute(ctx: Context, input: any): Promise<any> {
    // 1. Load workflow configuration (job.json, inputs.json, credits_script)
    // 2. Map form inputs to job structure using JSONPath
    // 3. Inject API keys into job payload
    // 4. Calculate cost using credits_script
    // 5. Submit job to Redis queue
    // 6. Wait for completion via WebSocket events
    // 7. Return job result
  }
}
```

### 4. Job Submission and Mapping Logic

**Key features:**
- Use JSONPath library (jq) to map form fields to job structure
- Support nested payload mapping (e.g., `.payload.prompt`)
- Handle API key injection similar to comfy_workflow components
- Preserve job priority and requirements from job.json

**Example mapping:**
```typescript
// inputs.json: [{"id": "prompt", "pathJq": ".payload.prompt"}]
// Form input: {"prompt": "Hello world"}
// Result: job.payload.prompt = "Hello world"
```

### 5. API Key Integration

**Reuse existing system:**
- Leverage `getApiKey()` method from ComfyWorkflowRunner
- Support both user-specific and environment variable fallbacks
- Inject keys into job payload based on field configuration

**Configuration:**
```json
// In inputs.json
{
  "id": "api_key", 
  "pathJq": ".payload.api_key",
  "type": "api_key",
  "workflow_name": "openai"
}
```

### 6. Cost Calculation Integration

**Approach:**
- Execute `credits_script` from workflow data using vm2 sandbox
- Pass form input context to computeCost function
- Return cost breakdown for credit deduction

**Implementation:**
```typescript
const { VM } = require('vm2');
const vm = new VM({ timeout: 1000, sandbox: {} });
const computeCost = vm.run(workflow.data.credits_script);
const costResult = computeCost(input);
```

### 7. WebSocket Integration

**Real-time updates:**
- Connect to existing job event system
- Stream job status, progress, and completion events
- Use existing `/jobs/:id/events` SSE endpoint

### 8. Error Handling and Validation

**Validation points:**
- Ensure job.json contains required fields (service_required, payload, etc.)
- Validate JSONPath expressions in inputs.json
- Handle missing or invalid credits_script
- Graceful fallbacks for API key failures

## File Structure Changes

```
src/modules/art-gen/nodes-v2/nodes/
├── direct-job.ts          # New DirectJobNode implementation
├── index.ts               # Export DirectJobNode
└── ...

src/routes/workflows/
├── index.ts               # Add direct_job validation
└── ...

prisma/
├── schema.prisma          # Update workflow type enum
└── ...
```

## Testing Strategy

### 1. Unit Tests
- DirectJobNode job mapping logic
- API key injection
- Cost calculation script execution
- Error handling scenarios

### 2. Integration Tests
- End-to-end job submission flow
- WebSocket event streaming
- Credit deduction verification

### 3. Example Component
- Use provided `openai_text` workflow as test case
- Verify form rendering, job submission, and result handling

## Rollout Plan

### Phase 1: Core Implementation
1. ✅ Database schema updates
2. ✅ DirectJobNode class creation  
3. ✅ Basic job submission logic

### Phase 2: Integration
1. ✅ API key support
2. ✅ Cost calculation integration
3. ✅ WebSocket event handling

### Phase 3: Testing & Refinement
1. ✅ Unit and integration tests
2. ✅ Performance optimization
3. ✅ Documentation updates

## Success Criteria

- [ ] New `direct_job` workflows can be created and executed
- [ ] Form inputs correctly map to job payload structure
- [ ] Jobs submit to Redis queue and process via workers
- [ ] Real-time progress updates via WebSocket
- [ ] API keys inject properly into job payload
- [ ] Cost calculation executes and credits deduct correctly
- [ ] Error handling provides meaningful feedback
- [ ] Performance matches or exceeds `fetch_api` components

## Risk Mitigation

**Potential Issues:**
1. **JSONPath complexity** - Provide clear examples and validation
2. **Script security** - Use vm2 sandbox for credits_script execution  
3. **Job queue overload** - Implement proper priority and rate limiting
4. **WebSocket scalability** - Leverage existing SSE infrastructure

**Fallback Strategy:**
- Maintain backward compatibility with existing component types
- Provide migration path from `fetch_api` to `direct_job`
- Gradual rollout with feature flags if needed

## Dependencies

- **External:** JSONPath library (node-jq), vm2 for script execution
- **Internal:** Existing job system, Redis server client, WebSocket infrastructure
- **Database:** Workflow type enum update

## Timeline Estimate

- **Phase 1:** 2-3 days
- **Phase 2:** 2-3 days  
- **Phase 3:** 1-2 days
- **Total:** 5-8 days

This implementation will provide a robust foundation for direct job processing while maintaining consistency with the existing component architecture.