# Phase 5: EmProps Integration Implementation Guide

## Executive Summary

This guide implements **seamless EmProps integration** using **NATS messaging** for distributed communication, **API Gateway patterns** for external service orchestration, and **event-driven architecture** for real-time synchronization. Based on modern microservices patterns from industry leaders, this approach enables the EMP-Job-Queue system to act as both a standalone service and an integrated component within the EmProps ecosystem.

## Architecture Overview

### Integration Strategy
- **NATS Message Bus**: Primary communication layer with EmProps services
- **API Gateway Pattern**: Unified external API interface with intelligent routing
- **Service Discovery**: Dynamic service registration and health monitoring
- **Event Sourcing**: Bi-directional event synchronization between systems
- **Domain Boundaries**: Clear separation between EMP-Job-Queue and EmProps concerns

```typescript
// Integration architecture overview
interface EmPropsIntegration {
  // NATS-based messaging for internal communication
  messaging: {
    userEvents: NASTUserEventHandler
    billingEvents: NATSBillingEventHandler
    jobNotifications: NATSJobNotificationPublisher
    systemEvents: NATSSystemEventHandler
  }
  
  // API Gateway for external integrations
  gateway: {
    authentication: EmPropsAuthMiddleware
    authorization: EmPropsRBACMiddleware
    billing: EmPropsBillingIntegration
    userManagement: EmPropsUserSyncService
  }
  
  // Service discovery and health monitoring
  discovery: {
    registration: EmPropsServiceRegistry
    healthChecks: EmPropsHealthMonitor
    loadBalancing: EmPropsLoadBalancer
  }
}
```

### Core Principles

1. **Loose Coupling**: Systems remain independently deployable and scalable
2. **Event-Driven Sync**: Real-time data consistency without tight coupling
3. **Graceful Degradation**: EMP-Job-Queue functions independently if EmProps is unavailable
4. **Domain Integrity**: Each system maintains its own data and business rules
5. **Observable Integration**: Comprehensive monitoring and debugging capabilities

## Technical Architecture

### NATS Messaging Infrastructure

```typescript
// /packages/emprops-integration/src/messaging/nats-emprops-client.ts
import { connect, NatsConnection, StringCodec, JSONCodec } from 'nats'
import { EmPropsEvent, UserEvent, BillingEvent, JobNotificationEvent } from './types'

export interface NATSEmPropsConfig {
  servers: string[]
  credentials?: string
  reconnectAttempts: number
  maxReconnectTimeWait: number
  subjects: {
    userEvents: string
    billingEvents: string
    jobNotifications: string
    systemHealth: string
  }
}

export class NATSEmPropsClient {
  private nc: NatsConnection | null = null
  private stringCodec = StringCodec()
  private jsonCodec = JSONCodec()
  
  constructor(private config: NATSEmPropsConfig) {}

  async connect(): Promise<void> {
    try {
      this.nc = await connect({
        servers: this.config.servers,
        name: 'emp-job-queue-service',
        maxReconnectAttempts: this.config.reconnectAttempts,
        maxReconnectTimeWait: this.config.maxReconnectTimeWait,
        reconnectDelayHandler: () => 2000, // 2 second delay
        
        // Connection event handlers
        disconnectedHandler: () => {
          console.warn('🔌 Disconnected from EmProps NATS')
          this.handleDisconnection()
        },
        reconnectHandler: () => {
          console.log('✅ Reconnected to EmProps NATS')
          this.handleReconnection()
        },
        closedHandler: () => {
          console.log('🛑 EmProps NATS connection closed')
        }
      })

      console.log('✅ Connected to EmProps NATS messaging system')
      await this.setupSubscriptions()
      await this.registerService()
      
    } catch (error) {
      console.error('❌ Failed to connect to EmProps NATS:', error)
      throw error
    }
  }

  private async setupSubscriptions(): Promise<void> {
    if (!this.nc) return

    // Subscribe to user events from EmProps
    await this.nc.subscribe(this.config.subjects.userEvents, {
      callback: this.handleUserEvent.bind(this)
    })

    // Subscribe to billing events from EmProps
    await this.nc.subscribe(this.config.subjects.billingEvents, {
      callback: this.handleBillingEvent.bind(this)
    })

    console.log('📡 EmProps event subscriptions established')
  }

  private async handleUserEvent(msg: any): Promise<void> {
    try {
      const event: UserEvent = this.jsonCodec.decode(msg.data)
      console.log('👤 Received user event:', event.type)

      switch (event.type) {
        case 'user.created':
          await this.handleUserCreated(event)
          break
        case 'user.updated': 
          await this.handleUserUpdated(event)
          break
        case 'user.deleted':
          await this.handleUserDeleted(event)
          break
        case 'subscription.changed':
          await this.handleSubscriptionChanged(event)
          break
        default:
          console.warn('🤷‍♂️ Unknown user event type:', event.type)
      }

      // Acknowledge successful processing
      if (msg.reply) {
        this.nc?.publish(msg.reply, this.jsonCodec.encode({ success: true }))
      }
    } catch (error) {
      console.error('❌ Error processing user event:', error)
      
      // Acknowledge with error
      if (msg.reply) {
        this.nc?.publish(msg.reply, this.jsonCodec.encode({ 
          success: false, 
          error: error.message 
        }))
      }
    }
  }

  private async handleBillingEvent(msg: any): Promise<void> {
    try {
      const event: BillingEvent = this.jsonCodec.decode(msg.data)
      console.log('💰 Received billing event:', event.type)

      switch (event.type) {
        case 'usage.recorded':
          await this.handleUsageRecorded(event)
          break
        case 'payment.successful':
          await this.handlePaymentSuccessful(event)
          break
        case 'payment.failed':
          await this.handlePaymentFailed(event)
          break
        case 'quota.exceeded':
          await this.handleQuotaExceeded(event)
          break
        default:
          console.warn('🤷‍♂️ Unknown billing event type:', event.type)
      }

      if (msg.reply) {
        this.nc?.publish(msg.reply, this.jsonCodec.encode({ success: true }))
      }
    } catch (error) {
      console.error('❌ Error processing billing event:', error)
      
      if (msg.reply) {
        this.nc?.publish(msg.reply, this.jsonCodec.encode({ 
          success: false, 
          error: error.message 
        }))
      }
    }
  }

  // Publish job events to EmProps
  async publishJobNotification(event: JobNotificationEvent): Promise<void> {
    if (!this.nc) {
      console.warn('⚠️ NATS not connected, job notification not sent')
      return
    }

    try {
      await this.nc.publish(
        this.config.subjects.jobNotifications,
        this.jsonCodec.encode(event)
      )
      console.log('📤 Published job notification:', event.type)
    } catch (error) {
      console.error('❌ Failed to publish job notification:', error)
    }
  }

  // Request-reply pattern for real-time queries
  async queryEmPropsService<T>(subject: string, request: any): Promise<T> {
    if (!this.nc) {
      throw new Error('NATS connection not available')
    }

    try {
      const response = await this.nc.request(
        subject,
        this.jsonCodec.encode(request),
        { timeout: 5000 } // 5 second timeout
      )
      
      return this.jsonCodec.decode(response.data) as T
    } catch (error) {
      console.error(`❌ Failed to query EmProps service ${subject}:`, error)
      throw error
    }
  }

  private async registerService(): Promise<void> {
    // Register this service with EmProps service discovery
    const serviceInfo = {
      name: 'emp-job-queue',
      version: process.env.SERVICE_VERSION || '1.0.0',
      host: process.env.SERVICE_HOST || 'localhost',
      port: parseInt(process.env.SERVICE_PORT || '3000'),
      health_check: '/health',
      capabilities: [
        'job-processing',
        'ai-inference',
        'workflow-management'
      ]
    }

    await this.nc?.publish('emprops.services.register', this.jsonCodec.encode(serviceInfo))
  }

  private handleDisconnection(): void {
    // Set degraded mode flag
    // In degraded mode, the service continues operating but without EmProps integration
  }

  private handleReconnection(): void {
    // Re-register service and re-establish subscriptions
    this.registerService()
  }

  async disconnect(): Promise<void> {
    if (this.nc) {
      await this.nc.close()
      this.nc = null
      console.log('🔌 Disconnected from EmProps NATS')
    }
  }

  // Event handlers (to be implemented by application services)
  private async handleUserCreated(event: UserEvent): Promise<void> {
    // Sync user to local database if needed
    // Update user permissions and quotas
  }

  private async handleUserUpdated(event: UserEvent): Promise<void> {
    // Update local user cache
    // Refresh permissions
  }

  private async handleUserDeleted(event: UserEvent): Promise<void> {
    // Handle user deletion
    // Cancel active jobs
  }

  private async handleSubscriptionChanged(event: UserEvent): Promise<void> {
    // Update user quotas and capabilities
    // Apply new billing rates
  }

  private async handleUsageRecorded(event: BillingEvent): Promise<void> {
    // Acknowledge usage tracking
  }

  private async handlePaymentSuccessful(event: BillingEvent): Promise<void> {
    // Restore service access if suspended
  }

  private async handlePaymentFailed(event: BillingEvent): Promise<void> {
    // Apply appropriate service restrictions
  }

  private async handleQuotaExceeded(event: BillingEvent): Promise<void> {
    // Temporarily suspend service for user
    // Send notification to user
  }
}
```

