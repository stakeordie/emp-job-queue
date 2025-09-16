# RESILIENCE IMPLEMENTATION GUIDE

## Quick Start Implementation

This guide provides concrete steps to implement the resilience solution incrementally without disrupting the existing system.

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Event Store Database Schema

Create the event store tables in the emp-job-queue database:

```sql
-- Migration: 001_add_event_store.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Event Store for workflow events
CREATE TABLE workflow_events (
    id BIGSERIAL PRIMARY KEY,
    workflow_id UUID NOT NULL,
    step_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    source_service VARCHAR(50) NOT NULL,
    correlation_id UUID,
    CONSTRAINT unique_workflow_sequence UNIQUE(workflow_id, sequence_number)
);

-- Outbox for guaranteed delivery
CREATE TABLE event_outbox (
    id BIGSERIAL PRIMARY KEY,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 10,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    destination_service VARCHAR(50)
);

-- Saga state management
CREATE TABLE workflow_sagas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID NOT NULL UNIQUE,
    saga_type VARCHAR(100) NOT NULL,
    current_step INTEGER DEFAULT 0,
    total_steps INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, failed, compensating
    saga_data JSONB NOT NULL,
    compensation_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    timeout_at TIMESTAMP WITH TIME ZONE
);

-- Circuit breaker state
CREATE TABLE circuit_breaker_state (
    id VARCHAR(100) PRIMARY KEY,
    state VARCHAR(20) NOT NULL DEFAULT 'CLOSED', -- CLOSED, OPEN, HALF_OPEN
    failure_count INTEGER DEFAULT 0,
    last_failure_time TIMESTAMP WITH TIME ZONE,
    last_success_time TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dead letter queue
CREATE TABLE dead_letter_queue (
    id BIGSERIAL PRIMARY KEY,
    original_event_id BIGINT REFERENCES workflow_events(id),
    failure_reason TEXT NOT NULL,
    retry_count INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending' -- pending, reviewing, resolved
);

-- Indexes for performance
CREATE INDEX idx_workflow_events_workflow_id ON workflow_events(workflow_id);
CREATE INDEX idx_workflow_events_status_created ON workflow_events(status, created_at);
CREATE INDEX idx_event_outbox_status_retry ON event_outbox(status, next_retry_at);
CREATE INDEX idx_workflow_sagas_status ON workflow_sagas(status);
CREATE INDEX idx_dead_letter_queue_status ON dead_letter_queue(status, created_at);
```

### 1.2 Event Store Service Implementation

Create the core event store service:

