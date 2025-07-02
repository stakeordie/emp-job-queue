// Hub HTTP Server - Express.js API for job submission and monitoring
// Direct port from Python hub FastAPI endpoints

import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Server } from 'http';
import { RedisServiceInterface } from '../core/interfaces/redis-service.js';
import {
  JobSubmissionRequest,
  JobStatusResponse,
  JobStatus,
  JobFilter,
} from '../core/types/job.js';
import { WorkerStatus } from '../core/types/worker.js';
import { logger } from '../core/utils/logger.js';
import { MonitoringDashboard } from './monitoring-dashboard.js';
import { ConnectionManagerInterface } from '../core/interfaces/connection-manager.js';

interface HubServerConfig {
  port: number;
  host: string;
  enableCors?: boolean;
  corsOrigins?: string[];
  enableHelmet?: boolean;
  enableCompression?: boolean;
  requestTimeout?: number;
  maxJsonSize?: string;
}

export class HubServer {
  private app: Express;
  private server: Server | null = null;
  private redisService: RedisServiceInterface;
  private connectionManager?: ConnectionManagerInterface;
  private config: HubServerConfig;
  private isRunningFlag = false;
  private monitoringDashboard?: MonitoringDashboard;

  constructor(
    redisService: RedisServiceInterface,
    config: HubServerConfig,
    connectionManager?: ConnectionManagerInterface
  ) {
    this.redisService = redisService;
    this.connectionManager = connectionManager;
    this.config = {
      enableCors: true,
      corsOrigins: ['*'],
      enableHelmet: true,
      enableCompression: true,
      requestTimeout: 30000,
      maxJsonSize: '10mb',
      ...config,
    };

    this.app = express();

    // Set up monitoring dashboard if connection manager is provided
    if (this.connectionManager) {
      this.monitoringDashboard = new MonitoringDashboard(this.redisService, this.connectionManager);
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    if (this.config.enableHelmet) {
      this.app.use(helmet());
    }

    // CORS
    if (this.config.enableCors) {
      this.app.use(
        cors({
          origin: this.config.corsOrigins,
          credentials: true,
        })
      );
    }

    // Compression
    if (this.config.enableCompression) {
      this.app.use(compression());
    }

    // Body parsing
    this.app.use(express.json({ limit: this.config.maxJsonSize }));
    this.app.use(express.urlencoded({ extended: true, limit: this.config.maxJsonSize }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });

      next();
    });