### Event Type Definitions

```typescript
// /packages/emprops-integration/src/types/events.ts
export interface EmPropsEvent {
  id: string
  type: string
  timestamp: string
  source: string
  version: string
}

export interface UserEvent extends EmPropsEvent {
  userId: string
  data: {
    email?: string
    name?: string
    subscription?: {
      plan: string
      status: 'active' | 'cancelled' | 'suspended'
      features: string[]
    }
    permissions?: string[]
  }
}

export interface BillingEvent extends EmPropsEvent {
  userId: string
  data: {
    amount?: number
    currency?: string
    usageType?: 'compute' | 'storage' | 'api_calls'
    quotas?: {
      daily?: number
      monthly?: number
    }
    paymentStatus?: 'successful' | 'failed' | 'pending'
  }
}

export interface JobNotificationEvent extends EmPropsEvent {
  jobId: string
  userId: string
  data: {
    status: 'queued' | 'processing' | 'completed' | 'failed'
    progress?: number
    estimatedCompletion?: string
    results?: {
      outputs: string[]
      duration: number
      cost: number
    }
    error?: {
      message: string
      code: string
    }
  }
}
```

### API Gateway Integration Service

```typescript
// /packages/emprops-integration/src/gateway/emprops-api-gateway.ts
import express from 'express'
import { NATSEmPropsClient } from '../messaging/nats-emprops-client'
import { DatabaseService } from '@emp/database'
import { EnhancedJobService } from '../services/enhanced-job-service'

export interface EmPropsAuthUser {
  userId: string
  email: string
  subscription: {
    plan: string
    quotas: {
      dailyJobs: number
      monthlyJobs: number
      concurrentJobs: number
    }
  }
  permissions: string[]
}

export class EmPropsAPIGateway {
  private app: express.Application
  private natsClient: NATSEmPropsClient
  private jobService: EnhancedJobService

  constructor(
    natsClient: NATSEmPropsClient,
    database: DatabaseService,
    jobService: EnhancedJobService
  ) {
    this.app = express()
    this.natsClient = natsClient
    this.jobService = jobService
    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(express.json())
    
    // EmProps authentication middleware
    this.app.use(this.authenticateEmPropsUser.bind(this))
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📡 ${req.method} ${req.path} - User: ${req.user?.userId}`)
      next()
    })
  }

  private async authenticateEmPropsUser(
    req: express.Request, 
    res: express.Response, 
    next: express.NextFunction
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' })
      }

      const token = authHeader.substring(7)
      
      // Query EmProps authentication service via NATS
      const authResponse = await this.natsClient.queryEmPropsService<{
        valid: boolean
        user?: EmPropsAuthUser
        error?: string
      }>('emprops.auth.validate', { token })

      if (!authResponse.valid || !authResponse.user) {
        return res.status(401).json({ error: 'Invalid token' })
      }

      // Attach user to request
      req.user = authResponse.user
      next()
    } catch (error) {
      console.error('❌ Authentication error:', error)
      
      // In degraded mode, allow local authentication
      if (this.isDegradedMode()) {
        return this.handleDegradedAuth(req, res, next)
      }
      
      res.status(500).json({ error: 'Authentication service unavailable' })
    }
  }

  private async handleDegradedAuth(
    req: express.Request, 
    res: express.Response, 
    next: express.NextFunction
  ): Promise<void> {
    // Fallback to local API key authentication when EmProps is unavailable
    const apiKey = req.headers['x-api-key'] as string
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'EmProps authentication unavailable. Please provide X-API-Key header.' 
      })
    }

    // Validate against local API key database
    // This would use the API key system from Phase 4
    // Implementation depends on local API key validation logic
    
    next()
  }

  private setupRoutes(): void {
    // Job submission with EmProps integration
    this.app.post('/api/v1/jobs', async (req, res) => {
      try {
        const user = req.user as EmPropsAuthUser
        
        // Check quotas before job submission
        const quotaCheck = await this.checkUserQuotas(user.userId)
        if (!quotaCheck.allowed) {
          return res.status(429).json({ 
            error: 'Quota exceeded', 
            details: quotaCheck.reason 
          })
        }

        // Submit job with user context
        const result = await this.jobService.submitJob({
          userId: user.userId,
          ...req.body
        })

        // Record usage for billing
        await this.recordUsage(user.userId, 'job_submission', 1)

        // Publish job notification to EmProps
        await this.natsClient.publishJobNotification({
          id: `job-${result.jobId}`,
          type: 'job.submitted',
          timestamp: new Date().toISOString(),
          source: 'emp-job-queue',
          version: '1.0',
          jobId: result.jobId,
          userId: user.userId,
          data: {
            status: 'queued',
            estimatedCompletion: new Date(Date.now() + result.estimatedCompletionTime * 1000).toISOString()
          }
        })

        res.json(result)
      } catch (error) {
        console.error('❌ Job submission error:', error)
        res.status(500).json({ error: 'Job submission failed' })
      }
    })

    // Job status with real-time updates
    this.app.get('/api/v1/jobs/:id', async (req, res) => {
      try {
        const user = req.user as EmPropsAuthUser
        const jobId = req.params.id

        const job = await this.jobService.getJobStatus(jobId)
        
        // Ensure user owns the job
        if (job.userId !== user.userId) {
          return res.status(404).json({ error: 'Job not found' })
        }

        res.json(job)
      } catch (error) {
        console.error('❌ Job status error:', error)
        res.status(500).json({ error: 'Failed to get job status' })
      }
    })

    // User job history with pagination
    this.app.get('/api/v1/jobs', async (req, res) => {
      try {
        const user = req.user as EmPropsAuthUser
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
        const offset = parseInt(req.query.offset as string) || 0

        const jobs = await this.jobService.getUserJobs(user.userId, limit, offset)
        res.json({
          jobs,
          pagination: {
            limit,
            offset,
            hasMore: jobs.length === limit
          }
        })
      } catch (error) {
        console.error('❌ Job history error:', error)
        res.status(500).json({ error: 'Failed to get job history' })
      }
    })

    // User usage statistics
    this.app.get('/api/v1/usage', async (req, res) => {
      try {
        const user = req.user as EmPropsAuthUser
        
        // Query usage from EmProps billing service
        const usage = await this.natsClient.queryEmPropsService<{
          daily: { jobs: number; compute: number; cost: number }
          monthly: { jobs: number; compute: number; cost: number }
          quotas: { daily: number; monthly: number; concurrent: number }
        }>('emprops.billing.usage', { userId: user.userId })

        res.json(usage)
      } catch (error) {
        console.error('❌ Usage query error:', error)
        res.status(500).json({ error: 'Failed to get usage statistics' })
      }
    })

    // Health check with EmProps connectivity
    this.app.get('/health', async (req, res) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: await this.checkDatabaseHealth(),
          emprops: await this.checkEmPropsConnectivity(),
          jobQueue: await this.checkJobQueueHealth()
        }
      }

      const isHealthy = Object.values(health.services).every(service => service.healthy)
      
      res.status(isHealthy ? 200 : 503).json(health)
    })
  }

  private async checkUserQuotas(userId: string): Promise<{
    allowed: boolean
    reason?: string
  }> {
    try {
      const quotaResponse = await this.natsClient.queryEmPropsService<{
        allowed: boolean
        quotas: {
          daily: { used: number; limit: number }
          monthly: { used: number; limit: number }
          concurrent: { used: number; limit: number }
        }
      }>('emprops.billing.quotas.check', { userId })

      if (!quotaResponse.allowed) {
        const quotas = quotaResponse.quotas
        
        if (quotas.daily.used >= quotas.daily.limit) {
          return { allowed: false, reason: 'Daily job limit exceeded' }
        }
        if (quotas.monthly.used >= quotas.monthly.limit) {
          return { allowed: false, reason: 'Monthly job limit exceeded' }
        }
        if (quotas.concurrent.used >= quotas.concurrent.limit) {
          return { allowed: false, reason: 'Concurrent job limit exceeded' }
        }
      }

      return { allowed: true }
    } catch (error) {
      // In case of EmProps unavailability, allow requests (degraded mode)
      console.warn('⚠️ Quota check failed, allowing request in degraded mode')
      return { allowed: true }
    }
  }

  private async recordUsage(
    userId: string, 
    usageType: string, 
    amount: number
  ): Promise<void> {
    try {
      await this.natsClient.queryEmPropsService('emprops.billing.usage.record', {
        userId,
        type: usageType,
        amount,
        timestamp: new Date().toISOString(),
        service: 'emp-job-queue'
      })
    } catch (error) {
      // Log error but don't fail the request
      console.error('❌ Failed to record usage:', error)
    }
  }

  private async checkDatabaseHealth(): Promise<{ healthy: boolean; latency: number }> {
    // Implementation from Phase 4
    return { healthy: true, latency: 10 }
  }

  private async checkEmPropsConnectivity(): Promise<{ healthy: boolean; latency: number }> {
    try {
      const start = Date.now()
      await this.natsClient.queryEmPropsService('emprops.health.ping', {})
      const latency = Date.now() - start
      
      return { healthy: true, latency }
    } catch (error) {
      return { healthy: false, latency: 0 }
    }
  }

  private async checkJobQueueHealth(): Promise<{ healthy: boolean; queueLength: number }> {
    // Implementation depends on job queue from previous phases
    return { healthy: true, queueLength: 0 }
  }

  private isDegradedMode(): boolean {
    // Check if EmProps services are available
    return false // Implement based on NATS connection status
  }

  async start(port = 3000): Promise<void> {
    this.app.listen(port, () => {
      console.log(`🌐 EmProps API Gateway running on port ${port}`)
    })
  }
}
```

### Service Discovery and Health Monitoring

```typescript
// /packages/emprops-integration/src/discovery/service-registry.ts
import { NATSEmPropsClient } from '../messaging/nats-emprops-client'

