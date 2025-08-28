# Phase 4: Database Integration Implementation Guide

## Executive Summary

This guide implements **hybrid persistence architecture** using **Prisma ORM + PostgreSQL** for structured data and **Redis** for job queuing, real-time events, and caching. Based on modern patterns from industry leaders, this approach provides ACID transactions, type safety, and horizontal scalability while maintaining Redis performance for ephemeral distributed machine workloads.

## Architecture Overview

### Hybrid Data Strategy
- **PostgreSQL (Prisma)**: User data, job metadata, machine configurations, billing records
- **Redis**: Active job queue, real-time events, session cache, webhook delivery status
- **Event Sourcing**: All state changes flow through message bus for consistency

```typescript
// Hybrid persistence pattern
interface DataLayer {
  // PostgreSQL via Prisma - ACID compliance
  persistent: {
    users: UserRepository
    jobTemplates: JobTemplateRepository 
    machines: MachineRepository
    billing: BillingRepository
  }
  
  // Redis - High performance ephemeral
  cache: {
    activeJobs: RedisJobQueue
    events: RedisStreams
    sessions: RedisCache
    webhookStatus: RedisHash
  }
}
```

### Core Principles

1. **Database-First Design**: PostgreSQL as source of truth for structured data
2. **Cache-Aside Pattern**: Redis enhances performance without compromising consistency  
3. **Event-Driven Sync**: Message bus keeps both systems synchronized
4. **Type-Safe Operations**: Prisma provides compile-time type safety
5. **Migration-First**: Schema changes via Prisma migrations with Redis compatibility

## Technical Architecture

### Database Schema Design

```prisma
// /packages/database/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// User Management
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // Relations
  jobRequests JobRequest[]
  apiKeys     ApiKey[]
  
  @@map("users")
}

// Job Templates and Requests
model JobTemplate {
  id          String   @id @default(cuid())
  name        String
  description String?
  schema      Json     // ComfyUI workflow schema
  category    String
  isPublic    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  userId      String
  user        User @relation(fields: [userId], references: [id])
  
  jobRequests JobRequest[]
  
  @@map("job_templates")
  @@index([category, isPublic])
}

model JobRequest {
  id              String    @id @default(cuid())
  templateId      String?
  customWorkflow  Json?     // Direct ComfyUI workflow
  parameters      Json      // Job parameters
  status          JobStatus @default(QUEUED)
  priority        Int       @default(10)
  createdAt       DateTime  @default(now())
  completedAt     DateTime?
  failedAt        DateTime?
  errorMessage    String?
  
  userId     String
  user       User @relation(fields: [userId], references: [id])
  template   JobTemplate? @relation(fields: [templateId], references: [id])
  
  // Job execution tracking
  executions JobExecution[]
  
  @@map("job_requests")
  @@index([status, priority, createdAt])
  @@index([userId, createdAt])
}

enum JobStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
  CANCELLED
}

// Machine and Execution Tracking
model Machine {
  id              String    @id @default(cuid())
  externalId      String    @unique // SALAD/vast.ai machine ID
  provider        String    // "salad", "vastai"
  region          String?
  capabilities    Json      // GPU type, memory, etc.
  status          MachineStatus @default(STARTING)
  lastHeartbeat   DateTime?
  registeredAt    DateTime  @default(now())
  terminatedAt    DateTime?
  
  executions JobExecution[]
  
  @@map("machines")
  @@index([status, lastHeartbeat])
  @@index([provider, region])
}

enum MachineStatus {
  STARTING
  AVAILABLE
  BUSY
  OFFLINE
  TERMINATED
}

model JobExecution {
  id            String    @id @default(cuid())
  jobRequestId  String
  machineId     String
  startedAt     DateTime  @default(now())
  completedAt   DateTime?
  failedAt      DateTime?
  errorMessage  String?
  outputs       Json?     // Generated assets URLs
  
  jobRequest JobRequest @relation(fields: [jobRequestId], references: [id])
  machine    Machine @relation(fields: [machineId], references: [id])
  
  @@map("job_executions")
  @@index([jobRequestId])
  @@index([machineId, startedAt])
}

// API Keys and Authentication
model ApiKey {
  id        String   @id @default(cuid())
  name      String
  keyHash   String   @unique // Hashed API key
  userId    String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  lastUsed  DateTime?
  
  user User @relation(fields: [userId], references: [id])
  
  @@map("api_keys")
  @@index([keyHash])
  @@index([userId, isActive])
}

// Configuration and Settings
model SystemConfig {
  key       String   @id
  value     Json
  updatedAt DateTime @default(now()) @updatedAt
  
  @@map("system_config")
}
```

### Repository Pattern Implementation

