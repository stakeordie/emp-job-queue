/**
 * Monitor WebSocket Handler
 *
 * ⚠️  CRITICAL: MONITORS ARE READ-ONLY OBSERVERS ONLY! ⚠️
 *
 * This handler is STRICTLY for passive monitoring operations:
 * - Event subscription management
 * - Real-time event streaming
 * - Connection health/heartbeat
 * - State synchronization after reconnection
 *
 * 🚫 DO NOT ADD ANY CONTROL/COMMAND OPERATIONS HERE! 🚫
 *
 * All control operations (submit job, sync job state, cancel job, etc.)
 * MUST go through the client WebSocket connection and be handled by
 * the core MessageHandler, NOT here!
 *
 * If you're tempted to add a new message type here, ask yourself:
 * "Does this CHANGE system state or is it READ-ONLY monitoring?"
 * If it changes state → Use client connection + MessageHandler
 * If it's read-only → This handler is appropriate
 */

import WebSocket from 'ws';
import { EventBroadcaster } from '../services/event-broadcaster.js';
import { JobBroker } from '../core/job-broker.js';
import { ConnectionManagerInterface } from '../core/interfaces/connection-manager.js';
import { MonitorConnectEvent, SubscribeEvent, HeartbeatEvent } from '../types/monitor-events.js';

/**
 * STRICTLY TYPED: Only read-only monitoring messages allowed
 * This prevents any control operations from being added here
 */
type MonitorOnlyMessageType = 'monitor_connect' | 'subscribe' | 'heartbeat' | 'resync_request';

interface MonitorOnlyMessage {
  type: MonitorOnlyMessageType;
  id?: string;
  timestamp: number;
  [key: string]: unknown;
}

export class MonitorWebSocketHandler {
  private eventBroadcaster: EventBroadcaster;
  private jobBroker: JobBroker;
  private connectionManager: ConnectionManagerInterface;

  constructor(
    eventBroadcaster: EventBroadcaster,
    jobBroker: JobBroker,
    connectionManager: ConnectionManagerInterface
  ) {
    this.eventBroadcaster = eventBroadcaster;
    this.jobBroker = jobBroker;
    this.connectionManager = connectionManager;
  }

