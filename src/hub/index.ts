// Hub Service Entry Point - direct port from Python hub/main.py
// Central orchestrator for job distribution and worker communication

import { HubServer } from './hub-server.js';
import { WebSocketManager } from './websocket-manager.js';
import { RedisService } from '../core/redis-service.js';
import { MessageHandler } from '../core/message-handler.js';
import { ConnectionManager } from '../core/connection-manager.js';
import { EventBroadcaster } from '../services/event-broadcaster.js';
import { MonitorWebSocketHandler } from './monitor-websocket-handler.js';
import { JobBroker } from '../core/job-broker.js';
import { logger } from '../core/utils/logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class Hub {
  private redisService: RedisService;
  private connectionManager: ConnectionManager;
  private messageHandler: MessageHandler;
  private hubServer: HubServer;
  private websocketManager: WebSocketManager;
  private eventBroadcaster: EventBroadcaster;
  private jobBroker: JobBroker;
  private isRunning = false;
  private stuckJobCleanupInterval?: NodeJS.Timeout;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // Initialize core services
    this.eventBroadcaster = new EventBroadcaster();
    this.redisService = new RedisService(redisUrl, this.eventBroadcaster);
    this.jobBroker = new JobBroker(this.redisService);

    this.connectionManager = new ConnectionManager(
      {
        maxMessageSizeBytes: parseInt(process.env.MAX_WS_MESSAGE_SIZE_MB || '100') * 1024 * 1024,
        heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000'),
        connectionTimeoutMs: parseInt(process.env.CONNECTION_TIMEOUT_MS || '60000'),
      },
      this.redisService
    );

    this.messageHandler = new MessageHandler(
      this.redisService,
      this.connectionManager,
      this.eventBroadcaster
    );

    // Initialize HTTP and WebSocket servers
    this.hubServer = new HubServer(
      this.redisService,
      {
        port: parseInt(process.env.HUB_PORT || '3001'),
        host: process.env.HUB_HOST || '0.0.0.0',
      },
      this.connectionManager
    );

    this.websocketManager = new WebSocketManager(
      this.connectionManager,
      {
        port: parseInt(process.env.WS_PORT || '3002'),
        host: process.env.WS_HOST || '0.0.0.0',
      },
      this.eventBroadcaster
    );

    // Set up monitor WebSocket handler after all dependencies are ready
    const monitorHandler = new MonitorWebSocketHandler(
      this.eventBroadcaster,
      this.jobBroker,
      this.connectionManager
    );
    this.websocketManager.setMonitorHandler(monitorHandler);
  }

  async start(): Promise<void> {
    try {
      logger.info('Starting Hub service...');

      // Start core services
      await this.redisService.connect();
      await this.connectionManager.start();

      // Legacy stats broadcasting (DISABLED - replaced with EventBroadcaster)
      // TODO: Remove this entire block after confirming event system is stable
      const enableLegacyStats = process.env.ENABLE_LEGACY_STATS_BROADCAST === 'true';
      if (enableLegacyStats) {
        const statsInterval = parseInt(process.env.STATS_BROADCAST_INTERVAL_MS || '5000');
        this.connectionManager.startStatsBroadcast(statsInterval);
        logger.warn('Legacy stats broadcast enabled - consider migrating to EventBroadcaster');
      } else {
        logger.info(
          'Legacy stats broadcast disabled - using EventBroadcaster for real-time updates'
        );
      }

      // Start servers
      await this.hubServer.start();
      await this.websocketManager.start();

      // Start stuck job cleanup background task
      this.startStuckJobCleanup();

      this.isRunning = true;

      logger.info(`Hub service started successfully`);
      logger.info(`HTTP API server listening on port ${process.env.HUB_PORT || 3001}`);
      logger.info(`WebSocket server listening on port ${process.env.WS_PORT || 3002}`);
      logger.info(
        `Monitoring dashboard available at http://localhost:${process.env.HUB_PORT || 3001}/dashboard`
      );
    } catch (error) {
      logger.error('Failed to start Hub service:', error);
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    logger.info('Stopping Hub service...');

    try {
      // Stop background tasks
      this.stopStuckJobCleanup();

      // Stop servers
      await this.websocketManager.stop();
      await this.hubServer.stop();

      // Stop core services
      await this.connectionManager.stop();
      await this.redisService.disconnect();

      this.isRunning = false;
      logger.info('Hub service stopped successfully');
    } catch (error) {
      logger.error('Error stopping Hub service:', error);
      throw error;
    }
  }

  isHealthy(): boolean {
    return (
      this.isRunning &&
      this.redisService.isConnected() &&
      this.connectionManager.isRunning() &&
      this.hubServer.isRunning() &&
      this.websocketManager.isRunning()
    );
  }

  /**
   * Start background task to detect and fix stuck jobs
   */
  private startStuckJobCleanup(): void {
    // Configurable cleanup interval (default: 60 seconds)
    const cleanupIntervalSec = parseInt(process.env.STUCK_JOB_CLEANUP_INTERVAL_SEC || '60');
    const cleanupIntervalMs = cleanupIntervalSec * 1000;

    logger.info(`Starting stuck job cleanup with ${cleanupIntervalSec}s interval`);

    this.stuckJobCleanupInterval = setInterval(async () => {
      try {
        const fixedCount = await this.redisService.detectAndFixOrphanedJobs();
        if (fixedCount > 0) {
          logger.info(`Background cleanup fixed ${fixedCount} stuck/orphaned jobs`);
        }
      } catch (error) {
        logger.error('Error in stuck job cleanup background task:', error);
      }
    }, cleanupIntervalMs);
  }

  /**
   * Stop background stuck job cleanup task
   */
  private stopStuckJobCleanup(): void {
    if (this.stuckJobCleanupInterval) {
      clearInterval(this.stuckJobCleanupInterval);
      this.stuckJobCleanupInterval = undefined;
      logger.info('Stopped stuck job cleanup background task');
    }
  }
}

// Create and start hub instance
const hub = new Hub();

// Graceful shutdown handling
const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await hub.stop();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

// Start the hub
hub.start().catch(error => {
  logger.error('Failed to start hub:', error);
  process.exit(1);
});

export { Hub };
