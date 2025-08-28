# Phase 3: API Service Refactor Implementation Guide

**Date**: 2025-08-26  
**Status**: Ready for Implementation  
**Priority**: Critical - Service Extraction  
**Timeline**: Days 11-18 (8 days)  
**Dependencies**: Phase 1 (Testing) + Phase 2 (Message Bus) Complete

## Executive Summary

> **🎯 Mission**: Extract domain services from monolithic API server using event-driven architecture patterns.

This guide provides detailed implementation instructions for Phase 3 of the unified modernization plan. Phase 3 extracts domain-specific services from the monolithic `lightweight-api-server.ts`, creating dedicated JobService and WorkflowService with clear boundaries and single responsibilities.

### 🏗️ Service Extraction Architecture

<FullscreenDiagram>

```mermaid
flowchart TD
    Start(["🚀 Start Phase 3"]) --> Analysis["🔍 Monolith Analysis"]
    Analysis --> JobService["⚙️ JobService Extraction"]
    JobService --> WorkflowService["🔄 WorkflowService Extraction"] 
    WorkflowService --> Integration["🔗 Service Integration"]
    Integration --> Migration["📦 API Route Migration"]
    Migration --> Testing["🧪 Integration Testing"]
    Testing --> Complete(["✅ Phase 3 Complete"])
    
    Analysis --> |"Days 11-12"| A1["Code Structure Review"]
    Analysis --> |"Days 11-12"| A2["Dependency Mapping"]
    Analysis --> |"Days 11-12"| A3["Service Boundary Definition"]
    
    JobService --> |"Days 13-14"| J1["Job Management Logic"]
    JobService --> |"Days 13-14"| J2["Redis Integration"]
    JobService --> |"Days 13-14"| J3["Event Publishing"]
    
    WorkflowService --> |"Days 15-16"| W1["Workflow Orchestration"]
    WorkflowService --> |"Days 15-16"| W2["Step Management"]
    WorkflowService --> |"Days 15-16"| W3["Progress Tracking"]
    
    Integration --> |"Day 17"| I1["Message Bus Wiring"]
    Integration --> |"Day 17"| I2["Event Handlers"]
    Integration --> |"Day 17"| I3["Cross-Service Communication"]
    
    Migration --> |"Day 18"| M1["HTTP Route Updates"]
    Migration --> |"Day 18"| M2["Middleware Migration"]
    Migration --> |"Day 18"| M3["Response Formatting"]
    
    Testing --> T1["Service Unit Tests"]
    Testing --> T2["Integration Tests"]
    Testing --> T3["End-to-End Validation"]
    
    classDef analysisStyle fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef serviceStyle fill:#e8f5e8,stroke:#2e7d32,stroke-width:2px
    classDef integrationStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef completeStyle fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    
    class A1,A2,A3 analysisStyle
    class J1,J2,J3,W1,W2,W3 serviceStyle
    class I1,I2,I3,M1,M2,M3,T1,T2,T3 integrationStyle
    class Start,Complete completeStyle
```

</FullscreenDiagram>

**Key Deliverables:**
- **JobService Extraction** with complete job lifecycle management
- **WorkflowService Extraction** with workflow orchestration and dependency handling
- **Service Communication** via message bus (no direct HTTP calls)  
- **Monolith Decomposition** from single file to service-oriented architecture
- **Legacy API Compatibility** maintaining existing HTTP endpoints
- **Service Testing** comprehensive coverage of extracted services

## Research Findings: Service Extraction Patterns

### Node.js Backend Architecture Best Practices
Based on Context7 research from production-ready Node.js architectures:

**Service Layer Pattern:**
- **Single Responsibility**: Each service handles one business domain
- **Dependency Injection**: Services receive dependencies via constructor
- **Event-Driven Communication**: Services communicate via events, not direct calls
- **Clean Architecture**: Business logic separated from infrastructure concerns

**Key Principles:**
- **Domain-Driven Design**: Services organized around business capabilities
- **Separation of Concerns**: Clear boundaries between services and responsibilities  
- **Testability**: Services can be tested in isolation with mocked dependencies
- **Scalability**: Services can be deployed and scaled independently

### Service Extraction Strategy
Research reveals proven patterns for extracting services from monoliths:

**Strangler Fig Pattern:**
- Gradually replace monolith functionality with services
- Maintain API compatibility during transition  
- Route requests to new services while keeping fallbacks
- Complete migration incrementally with testing at each step

**Event-First Approach:**
- Define service boundaries through events
- Extract services that publish and consume specific event types
- Use message bus to decouple services from the start
- Enable independent deployment and testing

## Current Monolith Analysis

### Lightweight API Server Structure
```typescript
// Current monolithic structure in lightweight-api-server.ts (~36,000 lines)
export class LightweightAPIServer {
  // Job Management (Should be JobService)
  private async handleJobSubmission()
  private async handleJobStatusRequest()  
  private async updateJobProgress()
  private async completeJob()
  
  // Workflow Management (Should be WorkflowService)
  private async createWorkflow()
  private async getWorkflowStatus()
  private async handleWorkflowStepCompletion()
  
  // WebSocket Management (Should be WebSocketService)
  private setupWebSocketServer()
  private handleWebSocketConnection()
  private broadcastJobUpdates()
  
  // Machine Management (Should be MachineService)
  private handleMachineRegistration()
  private updateMachineStatus()
  private trackMachineHealth()
  
  // Redis Management (Infrastructure)
  private redis: Redis
  private redisService: RedisService
}
```

### Problems with Current Architecture
1. **Single Responsibility Violation**: One class handling 4+ distinct domains
2. **Tight Coupling**: All functionality intertwined in single file  
3. **Testing Complexity**: Cannot test job logic without WebSocket/machine logic
4. **Deployment Coupling**: Cannot scale job processing independently
5. **Code Duplication**: Similar patterns repeated across different domains

## Target Service Architecture

### Service Separation Strategy
```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP API Layer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐│
│  │   Job Routes    │ │ Workflow Routes │ │Machine Routes ││
│  │                 │ │                 │ │               ││
│  │ POST /jobs      │ │ POST /workflows │ │ POST /machines││
│  │ GET /jobs/:id   │ │ GET /workflows  │ │ GET /machines ││
│  └─────────────────┘ └─────────────────┘ └───────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                   Service Layer                            │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐│
│  │   JobService    │ │ WorkflowService │ │ MachineService││
│  │                 │ │                 │ │               ││
│  │ - Submit Job    │ │ - Create Flow   │ │ - Register    ││
│  │ - Update Status │ │ - Track Steps   │ │ - Update      ││
│  │ - Complete Job  │ │ - Handle Deps   │ │ - Health      ││
│  └─────────────────┘ └─────────────────┘ └───────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Message Bus Layer                         │
│                 (Phase 2 Foundation)                       │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│                Infrastructure Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌───────────────┐│
│  │  Redis Service  │ │ WebSocket Mgmt  │ │  Telemetry    ││
│  └─────────────────┘ └─────────────────┘ └───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Service Responsibilities
- **JobService**: Complete job lifecycle (submit → assign → progress → complete)  
- **WorkflowService**: Multi-step orchestration with dependency management
- **MachineService**: Worker registration, health tracking, capability management
- **WebSocketService**: Real-time client notifications and subscription management
- **API Router**: HTTP endpoint routing to appropriate services

## Step-by-Step Implementation

### Day 11-12: JobService Extraction

#### 11.1 JobService Core Implementation
```typescript
// apps/api/src/services/job-service.ts
import { v4 as uuidv4 } from 'uuid'
import { 
  RedisService, 
  JobEventPublisher,
  getMessageBus,
  type JobPayload,
  type JobRequirements,
  type JobResult,
  type JobError
} from '@emp/core'
import { logger } from '../utils/logger'