```typescript
// packages/core/src/services/event-store.ts
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export interface WorkflowEvent {
  id?: number;
  workflowId: string;
  stepId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  sequenceNumber: number;
  sourceService: string;
  correlationId?: string;
  retryCount?: number;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface OutboxEvent {
  id?: number;
  aggregateId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  retryCount?: number;
  maxRetries?: number;
  nextRetryAt?: Date;
  status?: 'pending' | 'published' | 'failed';
  destinationService: string;
}

export class EventStore {
  constructor(private dbPool: Pool) {}

  async appendEvent(event: WorkflowEvent): Promise<number> {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Insert event
      const eventResult = await client.query(
        `INSERT INTO workflow_events
         (workflow_id, step_id, event_type, event_data, sequence_number, source_service, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          event.workflowId,
          event.stepId,
          event.eventType,
          JSON.stringify(event.eventData),
          event.sequenceNumber,
          event.sourceService,
          event.correlationId
        ]
      );

      const eventId = eventResult.rows[0].id;

      // Add to outbox for reliable delivery
      await client.query(
        `INSERT INTO event_outbox
         (aggregate_id, event_type, event_data, destination_service)
         VALUES ($1, $2, $3, $4)`,
        [
          event.workflowId,
          event.eventType,
          JSON.stringify(event.eventData),
          'all' // Broadcast to all interested services
        ]
      );

      await client.query('COMMIT');
      logger.info(`Event appended: ${event.eventType} for workflow ${event.workflowId}`);

      return eventId;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to append event:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getWorkflowEvents(workflowId: string): Promise<WorkflowEvent[]> {
    const result = await this.dbPool.query(
      `SELECT * FROM workflow_events
       WHERE workflow_id = $1
       ORDER BY sequence_number ASC`,
      [workflowId]
    );

    return result.rows.map(row => ({
      id: row.id,
      workflowId: row.workflow_id,
      stepId: row.step_id,
      eventType: row.event_type,
      eventData: row.event_data,
      sequenceNumber: row.sequence_number,
      sourceService: row.source_service,
      correlationId: row.correlation_id,
      retryCount: row.retry_count,
      status: row.status
    }));
  }

  async markEventProcessed(eventId: number): Promise<void> {
    await this.dbPool.query(
      `UPDATE workflow_events
       SET processed_at = NOW(), status = 'completed'
       WHERE id = $1`,
      [eventId]
    );
  }

  async getUnpublishedOutboxEvents(): Promise<OutboxEvent[]> {
    const result = await this.dbPool.query(
      `SELECT * FROM event_outbox
       WHERE status = 'pending'
       AND (next_retry_at IS NULL OR next_retry_at <= NOW())
       ORDER BY created_at ASC
       LIMIT 100`
    );

    return result.rows.map(row => ({
      id: row.id,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventData: row.event_data,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      status: row.status,
      destinationService: row.destination_service
    }));
  }

  async markOutboxEventPublished(eventId: number): Promise<void> {
    await this.dbPool.query(
      `UPDATE event_outbox
       SET published_at = NOW(), status = 'published'
       WHERE id = $1`,
      [eventId]
    );
  }

  async incrementOutboxRetry(eventId: number, nextRetryAt: Date): Promise<void> {
    await this.dbPool.query(
      `UPDATE event_outbox
       SET retry_count = retry_count + 1, next_retry_at = $2
       WHERE id = $1`,
      [eventId, nextRetryAt]
    );
  }
}
```

### 1.3 Circuit Breaker Implementation

```typescript
// packages/core/src/services/circuit-breaker.ts
import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
}