```typescript
// /packages/database/src/repositories/base-repository.ts
import { PrismaClient } from '@prisma/client'

export abstract class BaseRepository {
  constructor(protected prisma: PrismaClient) {}
  
  protected handleError(error: any, operation: string): never {
    if (error.code === 'P2002') {
      throw new ConflictError(`Unique constraint violation in ${operation}`)
    }
    if (error.code === 'P2025') {
      throw new NotFoundError(`Record not found in ${operation}`)
    }
    throw new DatabaseError(`Database operation failed: ${operation}`, error)
  }
}

// /packages/database/src/repositories/job-repository.ts
import { JobRequest, JobStatus, Prisma } from '@prisma/client'
import { BaseRepository } from './base-repository'

export interface CreateJobRequest {
  userId: string
  templateId?: string
  customWorkflow?: Record<string, any>
  parameters: Record<string, any>
  priority?: number
}

export interface JobRequestWithRelations extends JobRequest {
  user: { id: string; name: string | null; email: string }
  template?: { name: string; category: string } | null
  executions: Array<{
    id: string
    machineId: string
    startedAt: Date
    completedAt: Date | null
  }>
}

export class JobRepository extends BaseRepository {
  async create(data: CreateJobRequest): Promise<JobRequest> {
    try {
      return await this.prisma.jobRequest.create({
        data: {
          userId: data.userId,
          templateId: data.templateId,
          customWorkflow: data.customWorkflow || Prisma.JsonNull,
          parameters: data.parameters,
          priority: data.priority || 10,
          status: 'QUEUED'
        }
      })
    } catch (error) {
      this.handleError(error, 'create job request')
    }
  }

  async findById(id: string): Promise<JobRequestWithRelations | null> {
    try {
      return await this.prisma.jobRequest.findUnique({
        where: { id },
        include: {
          user: { select: { id: true, name: true, email: true } },
          template: { select: { name: true, category: true } },
          executions: {
            select: {
              id: true,
              machineId: true,
              startedAt: true,
              completedAt: true
            }
          }
        }
      })
    } catch (error) {
      this.handleError(error, 'find job request')
    }
  }

  async findByStatus(status: JobStatus, limit = 50): Promise<JobRequestWithRelations[]> {
    try {
      return await this.prisma.jobRequest.findMany({
        where: { status },
        include: {
          user: { select: { id: true, name: true, email: true } },
          template: { select: { name: true, category: true } },
          executions: {
            select: {
              id: true,
              machineId: true,
              startedAt: true,
              completedAt: true
            }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ],
        take: limit
      })
    } catch (error) {
      this.handleError(error, 'find jobs by status')
    }
  }

  async updateStatus(id: string, status: JobStatus, errorMessage?: string): Promise<JobRequest> {
    try {
      const updateData: Prisma.JobRequestUpdateInput = {
        status,
        updatedAt: new Date()
      }

      if (status === 'COMPLETED') {
        updateData.completedAt = new Date()
      } else if (status === 'FAILED') {
        updateData.failedAt = new Date()
        updateData.errorMessage = errorMessage
      }

      return await this.prisma.jobRequest.update({
        where: { id },
        data: updateData
      })
    } catch (error) {
      this.handleError(error, 'update job status')
    }
  }

  async findQueuedJobs(machineCapabilities: Record<string, any>, limit = 10): Promise<JobRequestWithRelations[]> {
    try {
      // This would include capability matching logic
      // For now, simplified to get queued jobs by priority
      return await this.prisma.jobRequest.findMany({
        where: { status: 'QUEUED' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          template: { select: { name: true, category: true } },
          executions: { select: { id: true, machineId: true, startedAt: true, completedAt: true } }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' }
        ],
        take: limit
      })
    } catch (error) {
      this.handleError(error, 'find queued jobs')
    }
  }

  async getUserJobHistory(userId: string, limit = 100): Promise<JobRequestWithRelations[]> {
    try {
      return await this.prisma.jobRequest.findMany({
        where: { userId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          template: { select: { name: true, category: true } },
          executions: { select: { id: true, machineId: true, startedAt: true, completedAt: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: limit
      })
    } catch (error) {
      this.handleError(error, 'get user job history')
    }
  }
}
```

### Machine Repository