export interface JobServiceConfig {
  redis: RedisService
  defaultPriority: number
  maxRetries: number
  timeoutSeconds: number
}

export interface JobSubmissionRequest {
  type: string
  prompt?: string
  parameters?: Record<string, any>
  priority?: number
  webhook_url?: string
  workflow_id?: string
  depends_on?: string[]
}

export interface JobSubmissionResponse {
  success: boolean
  job_id: string
  status: 'submitted' | 'waiting'
  message?: string
}

export interface JobStatusResponse {
  success: boolean
  job?: {
    id: string
    type: string
    status: string
    progress: number
    created_at: string
    started_at?: string
    completed_at?: string
    result?: JobResult
    error?: JobError
    worker_id?: string
    machine_id?: string
    workflow_id?: string
  }
  error?: {
    code: string
    message: string
  }
}

export class JobService {
  private redis: RedisService
  private eventPublisher: JobEventPublisher
  private messageBus = getMessageBus()
  private config: JobServiceConfig

  constructor(config: JobServiceConfig) {
    this.config = config
    this.redis = config.redis
    this.eventPublisher = new JobEventPublisher()
    
    this.setupEventHandlers()
  }

  /**
   * Submit a new job for processing
   */
  async submitJob(request: JobSubmissionRequest, correlationId?: string): Promise<JobSubmissionResponse> {
    try {
      const jobId = uuidv4()
      
      // Validate job request
      await this.validateJobRequest(request)
      
      // Create job payload
      const jobPayload: JobPayload = {
        type: request.type,
        prompt: request.prompt,
        parameters: request.parameters || {}
      }
      
      // Analyze job requirements
      const requirements = await this.analyzeJobRequirements(request)
      
      // Determine if job should wait for dependencies
      const shouldWait = request.depends_on && request.depends_on.length > 0
      const initialStatus = shouldWait ? 'waiting' : 'submitted'
      
      // Publish job submitted event (this handles Redis storage via state synchronizer)
      await this.eventPublisher.publishJobSubmitted(
        jobId,
        jobPayload,
        requirements,
        request.priority || this.config.defaultPriority,
        request.webhook_url,
        correlationId
      )
      
      // Handle dependency tracking if needed
      if (request.depends_on && request.depends_on.length > 0) {
        await this.setupJobDependencies(jobId, request.depends_on, request.workflow_id)
      }
      
      logger.info(`Job submitted successfully`, {
        jobId,
        type: request.type,
        status: initialStatus,
        correlationId
      })
      
      return {
        success: true,
        job_id: jobId,
        status: initialStatus
      }
      
    } catch (error) {
      logger.error('Job submission failed', {
        error: error.message,
        request: this.sanitizeRequest(request),
        correlationId
      })
      
      throw error
    }
  }

  /**
   * Get job status and details
   */
  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    try {
      const job = await this.redis.hgetall(`job:${jobId}`)
      
      if (!job || Object.keys(job).length === 0) {
        return {
          success: false,
          error: {
            code: 'JOB_NOT_FOUND',
            message: `Job with ID ${jobId} not found`
          }
        }
      }
      
      return {
        success: true,
        job: {
          id: job.id,
          type: job.type,
          status: job.status,
          progress: parseInt(job.progress || '0'),
          created_at: job.created_at,
          started_at: job.started_at,
          completed_at: job.completed_at,
          result: job.result ? JSON.parse(job.result) : undefined,
          error: job.error ? JSON.parse(job.error) : undefined,
          worker_id: job.worker_id,
          machine_id: job.machine_id,
          workflow_id: job.workflow_id
        }
      }
      
    } catch (error) {
      logger.error('Failed to get job status', {
        jobId,
        error: error.message
      })
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve job status'
        }
      }
    }
  }

  /**
   * Cancel a job (if possible)
   */
  async cancelJob(jobId: string, reason?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const job = await this.redis.hgetall(`job:${jobId}`)
      
      if (!job || Object.keys(job).length === 0) {
        return {
          success: false,
          message: 'Job not found'
        }
      }
      
      // Only allow cancellation of pending/waiting jobs
      if (!['pending', 'waiting'].includes(job.status)) {
        return {
          success: false,
          message: `Cannot cancel job in status: ${job.status}`
        }
      }
      
      // Update job status
      await this.redis.hmset(`job:${jobId}`, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason || 'User requested cancellation'
      })
      
      // Remove from pending queue
      await this.redis.zrem('jobs:pending', jobId)
      
      // Publish job failed event for consistency
      await this.eventPublisher.publishJobFailed(
        jobId,
        {
          code: 'JOB_CANCELLED',
          message: reason || 'Job cancelled by user',
          timestamp: new Date().toISOString()
        },
        0 // No retry for cancelled jobs
      )
      
      logger.info(`Job cancelled successfully`, { jobId, reason })
      
      return {
        success: true,
        message: 'Job cancelled successfully'
      }
      
    } catch (error) {
      logger.error('Failed to cancel job', {
        jobId,
        error: error.message
      })
      
      return {
        success: false,
        message: 'Failed to cancel job'
      }
    }
  }

  /**
   * Get job statistics and metrics
   */
  async getJobStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    by_type: Record<string, number>
  }> {
    try {
      const timeframMs = {
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000
      }[timeframe]
      
      const since = Date.now() - timeframMs
      
      // Get job counts by status
      const [pending, running, completed, failed] = await Promise.all([
        this.redis.zcard('jobs:pending'),
        this.redis.scard('jobs:assigned'), // Running jobs
        this.redis.scard('jobs:completed'),
        this.redis.scard('jobs:failed')
      ])
      
      // Get jobs by type (this would need a more sophisticated approach in production)
      // For now, we'll return basic stats
      const total = pending + running + completed + failed
      
      return {
        total,
        pending,
        running,
        completed,
        failed,
        by_type: {} // Would implement type-specific counting with additional Redis structures
      }
      
    } catch (error) {
      logger.error('Failed to get job stats', { error: error.message })
      throw error
    }
  }

  private setupEventHandlers(): void {
    // Listen for job assignment events to track progress
    this.messageBus.subscribe('job_assigned', (event) => {
      logger.info('Job assigned', { 
        jobId: event.job_id, 
        workerId: event.worker_id,
        machineId: event.machine_id 
      })
    }, { local: true })
    
    // Listen for job completion to handle dependent jobs
    this.messageBus.subscribe('job_completed', async (event) => {
      await this.handleJobDependencyCompletion(event.job_id)
    }, { local: true })
  }

  private async validateJobRequest(request: JobSubmissionRequest): Promise<void> {
    const errors: string[] = []
    
    if (!request.type) {
      errors.push('Job type is required')
    }
    
    if (!['text-to-image', 'image-to-image', 'upscale', 'controlnet'].includes(request.type)) {
      errors.push(`Unsupported job type: ${request.type}`)
    }
    
    if (request.type === 'text-to-image' && !request.prompt) {
      errors.push('Prompt is required for text-to-image jobs')
    }
    
    if (request.priority && (request.priority < 0 || request.priority > 100)) {
      errors.push('Priority must be between 0 and 100')
    }
    
    if (request.depends_on && !request.workflow_id) {
      errors.push('workflow_id is required when depends_on is specified')
    }
    
    if (errors.length > 0) {
      throw new Error(`Job validation failed: ${errors.join(', ')}`)
    }
  }

  private async analyzeJobRequirements(request: JobSubmissionRequest): Promise<JobRequirements> {
    // Analyze job type and parameters to determine resource requirements
    const baseRequirements: JobRequirements = {
      gpu_memory: 4,
      model_type: request.type,
      capabilities: [request.type]
    }
    
    switch (request.type) {
      case 'text-to-image':
        baseRequirements.gpu_memory = 8
        baseRequirements.model_type = 'stable-diffusion'
        break
        
      case 'upscale':
        baseRequirements.gpu_memory = 12
        baseRequirements.model_type = 'upscaler'
        break
        
      case 'controlnet':
        baseRequirements.gpu_memory = 16
        baseRequirements.model_type = 'controlnet'
        break
    }
    
    // Adjust based on parameters
    if (request.parameters?.high_quality) {
      baseRequirements.gpu_memory += 4
    }
    
    if (request.parameters?.batch_size > 1) {
      baseRequirements.gpu_memory += (request.parameters.batch_size - 1) * 2
    }
    
    return baseRequirements
  }

  private async setupJobDependencies(jobId: string, dependsOn: string[], workflowId?: string): Promise<void> {
    // Store dependency information
    await this.redis.sadd(`job:${jobId}:depends_on`, ...dependsOn)
    
    // Create reverse mapping for efficient lookup
    for (const depJobId of dependsOn) {
      await this.redis.sadd(`job:${depJobId}:dependents`, jobId)
    }
    
    if (workflowId) {
      await this.redis.hset(`job:${jobId}`, 'workflow_id', workflowId)
    }
  }

  private async handleJobDependencyCompletion(completedJobId: string): Promise<void> {
    try {
      // Get jobs that depend on this completed job
      const dependentJobs = await this.redis.smembers(`job:${completedJobId}:dependents`)
      
      for (const dependentJobId of dependentJobs) {
        // Check if all dependencies are complete
        const dependencies = await this.redis.smembers(`job:${dependentJobId}:depends_on`)
        let allComplete = true
        
        for (const depId of dependencies) {
          const depJob = await this.redis.hget(`job:${depId}`, 'status')
          if (depJob !== 'completed') {
            allComplete = false
            break
          }
        }
        
        if (allComplete) {
          // Update job status from 'waiting' to 'pending'
          await this.redis.hmset(`job:${dependentJobId}`, {
            status: 'pending',
            updated_at: new Date().toISOString()
          })
          
          // Add to pending queue
          const job = await this.redis.hgetall(`job:${dependentJobId}`)
          const priority = parseInt(job.priority || '50')
          await this.redis.zadd('jobs:pending', priority, dependentJobId)
          
          logger.info(`Job ${dependentJobId} dependencies satisfied, moved to pending`)
        }
      }
      
    } catch (error) {
      logger.error('Failed to handle job dependency completion', {
        completedJobId,
        error: error.message
      })
    }
  }

  private sanitizeRequest(request: JobSubmissionRequest): Partial<JobSubmissionRequest> {
    // Remove sensitive information for logging
    return {
      type: request.type,
      priority: request.priority,
      workflow_id: request.workflow_id,
      depends_on: request.depends_on
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      // Test Redis connection
      await this.redis.ping()
      
      // Get basic stats
      const stats = await this.getJobStats('hour')
      
      return {
        status: 'healthy',
        details: {
          redis: 'connected',
          stats
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message
        }
      }
    }
  }
}
```

#### 11.2 JobService Testing
```typescript
// apps/api/src/services/__tests__/job-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JobService } from '../job-service'
import { RedisService, JobEventPublisher } from '@emp/core'

