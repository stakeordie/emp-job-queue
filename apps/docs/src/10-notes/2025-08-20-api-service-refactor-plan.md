# API Service Refactor Plan: Domain Separation & Workflow Consolidation

**Date**: 2025-08-20  
**Status**: Planning  
**Priority**: High  

## Background

Currently, the API service (`apps/api/src/lightweight-api-server.ts`) is a monolith containing job submission, workflow tracking, and HTTP routing logic. Additionally, we have duplicate workflow tracking in both the API and webhook services, causing inconsistencies and the recent step_details error field bug.

## Problem Statement

### Current Issues:
1. **Monolithic API**: Business logic mixed with HTTP routing
2. **Duplicate Workflow Tracking**: API and webhook services both track workflows independently
3. **Inconsistent step_details**: Different services generate different webhook payloads
4. **Poor Testability**: Business logic tightly coupled to HTTP layer
5. **Unclear Domain Boundaries**: Job vs Workflow responsibilities mixed

### Recent Bug Example:
The error field was missing from workflow_failed webhook step_details because:
- Webhook service had its own workflow tracker
- API service had its own workflow tracker  
- Both generated step_details differently
- Required fixing the same bug in two places

## Proposed Architecture

### Domain-Driven Service Separation

```
apps/api/src/
├── lightweight-api-server.ts    # Pure HTTP routing
├── services/
│   ├── job-service.ts           # Job lifecycle management
│   ├── workflow-service.ts      # Workflow orchestration
│   └── message-bus-service.ts   # Event distribution
├── models/
│   ├── job.ts                   # Job domain model
│   ├── workflow.ts              # Workflow domain model
│   └── events.ts                # Event types
└── routes/
    ├── job-routes.ts            # Job HTTP endpoints
    ├── workflow-routes.ts       # Workflow HTTP endpoints
    └── internal-routes.ts       # Internal API endpoints
```

### Service Responsibilities

#### JobService - Job Lifecycle Authority
```typescript
export class JobService {
  // Core job operations
  async submitJob(jobData: JobSubmissionRequest): Promise<Job>
  async updateJobStatus(jobId: string, status: JobStatus, result?: any, error?: string): Promise<void>
  async getJob(jobId: string): Promise<Job | null>
  async cancelJob(jobId: string): Promise<void>
  
  // Job-workflow relationship
  async linkJobToWorkflow(jobId: string, workflowId: string, step: number): Promise<void>
}
```

#### WorkflowService - Workflow Orchestration Authority
```typescript
export class WorkflowService {
  // Workflow state management (SINGLE SOURCE OF TRUTH)
  async trackJobInWorkflow(jobId: string, workflowId: string, step: number): Promise<void>
  async onJobCompleted(jobId: string): Promise<WorkflowEvent[]>
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatus>
  
  // Canonical step_details generation
  private generateStepDetails(workflowId: string): StepDetail[]
}
```

#### MessageBusService - Event Distribution
```typescript
export class MessageBusService {
  // Replaces direct Redis pub/sub
  async publishJobEvent(event: JobEvent): Promise<void>
  async publishWorkflowEvent(event: WorkflowEvent): Promise<void>
  async subscribe(eventType: string, handler: EventHandler): Promise<void>
}
```

## Message Bus Integration

### Current State: Direct Redis Pub/Sub
```typescript
// Multiple services publishing to Redis directly
await redis.publish('job_failed', JSON.stringify(event));
await redis.publish('workflow_completed', JSON.stringify(event));
```

### Proposed: Centralized Message Bus
```typescript
// All events go through message bus service
await messageBus.publishJobEvent({
  type: 'job_failed',
  job_id: jobId,
  error: errorMessage,
  workflow_context: workflowData
});
```

### Message Bus Benefits:
- **Event Schema Validation**: Ensures consistent event structure
- **Event Routing**: Smart routing based on event types
- **Event Tracing**: Built-in observability for event flow
- **Delivery Guarantees**: Retry logic and dead letter queues
- **Event Transformation**: Convert between internal/external formats

## Implementation Plan

### Phase 1: Extract Services (Week 1)
1. **Create JobService**
   - Extract job submission logic from API
   - Extract job status update logic
   - Maintain Redis job storage format
   - Add comprehensive job tests

2. **Create WorkflowService** 
   - Extract workflow tracking from API
   - **Remove workflow tracking from webhook service**
   - Implement canonical step_details generation
   - Add workflow completion detection

3. **Create MessageBusService**
   - Wrap Redis pub/sub with type-safe interface
   - Add event schema validation
   - Implement event routing logic
   - Add event tracing/observability

### Phase 2: API Refactor (Week 2)
1. **Refactor HTTP Layer**
   - Update routes to use services
   - Remove business logic from endpoints
   - Add internal API endpoints for service communication
   - Maintain backward compatibility

2. **Add Service Integration**
   - JobService publishes events via MessageBus
   - WorkflowService listens to job events
   - WorkflowService publishes workflow events
   - All events flow through single message bus