```typescript
// /packages/database/src/repositories/machine-repository.ts
import { Machine, MachineStatus } from '@prisma/client'
import { BaseRepository } from './base-repository'

export interface RegisterMachineData {
  externalId: string
  provider: 'salad' | 'vastai'
  region?: string
  capabilities: Record<string, any>
}

export class MachineRepository extends BaseRepository {
  async register(data: RegisterMachineData): Promise<Machine> {
    try {
      return await this.prisma.machine.upsert({
        where: { externalId: data.externalId },
        update: {
          status: 'AVAILABLE',
          capabilities: data.capabilities,
          lastHeartbeat: new Date(),
          region: data.region
        },
        create: {
          externalId: data.externalId,
          provider: data.provider,
          region: data.region,
          capabilities: data.capabilities,
          status: 'AVAILABLE',
          lastHeartbeat: new Date()
        }
      })
    } catch (error) {
      this.handleError(error, 'register machine')
    }
  }

  async updateHeartbeat(externalId: string): Promise<Machine> {
    try {
      return await this.prisma.machine.update({
        where: { externalId },
        data: {
          lastHeartbeat: new Date(),
          status: 'AVAILABLE'
        }
      })
    } catch (error) {
      this.handleError(error, 'update machine heartbeat')
    }
  }

  async updateStatus(externalId: string, status: MachineStatus): Promise<Machine> {
    try {
      return await this.prisma.machine.update({
        where: { externalId },
        data: { 
          status,
          lastHeartbeat: new Date(),
          ...(status === 'TERMINATED' && { terminatedAt: new Date() })
        }
      })
    } catch (error) {
      this.handleError(error, 'update machine status')
    }
  }

  async findAvailableMachines(): Promise<Machine[]> {
    try {
      return await this.prisma.machine.findMany({
        where: { 
          status: 'AVAILABLE',
          lastHeartbeat: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
          }
        },
        orderBy: { lastHeartbeat: 'desc' }
      })
    } catch (error) {
      this.handleError(error, 'find available machines')
    }
  }

  async cleanupStaleHeartbeats(): Promise<number> {
    try {
      const result = await this.prisma.machine.updateMany({
        where: {
          lastHeartbeat: {
            lt: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
          },
          status: { not: 'TERMINATED' }
        },
        data: { status: 'OFFLINE' }
      })
      return result.count
    } catch (error) {
      this.handleError(error, 'cleanup stale heartbeats')
    }
  }
}
```

### Database Service Integration

```typescript
// /packages/database/src/database-service.ts
import { PrismaClient } from '@prisma/client'
import { JobRepository } from './repositories/job-repository'
import { MachineRepository } from './repositories/machine-repository'
import { UserRepository } from './repositories/user-repository'
import { ApiKeyRepository } from './repositories/api-key-repository'

export class DatabaseService {
  private prisma: PrismaClient
  
  public readonly jobs: JobRepository
  public readonly machines: MachineRepository
  public readonly users: UserRepository
  public readonly apiKeys: ApiKeyRepository

  constructor(databaseUrl?: string) {
    this.prisma = new PrismaClient({
      datasources: {
        db: { url: databaseUrl || process.env.DATABASE_URL }
      },
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['warn', 'error']
    })

    // Initialize repositories
    this.jobs = new JobRepository(this.prisma)
    this.machines = new MachineRepository(this.prisma)
    this.users = new UserRepository(this.prisma)
    this.apiKeys = new ApiKeyRepository(this.prisma)
  }

  async connect(): Promise<void> {
    try {
      await this.prisma.$connect()
      console.log('✅ Database connected successfully')
    } catch (error) {
      console.error('❌ Database connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect()
  }

  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { healthy: true, latency: Date.now() - start }
    } catch (error) {
      return { healthy: false, latency: Date.now() - start }
    }
  }

  // Transaction support for complex operations
  async transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return await this.prisma.$transaction(fn)
  }
}

// Singleton instance for application use
export const database = new DatabaseService()
```

### Redis-Database Synchronization