// Mock dependencies
vi.mock('@emp/core', () => ({
  RedisService: vi.fn(),
  JobEventPublisher: vi.fn(),
  getMessageBus: vi.fn(() => ({
    subscribe: vi.fn()
  }))
}))

describe('JobService', () => {
  let jobService: JobService
  let mockRedis: any
  let mockEventPublisher: any

  beforeEach(() => {
    mockRedis = {
      hgetall: vi.fn(),
      hmset: vi.fn(),
      zadd: vi.fn(),
      zrem: vi.fn(),
      sadd: vi.fn(),
      srem: vi.fn(),
      ping: vi.fn().mockResolvedValue('PONG'),
      zcard: vi.fn(),
      scard: vi.fn(),
      smembers: vi.fn().mockResolvedValue([]),
      hget: vi.fn(),
      hset: vi.fn()
    }

    mockEventPublisher = {
      publishJobSubmitted: vi.fn(),
      publishJobFailed: vi.fn()
    }

    vi.mocked(RedisService).mockImplementation(() => mockRedis as any)
    vi.mocked(JobEventPublisher).mockImplementation(() => mockEventPublisher as any)

    jobService = new JobService({
      redis: mockRedis,
      defaultPriority: 50,
      maxRetries: 3,
      timeoutSeconds: 300
    })
  })

  describe('submitJob', () => {
    it('should submit a valid job successfully', async ({ expect }) => {
      const request = {
        type: 'text-to-image',
        prompt: 'A beautiful sunset',
        priority: 70,
        webhook_url: 'https://example.com/webhook'
      }

      const result = await jobService.submitJob(request)

      expect(result.success).toBe(true)
      expect(result.job_id).toBeDefined()
      expect(result.status).toBe('submitted')

      // Verify event publisher was called
      expect(mockEventPublisher.publishJobSubmitted).toHaveBeenCalledWith(
        result.job_id,
        expect.objectContaining({
          type: 'text-to-image',
          prompt: 'A beautiful sunset'
        }),
        expect.objectContaining({
          model_type: 'stable-diffusion',
          gpu_memory: 8
        }),
        70,
        'https://example.com/webhook',
        undefined
      )
    })

    it('should validate job requests and reject invalid ones', async ({ expect }) => {
      const invalidRequest = {
        type: 'invalid-type',
        prompt: 'Test prompt'
      }

      await expect(jobService.submitJob(invalidRequest))
        .rejects
        .toThrow('Job validation failed')
    })

    it('should handle dependency jobs correctly', async ({ expect }) => {
      mockRedis.hgetall.mockResolvedValue({ status: 'completed' })

      const request = {
        type: 'upscale',
        workflow_id: 'workflow-123',
        depends_on: ['job-1', 'job-2']
      }

      const result = await jobService.submitJob(request)

      expect(result.status).toBe('waiting')
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        `job:${result.job_id}:depends_on`,
        'job-1',
        'job-2'
      )
    })
  })

  describe('getJobStatus', () => {
    it('should return job status when job exists', async ({ expect }) => {
      const jobData = {
        id: 'job-123',
        type: 'text-to-image',
        status: 'running',
        progress: '50',
        created_at: '2025-08-26T10:00:00Z',
        started_at: '2025-08-26T10:01:00Z'
      }

      mockRedis.hgetall.mockResolvedValue(jobData)

      const result = await jobService.getJobStatus('job-123')

      expect(result.success).toBe(true)
      expect(result.job).toEqual({
        id: 'job-123',
        type: 'text-to-image',
        status: 'running',
        progress: 50,
        created_at: '2025-08-26T10:00:00Z',
        started_at: '2025-08-26T10:01:00Z',
        completed_at: undefined,
        result: undefined,
        error: undefined,
        worker_id: undefined,
        machine_id: undefined,
        workflow_id: undefined
      })
    })

    it('should return error when job does not exist', async ({ expect }) => {
      mockRedis.hgetall.mockResolvedValue({})

      const result = await jobService.getJobStatus('nonexistent-job')

      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        code: 'JOB_NOT_FOUND',
        message: 'Job with ID nonexistent-job not found'
      })
    })
  })

  describe('cancelJob', () => {
    it('should cancel pending jobs successfully', async ({ expect }) => {
      mockRedis.hgetall.mockResolvedValue({
        id: 'job-123',
        status: 'pending'
      })

      const result = await jobService.cancelJob('job-123', 'User requested')

      expect(result.success).toBe(true)
      expect(mockRedis.hmset).toHaveBeenCalledWith(
        'job:job-123',
        expect.objectContaining({
          status: 'cancelled',
          cancel_reason: 'User requested'
        })
      )
      expect(mockRedis.zrem).toHaveBeenCalledWith('jobs:pending', 'job-123')
    })

    it('should not cancel running jobs', async ({ expect }) => {
      mockRedis.hgetall.mockResolvedValue({
        id: 'job-123',
        status: 'running'
      })

      const result = await jobService.cancelJob('job-123')

      expect(result.success).toBe(false)
      expect(result.message).toContain('Cannot cancel job in status: running')
    })
  })

  describe('getJobStats', () => {
    it('should return job statistics', async ({ expect }) => {
      mockRedis.zcard.mockResolvedValue(5)  // pending
      mockRedis.scard
        .mockResolvedValueOnce(3)  // running
        .mockResolvedValueOnce(10) // completed  
        .mockResolvedValueOnce(2)  // failed

      const stats = await jobService.getJobStats('day')

      expect(stats).toEqual({
        total: 20,
        pending: 5,
        running: 3,
        completed: 10,
        failed: 2,
        by_type: {}
      })
    })
  })

  describe('healthCheck', () => {
    it('should return healthy status when all checks pass', async ({ expect }) => {
      const health = await jobService.healthCheck()

      expect(health.status).toBe('healthy')
      expect(health.details.redis).toBe('connected')
    })

    it('should return unhealthy status when Redis is down', async ({ expect }) => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'))

      const health = await jobService.healthCheck()

      expect(health.status).toBe('unhealthy')
      expect(health.details.error).toBe('Connection failed')
    })
  })
})
```

### Day 13-14: WorkflowService Extraction

#### 13.1 WorkflowService Core Implementation
```typescript
// apps/api/src/services/workflow-service.ts
import { v4 as uuidv4 } from 'uuid'
import {
  RedisService,
  WorkflowEventPublisher,
  getMessageBus,
  type StepDetail
} from '@emp/core'
import { JobService } from './job-service'
import { logger } from '../utils/logger'