  /**
   * Handle new monitor WebSocket connection
   */
  handleConnection(ws: WebSocket, monitorId: string): void {
    // Monitor connected

    // Register with event broadcaster
    this.eventBroadcaster.addMonitor(monitorId, ws);

    // Set up message handling
    ws.on('message', async data => {
      try {
        const rawMessage = JSON.parse(data.toString());

        // Validate that this is a monitor-only message
        if (!this.isValidMonitorMessage(rawMessage)) {
          console.error(`[MonitorWS] Invalid message type for monitor: ${rawMessage.type}`);
          this.sendError(
            ws,
            `Monitor connections can only send: monitor_connect, subscribe, heartbeat, resync_request. Use client WebSocket for control operations.`
          );
          return;
        }

        const message = rawMessage as MonitorOnlyMessage;
        await this.handleMessage(monitorId, message);
      } catch (error) {
        console.error(`[MonitorWS] Error handling message from ${monitorId}:`, error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      // Monitor disconnected
      this.eventBroadcaster.removeMonitor(monitorId);
    });

    ws.on('error', error => {
      console.error(`[MonitorWS] Monitor ${monitorId} error:`, error);
      this.eventBroadcaster.removeMonitor(monitorId);
    });
  }

  /**
   * Handle incoming messages from monitors
   *
   * TypeScript ENFORCES only read-only monitoring operations!
   * Control operations will cause compile-time errors.
   */
  private async handleMessage(monitorId: string, message: MonitorOnlyMessage): Promise<void> {
    switch (message.type) {
      case 'monitor_connect':
        await this.handleMonitorConnect(monitorId, message as unknown as MonitorConnectEvent);
        break;

      case 'subscribe':
        this.handleSubscribe(monitorId, message as unknown as SubscribeEvent);
        break;

      case 'heartbeat':
        this.handleHeartbeat(monitorId, message as unknown as HeartbeatEvent);
        break;

      case 'resync_request':
        await this.handleResyncRequest(monitorId, message);
        break;

      default:
        // TypeScript should prevent this, but handle runtime edge cases
        const _exhaustive: never = message.type;
        console.error(`[MonitorWS] Unexpected message type from ${monitorId}: ${message.type}`);
        console.error(`[MonitorWS] This should be impossible due to TypeScript types!`);
    }
  }

  /**
   * Handle monitor connection and optional full state request
   */
  private async handleMonitorConnect(
    monitorId: string,
    message: MonitorConnectEvent
  ): Promise<void> {
    // Monitor requesting connection

    if (message.request_full_state) {
      await this.sendFullState(monitorId);
    }
  }

  /**
   * Handle subscription updates
   */
  private handleSubscribe(monitorId: string, message: SubscribeEvent): void {
    // Monitor subscribing to topics

    this.eventBroadcaster.updateSubscription(monitorId, message.topics, message.filters);
  }

  /**
   * Handle heartbeat from monitor
   */
  private handleHeartbeat(monitorId: string, _message: HeartbeatEvent): void {
    this.eventBroadcaster.updateHeartbeat(monitorId);
  }

  /**
   * Handle resync request
   */
  private async handleResyncRequest(
    monitorId: string,
    message: Record<string, unknown>
  ): Promise<void> {
    // Monitor requesting resync
    console.log(`[MonitorWS] Resync requested by ${monitorId} since ${message.since_timestamp}`);

    const sinceTimestamp = message.since_timestamp as number;
    const maxEvents = message.max_events as number | undefined;

    // Use enhanced resync functionality
    this.eventBroadcaster.handleResyncRequest(monitorId, sinceTimestamp, maxEvents);
  }

  /**
   * Send full state snapshot to monitor
   */
  private async sendFullState(monitorId: string): Promise<void> {
    try {
      // Get current system state
      const [workers, jobs] = await Promise.all([this.getWorkersState(), this.getJobsState()]);

      const systemStats = this.calculateSystemStats(workers, jobs);

      const stateData = {
        workers: this.formatWorkersForSnapshot(workers),
        jobs: {
          pending: jobs.filter(job => (job.status as string) === 'pending'),
          active: jobs.filter(
            job =>
              (job.status as string) === 'active' ||
              (job.status as string) === 'assigned' ||
              (job.status as string) === 'processing'
          ),
          completed: jobs.filter(job => (job.status as string) === 'completed'),
          failed: jobs.filter(job => (job.status as string) === 'failed'),
        },
        system_stats: systemStats,
      };

      await this.eventBroadcaster.sendFullState(monitorId, stateData);
    } catch (error) {
      console.error(`[MonitorWS] Error sending full state to ${monitorId}:`, error);
    }
  }

  /**
   * Get current workers state from connection manager
   */
  private async getWorkersState(): Promise<Record<string, unknown>[]> {
    try {
      // Get workers from connection manager (in-memory)
      const workersData = await this.connectionManager.getConnectedWorkers();
      return workersData.map(worker => ({
        id: worker.workerId,
        status: 'idle', // Default status - could be enhanced later
        capabilities: worker.capabilities || {},
        connected_at: worker.connectedAt,
        last_activity: worker.lastActivity,
        jobs_completed: 0, // Could be tracked separately
        jobs_failed: 0, // Could be tracked separately
        current_job_id: null, // Could be tracked separately
      }));
    } catch (error) {
      console.error('[MonitorWS] Error getting workers state:', error);
      return [];
    }
  }

  /**
   * Get current jobs state from job broker
   */
  private async getJobsState(): Promise<Record<string, unknown>[]> {
    try {
      // Get jobs from job broker's Redis store
      const jobsData = await this.jobBroker.getAllJobs();
      return (jobsData as Record<string, unknown>[]) || [];
    } catch (error) {
      console.error('[MonitorWS] Error getting jobs state:', error);
      return [];
    }
  }

  /**
   * Calculate system statistics
   */
  private calculateSystemStats(
    workers: Record<string, unknown>[],
    jobs: Record<string, unknown>[]
  ): Record<string, number> {
    const activeWorkers = workers.filter(
      w => (w.status as string) === 'idle' || (w.status as string) === 'busy'
    ).length;
    const pendingJobs = jobs.filter(j => (j.status as string) === 'pending').length;
    const activeJobs = jobs.filter(
      j =>
        (j.status as string) === 'active' ||
        (j.status as string) === 'assigned' ||
        (j.status as string) === 'processing'
    ).length;
    const completedJobs = jobs.filter(j => (j.status as string) === 'completed').length;
    const failedJobs = jobs.filter(j => (j.status as string) === 'failed').length;

    return {
      total_workers: workers.length,
      active_workers: activeWorkers,
      total_jobs: jobs.length,
      pending_jobs: pendingJobs,
      active_jobs: activeJobs,
      completed_jobs: completedJobs,
      failed_jobs: failedJobs,
    };
  }

  /**
   * Format workers data for snapshot
   */
  private formatWorkersForSnapshot(workers: Record<string, unknown>[]): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};

    for (const worker of workers) {
      formatted[worker.id as string] = {
        id: worker.id,
        status: (worker.status as string) || 'idle',
        capabilities: (worker.capabilities as Record<string, unknown>) || {},
        connected_at: (worker.connected_at as string) || new Date().toISOString(),
        jobs_completed: (worker.jobs_completed as number) || 0,
        jobs_failed: (worker.jobs_failed as number) || 0,
        current_job_id: (worker.current_job_id as string) || null,
        last_activity: (worker.last_activity as string) || new Date().toISOString(),
      };
    }

    return formatted;
  }

  /**
   * Send message to WebSocket
   */
  private sendMessage(ws: WebSocket, message: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error('[MonitorWS] Error sending message:', error);
      }
    }
  }

  /**
   * Send error message to WebSocket
   */
  private sendError(ws: WebSocket, error: string): void {
    this.sendMessage(ws, {
      type: 'error',
      message: error,
      timestamp: Date.now(),
    });
  }

  /**
   * Type guard: validates that a message is allowed for monitors
   * Prevents control operations from being processed here
   */
  private isValidMonitorMessage(message: unknown): message is MonitorOnlyMessage {
    if (!message || typeof message !== 'object') return false;

    const msg = message as Record<string, unknown>;
    const validTypes: MonitorOnlyMessageType[] = [
      'monitor_connect',
      'subscribe',
      'heartbeat',
      'resync_request',
    ];

    return (
      typeof msg.type === 'string' &&
      validTypes.includes(msg.type as MonitorOnlyMessageType) &&
      typeof msg.timestamp === 'number'
    );
  }

  /**
   * Get connected monitors info
   */
  getMonitorInfo(): { count: number; monitors: string[] } {
    return {
      count: this.eventBroadcaster.getMonitorCount(),
      monitors: this.eventBroadcaster.getConnectedMonitors(),
    };
  }
}
