/**
 * Monitor WebSocket Handler
 *
 * Handles WebSocket connections from monitors for real-time event streaming.
 * Supports subscription management, full state snapshots, and heartbeat monitoring.
 */

import WebSocket from 'ws';
import { EventBroadcaster } from '../services/event-broadcaster.js';
import { JobBroker } from '../core/job-broker.js';
import { ConnectionManagerInterface } from '../core/interfaces/connection-manager.js';
import { MonitorConnectEvent, SubscribeEvent, HeartbeatEvent } from '../types/monitor-events.js';

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
        const message = JSON.parse(data.toString());
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
   */
  private async handleMessage(monitorId: string, message: Record<string, unknown>): Promise<void> {
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
        console.warn(`[MonitorWS] Unknown message type from ${monitorId}:`, message.type);
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
          completed: jobs.filter(job => (job.status as string) === 'completed').slice(-100), // Last 100
          failed: jobs.filter(job => (job.status as string) === 'failed').slice(-100), // Last 100
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
   * Get connected monitors info
   */
  getMonitorInfo(): { count: number; monitors: string[] } {
    return {
      count: this.eventBroadcaster.getMonitorCount(),
      monitors: this.eventBroadcaster.getConnectedMonitors(),
    };
  }
}