export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: Date | null = null;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private config: CircuitBreakerConfig,
    private dbPool: Pool
  ) {
    this.loadState();
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        this.halfOpenCalls = 0;
        logger.info(`Circuit breaker ${this.name} moved to HALF_OPEN`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }
    }

    if (this.state === 'HALF_OPEN' && this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
      throw new Error(`Circuit breaker ${this.name} exceeded half-open limit`);
    }

    try {
      const result = await operation();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure();
      throw error;
    }
  }

  private async onSuccess(): Promise<void> {
    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        this.state = 'CLOSED';
        this.failureCount = 0;
        logger.info(`Circuit breaker ${this.name} RECOVERED to CLOSED`);
      }
    } else {
      this.failureCount = 0;
    }
    await this.saveState();
  }

  private async onFailure(): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.state === 'HALF_OPEN' || this.failureCount >= this.config.failureThreshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker ${this.name} OPENED after ${this.failureCount} failures`);
    }

    await this.saveState();
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.recoveryTimeout;
  }

  private async loadState(): Promise<void> {
    try {
      const result = await this.dbPool.query(
        'SELECT * FROM circuit_breaker_state WHERE id = $1',
        [this.name]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        this.state = row.state;
        this.failureCount = row.failure_count;
        this.lastFailureTime = row.last_failure_time;
      }
    } catch (error) {
      logger.error(`Failed to load circuit breaker state for ${this.name}:`, error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await this.dbPool.query(
        `INSERT INTO circuit_breaker_state (id, state, failure_count, last_failure_time, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (id)
         DO UPDATE SET
           state = EXCLUDED.state,
           failure_count = EXCLUDED.failure_count,
           last_failure_time = EXCLUDED.last_failure_time,
           updated_at = NOW()`,
        [this.name, this.state, this.failureCount, this.lastFailureTime]
      );
    } catch (error) {
      logger.error(`Failed to save circuit breaker state for ${this.name}:`, error);
    }
  }
}
```

### 1.4 Outbox Event Publisher

```typescript
// packages/core/src/services/outbox-publisher.ts
import { EventStore } from './event-store.js';
import { logger } from '../utils/logger.js';
import Redis from 'ioredis';

export class OutboxPublisher {
  private isRunning = false;
  private publishInterval: NodeJS.Timeout | null = null;

  constructor(
    private eventStore: EventStore,
    private redis: Redis,
    private intervalMs: number = 5000
  ) {}

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.publishInterval = setInterval(() => {
      this.publishPendingEvents().catch(error => {
        logger.error('Error publishing outbox events:', error);
      });
    }, this.intervalMs);

    logger.info('Outbox publisher started');
  }

  stop(): void {
    this.isRunning = false;
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }
    logger.info('Outbox publisher stopped');
  }

  private async publishPendingEvents(): Promise<void> {
    const events = await this.eventStore.getUnpublishedOutboxEvents();

    for (const event of events) {
      try {
        // Publish to Redis for real-time subscribers
        await this.redis.publish(
          `workflow_events:${event.eventType}`,
          JSON.stringify(event.eventData)
        );

        // Publish to specific service channels if needed
        if (event.destinationService !== 'all') {
          await this.redis.publish(
            `service_events:${event.destinationService}`,
            JSON.stringify(event.eventData)
          );
        }

        await this.eventStore.markOutboxEventPublished(event.id!);
        logger.debug(`Published outbox event ${event.id} of type ${event.eventType}`);

      } catch (error) {
        logger.error(`Failed to publish outbox event ${event.id}:`, error);

        if (event.retryCount! >= event.maxRetries!) {
          // Send to dead letter queue
          logger.warn(`Event ${event.id} exceeded max retries, needs manual intervention`);
          // TODO: Implement dead letter queue logic
        } else {
          // Schedule retry with exponential backoff
          const nextRetryAt = new Date(Date.now() + Math.pow(2, event.retryCount!) * 1000);
          await this.eventStore.incrementOutboxRetry(event.id!, nextRetryAt);
        }
      }
    }
  }
}
```

## Phase 2: Workflow Orchestrator (Weeks 3-4)

### 2.1 Workflow Orchestrator Service

```typescript
// packages/core/src/services/workflow-orchestrator.ts
import { EventStore, WorkflowEvent } from './event-store.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { logger } from '../utils/logger.js';
import { Pool } from 'pg';

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  timeout: number;
  retryPolicy: RetryPolicy;
}

export interface WorkflowStep {
  id: string;
  name: string;
  action: 'api_call' | 'job_submission' | 'wait' | 'condition';
  target: string; // service endpoint or queue name
  input: Record<string, unknown>;
  timeout: number;
  retryPolicy: RetryPolicy;
  compensatingAction?: WorkflowStep;
  condition?: string; // For conditional steps
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface WorkflowInstance {
  id: string;
  workflowDefinitionId: string;
  currentStepIndex: number;
  status: 'running' | 'completed' | 'failed' | 'compensating';
  input: Record<string, unknown>;
  context: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class WorkflowOrchestrator {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(
    private eventStore: EventStore,
    private dbPool: Pool
  ) {}

  async startWorkflow(
    definitionId: string,
    input: Record<string, unknown>
  ): Promise<string> {
    const workflowId = this.generateWorkflowId();

    // Store workflow started event
    await this.eventStore.appendEvent({
      workflowId,
      stepId: 'start',
      eventType: 'workflow_started',
      eventData: {
        definitionId,
        input,
        timestamp: new Date().toISOString()
      },
      sequenceNumber: 1,
      sourceService: 'workflow-orchestrator'
    });

    // Initialize saga state
    await this.initializeSaga(workflowId, definitionId, input);

    // Start first step
    await this.executeNextStep(workflowId);

    return workflowId;
  }

  private async initializeSaga(
    workflowId: string,
    definitionId: string,
    input: Record<string, unknown>
  ): Promise<void> {
    const definition = await this.getWorkflowDefinition(definitionId);

    await this.dbPool.query(
      `INSERT INTO workflow_sagas
       (workflow_id, saga_type, total_steps, saga_data, timeout_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        workflowId,
        definition.name,
        definition.steps.length,
        JSON.stringify({
          definition,
          input,
          context: {}
        }),
        new Date(Date.now() + definition.timeout)
      ]
    );
  }

  async executeNextStep(workflowId: string): Promise<void> {
    const saga = await this.getSagaState(workflowId);
    if (!saga || saga.status !== 'active') {
      logger.warn(`Cannot execute next step for workflow ${workflowId}: invalid state`);
      return;
    }

    const sagaData = saga.saga_data;
    const definition = sagaData.definition as WorkflowDefinition;
    const currentStep = definition.steps[saga.current_step];

    if (!currentStep) {
      // Workflow completed
      await this.completeWorkflow(workflowId);
      return;
    }

    try {
      logger.info(`Executing step ${currentStep.name} for workflow ${workflowId}`);

      // Get or create circuit breaker for this step
      const circuitBreaker = this.getCircuitBreaker(currentStep.target);

      // Execute step through circuit breaker
      const result = await circuitBreaker.execute(async () => {
        return await this.executeStep(workflowId, currentStep, sagaData.context);
      });

      // Update saga state
      await this.updateSagaProgress(workflowId, saga.current_step + 1, {
        ...sagaData.context,
        [`step_${currentStep.id}_result`]: result
      });

      // Store step completed event
      await this.eventStore.appendEvent({
        workflowId,
        stepId: currentStep.id,
        eventType: 'step_completed',
        eventData: {
          stepName: currentStep.name,
          result,
          timestamp: new Date().toISOString()
        },
        sequenceNumber: saga.current_step + 2,
        sourceService: 'workflow-orchestrator'
      });

      // Continue to next step
      setTimeout(() => this.executeNextStep(workflowId), 100);

    } catch (error) {
      logger.error(`Step ${currentStep.name} failed for workflow ${workflowId}:`, error);

      // Check if we should retry
      if (await this.shouldRetryStep(workflowId, currentStep)) {
        await this.scheduleStepRetry(workflowId, currentStep);
      } else {
        await this.handleStepFailure(workflowId, currentStep, error);
      }
    }
  }

  private async executeStep(
    workflowId: string,
    step: WorkflowStep,
    context: Record<string, unknown>
  ): Promise<unknown> {
    switch (step.action) {
      case 'api_call':
        return await this.executeApiCall(workflowId, step, context);
      case 'job_submission':
        return await this.executeJobSubmission(workflowId, step, context);
      case 'wait':
        return await this.executeWait(step);
      case 'condition':
        return await this.evaluateCondition(step, context);
      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }
  }

  private async executeApiCall(
    workflowId: string,
    step: WorkflowStep,
    context: Record<string, unknown>
  ): Promise<unknown> {
    // Prepare request data by merging step input with context
    const requestData = this.mergeInputWithContext(step.input, context);

    const response = await fetch(step.target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workflow-Id': workflowId,
        'X-Step-Id': step.id
      },
      body: JSON.stringify(requestData),
      signal: AbortSignal.timeout(step.timeout)
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  private async executeJobSubmission(
    workflowId: string,
    step: WorkflowStep,
    context: Record<string, unknown>
  ): Promise<unknown> {
    // Submit job to emp-job-queue
    const jobData = this.mergeInputWithContext(step.input, context);

    // Add workflow context to job
    const jobSubmission = {
      ...jobData,
      workflow_id: workflowId,
      workflow_step_id: step.id,
      timeout_minutes: step.timeout / (1000 * 60)
    };

    // Submit via API
    const response = await fetch(`${step.target}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
      },
      body: JSON.stringify(jobSubmission)
    });

    if (!response.ok) {
      throw new Error(`Job submission failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return { jobId: result.job_id };
  }

  private getCircuitBreaker(target: string): CircuitBreaker {
    if (!this.circuitBreakers.has(target)) {
      const circuitBreaker = new CircuitBreaker(
        `workflow_step_${target}`,
        {
          failureThreshold: 5,
          recoveryTimeout: 30000,
          halfOpenMaxCalls: 3
        },
        this.dbPool
      );
      this.circuitBreakers.set(target, circuitBreaker);
    }
    return this.circuitBreakers.get(target)!;
  }

  // Additional helper methods...
  private generateWorkflowId(): string {
    return `wf_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private mergeInputWithContext(
    input: Record<string, unknown>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    // Simple template replacement
    const merged = { ...input };
    for (const [key, value] of Object.entries(merged)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const contextKey = value.slice(2, -2).trim();
        merged[key] = context[contextKey] || value;
      }
    }
    return merged;
  }
}
```

## Phase 3: Integration Points (Weeks 5-6)

### 3.1 Enhanced EmProps OpenAPI Integration

Add resilience to the existing generation handler:

```typescript
// In emprops-open-api/src/routes/generator/v2-resilient.ts
import { WorkflowOrchestrator } from '@emp/core';

export const runResilientCollectionGeneration = (
  storageClient: StorageClient,
  prisma: PrismaClient,
  creditsService: CreditsService,
  openAiApi: OpenAIApi,
  kms: AWS.KMS,
  workflowOrchestrator: WorkflowOrchestrator
) => {
  return async (req: Request, res: Response) => {
    const bodyValidationResult = schema.safeParse(req.body);

    if (!bodyValidationResult.success) {
      return res.status(400).json({
        data: null,
        error: "Invalid request body",
      });
    }

    const userId = req.headers["user_id"] as string;
    const collectionId = req.params.id;
    const variables = bodyValidationResult.data.variables;

    try {
      // Use workflow orchestrator instead of direct GeneratorV2
      const workflowId = await workflowOrchestrator.startWorkflow(
        'collection_generation',
        {
          userId,
          collectionId,
          variables,
          // Include callback URLs for status updates
          statusCallbackUrl: `${process.env.API_BASE_URL}/internal/workflow/status`,
          completionCallbackUrl: `${process.env.API_BASE_URL}/internal/workflow/complete`
        }
      );

      // Create job record with workflow reference
      const jobId = uuid();
      await prisma.job.create({
        data: {
          id: jobId,
          name: `Collection Generation: ${collection?.title || "Untitled"}`,
          description: `Resilient generation job for collection ${collectionId}`,
          status: "pending",
          data: {
            collectionId,
            variables,
            workflowId, // Link to workflow
          },
          user_id: userId,
          job_type: "collection_generation_resilient",
        },
      });

      return res.status(200).json({
        data: {
          jobId,
          workflowId,
          message: "Resilient workflow started"
        },
        error: null,
      });

    } catch (error) {
      logger.error('Failed to start resilient workflow:', error);

      // Fallback to original implementation if workflow orchestrator fails
      logger.warn('Falling back to original generation method');
      return runCollectionGeneration(
        storageClient,
        prisma,
        creditsService,
        openAiApi,
        kms
      )(req, res);
    }
  };
};
```

### 3.2 Mini-App Resilient Client

```typescript
// In emerge-mini-app/lib/services/ResilientWorkflowClient.ts
interface OfflineRequest {
  id: string;
  type: 'workflow_start' | 'status_check';
  data: Record<string, unknown>;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  nextRetryAt: Date;
}

export class ResilientWorkflowClient {
  private offlineQueue: OfflineRequest[] = [];
  private isOnline = true;
  private syncInProgress = false;

  constructor(
    private baseClient: AiGenerationService,
    private storage: Storage = localStorage
  ) {
    this.loadOfflineQueue();
    this.setupConnectivityMonitoring();
    this.startBackgroundSync();
  }

  async triggerGeneration(
    collectionId: string,
    inputVariables: Record<string, unknown>
  ): Promise<{ jobId: string; isOptimistic: boolean }> {
    const requestId = this.generateRequestId();

    // Always create optimistic UI state
    const optimisticJobId = `opt_${requestId}`;
    this.updateOptimisticState(optimisticJobId, 'pending');

    if (this.isOnline) {
      try {
        // Try immediate submission
        const result = await this.baseClient.triggerGeneration(
          collectionId,
          inputVariables
        );

        // Replace optimistic state with real state
        this.replaceOptimisticState(optimisticJobId, result.jobId);

        return { jobId: result.jobId, isOptimistic: false };
      } catch (error) {
        if (this.isRetriableError(error)) {
          // Network/service error - queue for retry
          await this.queueRequest({
            id: requestId,
            type: 'workflow_start',
            data: { collectionId, inputVariables, optimisticJobId },
            retryCount: 0,
            maxRetries: 10,
            createdAt: new Date(),
            nextRetryAt: new Date(Date.now() + 5000) // Retry in 5 seconds
          });

          return { jobId: optimisticJobId, isOptimistic: true };
        } else {
          // Permanent error - fail immediately
          this.failOptimisticState(optimisticJobId, error);
          throw error;
        }
      }
    } else {
      // Offline - queue immediately
      await this.queueRequest({
        id: requestId,
        type: 'workflow_start',
        data: { collectionId, inputVariables, optimisticJobId },
        retryCount: 0,
        maxRetries: 10,
        createdAt: new Date(),
        nextRetryAt: new Date() // Retry when online
      });

      return { jobId: optimisticJobId, isOptimistic: true };
    }
  }

  async checkJobStatus(jobId: string): Promise<JobStatusData> {
    if (jobId.startsWith('opt_')) {
      // Return optimistic state
      return this.getOptimisticState(jobId);
    }

    if (this.isOnline) {
      try {
        return await this.baseClient.checkJobStatus(jobId);
      } catch (error) {
        if (this.isRetriableError(error)) {
          // Queue status check for retry
          await this.queueRequest({
            id: this.generateRequestId(),
            type: 'status_check',
            data: { jobId },
            retryCount: 0,
            maxRetries: 5,
            createdAt: new Date(),
            nextRetryAt: new Date(Date.now() + 2000)
          });
        }

        // Return cached state if available
        return this.getCachedJobState(jobId) || this.createErrorState(jobId, error);
      }
    } else {
      // Return cached state
      return this.getCachedJobState(jobId) || this.createOfflineState(jobId);
    }
  }

  private async queueRequest(request: OfflineRequest): Promise<void> {
    this.offlineQueue.push(request);
    await this.saveOfflineQueue();

    // Trigger immediate sync if online
    if (this.isOnline && !this.syncInProgress) {
      setTimeout(() => this.syncOfflineRequests(), 0);
    }
  }

  private async syncOfflineRequests(): Promise<void> {
    if (this.syncInProgress || !this.isOnline) return;

    this.syncInProgress = true;
    const now = new Date();

    try {
      const readyRequests = this.offlineQueue.filter(
        req => req.nextRetryAt <= now && req.retryCount < req.maxRetries
      );

      for (const request of readyRequests) {
        try {
          await this.processOfflineRequest(request);
          // Remove successful request
          this.removeFromQueue(request.id);
        } catch (error) {
          // Increment retry and reschedule
          request.retryCount++;
          request.nextRetryAt = new Date(
            now.getTime() + Math.pow(2, request.retryCount) * 1000
          );

          if (request.retryCount >= request.maxRetries) {
            // Move to failed state
            this.handlePermanentFailure(request, error);
            this.removeFromQueue(request.id);
          }
        }
      }

      await this.saveOfflineQueue();
    } finally {
      this.syncInProgress = false;
    }
  }

  private async processOfflineRequest(request: OfflineRequest): Promise<void> {
    switch (request.type) {
      case 'workflow_start':
        const result = await this.baseClient.triggerGeneration(
          request.data.collectionId as string,
          request.data.inputVariables as Record<string, unknown>
        );

        // Update optimistic state with real job ID
        this.replaceOptimisticState(
          request.data.optimisticJobId as string,
          result.jobId
        );
        break;

      case 'status_check':
        const status = await this.baseClient.checkJobStatus(
          request.data.jobId as string
        );
        this.updateCachedJobState(request.data.jobId as string, status);
        break;
    }
  }

  private setupConnectivityMonitoring(): void {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncOfflineRequests();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Periodic connectivity check
    setInterval(async () => {
      try {
        await fetch('/api/health', {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        });
        if (!this.isOnline) {
          this.isOnline = true;
          this.syncOfflineRequests();
        }
      } catch {
        this.isOnline = false;
      }
    }, 30000);
  }

  private startBackgroundSync(): void {
    // Periodic sync every 10 seconds
    setInterval(() => {
      if (this.isOnline) {
        this.syncOfflineRequests();
      }
    }, 10000);
  }

  private isRetriableError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('network') ||
             error.message.includes('timeout') ||
             error.message.includes('503') ||
             error.message.includes('502') ||
             error.message.includes('500');
    }
    return false;
  }

  // Storage methods for persistence
  private loadOfflineQueue(): void {
    try {
      const stored = this.storage.getItem('resilient_workflow_queue');
      if (stored) {
        this.offlineQueue = JSON.parse(stored).map((req: any) => ({
          ...req,
          createdAt: new Date(req.createdAt),
          nextRetryAt: new Date(req.nextRetryAt)
        }));
      }
    } catch (error) {
      console.warn('Failed to load offline queue:', error);
      this.offlineQueue = [];
    }
  }

  private async saveOfflineQueue(): Promise<void> {
    try {
      this.storage.setItem(
        'resilient_workflow_queue',
        JSON.stringify(this.offlineQueue)
      );
    } catch (error) {
      console.warn('Failed to save offline queue:', error);
    }
  }

  // Additional helper methods for state management...
}
```

## Deployment Strategy

### Rolling Deployment Plan

1. **Week 1**: Deploy event store and circuit breakers alongside existing system
2. **Week 2**: Deploy workflow orchestrator as optional feature (feature flag)
3. **Week 3**: Deploy resilient OpenAPI endpoints alongside existing ones
4. **Week 4**: Deploy resilient mini-app client with fallback to original
5. **Week 5**: Gradual traffic migration using feature flags
6. **Week 6**: Full migration and monitoring

### Feature Flags Configuration

```typescript
// Feature flags for gradual rollout
interface FeatureFlags {
  useResilientWorkflows: boolean;
  useCircuitBreakers: boolean;
  useOfflineQueue: boolean;
  fallbackToOriginal: boolean;
}

// Environment-based feature flags
const FEATURE_FLAGS: FeatureFlags = {
  useResilientWorkflows: process.env.ENABLE_RESILIENT_WORKFLOWS === 'true',
  useCircuitBreakers: process.env.ENABLE_CIRCUIT_BREAKERS === 'true',
  useOfflineQueue: process.env.ENABLE_OFFLINE_QUEUE === 'true',
  fallbackToOriginal: process.env.FALLBACK_TO_ORIGINAL !== 'false',
};
```

This implementation guide provides concrete, incremental steps to add resilience without disrupting the existing system. Each phase can be deployed independently with feature flags controlling the rollout.