```typescript
// /packages/database/src/sync/database-redis-sync.ts
import { MessageBusService, JobEventData } from '@emp/message-bus'
import { DatabaseService } from '../database-service'
import { RedisJobQueue } from '@emp/core'

export class DatabaseRedisSyncService {
  constructor(
    private database: DatabaseService,
    private messageBus: MessageBusService,
    private jobQueue: RedisJobQueue
  ) {}

  async initialize(): Promise<void> {
    // Subscribe to relevant events
    await this.messageBus.subscribe('job.submitted', this.handleJobSubmitted.bind(this))
    await this.messageBus.subscribe('job.status.updated', this.handleJobStatusUpdated.bind(this))
    await this.messageBus.subscribe('machine.registered', this.handleMachineRegistered.bind(this))
    await this.messageBus.subscribe('machine.heartbeat', this.handleMachineHeartbeat.bind(this))
    
    console.log('✅ Database-Redis sync service initialized')
  }

  private async handleJobSubmitted(event: JobEventData): Promise<void> {
    try {
      // Job already exists in PostgreSQL from API submission
      // Ensure Redis queue has the job
      const job = await this.database.jobs.findById(event.jobId)
      if (!job) {
        console.warn(`Job ${event.jobId} not found in database`)
        return
      }

      // Add to Redis queue for worker consumption
      await this.jobQueue.enqueueJob({
        id: job.id,
        userId: job.userId,
        templateId: job.templateId,
        customWorkflow: job.customWorkflow,
        parameters: job.parameters,
        priority: job.priority,
        requirements: this.extractJobRequirements(job)
      })

      console.log(`✅ Job ${event.jobId} synchronized to Redis queue`)
    } catch (error) {
      console.error(`❌ Failed to sync job submission for ${event.jobId}:`, error)
    }
  }

  private async handleJobStatusUpdated(event: JobEventData): Promise<void> {
    try {
      // Update PostgreSQL record
      await this.database.jobs.updateStatus(
        event.jobId, 
        event.status as any, 
        event.errorMessage
      )

      // Update Redis if needed (for real-time updates)
      if (event.status === 'COMPLETED' || event.status === 'FAILED') {
        await this.jobQueue.removeJob(event.jobId)
      }

      console.log(`✅ Job ${event.jobId} status updated to ${event.status}`)
    } catch (error) {
      console.error(`❌ Failed to sync job status update for ${event.jobId}:`, error)
    }
  }

  private async handleMachineRegistered(event: any): Promise<void> {
    try {
      await this.database.machines.register({
        externalId: event.machineId,
        provider: event.provider,
        region: event.region,
        capabilities: event.capabilities
      })

      console.log(`✅ Machine ${event.machineId} registered in database`)
    } catch (error) {
      console.error(`❌ Failed to register machine ${event.machineId}:`, error)
    }
  }

  private async handleMachineHeartbeat(event: any): Promise<void> {
    try {
      await this.database.machines.updateHeartbeat(event.machineId)
    } catch (error) {
      console.error(`❌ Failed to update heartbeat for ${event.machineId}:`, error)
    }
  }

  private extractJobRequirements(job: any): Record<string, any> {
    // Extract hardware requirements from job template or workflow
    // This would analyze the ComfyUI workflow to determine GPU requirements
    return {
      gpuType: 'any', // Could be 'rtx4090', 'a100', etc.
      minVram: 8, // GB
      estimatedDuration: 300 // seconds - could be ML predicted
    }
  }

  async performMaintenance(): Promise<void> {
    try {
      // Clean up stale machine heartbeats
      const staleCount = await this.database.machines.cleanupStaleHeartbeats()
      console.log(`🧹 Cleaned up ${staleCount} stale machine heartbeats`)

      // Could add more maintenance tasks:
      // - Archive completed jobs older than X days
      // - Clean up orphaned Redis keys
      // - Update job execution statistics
    } catch (error) {
      console.error('❌ Maintenance task failed:', error)
    }
  }
}
```

### Enhanced Job Service with Database Integration

```typescript
// /apps/api/src/services/enhanced-job-service.ts
import { DatabaseService } from '@emp/database'
import { MessageBusService } from '@emp/message-bus'
import { RedisJobQueue } from '@emp/core'
import { v4 as uuidv4 } from 'uuid'

export interface SubmitJobRequest {
  userId: string
  templateId?: string
  customWorkflow?: Record<string, any>
  parameters: Record<string, any>
  priority?: number
}

export interface JobSubmissionResponse {
  success: boolean
  jobId: string
  status: string
  estimatedCompletionTime?: number
}

export class EnhancedJobService {
  constructor(
    private database: DatabaseService,
    private messageBus: MessageBusService,
    private jobQueue: RedisJobQueue
  ) {}

  async submitJob(request: SubmitJobRequest): Promise<JobSubmissionResponse> {
    // Input validation
    if (!request.userId) {
      throw new ValidationError('User ID is required')
    }

    if (!request.templateId && !request.customWorkflow) {
      throw new ValidationError('Either templateId or customWorkflow must be provided')
    }

    try {
      // Use database transaction for consistency
      const result = await this.database.transaction(async (tx) => {
        // Create job request in PostgreSQL
        const jobRequest = await tx.jobRequest.create({
          data: {
            userId: request.userId,
            templateId: request.templateId,
            customWorkflow: request.customWorkflow || null,
            parameters: request.parameters,
            priority: request.priority || 10,
            status: 'QUEUED'
          }
        })

        // Publish event for Redis sync and other subscribers
        await this.messageBus.publishEvent({
          type: 'job.submitted',
          timestamp: new Date(),
          jobId: jobRequest.id,
          userId: request.userId,
          templateId: request.templateId,
          priority: jobRequest.priority
        })

        return jobRequest
      })

      // Estimate completion time based on queue size and job complexity
      const estimatedTime = await this.estimateCompletionTime(result.id)

      return {
        success: true,
        jobId: result.id,
        status: result.status,
        estimatedCompletionTime: estimatedTime
      }
    } catch (error) {
      console.error('Failed to submit job:', error)
      throw new ServiceError('Job submission failed', error)
    }
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.database.jobs.findById(jobId)
    if (!job) {
      throw new NotFoundError('Job not found')
    }

    return {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      errorMessage: job.errorMessage,
      user: job.user,
      template: job.template,
      executions: job.executions,
      progress: await this.getJobProgress(jobId) // From Redis cache
    }
  }

  async getUserJobs(userId: string, limit = 50): Promise<any[]> {
    const jobs = await this.database.jobs.getUserJobHistory(userId, limit)
    
    // Enrich with real-time data from Redis where applicable
    return Promise.all(jobs.map(async (job) => ({
      ...job,
      progress: job.status === 'PROCESSING' 
        ? await this.getJobProgress(job.id) 
        : undefined
    })))
  }

  async cancelJob(jobId: string, userId: string): Promise<boolean> {
    const job = await this.database.jobs.findById(jobId)
    if (!job) {
      throw new NotFoundError('Job not found')
    }

    if (job.userId !== userId) {
      throw new ForbiddenError('Cannot cancel job belonging to another user')
    }

    if (!['QUEUED', 'PROCESSING'].includes(job.status)) {
      throw new ValidationError('Cannot cancel job in current status')
    }

    try {
      // Update database
      await this.database.jobs.updateStatus(jobId, 'CANCELLED')

      // Publish cancellation event
      await this.messageBus.publishEvent({
        type: 'job.cancelled',
        timestamp: new Date(),
        jobId,
        userId
      })

      return true
    } catch (error) {
      console.error('Failed to cancel job:', error)
      throw new ServiceError('Job cancellation failed', error)
    }
  }

  private async estimateCompletionTime(jobId: string): Promise<number> {
    // This would involve:
    // 1. Check current queue length
    // 2. Analyze job complexity 
    // 3. Consider available machine capacity
    // 4. Use historical data for similar jobs
    
    const queueLength = await this.jobQueue.getQueueLength()
    const avgProcessingTime = 300 // seconds - could be ML predicted
    
    return queueLength * avgProcessingTime
  }

  private async getJobProgress(jobId: string): Promise<number | undefined> {
    // Get real-time progress from Redis cache
    // This would be updated by the worker during job execution
    return await this.jobQueue.getJobProgress(jobId)
  }
}
```

