# Comprehensive Codebase Modernization Plan: API Refactor + EmProps Integration + Cleanup

**Date**: 2025-08-25  
**Status**: Planning  
**Priority**: High  

## Overview

This plan combines three critical initiatives into a single, coordinated modernization effort:

1. **API Service Refactor**: Domain separation & workflow consolidation (from 2025-08-20 plan)
2. **EmProps Integration**: Migrate EmProps Open API & PostgreSQL database to monorepo
3. **Codebase Cleanup**: Remove unused files, stale logs, dead code, and technical debt

## Strategic Approach

### Why Combine These Initiatives?

**Architectural Synergy**: 
- **Cleanup enables refactor**: Remove dead code/dependencies before extracting services
- **Refactor enables integration**: Clean service boundaries make EmProps integration safer
- **Integration validates architecture**: Cross-service communication tests the new design
- Single coordinated effort minimizes disruption vs. three separate initiatives

**Dependency Chain**:
```mermaid
graph LR
    A[Cleanup] -->|Removes blockers| B[API Refactor]
    B -->|Creates boundaries| C[EmProps Integration]
    
    A1[Remove dead workflow code] --> B1[Extract WorkflowService cleanly]
    A2[Archive conflict logs] --> B2[Clear development workspace]  
    A3[Delete security risks] --> B3[Safe codebase for team work]
    
    B1 --> C1[EmProps integrates via clean APIs]
    B2 --> C2[No build conflicts during migration]
    B3 --> C3[Secure integrated system]
```

**Critical Cleanup-First Dependencies**:
- **Dead workflow code** → Must remove before extracting WorkflowService
- **Conflicting dependencies** → Must resolve before EmProps package.json merge  
- **Security files** (jwt.txt) → Must delete before team collaboration
- **Build artifacts** → Must clean before new build system integration

## Phase Overview

```mermaid
gantt
    title Comprehensive Modernization Timeline
    dateFormat  YYYY-MM-DD
    section Phase 1: Foundation
    Cleanup Analysis & Planning     :2025-08-26, 3d
    API Service Extraction         :2025-08-29, 4d
    section Phase 2: Integration
    EmProps Migration Prep         :2025-09-02, 3d
    Message Bus Implementation     :2025-09-05, 4d
    section Phase 3: Migration
    EmProps API Integration        :2025-09-09, 5d
    PostgreSQL Integration         :2025-09-16, 3d
    section Phase 4: Consolidation
    Service Integration            :2025-09-19, 4d
    Final Cleanup & Testing        :2025-09-23, 3d
```

## Phase 1: Foundation & API Service Refactor (Week 1)

### Day 1-2: Foundation Cleanup (Enables Everything Else)

**Why Cleanup Goes First**: Cleanup isn't separate from the other initiatives - it's the prerequisite that makes them possible without conflicts.

#### **Immediate Cleanup (Day 1 Morning)**
```bash
# Log files cleanup
find . -name "*.log" -type f -size +1M  # Large log files
find . -name "*.log" -mtime +30          # Old log files

# Unused dependencies audit
pnpm audit --audit-level high           # Security vulnerabilities
npx depcheck                            # Unused dependencies per package

# Dead code detection
find . -name "*.ts.remove" -o -name "*.backup" -o -name "*_old.*"
find . -name "node_modules" -prune -o -name "*.ts" -exec grep -l "TODO: REMOVE" {} \;
```

#### **Cleanup Categories Identified**

**A. Log Files** (Immediate cleanup)
```
logs/
├── api-prod-redis.log        # 45MB - Archive or delete
├── machine.log               # 23MB - Archive or delete  
├── worker-local.log          # 12MB - Archive or delete
├── monitorEventStream.log    # 8MB  - Archive or delete
└── [15+ other log files]     # Various sizes
```

**B. Backup/Archive Files**
```
backups/parallel-system-removal-20250727-171329/  # Old system backups
apps/api/src/lightweight-api-server.ts.remove     # Dead code
dockerfile-archive/                                # Old dockerfiles
scripts/archive/                                   # Old scripts
```