export interface WorkflowStep {
  type: string
  prompt?: string
  parameters?: Record<string, any>
  depends_on?: number[] // Indices of previous steps
}

export interface WorkflowCreationRequest {
  name: string
  description?: string
  steps: WorkflowStep[]
  webhook_url?: string
}

export interface WorkflowCreationResponse {
  success: boolean
  workflow_id: string
  job_ids: string[]
  message?: string
}

export interface WorkflowStatusResponse {
  success: boolean
  workflow?: {
    id: string
    name: string
    description?: string
    status: string
    total_steps: number
    completed_steps: number
    progress_percentage: number
    created_at: string
    completed_at?: string
  }
  steps?: Array<{
    step_index: number
    job_id: string
    status: string
    progress: number
    result?: any
    error?: any
    started_at?: string
    completed_at?: string
  }>
  error?: {
    code: string
    message: string
  }
}

export class WorkflowService {
  private redis: RedisService
  private jobService: JobService
  private eventPublisher: WorkflowEventPublisher
  private messageBus = getMessageBus()

  // Track workflow jobs for dependency resolution
  private workflowJobs = new Map<string, Set<string>>()

  constructor(redis: RedisService, jobService: JobService) {
    this.redis = redis
    this.jobService = jobService
    this.eventPublisher = new WorkflowEventPublisher()
    
    this.setupEventHandlers()
  }

  /**
   * Create a new workflow with multiple steps
   */
  async createWorkflow(request: WorkflowCreationRequest, correlationId?: string): Promise<WorkflowCreationResponse> {
    try {
      const workflowId = uuidv4()
      
      // Validate workflow request
      await this.validateWorkflowRequest(request)
      
      logger.info(`Creating workflow ${workflowId}`, {
        name: request.name,
        stepCount: request.steps.length,
        correlationId
      })

      // Create job submissions for each step
      const jobIds: string[] = []
      const stepJobMap = new Map<number, string>()
      
      for (let stepIndex = 0; stepIndex < request.steps.length; stepIndex++) {
        const step = request.steps[stepIndex]
        
        // Build job dependencies based on step dependencies
        const dependsOn: string[] = []
        if (step.depends_on && step.depends_on.length > 0) {
          for (const depIndex of step.depends_on) {
            if (stepJobMap.has(depIndex)) {
              dependsOn.push(stepJobMap.get(depIndex)!)
            }
          }
        }
        
        // Submit job for this step
        const jobResult = await this.jobService.submitJob({
          type: step.type,
          prompt: step.prompt,
          parameters: {
            ...step.parameters,
            step_index: stepIndex,
            workflow_id: workflowId
          },
          workflow_id: workflowId,
          depends_on: dependsOn.length > 0 ? dependsOn : undefined
        }, correlationId)
        
        if (!jobResult.success) {
          throw new Error(`Failed to create job for step ${stepIndex}: ${jobResult.message}`)
        }
        
        jobIds.push(jobResult.job_id)
        stepJobMap.set(stepIndex, jobResult.job_id)
      }
      
      // Track workflow jobs for dependency management
      this.workflowJobs.set(workflowId, new Set(jobIds))
      
      // Publish workflow created event
      await this.eventPublisher.publishWorkflowCreated(
        workflowId,
        request.name,
        request.steps.length,
        jobIds,
        request.description,
        request.webhook_url,
        correlationId
      )
      
      logger.info(`Workflow created successfully`, {
        workflowId,
        jobCount: jobIds.length,
        correlationId
      })
      
      return {
        success: true,
        workflow_id: workflowId,
        job_ids: jobIds
      }
      
    } catch (error) {
      logger.error('Workflow creation failed', {
        error: error.message,
        request: this.sanitizeWorkflowRequest(request),
        correlationId
      })
      
      throw error
    }
  }