## Migration Strategy

### Phase 4.1: Database Setup and Basic Integration

```bash
# /packages/database/setup.sh
#!/bin/bash

echo "🚀 Setting up PostgreSQL database..."

# Install dependencies
pnpm add prisma @prisma/client
pnpm add -D @types/uuid uuid

# Initialize Prisma
npx prisma init

# Generate Prisma client
npx prisma generate

# Run initial migration
npx prisma migrate dev --name init

echo "✅ Database setup complete"
```

```typescript
// /packages/database/src/migrations/001_initial_setup.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Running initial data setup...')
  
  // Create default system configurations
  await prisma.systemConfig.createMany({
    data: [
      { key: 'max_concurrent_jobs_per_user', value: 10 },
      { key: 'default_job_timeout_minutes', value: 30 },
      { key: 'max_queue_size', value: 1000 }
    ],
    skipDuplicates: true
  })

  console.log('✅ Initial data setup complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### Phase 4.2: Repository Pattern Implementation

```typescript
// /packages/database/test/job-repository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../src/database-service'

describe('JobRepository', () => {
  let database: DatabaseService

  beforeEach(async () => {
    database = new DatabaseService(process.env.TEST_DATABASE_URL)
    await database.connect()
  })

  afterEach(async () => {
    await database.disconnect()
  })

  it('should create and retrieve a job request', async () => {
    // Create test user first
    const user = await database.users.create({
      email: 'test@example.com',
      name: 'Test User'
    })

    // Create job request
    const jobData = {
      userId: user.id,
      parameters: { prompt: 'A beautiful landscape' },
      priority: 5
    }

    const job = await database.jobs.create(jobData)

    expect(job.id).toBeDefined()
    expect(job.status).toBe('QUEUED')
    expect(job.userId).toBe(user.id)
    expect(job.priority).toBe(5)

    // Retrieve and verify
    const retrieved = await database.jobs.findById(job.id)
    expect(retrieved).toBeDefined()
    expect(retrieved?.user.email).toBe('test@example.com')
  })

  it('should find jobs by status with proper ordering', async () => {
    // Create test data...
    const queuedJobs = await database.jobs.findByStatus('QUEUED', 10)
    
    // Verify ordering: priority desc, then createdAt asc
    for (let i = 1; i < queuedJobs.length; i++) {
      const prev = queuedJobs[i - 1]
      const curr = queuedJobs[i]
      
      expect(prev.priority >= curr.priority).toBe(true)
      if (prev.priority === curr.priority) {
        expect(prev.createdAt <= curr.createdAt).toBe(true)
      }
    }
  })

  it('should handle concurrent job status updates', async () => {
    const job = await database.jobs.create({
      userId: 'user1',
      parameters: { test: true }
    })

    // Simulate concurrent updates
    const updates = Promise.all([
      database.jobs.updateStatus(job.id, 'PROCESSING'),
      database.jobs.updateStatus(job.id, 'COMPLETED')
    ])

    // One should succeed, implementation handles concurrency
    await expect(updates).resolves.toBeDefined()
  })
})
```

### Phase 4.3: Event-Driven Synchronization

```typescript
// /apps/api/src/enhanced-api-server.ts
import express from 'express'
import { DatabaseService, database } from '@emp/database'
import { MessageBusService } from '@emp/message-bus'
import { RedisJobQueue } from '@emp/core'
import { DatabaseRedisSyncService } from '@emp/database'
import { EnhancedJobService } from './services/enhanced-job-service'