**C. Configuration Debris**
```
nohup.out                    # Process output file
dump.rdb                     # Redis dump file
jwt.txt                      # Credential file (security risk)
```

**D. Unused Dependencies** (Per package audit needed)
- Duplicate TypeScript configs
- Unused test utilities  
- Orphaned build artifacts
- Stale environment files

```bash
# Critical blockers that must be removed before anything else
rm -f jwt.txt nohup.out dump.rdb                    # Security risks
rm -rf backups/parallel-system-removal-20250727-171329/  # Confusing old code
rm -rf dockerfile-archive/ scripts/archive/              # Dead build artifacts
find . -name "*.remove" -delete                          # Obviously dead code

# Archive logs but don't delete (might need for debugging)
mkdir -p logs/archive/$(date +%Y%m%d)
find logs/ -name "*.log" -size +5M -exec mv {} logs/archive/$(date +%Y%m%d)/ \;
```

#### **Strategic Cleanup (Day 1 Afternoon)**
```bash
# These cleanup steps directly enable API refactor
# Remove conflicting dependencies that would block service extraction
for app in apps/*; do
  cd "$app"
  npx depcheck --json > ../cleanup-analysis/$app-unused-deps.json
  cd ../..
done

# Identify and document (don't fix yet) dependency conflicts
echo "apps/api dependencies:" > dependency-analysis.md
pnpm list --filter=@emp/api >> dependency-analysis.md
echo "apps/webhook-service dependencies:" >> dependency-analysis.md  
pnpm list --filter=webhook-service >> dependency-analysis.md

# Clean dead workflow tracking code that will conflict with refactor
grep -r "workflowTracker" apps/webhook-service/src/ || echo "✅ No duplicate tracking found"
```

#### **Cleanup Throughout Implementation (Continuous)**

**During API Refactor (Days 3-6)**:
```typescript
// As we extract services, remove dead code immediately
// OLD: apps/api/src/lightweight-api-server.ts
- const workflowStepDetails = this.generateStepDetails(); // ❌ DELETE when WorkflowService created
- private duplicateWorkflowLogic() { }                    // ❌ DELETE when extracted

// NEW: Clean service boundaries
+ // Moved to apps/api/src/services/workflow-service.ts ✅ 
```

**During EmProps Migration (Phase 3)**:
```bash
# Clean up EmProps source after migration
rm -rf /Users/the_dusky/code/emprops/emprops-open-api/  # After successful migration
```

#### **Why This Cleanup Strategy Works**

**Day 1**: Remove blockers and security risks that would interfere
- Dead code that creates confusion during refactoring
- Log files that slow down IDE and searches  
- Security risks that can't wait for later phases

**Day 1-2**: Analyze conflicts before they block progress
- Dependency conflicts between apps/api and emprops-open-api
- Duplicate code patterns that need coordination during refactor
- Configuration conflicts that would complicate integration

**Throughout Implementation**: Clean as we go
- Remove old code immediately when new code replaces it
- Don't accumulate technical debt during the modernization
- Keep the workspace clean to maintain developer velocity

### Day 3-6: API Service Refactor Implementation

Following the 2025-08-20 API Service Refactor Plan:

#### **Day 3: Extract Services**
```typescript
// Create new service layer
apps/api/src/services/
├── job-service.ts           # Job lifecycle management
├── workflow-service.ts      # Workflow orchestration (SINGLE SOURCE)  
└── message-bus-service.ts   # Event distribution
```

**JobService Implementation**
```typescript
export class JobService {
  constructor(
    private redisService: RedisService,
    private messageBus: MessageBusService
  ) {}

  async submitJob(jobData: JobSubmissionRequest): Promise<Job> {
    const job = await this.redisService.submitJob(jobData);
    
    // Publish through message bus instead of direct Redis
    await this.messageBus.publishJobEvent({
      type: 'job_submitted',
      job_id: job.id,
      workflow_context: job.workflow_id ? {
        workflow_id: job.workflow_id,
        step_number: job.step_number,
        total_steps: job.total_steps
      } : undefined
    });
    
    return job;
  }
  
  async updateJobStatus(
    jobId: string, 
    status: JobStatus, 
    result?: any, 
    error?: string
  ): Promise<void> {
    await this.redisService.updateJobStatus(jobId, status, result, error);
    
    // Single event publication point
    if (status === 'completed') {
      await this.messageBus.publishJobEvent({
        type: 'job_completed',
        job_id: jobId,
        result,
        workflow_context: await this.getWorkflowContext(jobId)
      });
    }
    
    if (status === 'failed') {
      await this.messageBus.publishJobEvent({
        type: 'job_failed',
        job_id: jobId,
        error,
        workflow_context: await this.getWorkflowContext(jobId)
      });
    }
  }
}
```