    // Request timeout
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.setTimeout(this.config.requestTimeout || 30000, () => {
        res.status(408).json({ error: 'Request timeout' });
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Monitoring dashboard
    if (this.monitoringDashboard) {
      this.app.use('/dashboard', this.monitoringDashboard.getApp());
    }

    // Health check
    this.app.get('/health', this.handleHealthCheck.bind(this));

    // Job management routes
    this.app.post('/jobs', this.handleJobSubmission.bind(this));
    this.app.get('/jobs/:id', this.handleGetJob.bind(this));
    this.app.get('/jobs/:id/status', this.handleGetJobStatus.bind(this));
    this.app.get('/jobs/:id/progress', this.handleGetJobProgress.bind(this));
    this.app.post('/jobs/:id/cancel', this.handleCancelJob.bind(this));
    this.app.get('/jobs', this.handleListJobs.bind(this));

    // Worker management routes
    this.app.get('/workers', this.handleListWorkers.bind(this));
    this.app.get('/workers/:id', this.handleGetWorker.bind(this));
    this.app.get('/workers/:id/jobs', this.handleGetWorkerJobs.bind(this));

    // System monitoring routes
    this.app.get('/metrics', this.handleGetMetrics.bind(this));
    this.app.get('/statistics', this.handleGetStatistics.bind(this));
    this.app.get('/system/status', this.handleGetSystemStatus.bind(this));

    // Queue management routes
    this.app.get('/queue/pending', this.handleGetPendingJobs.bind(this));
    this.app.get('/queue/active', this.handleGetActiveJobs.bind(this));
    this.app.get('/queue/completed', this.handleGetCompletedJobs.bind(this));
    this.app.get('/queue/failed', this.handleGetFailedJobs.bind(this));
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.originalUrl,
        method: req.method,
      });
    });

    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
      logger.error(`API Error on ${req.method} ${req.path}:`, error);

      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      });
    });
  }

  // Route handlers
  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const redisHealthy = await this.redisService.ping();
      const health = {
        status: redisHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          redis: redisHealthy ? 'connected' : 'disconnected',
          api: 'running',
        },
      };

      res.status(redisHealthy ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed',
      });
    }
  }

  private async handleJobSubmission(req: Request, res: Response): Promise<void> {
    try {
      const jobRequest: JobSubmissionRequest = req.body;

      // Validate required fields
      if (!jobRequest.service_required || !jobRequest.payload) {
        res.status(400).json({
          error: 'Missing required fields',
          required: ['service_required', 'payload'],
        });
        return;
      }

      const jobId = await this.redisService.submitJob({
        service_required: jobRequest.service_required,
        priority: jobRequest.priority || 50,
        payload: jobRequest.payload,
        customer_id: jobRequest.customer_id,
        requirements: jobRequest.requirements,
        max_retries: jobRequest.max_retries || 3,
        workflow_id: jobRequest.workflow_id,
        workflow_priority: jobRequest.workflow_priority,
        workflow_datetime: jobRequest.workflow_datetime,
        step_number: jobRequest.step_number,
      });

      const job = await this.redisService.getJob(jobId);
      const queuePosition = await this.redisService.getJobQueuePosition(jobId);

      res.status(201).json({
        job_id: jobId,
        status: 'submitted',
        queue_position: queuePosition,
        job: job,
      });
    } catch (error) {
      logger.error('Job submission failed:', error);
      res.status(500).json({
        error: 'Failed to submit job',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleGetJob(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.id;
      const job = await this.redisService.getJob(jobId);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.json({ job });
    } catch (error) {
      logger.error(`Failed to get job ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve job' });
    }
  }

  private async handleGetJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.id;
      const job = await this.redisService.getJob(jobId);

      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const queuePosition =
        job.status === JobStatus.PENDING ? await this.redisService.getJobQueuePosition(jobId) : -1;

      const response: JobStatusResponse = {
        job,
        queue_position: queuePosition >= 0 ? queuePosition : undefined,
      };

      res.json(response);
    } catch (error) {
      logger.error(`Failed to get job status ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve job status' });
    }
  }

  private async handleGetJobProgress(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.id;
      // TODO: Implement progress retrieval from Redis
      res.json({
        job_id: jobId,
        progress: 0,
        status: 'pending',
        message: 'Progress tracking not yet implemented',
      });
    } catch (error) {
      logger.error(`Failed to get job progress ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve job progress' });
    }
  }

  private async handleCancelJob(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.id;
      const { reason } = req.body;

      await this.redisService.cancelJob(jobId, reason || 'Cancelled by user');

      res.json({
        job_id: jobId,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(`Failed to cancel job ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  }

  private async handleListJobs(req: Request, res: Response): Promise<void> {
    try {
      const filter: JobFilter = {
        status: req.query.status as JobStatus[],
        type: req.query.type as string[],
        customer_id: req.query.customer_id as string,
        worker_id: req.query.worker_id as string,
      };

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.page_size as string) || 20;

      const result = await this.redisService.searchJobs(filter, page, pageSize);
      res.json(result);
    } catch (error) {
      logger.error('Failed to list jobs:', error);
      res.status(500).json({ error: 'Failed to retrieve jobs' });
    }
  }

  private async handleListWorkers(req: Request, res: Response): Promise<void> {
    try {
      if (!this.connectionManager) {
        res.status(503).json({ error: 'Connection manager not available' });
        return;
      }

      // Get workers from connection manager (in-memory, like Python version)
      const workers = await this.connectionManager.getConnectedWorkers();

      // Apply basic filtering if needed
      const filter = {
        status: req.query.status as WorkerStatus[],
        services: req.query.services as string[],
        available_only: req.query.available_only === 'true',
      };

      // Simple filtering (more complex filtering can be added later)
      let filteredWorkers = workers;
      if (filter.services && filter.services.length > 0) {
        filteredWorkers = workers.filter(worker =>
          filter.services.some(service => worker.capabilities?.services?.includes(service))
        );
      }

      res.json({ workers: filteredWorkers });
    } catch (error) {
      logger.error('Failed to list workers:', error);
      res.status(500).json({ error: 'Failed to retrieve workers' });
    }
  }

  private async handleGetWorker(req: Request, res: Response): Promise<void> {
    try {
      const workerId = req.params.id;
      const worker = await this.redisService.getWorker(workerId);

      if (!worker) {
        res.status(404).json({ error: 'Worker not found' });
        return;
      }

      res.json({ worker });
    } catch (error) {
      logger.error(`Failed to get worker ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve worker' });
    }
  }

  private async handleGetWorkerJobs(req: Request, res: Response): Promise<void> {
    try {
      const workerId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 50;

      const jobs = await this.redisService.getJobsByWorker(workerId, limit);
      res.json({ worker_id: workerId, jobs });
    } catch (error) {
      logger.error(`Failed to get worker jobs ${req.params.id}:`, error);
      res.status(500).json({ error: 'Failed to retrieve worker jobs' });
    }
  }

  private async handleGetMetrics(req: Request, res: Response): Promise<void> {
    try {
      const [jobStats, workerStats, systemMetrics] = await Promise.all([
        this.redisService.getJobStatistics(),
        this.redisService.getWorkerStatistics(),
        this.redisService.getSystemMetrics(),
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        jobs: jobStats,
        workers: workerStats,
        system: systemMetrics,
      });
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
  }

  private async handleGetStatistics(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.redisService.getJobStatistics();
      res.json(stats);
    } catch (error) {
      logger.error('Failed to get statistics:', error);
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  }

  private async handleGetSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      const [jobStats, workerStats, redisInfo] = await Promise.all([
        this.redisService.getJobStatistics(),
        this.redisService.getWorkerStatistics(),
        this.redisService.getRedisInfo(),
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        status: 'operational',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        jobs: jobStats,
        workers: workerStats,
        redis: {
          connected: this.redisService.isConnected(),
          info: redisInfo,
        },
      });
    } catch (error) {
      logger.error('Failed to get system status:', error);
      res.status(500).json({ error: 'Failed to retrieve system status' });
    }
  }

  private async handleGetPendingJobs(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = await this.redisService.getPendingJobs(limit);
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get pending jobs:', error);
      res.status(500).json({ error: 'Failed to retrieve pending jobs' });
    }
  }

  private async handleGetActiveJobs(req: Request, res: Response): Promise<void> {
    try {
      const workerId = req.query.worker_id as string;
      const jobs = await this.redisService.getActiveJobs(workerId);
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get active jobs:', error);
      res.status(500).json({ error: 'Failed to retrieve active jobs' });
    }
  }

  private async handleGetCompletedJobs(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = await this.redisService.getCompletedJobs(limit);
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get completed jobs:', error);
      res.status(500).json({ error: 'Failed to retrieve completed jobs' });
    }
  }

  private async handleGetFailedJobs(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const jobs = await this.redisService.getFailedJobs(limit);
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get failed jobs:', error);
      res.status(500).json({ error: 'Failed to retrieve failed jobs' });
    }
  }

  // Server lifecycle
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, this.config.host, () => {
        this.isRunningFlag = true;
        logger.info(`Hub HTTP server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });

      this.server.on('error', error => {
        logger.error('Hub HTTP server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.isRunningFlag = false;
          logger.info('Hub HTTP server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isRunning(): boolean {
    return this.isRunningFlag;
  }

  getApp(): Express {
    return this.app;
  }
}