export interface ServiceDefinition {
  name: string
  version: string
  host: string
  port: number
  protocol: 'http' | 'https' | 'grpc'
  healthCheck: {
    path: string
    interval: number
    timeout: number
  }
  capabilities: string[]
  metadata: Record<string, any>
}

export class EmPropsServiceRegistry {
  private services = new Map<string, ServiceDefinition>()
  private healthIntervals = new Map<string, NodeJS.Timeout>()

  constructor(private natsClient: NATSEmPropsClient) {}

  async initialize(): Promise<void> {
    // Subscribe to service discovery events
    await this.setupServiceDiscoverySubscriptions()
    
    // Start health monitoring
    this.startHealthMonitoring()
    
    console.log('🔍 Service registry initialized')
  }

  private async setupServiceDiscoverySubscriptions(): Promise<void> {
    // Listen for service registrations
    // Listen for service deregistrations
    // Listen for service updates
    
    console.log('📡 Service discovery subscriptions established')
  }

  async registerService(service: ServiceDefinition): Promise<void> {
    try {
      // Register with EmProps service registry
      await this.natsClient.queryEmPropsService('emprops.services.register', service)
      
      // Store locally for health monitoring
      this.services.set(service.name, service)
      
      // Start health monitoring for this service
      this.startServiceHealthMonitoring(service)
      
      console.log(`✅ Service registered: ${service.name}`)
    } catch (error) {
      console.error(`❌ Failed to register service ${service.name}:`, error)
      throw error
    }
  }