#### **Day 4: Extract Workflow Service**
**Critical: Remove duplicate tracking from webhook service**

```typescript
export class WorkflowService {
  constructor(
    private redisService: RedisService,
    private messageBus: MessageBusService
  ) {
    // Subscribe to job events from message bus
    this.messageBus.subscribe('job_completed', this.onJobCompleted.bind(this));
    this.messageBus.subscribe('job_failed', this.onJobFailed.bind(this));
  }

  // SINGLE SOURCE OF TRUTH for workflow state
  private workflowTracker = new Map<string, WorkflowState>();

  async onJobCompleted(event: JobCompletedEvent): Promise<void> {
    if (!event.workflow_context) return;

    const { workflow_id, step_number, total_steps } = event.workflow_context;
    const workflow = this.getOrCreateWorkflow(workflow_id, total_steps);
    
    workflow.completedSteps.add(step_number);
    
    // Check for completion using CANONICAL logic
    if (this.isWorkflowComplete(workflow)) {
      await this.publishWorkflowCompletion(workflow_id);
    }
  }

  // CANONICAL step_details generation (no more duplication!)
  private async generateStepDetails(workflowId: string): Promise<StepDetail[]> {
    const workflow = this.workflowTracker.get(workflowId);
    if (!workflow) return [];

    return Array.from(workflow.steps.entries()).map(([stepNum, jobId]) => ({
      step_number: stepNum,
      job_id: jobId,
      status: workflow.completedSteps.has(stepNum) ? 'completed' : 
              workflow.failedSteps.has(stepNum) ? 'failed' : 'pending',
      // ALWAYS include error field when step failed
      error: workflow.stepErrors.get(stepNum) || undefined
    }));
  }
}
```

#### **Day 5: Message Bus Implementation**
```typescript
export class MessageBusService {
  constructor(private redisClient: Redis) {}

  async publishJobEvent(event: JobEvent): Promise<void> {
    // Schema validation
    const validatedEvent = JobEventSchema.parse(event);
    
    // Add tracing context
    const tracedEvent = {
      ...validatedEvent,
      timestamp: Date.now(),
      trace_id: this.generateTraceId()
    };

    // Publish with guaranteed delivery
    await this.redisClient.publish(
      `job_events:${event.type}`, 
      JSON.stringify(tracedEvent)
    );

    // Log for observability
    logger.info(`Published job event: ${event.type}`, { 
      job_id: event.job_id,
      trace_id: tracedEvent.trace_id 
    });
  }

  async publishWorkflowEvent(event: WorkflowEvent): Promise<void> {
    // Similar implementation with workflow event schema
    const validatedEvent = WorkflowEventSchema.parse(event);
    
    await this.redisClient.publish(
      `workflow_events:${event.type}`,
      JSON.stringify({
        ...validatedEvent,
        timestamp: Date.now(),
        trace_id: this.generateTraceId()
      })
    );
  }
}
```

#### **Day 6: Update Webhook Service**
**Remove duplicate workflow tracking entirely**