### Phase 3: Webhook Service Update (Week 2)
1. **Remove Duplicate Tracking**
   - Delete workflow tracker from webhook service
   - Remove step_details generation from webhook service
   - Update to consume API workflow events only

2. **API Integration**
   - Webhook service calls API internal endpoints
   - API publishes canonical workflow events
   - Webhook service focuses purely on HTTP delivery

### Phase 4: Testing & Validation (Week 3)
1. **Integration Testing**
   - Test complete job→workflow→webhook flow
   - Verify step_details consistency across all endpoints
   - Test error scenarios and edge cases

2. **Performance Testing**
   - Measure latency impact of service calls
   - Optimize high-frequency operations
   - Monitor Redis load patterns

3. **Observability**
   - Add distributed tracing across services
   - Monitor event flow through message bus
   - Track workflow completion metrics

## Event Flow Architecture

### Job Lifecycle with Message Bus
```
1. HTTP Request → API → JobService.submitJob()
2. JobService → MessageBus.publishJobEvent('job_submitted')
3. WorkflowService ← MessageBus (subscribes to job events)
4. WorkflowService.trackJobInWorkflow()
5. Worker processes job → Redis pub/sub → WebhookService
6. WebhookService → API internal endpoint → JobService.updateJobStatus()
7. JobService → MessageBus.publishJobEvent('job_completed')
8. WorkflowService ← MessageBus → checks workflow completion
9. WorkflowService → MessageBus.publishWorkflowEvent('workflow_completed')
10. WebhookService ← MessageBus → sends workflow webhook
```

### Message Bus Event Types
```typescript
// Job events
type JobEvent = 
  | { type: 'job_submitted'; job_id: string; workflow_context?: WorkflowContext }
  | { type: 'job_completed'; job_id: string; result: any; workflow_context?: WorkflowContext }
  | { type: 'job_failed'; job_id: string; error: string; workflow_context?: WorkflowContext }

// Workflow events  
type WorkflowEvent =
  | { type: 'workflow_submitted'; workflow_id: string; total_steps: number }
  | { type: 'workflow_completed'; workflow_id: string; step_details: StepDetail[] }
  | { type: 'workflow_failed'; workflow_id: string; step_details: StepDetail[] }
```

## Data Flow & Ownership

### Single Source of Truth: API Services
```
JobService (Redis: jobs:*)
├── Job state: pending, in_progress, completed, failed
├── Job metadata: priority, payload, requirements
└── Job results: output, errors, timing

WorkflowService (Redis: workflows:*)  
├── Workflow state: step completion tracking
├── Job→workflow mapping: which jobs belong to which workflows
├── Step details: canonical step_details with error fields
└── Workflow events: completion/failure detection
```

### Read-Only Consumers
```
WebhookService
├── Consumes workflow events from MessageBus
├── Calls API for additional workflow data if needed
└── Focuses purely on HTTP webhook delivery

Monitor/Analytics Services
├── Subscribe to events via MessageBus
├── Query API services for current state
└── No direct workflow tracking
```

## Success Metrics

### Code Quality
- [ ] Single place for step_details generation
- [ ] No duplicate workflow tracking code
- [ ] Clear domain boundaries between services
- [ ] Business logic separated from HTTP routing

### Reliability  
- [ ] Consistent step_details across all endpoints
- [ ] No more step_details error field bugs
- [ ] Workflow events always include error information
- [ ] No race conditions between tracking systems

### Performance
- [ ] API response times remain under 100ms
- [ ] Webhook delivery latency stays under 1s
- [ ] Event processing doesn't increase Redis load significantly

### Observability
- [ ] Complete event tracing from job submission to webhook delivery
- [ ] Clear metrics on workflow completion rates
- [ ] Event bus throughput and error monitoring

## Risk Mitigation

### Backward Compatibility
- Maintain existing API endpoints during transition
- Feature flags for new vs old workflow tracking
- Gradual migration of webhook consumers

### Performance Impact
- Monitor API response times during refactor
- Optimize service-to-service communication
- Consider caching for high-frequency operations

### Data Consistency
- Implement transactional updates across job/workflow state
- Add data validation at service boundaries  
- Monitor for state drift between services

## Future Benefits

### Extensibility
- Easy to add new job types without touching HTTP layer
- Workflow logic can evolve independently
- Message bus enables new event consumers

### Testing
- Unit test services in isolation
- Mock service dependencies easily
- Integration test complete flows

### Monitoring
- Service-level metrics and tracing
- Clear ownership for debugging issues
- Event-driven observability

## Next Steps

1. **Create GitHub Issue**: Break down into specific development tasks
2. **Architecture Review**: Get team feedback on service boundaries
3. **Proof of Concept**: Build JobService with simple endpoints
4. **Migration Plan**: Define rollout strategy and rollback procedures

---

*This refactor addresses the immediate workflow tracking duplication issue while setting up better long-term architecture for the API service and event-driven communication.*