export class EnhancedApiServer {
  private app: express.Application
  private messageBus: MessageBusService
  private jobQueue: RedisJobQueue
  private syncService: DatabaseRedisSyncService
  private jobService: EnhancedJobService

  constructor() {
    this.app = express()
    this.messageBus = new MessageBusService()
    this.jobQueue = new RedisJobQueue()
    
    // Initialize sync service
    this.syncService = new DatabaseRedisSyncService(
      database,
      this.messageBus,
      this.jobQueue
    )

    // Initialize enhanced job service
    this.jobService = new EnhancedJobService(
      database,
      this.messageBus,
      this.jobQueue
    )
  }

  async initialize(): Promise<void> {
    // Connect to database
    await database.connect()
    
    // Initialize message bus
    await this.messageBus.initialize()
    
    // Initialize sync service
    await this.syncService.initialize()
    
    // Setup routes
    this.setupRoutes()
    
    // Start maintenance tasks
    this.startMaintenanceTasks()
    
    console.log('✅ Enhanced API server initialized')
  }

  private setupRoutes(): void {
    this.app.use(express.json())

    // Job management routes
    this.app.post('/api/jobs', async (req, res) => {
      try {
        const result = await this.jobService.submitJob(req.body)
        res.json(result)
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })

    this.app.get('/api/jobs/:id', async (req, res) => {
      try {
        const job = await this.jobService.getJobStatus(req.params.id)
        res.json(job)
      } catch (error) {
        res.status(404).json({ error: error.message })
      }
    })

    this.app.get('/api/users/:userId/jobs', async (req, res) => {
      try {
        const jobs = await this.jobService.getUserJobs(req.params.userId)
        res.json(jobs)
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })

    this.app.delete('/api/jobs/:id', async (req, res) => {
      try {
        await this.jobService.cancelJob(req.params.id, req.body.userId)
        res.json({ success: true })
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })

    // Health check
    this.app.get('/health', async (req, res) => {
      const dbHealth = await database.healthCheck()
      res.json({
        status: 'ok',
        database: dbHealth,
        timestamp: new Date().toISOString()
      })
    })
  }

  private startMaintenanceTasks(): void {
    // Run maintenance every 5 minutes
    setInterval(async () => {
      try {
        await this.syncService.performMaintenance()
      } catch (error) {
        console.error('Maintenance task error:', error)
      }
    }, 5 * 60 * 1000)
  }

  async start(port = 3000): Promise<void> {
    await this.initialize()
    
    this.app.listen(port, () => {
      console.log(`🚀 Enhanced API server running on port ${port}`)
    })
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down API server...')
    await database.disconnect()
    await this.messageBus.shutdown()
    console.log('✅ API server shutdown complete')
  }
}
```

## Testing Strategy

### Database Testing Setup

```typescript
// /packages/database/vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 10000,
    env: {
      TEST_DATABASE_URL: 'postgresql://test:test@localhost:5433/emp_test?schema=public'
    }
  }
})
```

```typescript
// /packages/database/test/setup.ts
import { beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { DatabaseService } from '../src/database-service'

beforeAll(async () => {
  // Reset test database
  execSync('npx prisma migrate reset --force --schema=./prisma/schema.prisma', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }
  })
})

afterAll(async () => {
  // Cleanup connections
  const database = new DatabaseService(process.env.TEST_DATABASE_URL)
  await database.disconnect()
})
```

### Integration Testing

```typescript
// /packages/database/test/integration/database-redis-sync.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseService } from '../../src/database-service'
import { MessageBusService } from '@emp/message-bus'
import { RedisJobQueue } from '@emp/core'
import { DatabaseRedisSyncService } from '../../src/sync/database-redis-sync'