```typescript
// OLD: Webhook service had its own workflow tracker (REMOVE THIS)
// private workflowTracker = new Map<string, WorkflowState>();  ❌ DELETE

export class WebhookNotificationService extends EventEmitter {
  constructor(
    private redisClient: Redis,
    private empropsApiUrl: string,
    private empropsApiKey?: string
  ) {
    super();
    
    // Subscribe ONLY to canonical workflow events from API
    this.messageBus.subscribe('workflow_completed', this.onWorkflowCompleted.bind(this));
    this.messageBus.subscribe('workflow_failed', this.onWorkflowFailed.bind(this));
  }

  // Consume canonical events (no more step_details generation here)
  private async onWorkflowCompleted(event: WorkflowCompletedEvent): Promise<void> {
    // Event already contains CANONICAL step_details from WorkflowService
    const webhooks = this.findMatchingWebhooksForEventType('workflow_completed');
    
    for (const webhook of webhooks) {
      const payload: WebhookPayload = {
        event_type: 'workflow_completed',
        event_id: this.generateId(),
        timestamp: event.timestamp,
        webhook_id: webhook.id,
        data: {
          workflow_id: event.workflow_id,
          step_details: event.step_details,  // From API WorkflowService
          success: true,
          total_steps: event.total_steps,
          completed_steps: event.completed_steps,
          // Enhanced with EMPROPS data if available
          outputs: await this.fetchEmpropsOutputs(event.workflow_id)
        }
      };
      
      this.queueDelivery(payload);
    }
  }
}
```

## Phase 2: EmProps Integration Preparation (Week 2)

### Day 7-9: EmProps Migration Preparation

#### **Day 7: Dependency Analysis & Conversion Planning**

**Package Manager Migration Strategy**
```bash
# Analyze EmProps dependencies vs monorepo
cd /Users/the_dusky/code/emprops/emprops-open-api
npm list --depth=0 > emprops-deps.txt

cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue  
pnpm list --depth=0 > monorepo-deps.txt

# Identify conflicts
diff emprops-deps.txt monorepo-deps.txt
```

**Critical Dependency Conflicts to Resolve**
```json
{
  "conflicts": {
    "typescript": {
      "emprops": "^5.0.4",
      "monorepo": "^5.0.0",
      "resolution": "upgrade monorepo to 5.0.4"
    },
    "express": {
      "emprops": "^4.21.1", 
      "monorepo": "none",
      "resolution": "add to monorepo root"
    },
    "prisma": {
      "emprops": "^6.3.1",
      "monorepo": "none", 
      "resolution": "add as workspace package"
    }
  }
}
```

#### **Day 8: Database Integration Planning**

**PostgreSQL Integration Strategy**
```yaml
# Add to docker-compose.yml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: emprops_dev
      POSTGRES_USER: emprops
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./packages/emprops-db/migrations:/docker-entrypoint-initdb.d

volumes:
  postgres_data:
```

**Database Package Structure**
```
packages/emprops-db/
├── package.json
├── prisma/
│   ├── schema.prisma      # Migrated from emprops-open-api
│   └── migrations/        # All existing migrations
├── src/
│   ├── client.ts          # Prisma client exports
│   ├── types.ts           # Generated types for monorepo
│   └── utils.ts           # Database utilities
└── scripts/
    ├── migrate.ts         # Migration runner
    ├── seed.ts            # Data seeding
    └── reset.ts           # Development reset
```

#### **Day 9: Service Architecture Planning**

**Updated Monorepo Structure**
```
apps/
├── api/                   # Refactored job queue API
├── emprops-api/          # Migrated EmProps API  
├── monitor/              # Job queue monitoring
├── webhook-service/      # Refactored webhook service
└── worker/               # Job workers

packages/
├── core/                 # Shared job queue types
├── emprops-db/          # PostgreSQL database package
├── emprops-shared/      # Shared EmProps types/utils
└── message-bus/         # Event system (extracted from core)
```

### Day 10-13: Message Bus & Integration Layer

#### **Day 10-11: Extract Message Bus Package**
```typescript
// packages/message-bus/src/index.ts
export class MessageBus {
  constructor(
    private redisClient: Redis,
    private config: MessageBusConfig
  ) {}

  // Type-safe event publishing
  async publishJobEvent<T extends JobEvent>(event: T): Promise<void>
  async publishWorkflowEvent<T extends WorkflowEvent>(event: T): Promise<void>
  async publishEmpropsEvent<T extends EmpropsEvent>(event: T): Promise<void>

  // Event routing and transformation
  private routeEvent(event: Event): string[]
  private transformForConsumer(event: Event, consumer: string): Event
}

// Event schema definitions
export const EventSchemas = {
  job: z.union([JobSubmittedSchema, JobCompletedSchema, JobFailedSchema]),
  workflow: z.union([WorkflowSubmittedSchema, WorkflowCompletedSchema]),
  emprops: z.union([CollectionCreatedSchema, WorkflowGeneratedSchema])
};
```