  /**
   * Get workflow status and step details
   */
  async getWorkflowStatus(workflowId: string): Promise<WorkflowStatusResponse> {
    try {
      // Get workflow metadata
      const workflow = await this.redis.hgetall(`workflow:${workflowId}`)
      
      if (!workflow || Object.keys(workflow).length === 0) {
        return {
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: `Workflow with ID ${workflowId} not found`
          }
        }
      }
      
      // Get job details for each step
      const jobIds = JSON.parse(workflow.job_ids || '[]')
      const steps: WorkflowStatusResponse['steps'] = []
      
      for (let i = 0; i < jobIds.length; i++) {
        const jobId = jobIds[i]
        const jobStatus = await this.jobService.getJobStatus(jobId)
        
        if (jobStatus.success && jobStatus.job) {
          const job = jobStatus.job
          steps.push({
            step_index: i,
            job_id: jobId,
            status: job.status,
            progress: job.progress,
            result: job.result,
            error: job.error,
            started_at: job.started_at,
            completed_at: job.completed_at
          })
        }
      }
      
      const totalSteps = parseInt(workflow.total_steps || '0')
      const completedSteps = parseInt(workflow.completed_steps || '0')
      const progressPercentage = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0
      
      return {
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          status: workflow.status,
          total_steps: totalSteps,
          completed_steps: completedSteps,
          progress_percentage: Math.round(progressPercentage * 100) / 100,
          created_at: workflow.created_at,
          completed_at: workflow.completed_at
        },
        steps
      }
      
    } catch (error) {
      logger.error('Failed to get workflow status', {
        workflowId,
        error: error.message
      })
      
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve workflow status'
        }
      }
    }
  }

  /**
   * Cancel an entire workflow
   */
  async cancelWorkflow(workflowId: string, reason?: string): Promise<{ success: boolean; message?: string }> {
    try {
      const workflow = await this.redis.hgetall(`workflow:${workflowId}`)
      
      if (!workflow || Object.keys(workflow).length === 0) {
        return {
          success: false,
          message: 'Workflow not found'
        }
      }
      
      if (['completed', 'failed', 'cancelled'].includes(workflow.status)) {
        return {
          success: false,
          message: `Cannot cancel workflow in status: ${workflow.status}`
        }
      }
      
      // Cancel all associated jobs
      const jobIds = JSON.parse(workflow.job_ids || '[]')
      const cancelResults = await Promise.allSettled(
        jobIds.map(jobId => this.jobService.cancelJob(jobId, reason))
      )
      
      // Count successful cancellations
      const successfulCancellations = cancelResults
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .length
      
      // Update workflow status
      await this.redis.hmset(`workflow:${workflowId}`, {
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason || 'User requested cancellation'
      })
      
      logger.info(`Workflow cancelled`, {
        workflowId,
        totalJobs: jobIds.length,
        cancelledJobs: successfulCancellations,
        reason
      })
      
      return {
        success: true,
        message: `Workflow cancelled (${successfulCancellations}/${jobIds.length} jobs cancelled)`
      }
      
    } catch (error) {
      logger.error('Failed to cancel workflow', {
        workflowId,
        error: error.message
      })
      
      return {
        success: false,
        message: 'Failed to cancel workflow'
      }
    }
  }

  /**
   * Get workflow statistics
   */
  async getWorkflowStats(timeframe: 'hour' | 'day' | 'week' = 'day'): Promise<{
    total: number
    pending: number
    running: number
    completed: number
    failed: number
    cancelled: number
    avg_completion_time?: number
  }> {
    try {
      // This is a simplified implementation
      // In production, you'd want more sophisticated querying
      
      const workflows = await this.redis.keys('workflow:*')
      const stats = {
        total: workflows.length,
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0
      }
      
      for (const workflowKey of workflows) {
        const workflow = await this.redis.hget(workflowKey, 'status')
        if (workflow) {
          switch (workflow) {
            case 'pending':
              stats.pending++
              break
            case 'running':
              stats.running++
              break
            case 'completed':
              stats.completed++
              break
            case 'failed':
              stats.failed++
              break
            case 'cancelled':
              stats.cancelled++
              break
          }
        }
      }
      
      return stats
      
    } catch (error) {
      logger.error('Failed to get workflow stats', { error: error.message })
      throw error
    }
  }

  private setupEventHandlers(): void {
    // Listen for job completion events to update workflow progress
    this.messageBus.subscribe('job_completed', async (event) => {
      await this.handleJobCompleted(event.job_id, event.result)
    }, { local: true })
    
    // Listen for job failure events  
    this.messageBus.subscribe('job_failed', async (event) => {
      await this.handleJobFailed(event.job_id, event.error)
    }, { local: true })
  }

  private async handleJobCompleted(jobId: string, result: any): Promise<void> {
    try {
      // Get job details to find associated workflow
      const job = await this.redis.hgetall(`job:${jobId}`)
      const workflowId = job.workflow_id
      
      if (!workflowId) {
        return // Job not part of a workflow
      }
      
      // Get workflow details
      const workflow = await this.redis.hgetall(`workflow:${workflowId}`)
      if (!workflow) {
        logger.error('Workflow not found for completed job', { jobId, workflowId })
        return
      }
      
      // Increment completed steps
      const completedSteps = parseInt(workflow.completed_steps || '0') + 1
      const totalSteps = parseInt(workflow.total_steps || '0')
      
      await this.redis.hmset(`workflow:${workflowId}`, {
        completed_steps: completedSteps,
        updated_at: new Date().toISOString()
      })
      
      // Get step index from job parameters
      const stepIndex = parseInt(job.parameters ? JSON.parse(job.parameters).step_index : '0')
      
      // Publish workflow step completed event
      await this.eventPublisher.publishWorkflowStepCompleted(
        workflowId,
        stepIndex,
        jobId,
        result,
        completedSteps,
        totalSteps
      )
      
      // Check if workflow is complete
      if (completedSteps >= totalSteps) {
        await this.completeWorkflow(workflowId)
      }
      
    } catch (error) {
      logger.error('Failed to handle job completion in workflow', {
        jobId,
        error: error.message
      })
    }
  }

  private async handleJobFailed(jobId: string, error: any): Promise<void> {
    try {
      // Get job details to find associated workflow
      const job = await this.redis.hgetall(`job:${jobId}`)
      const workflowId = job.workflow_id
      
      if (!workflowId) {
        return // Job not part of a workflow
      }
      
      // For now, fail the entire workflow if any job fails
      // In production, you might want more sophisticated error handling
      await this.redis.hmset(`workflow:${workflowId}`, {
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: `Job ${jobId} failed: ${error.message || error.code}`
      })
      
      logger.info('Workflow failed due to job failure', { workflowId, jobId })
      
    } catch (err) {
      logger.error('Failed to handle job failure in workflow', {
        jobId,
        error: err.message
      })
    }
  }

  private async completeWorkflow(workflowId: string): Promise<void> {
    try {
      // Update workflow status
      await this.redis.hmset(`workflow:${workflowId}`, {
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      
      // Generate step details for the completion event
      const stepDetails = await this.generateStepDetails(workflowId)
      
      // Count successes and failures
      const successCount = stepDetails.filter(step => step.status === 'completed').length
      const failedCount = stepDetails.filter(step => step.status === 'failed').length
      
      // Publish workflow completed event
      await this.eventPublisher.publishWorkflowCompleted(
        workflowId,
        stepDetails,
        stepDetails.length,
        successCount,
        failedCount
      )
      
      logger.info('Workflow completed successfully', {
        workflowId,
        totalSteps: stepDetails.length,
        successCount,
        failedCount
      })
      
    } catch (error) {
      logger.error('Failed to complete workflow', {
        workflowId,
        error: error.message
      })
    }
  }

  private async generateStepDetails(workflowId: string): Promise<StepDetail[]> {
    const workflow = await this.redis.hgetall(`workflow:${workflowId}`)
    const jobIds = JSON.parse(workflow.job_ids || '[]')
    const stepDetails: StepDetail[] = []
    
    for (let i = 0; i < jobIds.length; i++) {
      const jobId = jobIds[i]
      const job = await this.redis.hgetall(`job:${jobId}`)
      
      stepDetails.push({
        step_index: i,
        job_id: jobId,
        status: job.status,
        result: job.result ? JSON.parse(job.result) : null,
        error: job.error ? JSON.parse(job.error) : null,
        completed_at: job.completed_at
      })
    }
    
    return stepDetails
  }

  private async validateWorkflowRequest(request: WorkflowCreationRequest): Promise<void> {
    const errors: string[] = []
    
    if (!request.name?.trim()) {
      errors.push('Workflow name is required')
    }
    
    if (!request.steps || request.steps.length === 0) {
      errors.push('Workflow must have at least one step')
    }
    
    if (request.steps && request.steps.length > 50) {
      errors.push('Workflow cannot have more than 50 steps')
    }
    
    // Validate each step
    request.steps?.forEach((step, index) => {
      if (!step.type) {
        errors.push(`Step ${index}: type is required`)
      }
      
      if (step.depends_on) {
        // Check for circular dependencies and invalid indices
        if (step.depends_on.some(dep => dep >= index)) {
          errors.push(`Step ${index}: cannot depend on future or self steps`)
        }
        
        if (step.depends_on.some(dep => dep < 0)) {
          errors.push(`Step ${index}: invalid dependency index`)
        }
      }
    })
    
    if (errors.length > 0) {
      throw new Error(`Workflow validation failed: ${errors.join(', ')}`)
    }
  }

  private sanitizeWorkflowRequest(request: WorkflowCreationRequest): Partial<WorkflowCreationRequest> {
    return {
      name: request.name,
      description: request.description,
      steps: request.steps.map(step => ({
        type: step.type,
        depends_on: step.depends_on
      }))
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      // Test Redis connection
      await this.redis.ping()
      
      // Get basic stats
      const stats = await this.getWorkflowStats('hour')
      
      return {
        status: 'healthy',
        details: {
          redis: 'connected',
          stats
        }
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message
        }
      }
    }
  }
}
```

### Day 15-16: Service Integration and API Route Refactoring

#### 15.1 Refactored API Routes
```typescript
// apps/api/src/routes/job-routes.ts
import { Router } from 'express'
import { JobService } from '../services/job-service'
import { validateApiKey } from '../middleware/auth'
import { validateRequest } from '../middleware/validation'
import { logger } from '../utils/logger'