describe('Database-Redis Sync Integration', () => {
  let database: DatabaseService
  let messageBus: MessageBusService
  let jobQueue: RedisJobQueue
  let syncService: DatabaseRedisSyncService

  beforeEach(async () => {
    database = new DatabaseService(process.env.TEST_DATABASE_URL)
    messageBus = new MessageBusService()
    jobQueue = new RedisJobQueue()
    syncService = new DatabaseRedisSyncService(database, messageBus, jobQueue)

    await database.connect()
    await messageBus.initialize()
    await syncService.initialize()
  })

  afterEach(async () => {
    await database.disconnect()
    await messageBus.shutdown()
  })

  it('should sync job submission from database to Redis', async () => {
    // Create user
    const user = await database.users.create({
      email: 'sync-test@example.com',
      name: 'Sync Test'
    })

    // Create job in database
    const job = await database.jobs.create({
      userId: user.id,
      parameters: { prompt: 'Test sync' },
      priority: 5
    })

    // Publish job submitted event
    await messageBus.publishEvent({
      type: 'job.submitted',
      timestamp: new Date(),
      jobId: job.id,
      userId: user.id,
      priority: 5
    })

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify job exists in Redis queue
    const queueLength = await jobQueue.getQueueLength()
    expect(queueLength).toBeGreaterThan(0)
  })

  it('should handle machine registration sync', async () => {
    const machineId = 'test-machine-123'
    
    // Publish machine registered event
    await messageBus.publishEvent({
      type: 'machine.registered',
      timestamp: new Date(),
      machineId,
      provider: 'salad',
      capabilities: { gpu: 'rtx4090', vram: 24 }
    })

    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify machine exists in database
    const machine = await database.machines.findByExternalId(machineId)
    expect(machine).toBeDefined()
    expect(machine?.provider).toBe('salad')
  })
})
```

## Performance Considerations

### Database Performance Optimization

```sql
-- /packages/database/sql/indexes.sql
-- Performance indexes for common queries

-- Job queries by user and status
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_requests_user_status_created 
ON job_requests (user_id, status, created_at DESC);

-- Job queue optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_requests_queue_priority 
ON job_requests (status, priority DESC, created_at ASC)
WHERE status = 'QUEUED';

-- Machine heartbeat cleanup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_machines_heartbeat_status 
ON machines (last_heartbeat, status)
WHERE status != 'TERMINATED';

-- API key lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_hash_active 
ON api_keys (key_hash)
WHERE is_active = true;

-- Job execution analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_job_executions_machine_time 
ON job_executions (machine_id, started_at DESC);
```

### Connection Pooling Configuration

```typescript
// /packages/database/src/config/prisma-config.ts
export const getPrismaConfig = () => ({
  datasources: {
    db: { 
      url: process.env.DATABASE_URL 
    }
  },
  // Connection pool settings
  __internal: {
    engine: {
      endpoint: process.env.DATABASE_URL,
      connectionString: process.env.DATABASE_URL,
    },
  },
  // Production optimizations
  log: process.env.NODE_ENV === 'production' 
    ? ['error'] 
    : ['query', 'info', 'warn', 'error'],
    
  // Connection pool configuration
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
  maxIdleTime: 60000, // 1 minute
  maxLifetime: 1800000, // 30 minutes
})
```

## Monitoring and Observability

### Database Metrics Collection

```typescript
// /packages/database/src/monitoring/database-metrics.ts
import { DatabaseService } from '../database-service'

export class DatabaseMetrics {
  constructor(private database: DatabaseService) {}

  async collectMetrics(): Promise<Record<string, any>> {
    const [
      healthCheck,
      jobStats,
      machineStats,
      userStats
    ] = await Promise.all([
      this.database.healthCheck(),
      this.getJobStatistics(),
      this.getMachineStatistics(), 
      this.getUserStatistics()
    ])

    return {
      timestamp: new Date().toISOString(),
      database: healthCheck,
      jobs: jobStats,
      machines: machineStats,
      users: userStats
    }
  }

  private async getJobStatistics() {
    const [queued, processing, completed, failed] = await Promise.all([
      this.database.jobs.findByStatus('QUEUED', 1).then(jobs => jobs.length),
      this.database.jobs.findByStatus('PROCESSING', 1).then(jobs => jobs.length),
      this.countJobsByStatus('COMPLETED'),
      this.countJobsByStatus('FAILED')
    ])

    return { queued, processing, completed, failed }
  }

  private async countJobsByStatus(status: string): Promise<number> {
    // This would be a raw query for performance
    const result = await this.database.$queryRaw`
      SELECT COUNT(*) as count 
      FROM job_requests 
      WHERE status = ${status}
      AND created_at > NOW() - INTERVAL '24 hours'
    `
    return parseInt(result[0].count)
  }

  private async getMachineStatistics() {
    // Similar implementation for machine stats
    return {
      available: 0,
      busy: 0,
      offline: 0,
      totalRegistered: 0
    }
  }