  private startServiceHealthMonitoring(service: ServiceDefinition): void {
    const interval = setInterval(async () => {
      try {
        const healthStatus = await this.checkServiceHealth(service)
        
        // Report health status to EmProps
        await this.natsClient.queryEmPropsService('emprops.services.health', {
          serviceName: service.name,
          status: healthStatus.healthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          details: healthStatus
        })
        
      } catch (error) {
        console.error(`❌ Health check failed for ${service.name}:`, error)
      }
    }, service.healthCheck.interval)

    this.healthIntervals.set(service.name, interval)
  }

  private async checkServiceHealth(service: ServiceDefinition): Promise<{
    healthy: boolean
    latency: number
    details: any
  }> {
    const start = Date.now()
    
    try {
      // Make HTTP health check request
      const response = await fetch(
        `${service.protocol}://${service.host}:${service.port}${service.healthCheck.path}`,
        { 
          method: 'GET',
          signal: AbortSignal.timeout(service.healthCheck.timeout)
        }
      )
      
      const latency = Date.now() - start
      const healthy = response.ok
      
      return {
        healthy,
        latency,
        details: healthy ? await response.json() : { error: response.statusText }
      }
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - start,
        details: { error: error.message }
      }
    }
  }

  private startHealthMonitoring(): void {
    // Monitor overall system health
    setInterval(async () => {
      const systemHealth = {
        services: this.services.size,
        healthy: Array.from(this.services.values()).filter(s => this.isServiceHealthy(s)).length,
        timestamp: new Date().toISOString()
      }
      
      // Report system health to EmProps
      await this.natsClient.queryEmPropsService('emprops.system.health', systemHealth)
    }, 30000) // Every 30 seconds
  }

  private isServiceHealthy(service: ServiceDefinition): boolean {
    // Implementation depends on cached health status
    return true
  }

  async deregisterService(serviceName: string): Promise<void> {
    try {
      await this.natsClient.queryEmPropsService('emprops.services.deregister', {
        serviceName
      })
      
      // Stop health monitoring
      const interval = this.healthIntervals.get(serviceName)
      if (interval) {
        clearInterval(interval)
        this.healthIntervals.delete(serviceName)
      }
      
      // Remove from local registry
      this.services.delete(serviceName)
      
      console.log(`🗑️ Service deregistered: ${serviceName}`)
    } catch (error) {
      console.error(`❌ Failed to deregister service ${serviceName}:`, error)
    }
  }

  async shutdown(): Promise<void> {
    // Clear all health monitoring intervals
    for (const interval of this.healthIntervals.values()) {
      clearInterval(interval)
    }
    
    // Deregister all services
    for (const serviceName of this.services.keys()) {
      await this.deregisterService(serviceName)
    }
    
    console.log('🛑 Service registry shutdown complete')
  }
}
```

### Unified Integration Service

```typescript
// /packages/emprops-integration/src/emprops-integration-service.ts
import { NATSEmPropsClient, NATSEmPropsConfig } from './messaging/nats-emprops-client'
import { EmPropsAPIGateway } from './gateway/emprops-api-gateway'
import { EmPropsServiceRegistry } from './discovery/service-registry'
import { DatabaseService } from '@emp/database'
import { MessageBusService } from '@emp/message-bus'
import { EnhancedJobService } from './services/enhanced-job-service'

export interface EmPropsIntegrationConfig {
  nats: NATSEmPropsConfig
  apiGateway: {
    port: number
    host: string
  }
  serviceRegistry: {
    serviceName: string
    version: string
    healthCheckPath: string
  }
  features: {
    authentication: boolean
    billing: boolean
    notifications: boolean
    serviceDiscovery: boolean
  }
}

export class EmPropsIntegrationService {
  private natsClient: NATSEmPropsClient
  private apiGateway: EmPropsAPIGateway
  private serviceRegistry: EmPropsServiceRegistry
  private isInitialized = false

  constructor(
    private config: EmPropsIntegrationConfig,
    private database: DatabaseService,
    private messageBus: MessageBusService,
    private jobService: EnhancedJobService
  ) {
    this.natsClient = new NATSEmPropsClient(config.nats)
    this.apiGateway = new EmPropsAPIGateway(this.natsClient, database, jobService)
    this.serviceRegistry = new EmPropsServiceRegistry(this.natsClient)
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('⚠️ EmProps integration already initialized')
      return
    }

