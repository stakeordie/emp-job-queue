# Phase 1: Action Plan

## Overview

This plan addresses 448 terminology issues across 98 files.

## Recommended Migration Sequence

### Step 1: Core Type Definitions (CRITICAL)

Update these files first as they define the base types:

- [ ] `packages/core/src/types/job.ts`
- [ ] `packages/core/src/types/worker.ts`
- [ ] `packages/core/src/interfaces/*.ts`

### Step 2: Redis Key Patterns (HIGH PRIORITY)

Update Redis key generation and pattern matching:

- [ ] `packages/core/src/redis-service.ts`
- [ ] `packages/core/src/redis-functions/*.lua`
- [ ] `apps/worker/src/redis-direct-worker-client.ts`

### Step 3: Service Implementations (MEDIUM PRIORITY)

Update service layer implementations:

- [ ] API server job handling
- [ ] Worker job claiming and processing
- [ ] Webhook service job notifications
- [ ] Monitor UI job display

### Step 4: Tests and Documentation (LOW PRIORITY)

Update tests and documentation:

- [ ] Unit tests
- [ ] Integration tests
- [ ] API documentation
- [ ] README files

## File-by-File Checklist

### `apps/api/src/lightweight-api-server.ts` (25 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'jobId'
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'step:' for worker processing units
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/redis-functions/__tests__/integration.test.ts` (22 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'step:' for worker processing units
- [ ] Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/redis-functions/__tests__/integration.test.ts` (22 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'step:' for worker processing units
- [ ] Check if should be 'stepId'

### `apps/worker/src/connectors/protocol/websocket-connector.ts` (21 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/asset-saver-retry-suffix.test.ts` (14 issues)

- [ ] Check if should be 'stepId'

### `apps/monitor/src/services/jobForensics.ts` (13 issues)

- [ ] Check if should be 'job:' for user requests
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'step:' for worker processing units
- [ ] Check if should be 'stepId:'

### `apps/worker/src/redis-direct-worker-client.ts` (11 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/workflow-aware-attestations.test.ts` (11 issues)

- [ ] Check if should be 'job:' for user requests
- [ ] Check if should be 'step:' for worker processing units
- [ ] Check if should be 'stepId:'

### `packages/core/src/redis-service.ts` (10 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/redis-service.ts` (10 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/job-broker.ts` (9 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/interfaces/redis-service.ts` (9 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/src/hybrid-client.ts` (9 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/job-broker.ts` (9 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/redis-service.ts` (9 issues)

- [ ] Check if should be 'stepId:'

### `apps/telemetry-collector/src/__tests__/workflow-span-validation.test.ts` (8 issues)

- [ ] Check if should be '.jobId'
- [ ] Check if should be '.stepId'
- [ ] Check if should be 'step:' for worker processing units

### `packages/core/src/telemetry/connector-logger.ts` (7 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/telemetry/message-bus.ts` (7 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/services/event-broadcaster.ts` (7 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/monitor-api-compatibility.test.ts` (7 issues)

- [ ] Check if should be 'job:' for user requests
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/telemetry/connector-logger.ts` (7 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/telemetry/message-bus.ts` (7 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/services/event-broadcaster.ts` (7 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/monitor/src/store/index.ts` (7 issues)

- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId:'

### `packages/core/src/services/webhook-notification-service.ts` (6 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/services/webhook-notification-service.ts` (6 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/monitor/src/app/webhook-monitor/[webhookId]/page.tsx` (6 issues)

- [ ] Check if should be '.jobId'
- [ ] Check if should be '.stepId'
- [ ] Check if should be 'jobId'

### `apps/worker/src/redis-direct-base-worker.ts` (5 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/mocks/error-case-cli.ts` (5 issues)

- [ ] Check if should be '.stepId'

### `apps/worker/src/connectors/simulation-websocket-connector.ts` (5 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/telemetry-collector/src/__tests__/event-client-redis.integration.test.ts` (5 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId'

### `apps/monitor/src/components/JobForensics.tsx` (5 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `packages/core/src/workflow-telemetry.ts` (4 issues)

- [ ] Check if should be '.jobId'
- [ ] Check if should be '.stepId'

### `packages/core/src/connection-manager.ts` (4 issues)

- [ ] Check if should be 'stepId:'

### `packages/core/src/interfaces/connection-manager.ts` (4 issues)

- [ ] Check if should be 'stepId:'

### `packages/core/src/interfaces/job-broker.ts` (4 issues)

- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/job-health-monitor.ts` (4 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/mocks/base-progressive-mock.ts` (4 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/failure-attestation.test.ts` (4 issues)

- [ ] Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/workflow-telemetry.ts` (4 issues)

- [ ] Check if should be '.jobId'
- [ ] Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/connection-manager.ts` (4 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/connection-manager.ts` (4 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/job-broker.ts` (4 issues)

- [ ] Check if should be 'jobId:'
- [ ] Check if should be 'stepId:'

### `packages/core/src/enhanced-message-handler.ts` (3 issues)

- [ ] Check if should be 'stepId'

### `packages/core/src/message-handler.ts` (3 issues)

- [ ] Check if should be 'stepId'

### `packages/core/src/types/connector.ts` (3 issues)

- [ ] Check if should be 'stepId:'
- [ ] Should be 'StepProgress'
- [ ] Should be 'StepResult'

### `packages/core/src/types/job.ts` (3 issues)

- [ ] Should be 'Step' - worker processing unit
- [ ] Should be 'StepProgress'
- [ ] Should be 'StepResult'

### `apps/worker/src/connectors/base-connector.ts` (3 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/failure-classification.test.ts` (3 issues)

- [ ] Check if should be 'job:' for user requests
- [ ] Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/enhanced-message-handler.ts` (3 issues)

- [ ] Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/message-handler.ts` (3 issues)

- [ ] Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/types/connector.ts` (3 issues)

- [ ] Check if should be 'stepId:'
- [ ] Should be 'StepProgress'
- [ ] Should be 'StepResult'

### `apps/api/.workspace-packages/core/src/types/job.ts` (3 issues)

- [ ] Should be 'Step' - worker processing unit
- [ ] Should be 'StepProgress'
- [ ] Should be 'StepResult'

### `packages/core/src/types/messages.ts` (2 issues)

- [ ] Should be 'Step' - worker processing unit
- [ ] Should be 'StepResult'

### `packages/core/src/telemetry/event-client.ts` (2 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-base-connector.ts` (2 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/rest-async-connector.ts` (2 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/comfyui-websocket-connector.ts` (2 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/__tests__/comprehensive-failure-attestation.test.ts` (2 issues)

- [ ] Check if should be 'stepId'

### `apps/worker/src/__tests__/unit-retry-suffix.test.ts` (2 issues)

- [ ] Check if should be 'stepId'
- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/protocol/http-connector.ts` (2 issues)

- [ ] Check if should be 'stepId:'

### `apps/telemetry-collector/src/event-processor.ts` (2 issues)

- [ ] Check if should be '.stepId'

### `apps/telemetry-collector/src/redis-to-otlp-bridge.ts` (2 issues)

- [ ] Check if should be '.stepId'

### `apps/telemetry-collector/src/dash0-forwarder.ts` (2 issues)

- [ ] Check if should be '.stepId'

### `apps/telemetry-collector/src/__tests__/format-conversion.test.ts` (2 issues)

- [ ] Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/types/messages.ts` (2 issues)

- [ ] Should be 'Step' - worker processing unit
- [ ] Should be 'StepResult'

### `apps/api/.workspace-packages/core/src/telemetry/event-client.ts` (2 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId:'

### `apps/monitor/src/__tests__/attestation-system-integration.test.ts` (2 issues)

- [ ] Check if should be 'jobId'
- [ ] Check if should be 'stepId'

### `apps/monitor/src/app/api/workflow-debug/[workflowId]/route.ts` (2 issues)

- [ ] Check if should be 'step:' for worker processing units

### `apps/monitor/src/app/api/jobs/[jobId]/retry/route.ts` (2 issues)

- [ ] Check if should be '.stepId'
- [ ] Check if should be 'stepId'

### `apps/monitor/src/app/page.tsx` (2 issues)

- [ ] Check if should be 'stepId:'

### `packages/core/src/redis-functions/installer.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `packages/core/src/utils/redis-operations.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `packages/core/src/log-interpretation/enhanced-progress-callback.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `packages/database/src/operations.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/mocks/error-case-recorder.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `apps/worker/src/connectors/simulation-http-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/mock-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/rest-sync-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/comfyui-health-example.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/simulation-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/streaming-mixin.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `apps/worker/src/connectors/limited-service-example.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-responses-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/asset-saver.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `apps/worker/src/connectors/openai-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-text-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/connectors/a1111-websocket-connector.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/examples/logging-integration-example.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/worker/src/telemetry/worker-tracer.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/src/test-workflow-telemetry.ts` (1 issues)

- [ ] Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/redis-functions/installer.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/utils/redis-operations.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/log-interpretation/enhanced-progress-callback.ts` (1 issues)

- [ ] Check if should be '.stepId'

### `apps/monitor/src/types/forensics.ts` (1 issues)

- [ ] Check if should be 'stepId:'

### `apps/monitor/src/types/job.ts` (1 issues)

- [ ] Should be 'Step' - worker processing unit

### `apps/monitor/src/app/api/workflows/[workflowId]/all-attestations/route.ts` (1 issues)

- [ ] Check if should be 'stepId'

### `apps/monitor/src/components/SimpleWorkerCard.tsx` (1 issues)

- [ ] Check if should be 'stepId:'