#### **Day 12-13: Cross-Service Communication Design**
```typescript
// Service communication patterns
interface ServiceCommunication {
  // Job Queue → EmProps API
  onWorkflowCompleted(workflowId: string): Promise<EmpropsCollection>
  
  // EmProps API → Job Queue  
  submitWorkflowJob(collectionConfig: CollectionConfig): Promise<Job>
  
  // Shared event types
  type CrossServiceEvent = 
    | { type: 'collection_generated'; collection_id: string; workflow_results: any[] }
    | { type: 'workflow_requested'; collection_id: string; generation_params: any }
}
```

## Phase 3: EmProps Migration Implementation (Week 3-4)

### Day 14-18: EmProps API Migration

#### **Day 14: Create EmProps API Package**
```bash
# Copy and adapt EmProps API
cp -r /Users/the_dusky/code/emprops/emprops-open-api apps/emprops-api/

cd apps/emprops-api/

# Convert package.json to pnpm workspace format  
cat > package.json << EOF
{
  "name": "@emp/emprops-api",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "nodemon --exec tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@emp/emprops-db": "workspace:*",
    "@emp/emprops-shared": "workspace:*", 
    "@emp/message-bus": "workspace:*",
    // ... other dependencies
  }
}
EOF
```

#### **Day 15-16: Database Package Creation**
```bash
# Create database package
mkdir -p packages/emprops-db/

# Move and adapt Prisma schema
cp apps/emprops-api/prisma/schema.prisma packages/emprops-db/prisma/
cp -r apps/emprops-api/prisma/migrations packages/emprops-db/prisma/

# Create database package
cat > packages/emprops-db/package.json << EOF
{
  "name": "@emp/emprops-db", 
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc && pnpm prisma:generate",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate deploy", 
    "prisma:reset": "prisma migrate reset",
    "prisma:seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@prisma/client": "^6.3.1",
    "prisma": "^6.3.1"
  }
}
EOF
```

**Database Client Export**
```typescript
// packages/emprops-db/src/index.ts
export { PrismaClient } from '@prisma/client';
export * from './types';
export * from './utils';

// Re-export generated types for IDE support
export type {
  Collection,
  Project, 
  Workflow,
  Job as EmpropsJob, // Avoid conflict with job queue Job type
  // ... other generated types
} from '@prisma/client';

// Database utilities
export const createDbClient = () => {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });
};
```

#### **Day 17-18: Service Integration**
```typescript
// apps/emprops-api/src/services/workflow-job-service.ts
import { MessageBus } from '@emp/message-bus';
import { JobService } from '@emp/api/services';

export class WorkflowJobService {
  constructor(
    private messageBus: MessageBus,
    private jobQueueApi: JobService  // Cross-service communication
  ) {}

  async submitCollectionWorkflow(
    collectionId: string,
    workflowConfig: CollectionWorkflowConfig
  ): Promise<string> {
    // Create workflow in EmProps DB
    const workflow = await this.db.workflow.create({
      data: {
        collection_id: collectionId,
        config: workflowConfig,
        status: 'pending'
      }
    });

    // Submit jobs to job queue system
    const jobs = await Promise.all(
      workflowConfig.steps.map(async (step, index) => {
        return await this.jobQueueApi.submitJob({
          service_required: step.service,
          payload: step.params,
          workflow_id: workflow.id,
          step_number: index + 1,
          total_steps: workflowConfig.steps.length,
          priority: workflowConfig.priority || 50
        });
      })
    );

    // Listen for workflow completion
    await this.messageBus.subscribe(
      'workflow_completed', 
      this.onWorkflowCompleted.bind(this)
    );

    return workflow.id;
  }

  private async onWorkflowCompleted(event: WorkflowCompletedEvent): Promise<void> {
    // Update EmProps database with results
    await this.db.workflow.update({
      where: { id: event.workflow_id },
      data: { 
        status: 'completed',
        results: event.step_details,
        completed_at: new Date()
      }
    });

    // Generate final collection outputs
    await this.generateCollectionOutputs(event.workflow_id);
  }
}
```