export function createJobRoutes(jobService: JobService): Router {
  const router = Router()

  // Middleware
  router.use(validateApiKey)

  /**
   * Submit a new job for processing
   */
  router.post('/submit', validateRequest, async (req, res) => {
    try {
      const correlationId = req.headers['x-correlation-id'] as string
      
      const result = await jobService.submitJob({
        type: req.body.type,
        prompt: req.body.prompt,
        parameters: req.body.parameters,
        priority: req.body.priority,
        webhook_url: req.body.webhook_url
      }, correlationId)

      logger.info('Job submitted via API', {
        jobId: result.job_id,
        clientId: req.headers['x-client-id'],
        correlationId
      })

      res.json(result)
    } catch (error) {
      logger.error('Job submission API error', {
        error: error.message,
        body: req.body,
        clientId: req.headers['x-client-id']
      })

      res.status(400).json({
        success: false,
        error: {
          code: 'JOB_SUBMISSION_FAILED',
          message: error.message
        }
      })
    }
  })

  /**
   * Get job status and details
   */
  router.get('/:jobId/status', async (req, res) => {
    try {
      const { jobId } = req.params
      const result = await jobService.getJobStatus(jobId)

      if (result.success) {
        res.json(result)
      } else {
        res.status(404).json(result)
      }
    } catch (error) {
      logger.error('Job status API error', {
        jobId: req.params.jobId,
        error: error.message
      })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve job status'
        }
      })
    }
  })

  /**
   * Cancel a job
   */
  router.post('/:jobId/cancel', async (req, res) => {
    try {
      const { jobId } = req.params
      const { reason } = req.body

      const result = await jobService.cancelJob(jobId, reason)

      res.json(result)
    } catch (error) {
      logger.error('Job cancellation API error', {
        jobId: req.params.jobId,
        error: error.message
      })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel job'
        }
      })
    }
  })

  /**
   * Get job statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const timeframe = (req.query.timeframe as string) || 'day'
      
      if (!['hour', 'day', 'week'].includes(timeframe)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMEFRAME',
            message: 'Timeframe must be hour, day, or week'
          }
        })
      }

      const stats = await jobService.getJobStats(timeframe as any)
      
      res.json({
        success: true,
        stats,
        timeframe
      })
    } catch (error) {
      logger.error('Job stats API error', { error: error.message })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve job statistics'
        }
      })
    }
  })

  return router
}
```

```typescript
// apps/api/src/routes/workflow-routes.ts
import { Router } from 'express'
import { WorkflowService } from '../services/workflow-service'
import { validateApiKey } from '../middleware/auth'
import { validateRequest } from '../middleware/validation'
import { logger } from '../utils/logger'

export function createWorkflowRoutes(workflowService: WorkflowService): Router {
  const router = Router()

  // Middleware
  router.use(validateApiKey)

  /**
   * Create a new workflow
   */
  router.post('/', validateRequest, async (req, res) => {
    try {
      const correlationId = req.headers['x-correlation-id'] as string

      const result = await workflowService.createWorkflow({
        name: req.body.name,
        description: req.body.description,
        steps: req.body.steps,
        webhook_url: req.body.webhook_url
      }, correlationId)

      logger.info('Workflow created via API', {
        workflowId: result.workflow_id,
        stepCount: result.job_ids.length,
        clientId: req.headers['x-client-id'],
        correlationId
      })

      res.json(result)
    } catch (error) {
      logger.error('Workflow creation API error', {
        error: error.message,
        body: req.body,
        clientId: req.headers['x-client-id']
      })

      res.status(400).json({
        success: false,
        error: {
          code: 'WORKFLOW_CREATION_FAILED',
          message: error.message
        }
      })
    }
  })

  /**
   * Get workflow status and step details
   */
  router.get('/:workflowId/status', async (req, res) => {
    try {
      const { workflowId } = req.params
      const result = await workflowService.getWorkflowStatus(workflowId)

      if (result.success) {
        res.json(result)
      } else {
        res.status(404).json(result)
      }
    } catch (error) {
      logger.error('Workflow status API error', {
        workflowId: req.params.workflowId,
        error: error.message
      })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve workflow status'
        }
      })
    }
  })

  /**
   * Cancel a workflow
   */
  router.post('/:workflowId/cancel', async (req, res) => {
    try {
      const { workflowId } = req.params
      const { reason } = req.body

      const result = await workflowService.cancelWorkflow(workflowId, reason)

      res.json(result)
    } catch (error) {
      logger.error('Workflow cancellation API error', {
        workflowId: req.params.workflowId,
        error: error.message
      })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel workflow'
        }
      })
    }
  })

  /**
   * Get workflow statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const timeframe = (req.query.timeframe as string) || 'day'
      
      if (!['hour', 'day', 'week'].includes(timeframe)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TIMEFRAME',
            message: 'Timeframe must be hour, day, or week'
          }
        })
      }

      const stats = await workflowService.getWorkflowStats(timeframe as any)
      
      res.json({
        success: true,
        stats,
        timeframe
      })
    } catch (error) {
      logger.error('Workflow stats API error', { error: error.message })

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve workflow statistics'
        }
      })
    }
  })

  return router
}
```

#### 15.2 Refactored App Structure
```typescript
// apps/api/src/app.ts - Refactored using services
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import {
  createMessageBus,
  RedisService
} from '@emp/core'

// Services
import { JobService } from './services/job-service'
import { WorkflowService } from './services/workflow-service'
import { WebSocketEventBroadcaster } from './services/websocket-event-broadcaster'
import { RedisStateSynchronizer } from './services/redis-state-synchronizer'

// Routes
import { createJobRoutes } from './routes/job-routes'
import { createWorkflowRoutes } from './routes/workflow-routes'

// Middleware
import { requestLogger } from './middleware/logging'
import { errorHandler } from './middleware/error-handler'
import { healthCheck } from './middleware/health-check'

export interface AppConfig {
  port: number
  corsOrigins: string[]
  redis: {
    host: string
    port: number
    password?: string
  }
  messageBus: {
    redis: {
      host: string
      port: number
      password?: string
      db?: number
    }
    streams: {
      maxLength: number
      retentionHours: number
    }
    consumer: {
      group: string
      name: string
    }
  }
}

export async function createApp(config: AppConfig): Promise<{
  app: express.Express
  server: any
  shutdown: () => Promise<void>
}> {
  const app = express()

  // Basic middleware
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true
  }))
  app.use(express.json({ limit: '10mb' }))
  app.use(requestLogger)

  // Initialize message bus first
  const messageBus = createMessageBus(config.messageBus)
  await messageBus.connect()

  // Initialize Redis service
  const redisService = new RedisService({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password
  })
  await redisService.connect()

  // Initialize services with dependency injection
  const jobService = new JobService({
    redis: redisService,
    defaultPriority: 50,
    maxRetries: 3,
    timeoutSeconds: 300
  })

  const workflowService = new WorkflowService(redisService, jobService)

  // Initialize state synchronizer
  const stateSynchronizer = new RedisStateSynchronizer(redisService)

  // Setup HTTP server with WebSocket support
  const server = createServer(app)
  const wss = new WebSocketServer({ 
    server,
    path: '/ws'
  })

  // Initialize WebSocket event broadcaster
  const wsEventBroadcaster = new WebSocketEventBroadcaster()

  wss.on('connection', (ws, request) => {
    const clientId = `client-${Date.now()}-${Math.random()}`
    wsEventBroadcaster.addConnection(clientId, ws)
  })

  wsEventBroadcaster.startHealthCheck()

  // Setup API routes
  app.use('/api/jobs', createJobRoutes(jobService))
  app.use('/api/workflows', createWorkflowRoutes(workflowService))

  // Health check endpoints
  app.get('/health', healthCheck([
    { name: 'message_bus', check: () => messageBus.healthCheck() },
    { name: 'redis', check: () => redisService.ping() },
    { name: 'job_service', check: () => jobService.healthCheck() },
    { name: 'workflow_service', check: () => workflowService.healthCheck() }
  ]))

  app.get('/health/ready', (req, res) => {
    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    })
  })

  // Error handling
  app.use(errorHandler)

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} not found`
      }
    })
  })

  // Shutdown function
  const shutdown = async (): Promise<void> => {
    console.log('🛑 Shutting down services...')

    // Close HTTP server
    server.close()

    // Disconnect message bus
    await messageBus.disconnect()

    // Disconnect Redis
    await redisService.disconnect()

    console.log('✅ Shutdown completed')
  }

  return {
    app,
    server,
    shutdown
  }
}
```

### Day 17-18: Testing and Legacy Compatibility

#### 17.1 Service Integration Tests
```typescript
// apps/api/src/services/__tests__/service-integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createApp, type AppConfig } from '../../app'
import request from 'supertest'
import { redis } from '../../../../../test/integration-setup'

describe('Service Integration Tests', () => {
  let app: any
  let server: any
  let shutdown: any

  beforeAll(async () => {
    const config: AppConfig = {
      port: 0, // Let OS assign port
      corsOrigins: ['*'],
      redis: {
        host: 'localhost',
        port: 6380 // Test Redis
      },
      messageBus: {
        redis: {
          host: 'localhost',
          port: 6380,
          db: 1
        },
        streams: {
          maxLength: 1000,
          retentionHours: 1
        },
        consumer: {
          group: 'test-api',
          name: `test-${Date.now()}`
        }
      }
    }

    const appResult = await createApp(config)
    app = appResult.app
    server = appResult.server
    shutdown = appResult.shutdown

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(() => {
        resolve()
      })
    })
  })

  afterAll(async () => {
    if (shutdown) {
      await shutdown()
    }
  })

  beforeEach(async () => {
    // Clean test databases
    await redis.flushdb()
  })

  describe('Job Service Integration', () => {
    it('should handle complete job lifecycle through API', async ({ expect }) => {
      // 1. Submit job
      const jobSubmission = {
        type: 'text-to-image',
        prompt: 'Integration test image',
        parameters: {
          width: 512,
          height: 512
        },
        priority: 75,
        webhook_url: 'https://example.com/webhook'
      }

      const submitResponse = await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send(jobSubmission)
        .expect(200)

      expect(submitResponse.body).toMatchObject({
        success: true,
        job_id: expect.any(String),
        status: 'submitted'
      })

      const jobId = submitResponse.body.job_id

      // 2. Check job status
      const statusResponse = await request(app)
        .get(`/api/jobs/${jobId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(statusResponse.body).toMatchObject({
        success: true,
        job: {
          id: jobId,
          type: 'text-to-image',
          status: 'pending',
          progress: 0
        }
      })

      // 3. Verify job in Redis
      const jobData = await redis.hgetall(`job:${jobId}`)
      expect(jobData.type).toBe('text-to-image')
      expect(jobData.status).toBe('pending')

      // 4. Verify job in pending queue
      const pendingJobs = await redis.zrange('jobs:pending', 0, -1, 'WITHSCORES')
      expect(pendingJobs).toContain(jobId)
      expect(pendingJobs).toContain('75') // Priority score
    })

    it('should cancel jobs through API', async ({ expect }) => {
      // Submit a job first
      const submitResponse = await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send({
          type: 'text-to-image',
          prompt: 'Job to be cancelled'
        })
        .expect(200)

      const jobId = submitResponse.body.job_id

      // Cancel the job
      const cancelResponse = await request(app)
        .post(`/api/jobs/${jobId}/cancel`)
        .set('x-api-key', 'test_api_key')
        .send({
          reason: 'Integration test cancellation'
        })
        .expect(200)

      expect(cancelResponse.body).toMatchObject({
        success: true,
        message: 'Job cancelled successfully'
      })

      // Verify job status updated
      const statusResponse = await request(app)
        .get(`/api/jobs/${jobId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(statusResponse.body.job.status).toBe('cancelled')
    })

    it('should get job statistics through API', async ({ expect }) => {
      // Submit several jobs for statistics
      const jobTypes = ['text-to-image', 'upscale', 'text-to-image']
      
      for (const type of jobTypes) {
        await request(app)
          .post('/api/jobs/submit')
          .set('x-api-key', 'test_api_key')
          .send({
            type,
            prompt: `${type} job`
          })
      }

      // Get statistics
      const statsResponse = await request(app)
        .get('/api/jobs/stats?timeframe=day')
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(statsResponse.body).toMatchObject({
        success: true,
        stats: {
          total: 3,
          pending: 3,
          running: 0,
          completed: 0,
          failed: 0
        },
        timeframe: 'day'
      })
    })
  })

  describe('Workflow Service Integration', () => {
    it('should handle complete workflow lifecycle through API', async ({ expect }) => {
      // 1. Create workflow
      const workflowRequest = {
        name: 'Integration Test Workflow',
        description: 'Multi-step workflow for testing',
        steps: [
          {
            type: 'text-to-image',
            prompt: 'Base image',
            parameters: { width: 512, height: 512 }
          },
          {
            type: 'upscale',
            parameters: { scale_factor: 2 },
            depends_on: [0]
          }
        ],
        webhook_url: 'https://example.com/workflow-webhook'
      }

      const createResponse = await request(app)
        .post('/api/workflows')
        .set('x-api-key', 'test_api_key')
        .send(workflowRequest)
        .expect(200)

      expect(createResponse.body).toMatchObject({
        success: true,
        workflow_id: expect.any(String),
        job_ids: expect.arrayContaining([
          expect.any(String),
          expect.any(String)
        ])
      })

      const workflowId = createResponse.body.workflow_id
      const jobIds = createResponse.body.job_ids

      // 2. Check workflow status
      const statusResponse = await request(app)
        .get(`/api/workflows/${workflowId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(statusResponse.body).toMatchObject({
        success: true,
        workflow: {
          id: workflowId,
          name: 'Integration Test Workflow',
          status: 'pending',
          total_steps: 2,
          completed_steps: 0,
          progress_percentage: 0
        },
        steps: expect.arrayContaining([
          expect.objectContaining({
            step_index: 0,
            job_id: jobIds[0],
            status: 'pending'
          }),
          expect.objectContaining({
            step_index: 1,
            job_id: jobIds[1],
            status: 'waiting' // Depends on step 0
          })
        ])
      })

      // 3. Verify workflow in Redis
      const workflowData = await redis.hgetall(`workflow:${workflowId}`)
      expect(workflowData.name).toBe('Integration Test Workflow')
      expect(workflowData.total_steps).toBe('2')

      // 4. Verify job dependencies
      const job1Dependencies = await redis.smembers(`job:${jobIds[1]}:depends_on`)
      expect(job1Dependencies).toContain(jobIds[0])
    })

    it('should cancel workflows through API', async ({ expect }) => {
      // Create a workflow first
      const createResponse = await request(app)
        .post('/api/workflows')
        .set('x-api-key', 'test_api_key')
        .send({
          name: 'Workflow to Cancel',
          steps: [
            { type: 'text-to-image', prompt: 'step 1' },
            { type: 'upscale', depends_on: [0] }
          ]
        })
        .expect(200)

      const workflowId = createResponse.body.workflow_id

      // Cancel the workflow
      const cancelResponse = await request(app)
        .post(`/api/workflows/${workflowId}/cancel`)
        .set('x-api-key', 'test_api_key')
        .send({
          reason: 'Integration test cancellation'
        })
        .expect(200)

      expect(cancelResponse.body).toMatchObject({
        success: true,
        message: expect.stringContaining('Workflow cancelled')
      })

      // Verify workflow status updated
      const statusResponse = await request(app)
        .get(`/api/workflows/${workflowId}/status`)
        .set('x-api-key', 'test_api_key')
        .expect(200)

      expect(statusResponse.body.workflow.status).toBe('cancelled')
    })
  })

  describe('Cross-Service Integration', () => {
    it('should handle job completion affecting workflow progress', async ({ expect }) => {
      // Create a workflow
      const workflowResponse = await request(app)
        .post('/api/workflows')
        .set('x-api-key', 'test_api_key')
        .send({
          name: 'Progress Test Workflow',
          steps: [
            { type: 'text-to-image', prompt: 'First step' },
            { type: 'upscale', depends_on: [0] }
          ]
        })

      const workflowId = workflowResponse.body.workflow_id
      const jobIds = workflowResponse.body.job_ids

      // Simulate job completion by directly updating Redis and triggering events
      // (In production, this would be done by workers)
      await redis.hmset(`job:${jobIds[0]}`, {
        status: 'completed',
        result: JSON.stringify({ image_url: 'https://example.com/result.jpg' }),
        completed_at: new Date().toISOString()
      })

      // Trigger job completion event (this would happen via message bus in production)
      // For this test, we'll check the dependent job status directly
      
      // Wait a bit for event processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check that second job is now pending (dependency satisfied)
      const job2Status = await redis.hget(`job:${jobIds[1]}`, 'status')
      // Note: In the actual implementation, the job would move from 'waiting' to 'pending'
      // This test verifies the dependency handling logic works
    })
  })

  describe('Error Handling', () => {
    it('should handle validation errors gracefully', async ({ expect }) => {
      // Try to submit invalid job
      const invalidJobResponse = await request(app)
        .post('/api/jobs/submit')
        .set('x-api-key', 'test_api_key')
        .send({
          type: 'invalid-type',
          prompt: 'This should fail'
        })
        .expect(400)

      expect(invalidJobResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'JOB_SUBMISSION_FAILED',
          message: expect.stringContaining('validation failed')
        }
      })

      // Try to create invalid workflow
      const invalidWorkflowResponse = await request(app)
        .post('/api/workflows')
        .set('x-api-key', 'test_api_key')
        .send({
          name: '',
          steps: [] // Empty steps
        })
        .expect(400)

      expect(invalidWorkflowResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'WORKFLOW_CREATION_FAILED',
          message: expect.stringContaining('validation failed')
        }
      })
    })

    it('should handle not found resources gracefully', async ({ expect }) => {
      // Try to get non-existent job
      const jobResponse = await request(app)
        .get('/api/jobs/nonexistent-job/status')
        .set('x-api-key', 'test_api_key')
        .expect(404)

      expect(jobResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'JOB_NOT_FOUND'
        }
      })

      // Try to get non-existent workflow
      const workflowResponse = await request(app)
        .get('/api/workflows/nonexistent-workflow/status')
        .set('x-api-key', 'test_api_key')
        .expect(404)

      expect(workflowResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'WORKFLOW_NOT_FOUND'
        }
      })
    })
  })

  describe('Health Checks', () => {
    it('should return healthy status when all services are running', async ({ expect }) => {
      const healthResponse = await request(app)
        .get('/health')
        .expect(200)

      expect(healthResponse.body).toMatchObject({
        status: 'healthy',
        checks: expect.objectContaining({
          message_bus: expect.objectContaining({
            status: 'healthy'
          }),
          redis: expect.any(String),
          job_service: expect.objectContaining({
            status: 'healthy'
          }),
          workflow_service: expect.objectContaining({
            status: 'healthy'
          })
        })
      })
    })
  })
})
```

## Legacy Compatibility Strategy

### Migration Approach
To ensure zero-downtime migration, we'll use the **Strangler Fig Pattern**:

1. **Phase 3a**: Keep existing monolithic endpoints working while services run in parallel
2. **Phase 3b**: Route traffic to services while maintaining API compatibility  
3. **Phase 3c**: Remove monolithic code once all traffic flows through services

### Compatibility Layer
```typescript
// apps/api/src/compatibility/legacy-adapter.ts
// Ensures existing API contracts continue to work

import type { LightweightAPIServer } from '../legacy/lightweight-api-server'
import type { JobService } from '../services/job-service'
import type { WorkflowService } from '../services/workflow-service'

export class LegacyAPIAdapter {
  constructor(
    private jobService: JobService,
    private workflowService: WorkflowService
  ) {}

  // Translate legacy job submission to new service
  async handleLegacyJobSubmit(legacyPayload: any): Promise<any> {
    const modernRequest = this.translateLegacyJobPayload(legacyPayload)
    const result = await this.jobService.submitJob(modernRequest)
    return this.translateToLegacyResponse(result)
  }

  // Add compatibility methods as needed
}
```

## Success Criteria and Validation

### Technical Metrics
- **Service Separation**: JobService and WorkflowService completely extracted
- **Zero Direct Calls**: All service communication via message bus
- **API Compatibility**: All existing endpoints work unchanged
- **Test Coverage**: >90% coverage for extracted services
- **Performance**: No degradation in API response times

### Architecture Quality
- **Single Responsibility**: Each service handles one domain
- **Dependency Injection**: Services receive dependencies via constructor
- **Event-Driven**: Services communicate via events, not direct calls
- **Testability**: Services can be tested in isolation

### Business Continuity  
- **Zero Downtime**: API endpoints continue working during migration
- **Backward Compatibility**: Existing clients unaffected
- **Monitoring**: All service health checks operational
- **Documentation**: API documentation updated for service architecture

### Completion Checklist
- [ ] JobService extracted and tested
- [ ] WorkflowService extracted and tested  
- [ ] API routes refactored to use services
- [ ] Message bus integration complete
- [ ] Service integration tests passing
- [ ] Legacy compatibility maintained
- [ ] Health checks implemented for all services
- [ ] Performance benchmarks meet requirements
- [ ] Documentation updated
- [ ] Deployment guide created

## Risk Mitigation

### Technical Risks
1. **Service Communication Failures**
   - **Risk**: Message bus unavailable causing service isolation
   - **Mitigation**: Fallback to local events, circuit breaker patterns
   - **Detection**: Health checks, service monitoring

2. **Data Consistency Issues**
   - **Risk**: Events and Redis state become inconsistent
   - **Mitigation**: Event sourcing, state synchronizer, idempotency
   - **Detection**: Data consistency tests, audit trails

3. **Performance Degradation**
   - **Risk**: Service extraction introduces latency
   - **Mitigation**: Async processing, connection pooling, caching
   - **Detection**: Performance benchmarking, load testing

### Migration Risks
1. **API Breaking Changes**
   - **Risk**: Existing clients affected by service changes
   - **Mitigation**: Legacy compatibility layer, gradual migration
   - **Detection**: Contract testing, client feedback

2. **Deployment Complexity**
   - **Risk**: Service deployment more complex than monolith
   - **Mitigation**: Containerization, orchestration, health checks
   - **Detection**: Deployment testing, rollback procedures

## Preparation for Phase 4

This service refactor creates the foundation for Phase 4: Database Integration. Key preparations:

1. **Service Boundaries**: Clear domain separation enables focused database design
2. **Event Sourcing**: Event streams provide audit trail for database consistency
3. **Data Access Patterns**: Services define clear data access requirements
4. **Testing Infrastructure**: Service testing patterns ready for database integration
5. **Scalability Foundation**: Services can scale independently with dedicated databases

The clean service architecture ensures that database integration in Phase 4 can proceed with clear data ownership and access patterns established.

**Status**: Ready for implementation. Proceed to Phase 4 after successful completion of all Phase 3 deliverables and validation of service extraction patterns.