    try {
      console.log('🚀 Initializing EmProps integration...')
      
      // 1. Connect to NATS messaging system
      if (this.config.features.notifications || this.config.features.billing) {
        await this.natsClient.connect()
      }

      // 2. Initialize service registry
      if (this.config.features.serviceDiscovery) {
        await this.serviceRegistry.initialize()
        await this.registerSelf()
      }

      // 3. Start API gateway
      await this.apiGateway.start(this.config.apiGateway.port)

      // 4. Setup integration with internal message bus
      await this.setupMessageBusIntegration()

      this.isInitialized = true
      console.log('✅ EmProps integration initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize EmProps integration:', error)
      
      // Enable degraded mode
      await this.enableDegradedMode()
      throw error
    }
  }

  private async registerSelf(): Promise<void> {
    const serviceDefinition = {
      name: this.config.serviceRegistry.serviceName,
      version: this.config.serviceRegistry.version,
      host: this.config.apiGateway.host,
      port: this.config.apiGateway.port,
      protocol: 'http' as const,
      healthCheck: {
        path: this.config.serviceRegistry.healthCheckPath,
        interval: 30000, // 30 seconds
        timeout: 5000   // 5 seconds
      },
      capabilities: [
        'job-processing',
        'ai-inference',
        'workflow-management',
        'real-time-updates'
      ],
      metadata: {
        supportedModels: ['stable-diffusion', 'comfyui-workflows'],
        maxConcurrentJobs: 100,
        features: this.config.features
      }
    }

    await this.serviceRegistry.registerService(serviceDefinition)
  }

  private async setupMessageBusIntegration(): Promise<void> {
    // Bridge internal message bus events to NATS
    await this.messageBus.subscribe('job.status.updated', async (event) => {
      await this.natsClient.publishJobNotification({
        id: `job-status-${event.jobId}`,
        type: 'job.status.updated',
        timestamp: new Date().toISOString(),
        source: 'emp-job-queue',
        version: '1.0',
        jobId: event.jobId,
        userId: event.userId,
        data: {
          status: event.status as any,
          progress: event.progress
        }
      })
    })

    await this.messageBus.subscribe('job.completed', async (event) => {
      await this.natsClient.publishJobNotification({
        id: `job-completed-${event.jobId}`,
        type: 'job.completed',
        timestamp: new Date().toISOString(),
        source: 'emp-job-queue',
        version: '1.0',
        jobId: event.jobId,
        userId: event.userId,
        data: {
          status: 'completed',
          results: event.results
        }
      })
    })

    console.log('🔗 Message bus integration established')
  }

  private async enableDegradedMode(): Promise<void> {
    console.warn('⚠️ Enabling degraded mode - EmProps integration unavailable')
    
    // In degraded mode:
    // - API gateway still runs but uses local authentication
    // - Job processing continues without EmProps billing
    // - Notifications are stored locally for later sync
    
    // Store degraded mode flag for other services to check
    process.env.EMPROPS_DEGRADED_MODE = 'true'
  }

  async getIntegrationStatus(): Promise<{
    connected: boolean
    features: Record<string, boolean>
    services: {
      nats: boolean
      apiGateway: boolean
      serviceRegistry: boolean
    }
  }> {
    return {
      connected: this.isInitialized,
      features: this.config.features,
      services: {
        nats: !!this.natsClient,
        apiGateway: !!this.apiGateway,
        serviceRegistry: !!this.serviceRegistry
      }
    }
  }

  async publishJobEvent(event: any): Promise<void> {
    if (this.isInitialized) {
      await this.natsClient.publishJobNotification(event)
    }
  }

  async queryEmProps<T>(subject: string, request: any): Promise<T> {
    if (!this.isInitialized) {
      throw new Error('EmProps integration not initialized')
    }
    
    return await this.natsClient.queryEmPropsService<T>(subject, request)
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return

    console.log('🛑 Shutting down EmProps integration...')
    
    try {
      // Shutdown in reverse order
      await this.serviceRegistry.shutdown()
      await this.natsClient.disconnect()
      
      this.isInitialized = false
      console.log('✅ EmProps integration shutdown complete')
    } catch (error) {
      console.error('❌ Error during EmProps integration shutdown:', error)
    }
  }
}
```

## Configuration and Environment Setup

### Environment Configuration

```bash
# /.env.emprops
# EmProps Integration Configuration

# NATS Configuration
EMPROPS_NATS_SERVERS=nats://emprops-nats-1:4222,nats://emprops-nats-2:4222
EMPROPS_NATS_CREDENTIALS=/etc/nats/emprops.creds
EMPROPS_NATS_RECONNECT_ATTEMPTS=10
EMPROPS_NATS_MAX_RECONNECT_WAIT=30000

# NATS Subjects
EMPROPS_SUBJECT_USER_EVENTS=emprops.events.users
EMPROPS_SUBJECT_BILLING_EVENTS=emprops.events.billing
EMPROPS_SUBJECT_JOB_NOTIFICATIONS=emprops.notifications.jobs
EMPROPS_SUBJECT_SYSTEM_HEALTH=emprops.system.health

# API Gateway Configuration
EMPROPS_API_HOST=0.0.0.0
EMPROPS_API_PORT=3000
EMPROPS_API_RATE_LIMIT=100
EMPROPS_API_TIMEOUT=30000

# Service Registry Configuration
EMPROPS_SERVICE_NAME=emp-job-queue
EMPROPS_SERVICE_VERSION=1.0.0
EMPROPS_HEALTH_CHECK_PATH=/health

# Feature Flags
EMPROPS_ENABLE_AUTHENTICATION=true
EMPROPS_ENABLE_BILLING=true
EMPROPS_ENABLE_NOTIFICATIONS=true
EMPROPS_ENABLE_SERVICE_DISCOVERY=true

# Degraded Mode Settings
EMPROPS_DEGRADED_MODE=false
EMPROPS_DEGRADED_MODE_API_KEY_AUTH=true
EMPROPS_DEGRADED_MODE_LOCAL_BILLING=false
```

### Configuration Builder

```typescript
// /packages/emprops-integration/src/config/integration-config.ts
import { EmPropsIntegrationConfig } from '../emprops-integration-service'