  private async getUserStatistics() {
    // User activity statistics
    return {
      activeToday: 0,
      totalUsers: 0
    }
  }
}
```

## Security Considerations

### Data Protection and Access Control

```typescript
// /packages/database/src/security/data-access-control.ts
export class DataAccessControl {
  static validateUserAccess(requestUserId: string, resourceUserId: string): boolean {
    if (requestUserId !== resourceUserId) {
      throw new ForbiddenError('Access denied to resource')
    }
    return true
  }

  static sanitizeJobParameters(parameters: any): any {
    // Remove potentially dangerous parameters
    const sanitized = { ...parameters }
    delete sanitized.__proto__
    delete sanitized.constructor
    delete sanitized.prototype
    
    // Additional sanitization for ComfyUI workflows
    if (sanitized.workflow) {
      sanitized.workflow = this.sanitizeWorkflow(sanitized.workflow)
    }
    
    return sanitized
  }

  private static sanitizeWorkflow(workflow: any): any {
    // Remove dangerous node types or parameters
    // This would be specific to ComfyUI security considerations
    return workflow
  }
}
```

### API Key Management

```typescript
// /packages/database/src/repositories/api-key-repository.ts
import { ApiKey } from '@prisma/client'
import { BaseRepository } from './base-repository'
import { createHash, randomBytes } from 'crypto'

export class ApiKeyRepository extends BaseRepository {
  async create(userId: string, name: string): Promise<{ key: string; apiKey: ApiKey }> {
    // Generate secure API key
    const key = this.generateApiKey()
    const keyHash = this.hashApiKey(key)

    try {
      const apiKey = await this.prisma.apiKey.create({
        data: {
          name,
          userId,
          keyHash,
          isActive: true
        }
      })

      return { key, apiKey }
    } catch (error) {
      this.handleError(error, 'create API key')
    }
  }

  async validateKey(key: string): Promise<ApiKey & { user: any } | null> {
    const keyHash = this.hashApiKey(key)
    
    try {
      const apiKey = await this.prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: true }
      })

      if (apiKey && apiKey.isActive) {
        // Update last used timestamp
        await this.prisma.apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsed: new Date() }
        })
      }

      return apiKey
    } catch (error) {
      this.handleError(error, 'validate API key')
    }
  }

  private generateApiKey(): string {
    return `emp_${randomBytes(32).toString('hex')}`
  }

  private hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex')
  }
}
```

## Deployment Configuration

### Environment Configuration

```bash
# /.env.example
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/emp_job_queue?schema=public"
TEST_DATABASE_URL="postgresql://test:test@localhost:5433/emp_test?schema=public"

# Redis Configuration  
REDIS_URL="redis://localhost:6379"
REDIS_PASSWORD=""

# Database Pool Settings
DB_CONNECTION_LIMIT=10
DB_QUERY_TIMEOUT=30000
DB_IDLE_TIMEOUT=60000

# Migration Settings
SHADOW_DATABASE_URL="postgresql://username:password@localhost:5432/emp_shadow?schema=public"
```

### Docker Compose Database Services

```yaml
# /docker-compose.database.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: emp_job_queue
      POSTGRES_USER: emp_user
      POSTGRES_PASSWORD: emp_password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./packages/database/sql/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U emp_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  postgres-test:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: emp_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
    volumes:
      - postgres_test_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  postgres_data:
  postgres_test_data:
  redis_data:
```

## Success Criteria and Validation

### Acceptance Criteria

1. **✅ Dual Persistence**: PostgreSQL stores authoritative data, Redis handles queues and cache
2. **✅ Type Safety**: All database operations are type-safe via Prisma
3. **✅ Event Consistency**: Message bus keeps both systems synchronized
4. **✅ Migration Safety**: Schema changes through Prisma migrations
5. **✅ Performance**: Sub-100ms query response times for common operations
6. **✅ Reliability**: Proper error handling and transaction support

### Testing Checklist

```typescript
// /packages/database/test/acceptance.test.ts
describe('Phase 4 Acceptance Tests', () => {
  it('✅ should maintain data consistency between PostgreSQL and Redis', async () => {
    // Test dual-write consistency
  })

  it('✅ should provide type-safe database operations', async () => {
    // Test Prisma type safety
  })

  it('✅ should handle concurrent operations correctly', async () => {
    // Test transaction isolation
  })

  it('✅ should sync events between database and Redis', async () => {
    // Test event-driven synchronization
  })

  it('✅ should perform migrations safely', async () => {
    // Test schema migration process
  })

  it('✅ should meet performance requirements', async () => {
    // Test query response times
  })
})
```

This Phase 4 implementation provides a robust, type-safe database layer that maintains Redis performance while adding PostgreSQL reliability. The hybrid architecture supports the system's evolution toward specialized machine pools while ensuring data consistency and developer productivity.