### Day 19-21: PostgreSQL Integration

#### **Day 19: Environment & Configuration**
```typescript
// config/environments/components/postgres.env
export const postgresConfig = {
  development: {
    DATABASE_URL: "postgresql://emprops:password@localhost:5432/emprops_dev"
  },
  production: {
    DATABASE_URL: process.env.DATABASE_URL
  }
};
```

**Docker Compose Integration**
```yaml
# docker-compose.yml additions
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: emprops_dev
      POSTGRES_USER: emprops
      POSTGRES_PASSWORD: emprops_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      
  emprops-api:
    build: ./apps/emprops-api
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://emprops:emprops_password@postgres:5432/emprops_dev
      REDIS_URL: redis://redis:6379
    ports:
      - "8080:8080"

volumes:
  postgres_data:
```

#### **Day 20-21: Migration & Testing**
```bash
# Development workflow scripts
pnpm db:migrate      # Run Prisma migrations
pnpm db:seed        # Seed development data
pnpm db:reset       # Reset database (dev only)
pnpm dev:emprops    # Start EmProps API in development

# Integration testing
pnpm test:integration  # Test cross-service communication
pnpm test:db          # Test database operations
```

## Phase 4: Final Integration & Cleanup (Week 4-5)

### Day 22-25: Service Integration & Testing

#### **Day 22-23: Cross-Service Integration**
```typescript
// Unified development experience
const services = {
  jobQueue: new JobQueueAPI(redisClient, messageBus),
  empropsApi: new EmpropsAPI(dbClient, messageBus),
  webhooks: new WebhookService(redisClient, messageBus),
  workflows: new WorkflowService(redisClient, messageBus)
};

// End-to-end collection generation flow
async function generateCollection(collectionConfig: CollectionConfig) {
  // 1. EmProps API receives collection request
  const collection = await services.empropsApi.createCollection(collectionConfig);
  
  // 2. EmProps API submits workflow to job queue
  const workflowId = await services.empropsApi.submitWorkflow(collection.id);
  
  // 3. Job queue processes individual steps
  // 4. Workflow service tracks completion
  // 5. Webhook service notifies EmProps API
  // 6. EmProps API generates final collection
  
  return collection;
}
```

#### **Day 24-25: Integration Testing**
```typescript
// Integration test suite
describe('End-to-End Collection Generation', () => {
  test('should generate collection with multiple workflow steps', async () => {
    // Submit collection request to EmProps API
    const collection = await empropsApi.post('/collections', collectionConfig);
    
    // Verify jobs submitted to queue
    const jobs = await jobQueueApi.get(`/workflows/${collection.workflow_id}/jobs`);
    expect(jobs).toHaveLength(collectionConfig.steps.length);
    
    // Simulate job completion
    for (const job of jobs) {
      await jobQueueApi.post(`/jobs/${job.id}/complete`, { success: true });
    }
    
    // Verify workflow completion event
    await waitForEvent('workflow_completed');
    
    // Verify collection updated with results
    const completedCollection = await empropsApi.get(`/collections/${collection.id}`);
    expect(completedCollection.status).toBe('completed');
    expect(completedCollection.outputs).toBeDefined();
  });
});
```

### Day 26-28: Final Cleanup & Documentation

#### **Day 26: Remaining Cleanup Tasks**

**Remove Duplicate Code**
```bash
# Remove old workflow tracking from webhook service
rm apps/webhook-service/src/workflow-tracker.ts

# Remove old API monolith backup files  
rm apps/api/src/lightweight-api-server.ts.backup

# Clean up old environment files
find config/ -name "*.old" -delete
find config/ -name "*.backup" -delete
```