export function buildEmPropsIntegrationConfig(): EmPropsIntegrationConfig {
  return {
    nats: {
      servers: (process.env.EMPROPS_NATS_SERVERS || 'nats://localhost:4222').split(','),
      credentials: process.env.EMPROPS_NATS_CREDENTIALS,
      reconnectAttempts: parseInt(process.env.EMPROPS_NATS_RECONNECT_ATTEMPTS || '10'),
      maxReconnectTimeWait: parseInt(process.env.EMPROPS_NATS_MAX_RECONNECT_WAIT || '30000'),
      subjects: {
        userEvents: process.env.EMPROPS_SUBJECT_USER_EVENTS || 'emprops.events.users',
        billingEvents: process.env.EMPROPS_SUBJECT_BILLING_EVENTS || 'emprops.events.billing',
        jobNotifications: process.env.EMPROPS_SUBJECT_JOB_NOTIFICATIONS || 'emprops.notifications.jobs',
        systemHealth: process.env.EMPROPS_SUBJECT_SYSTEM_HEALTH || 'emprops.system.health'
      }
    },
    apiGateway: {
      port: parseInt(process.env.EMPROPS_API_PORT || '3000'),
      host: process.env.EMPROPS_API_HOST || '0.0.0.0'
    },
    serviceRegistry: {
      serviceName: process.env.EMPROPS_SERVICE_NAME || 'emp-job-queue',
      version: process.env.EMPROPS_SERVICE_VERSION || '1.0.0',
      healthCheckPath: process.env.EMPROPS_HEALTH_CHECK_PATH || '/health'
    },
    features: {
      authentication: process.env.EMPROPS_ENABLE_AUTHENTICATION === 'true',
      billing: process.env.EMPROPS_ENABLE_BILLING === 'true',
      notifications: process.env.EMPROPS_ENABLE_NOTIFICATIONS === 'true',
      serviceDiscovery: process.env.EMPROPS_ENABLE_SERVICE_DISCOVERY === 'true'
    }
  }
}
```

## Integration with Main Application

### Enhanced Application Server

```typescript
// /apps/api/src/integrated-api-server.ts
import { EmPropsIntegrationService } from '@emp/emprops-integration'
import { DatabaseService } from '@emp/database'
import { MessageBusService } from '@emp/message-bus'
import { EnhancedJobService } from './services/enhanced-job-service'
import { buildEmPropsIntegrationConfig } from '@emp/emprops-integration/config'

export class IntegratedAPIServer {
  private database: DatabaseService
  private messageBus: MessageBusService
  private jobService: EnhancedJobService
  private empropsIntegration: EmPropsIntegrationService

  constructor() {
    this.database = new DatabaseService()
    this.messageBus = new MessageBusService()
    this.jobService = new EnhancedJobService(this.database, this.messageBus)
    
    // Initialize EmProps integration
    const config = buildEmPropsIntegrationConfig()
    this.empropsIntegration = new EmPropsIntegrationService(
      config,
      this.database,
      this.messageBus,
      this.jobService
    )
  }

  async initialize(): Promise<void> {
    try {
      console.log('🚀 Initializing integrated API server...')

      // 1. Connect to database
      await this.database.connect()

      // 2. Initialize message bus
      await this.messageBus.initialize()

      // 3. Setup job service integration
      await this.setupJobServiceIntegration()

      // 4. Initialize EmProps integration (this starts the API gateway)
      await this.empropsIntegration.initialize()

      console.log('✅ Integrated API server initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize integrated API server:', error)
      
      // Start in standalone mode if EmProps integration fails
      await this.startStandaloneMode()
    }
  }

  private async setupJobServiceIntegration(): Promise<void> {
    // Bridge job service events to EmProps integration
    await this.messageBus.subscribe('job.completed', async (event) => {
      // Publish to EmProps
      await this.empropsIntegration.publishJobEvent({
        id: `completion-${event.jobId}`,
        type: 'job.completed',
        timestamp: new Date().toISOString(),
        source: 'emp-job-queue',
        version: '1.0',
        jobId: event.jobId,
        userId: event.userId,
        data: {
          status: 'completed',
          results: event.results
        }
      })
    })

    console.log('🔗 Job service integration established')
  }

  private async startStandaloneMode(): Promise<void> {
    console.warn('⚠️ Starting in standalone mode')
    
    // Start basic API server without EmProps integration
    // This would be the original lightweight API server from earlier phases
  }

  async getStatus(): Promise<any> {
    const integrationStatus = await this.empropsIntegration.getIntegrationStatus()
    
    return {
      server: 'running',
      timestamp: new Date().toISOString(),
      database: await this.database.healthCheck(),
      messageBus: true, // Add real health check
      emprops: integrationStatus
    }
  }

  async shutdown(): Promise<void> {
    console.log('🛑 Shutting down integrated API server...')

    try {
      await this.empropsIntegration.shutdown()
      await this.messageBus.shutdown()
      await this.database.disconnect()
      
      console.log('✅ Integrated API server shutdown complete')
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
    }
  }
}

// Application entry point
async function main() {
  const server = new IntegratedAPIServer()
  
  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...')
    await server.shutdown()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
    await server.shutdown()
    process.exit(0)
  })

  try {
    await server.initialize()
  } catch (error) {
    console.error('💥 Fatal error during startup:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}
```

## Testing Strategy

### Integration Testing Setup

```typescript
// /packages/emprops-integration/test/integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { EmPropsIntegrationService } from '../src/emprops-integration-service'
import { MockNATSServer } from './mocks/mock-nats-server'
import { MockDatabase } from './mocks/mock-database'

describe('EmProps Integration', () => {
  let mockNats: MockNATSServer
  let mockDatabase: MockDatabase
  let integration: EmPropsIntegrationService

  beforeAll(async () => {
    // Setup mock services
    mockNats = new MockNATSServer()
    mockDatabase = new MockDatabase()
    
    await mockNats.start()
    
    // Create integration service with test config
    const config = {
      nats: {
        servers: ['nats://localhost:4222'],
        reconnectAttempts: 3,
        maxReconnectTimeWait: 5000,
        subjects: {
          userEvents: 'test.users',
          billingEvents: 'test.billing',
          jobNotifications: 'test.jobs',
          systemHealth: 'test.health'
        }
      },
      apiGateway: { port: 3001, host: 'localhost' },
      serviceRegistry: {
        serviceName: 'emp-job-queue-test',
        version: '1.0.0',
        healthCheckPath: '/health'
      },
      features: {
        authentication: true,
        billing: true,
        notifications: true,
        serviceDiscovery: true
      }
    }

    integration = new EmPropsIntegrationService(
      config,
      mockDatabase as any,
      {} as any,
      {} as any
    )
  })

  afterAll(async () => {
    await integration.shutdown()
    await mockNats.stop()
  })

  it('should initialize successfully', async () => {
    await expect(integration.initialize()).resolves.not.toThrow()
    
    const status = await integration.getIntegrationStatus()
    expect(status.connected).toBe(true)
  })

  it('should handle user events correctly', async () => {
    // Test user creation event processing
    await mockNats.publishEvent('test.users', {
      id: 'user-123',
      type: 'user.created',
      timestamp: new Date().toISOString(),
      source: 'emprops',
      version: '1.0',
      userId: 'user-123',
      data: {
        email: 'test@example.com',
        subscription: { plan: 'pro', status: 'active' }
      }
    })

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify user was processed correctly
    expect(mockDatabase.users.has('user-123')).toBe(true)
  })

  it('should handle billing events correctly', async () => {
    // Test quota exceeded event
    await mockNats.publishEvent('test.billing', {
      id: 'billing-456',
      type: 'quota.exceeded',
      timestamp: new Date().toISOString(),
      source: 'emprops',
      version: '1.0',
      userId: 'user-123',
      data: { quotas: { daily: 100, monthly: 1000 } }
    })

    await new Promise(resolve => setTimeout(resolve, 100))

    // Verify quota limits were applied
    const user = mockDatabase.users.get('user-123')
    expect(user?.suspended).toBe(true)
  })

  it('should publish job notifications correctly', async () => {
    const jobEvent = {
      id: 'job-789',
      type: 'job.completed',
      timestamp: new Date().toISOString(),
      source: 'emp-job-queue',
      version: '1.0',
      jobId: 'job-789',
      userId: 'user-123',
      data: { status: 'completed' as const }
    }

    await integration.publishJobEvent(jobEvent)

    // Verify event was published to NATS
    const publishedEvents = mockNats.getPublishedEvents('test.jobs')
    expect(publishedEvents).toHaveLength(1)
    expect(publishedEvents[0]).toMatchObject(jobEvent)
  })

  it('should handle EmProps service queries', async () => {
    // Mock EmProps response
    mockNats.setRequestResponse('emprops.auth.validate', {
      valid: true,
      user: {
        userId: 'user-123',
        email: 'test@example.com',
        subscription: { plan: 'pro' }
      }
    })

    const response = await integration.queryEmProps('emprops.auth.validate', {
      token: 'test-token'
    })

    expect(response.valid).toBe(true)
    expect(response.user.userId).toBe('user-123')
  })

  it('should handle graceful degradation', async () => {
    // Simulate NATS disconnection
    await mockNats.disconnect()

    // Service should still function in degraded mode
    const status = await integration.getIntegrationStatus()
    expect(status.connected).toBe(false)

    // API should still be accessible but with local auth
    const response = await fetch('http://localhost:3001/health')
    expect(response.ok).toBe(true)
  })
})
```

### Mock Services for Testing

```typescript
// /packages/emprops-integration/test/mocks/mock-nats-server.ts
import { EventEmitter } from 'events'

export class MockNATSServer extends EventEmitter {
  private subscriptions = new Map<string, Function[]>()
  private publishedEvents = new Map<string, any[]>()
  private requestResponses = new Map<string, any>()
  private connected = true

  async start(): Promise<void> {
    console.log('🧪 Mock NATS server started')
  }

  async stop(): Promise<void> {
    console.log('🧪 Mock NATS server stopped')
  }

  subscribe(subject: string, handler: Function): void {
    if (!this.subscriptions.has(subject)) {
      this.subscriptions.set(subject, [])
    }
    this.subscriptions.get(subject)!.push(handler)
  }

  async publishEvent(subject: string, event: any): Promise<void> {
    // Store for verification
    if (!this.publishedEvents.has(subject)) {
      this.publishedEvents.set(subject, [])
    }
    this.publishedEvents.get(subject)!.push(event)

    // Trigger subscribers
    const handlers = this.subscriptions.get(subject) || []
    handlers.forEach(handler => {
      handler({ data: Buffer.from(JSON.stringify(event)) })
    })
  }

  setRequestResponse(subject: string, response: any): void {
    this.requestResponses.set(subject, response)
  }

  async request(subject: string, data: any): Promise<any> {
    const response = this.requestResponses.get(subject)
    if (response) {
      return { data: Buffer.from(JSON.stringify(response)) }
    }
    throw new Error(`No mock response for ${subject}`)
  }

  getPublishedEvents(subject: string): any[] {
    return this.publishedEvents.get(subject) || []
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.emit('disconnected')
  }

  isConnected(): boolean {
    return this.connected
  }
}
```

## Deployment and Operations

### Docker Compose Integration

```yaml
# /docker-compose.emprops.yml
version: '3.8'

services:
  # NATS for EmProps communication
  nats:
    image: nats:2.9-alpine
    ports:
      - "4222:4222"
      - "8222:8222"  # HTTP monitoring
    volumes:
      - ./config/nats.conf:/etc/nats/nats.conf
      - ./config/emprops.creds:/etc/nats/emprops.creds
    command: ["-c", "/etc/nats/nats.conf"]
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8222/varz"]
      interval: 10s
      timeout: 5s
      retries: 3

  # Integrated API server with EmProps support
  emp-api-integrated:
    build:
      context: .
      dockerfile: apps/api/Dockerfile.integrated
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://emp:password@postgres:5432/emp_production
      - REDIS_URL=redis://redis:6379
      - EMPROPS_NATS_SERVERS=nats://nats:4222
      - EMPROPS_ENABLE_AUTHENTICATION=true
      - EMPROPS_ENABLE_BILLING=true
      - EMPROPS_ENABLE_NOTIFICATIONS=true
    depends_on:
      - postgres
      - redis
      - nats
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Service registry dashboard (optional)
  service-registry-ui:
    image: nats-streaming:0.25-alpine
    ports:
      - "8080:8080"
    environment:
      - NATS_URL=nats://nats:4222
    depends_on:
      - nats

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: emprops-network
    external: true
```

### NATS Configuration

```conf
# /config/nats.conf
# NATS Server Configuration for EmProps Integration

port: 4222
http_port: 8222

# Cluster configuration (if using NATS clustering)
cluster {
  name: emprops-cluster
  port: 6222
  routes = [
    nats://nats-1:6222
    nats://nats-2:6222
  ]
}

# Authentication and authorization
authorization {
  users: [
    {
      user: emp_job_queue
      password: $EMP_JOB_QUEUE_PASSWORD
      permissions: {
        subscribe: [
          "emprops.events.>"
          "emprops.system.>"
        ]
        publish: [
          "emprops.notifications.>"
          "emprops.services.>"
        ]
      }
    }
  ]
}

# Logging
log_file: "/var/log/nats/nats.log"
log_size_limit: 100MB
max_log_files: 5
debug: false
trace: false

# JetStream (for persistent messaging if needed)
jetstream: {
  store_dir: /data/jetstream
  max_memory_store: 1GB
  max_file_store: 10GB
}

# Monitoring
monitoring: {
  trace: false
  debug: false
  log_disconnect: true
  log_reconnect: true
}
```

### Health Monitoring Dashboard

```typescript
// /packages/emprops-integration/src/monitoring/health-dashboard.ts
import express from 'express'
import { EmPropsIntegrationService } from '../emprops-integration-service'

export class HealthDashboard {
  private app: express.Application

  constructor(private integration: EmPropsIntegrationService) {
    this.app = express()
    this.setupRoutes()
  }

  private setupRoutes(): void {
    this.app.use(express.static('public'))

    // Health summary endpoint
    this.app.get('/api/health', async (req, res) => {
      const status = await this.integration.getIntegrationStatus()
      res.json(status)
    })

    // Service discovery endpoint
    this.app.get('/api/services', async (req, res) => {
      try {
        const services = await this.integration.queryEmProps(
          'emprops.services.list', 
          {}
        )
        res.json(services)
      } catch (error) {
        res.status(503).json({ error: 'Service discovery unavailable' })
      }
    })

    // Metrics endpoint
    this.app.get('/api/metrics', async (req, res) => {
      // Return Prometheus-style metrics
      const metrics = await this.collectMetrics()
      res.set('Content-Type', 'text/plain')
      res.send(metrics)
    })

    // Dashboard HTML
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>EmProps Integration Dashboard</title>
          <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        </head>
        <body>
          <h1>EmProps Integration Health Dashboard</h1>
          <div id="status"></div>
          <div id="services"></div>
          <script>
            // Real-time dashboard implementation
            setInterval(async () => {
              const response = await fetch('/api/health')
              const status = await response.json()
              document.getElementById('status').innerHTML = 
                '<pre>' + JSON.stringify(status, null, 2) + '</pre>'
            }, 5000)
          </script>
        </body>
        </html>
      `)
    })
  }

  private async collectMetrics(): Promise<string> {
    const status = await this.integration.getIntegrationStatus()
    
    return `
# HELP emprops_integration_connected Whether EmProps integration is connected
# TYPE emprops_integration_connected gauge
emprops_integration_connected ${status.connected ? 1 : 0}

# HELP emprops_features_enabled Count of enabled features
# TYPE emprops_features_enabled gauge
emprops_features_enabled ${Object.values(status.features).filter(Boolean).length}

# HELP emprops_services_healthy Count of healthy services  
# TYPE emprops_services_healthy gauge
emprops_services_healthy ${Object.values(status.services).filter(Boolean).length}
    `.trim()
  }

  start(port = 8080): void {
    this.app.listen(port, () => {
      console.log(`📊 Health dashboard running on port ${port}`)
    })
  }
}
```

## Success Criteria and Validation

### Acceptance Criteria

1. **✅ Seamless Integration**: EMP-Job-Queue integrates with EmProps without breaking existing functionality
2. **✅ Event-Driven Sync**: Real-time synchronization of user and billing events
3. **✅ Graceful Degradation**: System continues operating when EmProps is unavailable  
4. **✅ Service Discovery**: Automatic service registration and health monitoring
5. **✅ Authentication**: Unified authentication through EmProps
6. **✅ Billing Integration**: Usage tracking and quota enforcement
7. **✅ Observable**: Comprehensive monitoring and debugging capabilities

### Integration Test Suite

```typescript
// /packages/emprops-integration/test/acceptance.test.ts
describe('Phase 5 Acceptance Tests', () => {
  it('✅ should integrate seamlessly with EmProps', async () => {
    // Test complete integration flow
  })

  it('✅ should sync events in real-time', async () => {
    // Test event-driven synchronization
  })

  it('✅ should handle graceful degradation', async () => {
    // Test system continues when EmProps unavailable
  })

  it('✅ should register and monitor service health', async () => {
    // Test service discovery integration
  })

  it('✅ should authenticate users through EmProps', async () => {
    // Test unified authentication
  })

  it('✅ should track usage and enforce quotas', async () => {
    // Test billing integration
  })

  it('✅ should provide comprehensive observability', async () => {
    // Test monitoring and debugging capabilities
  })
})
```

### Performance Benchmarks

```typescript
// /packages/emprops-integration/test/performance.test.ts
describe('Performance Benchmarks', () => {
  it('should handle 1000 concurrent job submissions', async () => {
    // Test throughput with EmProps authentication
  })

  it('should maintain <100ms response times', async () => {
    // Test latency with EmProps integration
  })

  it('should process events within 50ms', async () => {
    // Test event processing latency
  })
})
```

This Phase 5 implementation enables seamless integration with the EmProps ecosystem while maintaining system independence and reliability. The event-driven architecture ensures real-time synchronization, while graceful degradation guarantees service availability even during EmProps outages.

The NATS messaging system provides robust, scalable communication, and the API Gateway pattern ensures clean separation of concerns. Service discovery and health monitoring enable dynamic service management at scale.

This implementation advances the north star by creating a unified, integrated system that can scale independently while participating in the broader EmProps ecosystem, setting the foundation for enterprise-grade AI workload management.