**Consolidate Dependencies**
```bash
# Remove duplicate dependencies across packages
pnpm dedupe

# Update all packages to use workspace versions
pnpm -r update
```

#### **Day 27-28: Documentation & Scripts**

**Update Development Scripts**
```json
{
  "scripts": {
    // Unified development
    "dev:all": "concurrently 'pnpm dev:api' 'pnpm dev:emprops' 'pnpm dev:monitor'",
    "dev:api": "turbo run dev --filter=@emp/api", 
    "dev:emprops": "turbo run dev --filter=@emp/emprops-api",
    
    // Database management
    "db:migrate": "pnpm --filter=@emp/emprops-db prisma:migrate",
    "db:seed": "pnpm --filter=@emp/emprops-db prisma:seed",
    "db:reset": "pnpm --filter=@emp/emprops-db prisma:reset",
    
    // Testing
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    
    // Production
    "build:all": "turbo run build",
    "start:production": "docker-compose up --build"
  }
}
```

**Documentation Updates**
- Update README with new architecture
- Document cross-service communication patterns  
- Create migration guide for developers
- Update deployment documentation

## Success Metrics

### Technical Metrics
- [ ] **API Response Time**: <100ms for 95% of requests
- [ ] **Build Time**: Turbo build completes in <2 minutes
- [ ] **Test Coverage**: >80% across all services
- [ ] **Bundle Size**: No individual service >10MB compressed

### Architectural Metrics  
- [ ] **Single Source of Truth**: Workflow tracking only in API WorkflowService
- [ ] **Event Consistency**: All events go through MessageBus
- [ ] **Service Boundaries**: Clear domain separation between services
- [ ] **Database Isolation**: PostgreSQL for EmProps, Redis for job queue

### Operational Metrics
- [ ] **Development Setup**: `pnpm dev:all` starts entire stack
- [ ] **Database Migrations**: Zero-downtime production migrations
- [ ] **Log Volume**: <1GB/day total log output in production
- [ ] **Dependency Count**: <200 unique dependencies across monorepo

### Cleanup Metrics
- [ ] **File Count Reduction**: >1000 files removed
- [ ] **Repository Size**: <500MB (excluding node_modules)
- [ ] **Dead Code**: 0 unused exports detected by analysis tools
- [ ] **Log File Management**: Automated rotation and cleanup

## Risk Mitigation

### Rollback Strategy
```bash
# Each phase has rollback capability
git tag phase-1-foundation
git tag phase-2-integration  
git tag phase-3-migration
git tag phase-4-final

# Rollback to previous phase if needed
git reset --hard phase-2-integration
```

### Monitoring & Alerts
- Service health checks for all apps
- Database connection monitoring
- Message bus throughput tracking
- Cross-service communication latency

### Staged Deployment
1. **Development**: Test all changes in dev environment
2. **Staging**: Deploy with production-like data  
3. **Canary**: Rolling deployment with traffic splitting
4. **Production**: Full deployment with monitoring

## Post-Implementation Benefits

### Developer Experience
- **Single Repository**: All EmProps services in one place
- **Unified Development**: One command starts entire stack
- **Consistent Tooling**: Same build system, linting, testing
- **Clear Architecture**: Well-defined service boundaries

### Operational Excellence
- **Coordinated Deployments**: Deploy related services together
- **Unified Monitoring**: Single observability stack
- **Efficient Resource Usage**: Shared dependencies and builds
- **Simplified Configuration**: One environment system

### Architectural Quality
- **Event-Driven**: All inter-service communication through events
- **Domain Separation**: Clear boundaries between concerns
- **Type Safety**: Shared types across service boundaries  
- **Testability**: Mock service dependencies easily

## Next Steps

1. **Team Review**: Present plan to development team
2. **Timeline Confirmation**: Adjust dates based on team availability
3. **Resource Allocation**: Assign team members to phases
4. **Monitoring Setup**: Prepare observability for tracking progress
5. **Rollback Testing**: Verify rollback procedures work

---

*This comprehensive plan transforms three separate initiatives into a single coordinated modernization effort, resulting in a clean, well-architected, and maintainable codebase.*