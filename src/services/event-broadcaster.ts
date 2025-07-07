/**
 * Event Broadcaster Service
 *
 * Manages real-time event broadcasting to connected monitors.
 * Replaces polling-based stats_broadcast with instant event updates.
 */

import WebSocket from 'ws';
import {
  MonitorEvent,
  SubscriptionTopic,
  SubscriptionFilters,
  MonitorSubscription,
  WorkerConnectedEvent,
  WorkerDisconnectedEvent,
  WorkerStatusChangedEvent,
  JobSubmittedEvent,
  JobAssignedEvent,
  JobStatusChangedEvent,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  FullStateSnapshotEvent,
  HeartbeatAckEvent,
} from '../types/monitor-events.js';
import { JobRequirements, JobStatus } from '../core/types/job.js';

export class EventBroadcaster {
  private monitors: Map<string, WebSocket> = new Map();
  private subscriptions: Map<string, MonitorSubscription> = new Map();
  private eventHistory: MonitorEvent[] = [];
  private maxHistorySize = 1000;

  constructor() {
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
  }

  /**
   * Register a new monitor connection
   */
  addMonitor(monitorId: string, ws: WebSocket): void {
    // Monitor connected

    this.monitors.set(monitorId, ws);

    // Set up WebSocket handlers
    ws.on('close', () => {
      this.removeMonitor(monitorId);
    });

    ws.on('error', error => {
      console.error(`[EventBroadcaster] Monitor ${monitorId} error:`, error);
      this.removeMonitor(monitorId);
    });

    // Initialize subscription with heartbeat tracking
    this.subscriptions.set(monitorId, {
      monitor_id: monitorId,
      topics: [],
      connected_at: Date.now(),
      last_heartbeat: Date.now(),
    });
  }

  /**
   * Remove monitor connection
   */
  removeMonitor(monitorId: string): void {
    // Monitor disconnected
    this.monitors.delete(monitorId);
    this.subscriptions.delete(monitorId);
  }

  /**
   * Update monitor subscription
   */
  updateSubscription(
    monitorId: string,
    topics: SubscriptionTopic[],
    filters?: SubscriptionFilters
  ): void {
    const subscription = this.subscriptions.get(monitorId);
    if (subscription) {
      subscription.topics = topics;
      subscription.filters = filters;
      // Monitor subscribed to topics
    }
  }

  /**
   * Update monitor heartbeat
   */
  updateHeartbeat(monitorId: string): void {
    const subscription = this.subscriptions.get(monitorId);
    if (subscription) {
      subscription.last_heartbeat = Date.now();
    }
  }

  /**
   * Broadcast event to all subscribed monitors
   */
  broadcast(event: MonitorEvent): void {
    // Store event in history
    this.addToHistory(event);

    // Send to all subscribed monitors
    for (const [monitorId, ws] of this.monitors) {
      if (this.shouldReceiveEvent(monitorId, event)) {
        this.sendToMonitor(ws, event);
      }
    }

    // Debug logging for non-heartbeat events
    if (event.type !== 'heartbeat' && event.type !== 'heartbeat_ack') {
      // Event broadcasted to monitors
    }
  }

  /**
   * Send full state snapshot to specific monitor
   */
  async sendFullState(monitorId: string, stateData: FullStateSnapshotEvent['data']): Promise<void> {
    const ws = this.monitors.get(monitorId);
    if (!ws) return;

    const event: FullStateSnapshotEvent = {
      type: 'full_state_snapshot',
      data: stateData,
      timestamp: Date.now(),
    };

    this.sendToMonitor(ws, event);
    // Sent full state to monitor
  }

  /**
   * Get events since timestamp (for resync)
   */
  getEventsSince(
    timestamp: number,
    maxEvents?: number
  ): { events: MonitorEvent[]; hasMore: boolean } {
    const filteredEvents = this.eventHistory.filter(event => event.timestamp > timestamp);

    if (maxEvents && filteredEvents.length > maxEvents) {
      return {
        events: filteredEvents.slice(0, maxEvents),
        hasMore: true,
      };
    }

    return {
      events: filteredEvents,
      hasMore: false,
    };
  }

  /**
   * Get oldest available timestamp in history
   */
  getOldestTimestamp(): number {
    if (this.eventHistory.length === 0) {
      return Date.now();
    }
    return this.eventHistory[0].timestamp;
  }

  /**
   * Handle resync request from monitor
   */
  handleResyncRequest(monitorId: string, sinceTimestamp: number, maxEvents?: number): void {
    const ws = this.monitors.get(monitorId);
    if (!ws) return;

    const { events, hasMore } = this.getEventsSince(sinceTimestamp, maxEvents);
    const oldestTimestamp = this.getOldestTimestamp();

    const resyncResponse = {
      type: 'resync_response' as const,
      monitor_id: monitorId,
      events: events,
      has_more: hasMore,
      oldest_available_timestamp: oldestTimestamp,
      timestamp: Date.now(),
    };

    this.sendToMonitor(ws, resyncResponse);

    // Log resync activity
    console.log(
      `[EventBroadcaster] Sent ${events.length} events to monitor ${monitorId} since ${sinceTimestamp}`
    );
  }

  // Event Broadcasting Methods

  broadcastWorkerConnected(workerId: string, workerData: Record<string, unknown>): void {
    const event: WorkerConnectedEvent = {
      type: 'worker_connected',
      worker_id: workerId,
      worker_data: {
        id: workerId,
        status: (workerData.status as string) || 'idle',
        capabilities:
          (workerData.capabilities as {
            gpu_count: number;
            gpu_memory_gb: number;
            gpu_model: string;
            cpu_cores: number;
            ram_gb: number;
            services: string[];
            models: string[];
            customer_access: string;
            max_concurrent_jobs: number;
          }) ||
          ({} as unknown as {
            gpu_count: number;
            gpu_memory_gb: number;
            gpu_model: string;
            cpu_cores: number;
            ram_gb: number;
            services: string[];
            models: string[];
            customer_access: string;
            max_concurrent_jobs: number;
          }),
        connected_at: (workerData.connected_at as string) || new Date().toISOString(),
        jobs_completed: (workerData.jobs_completed as number) || 0,
        jobs_failed: (workerData.jobs_failed as number) || 0,
      },
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastWorkerDisconnected(workerId: string): void {
    const event: WorkerDisconnectedEvent = {
      type: 'worker_disconnected',
      worker_id: workerId,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastWorkerStatusChanged(
    workerId: string,
    oldStatus: string,
    newStatus: string,
    currentJobId?: string
  ): void {
    const event: WorkerStatusChangedEvent = {
      type: 'worker_status_changed',
      worker_id: workerId,
      old_status: oldStatus,
      new_status: newStatus,
      current_job_id: currentJobId,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobSubmitted(jobId: string, jobData: Record<string, unknown>): void {
    const event: JobSubmittedEvent = {
      type: 'job_submitted',
      job_id: jobId,
      job_data: {
        id: jobId,
        job_type: jobData.job_type as string,
        status: 'pending',
        priority: jobData.priority as number,
        workflow_id: jobData.workflow_id as string,
        workflow_priority: jobData.workflow_priority as number,
        workflow_datetime: jobData.workflow_datetime as number,
        step_number: jobData.step_number as number,
        customer_id: jobData.customer_id as string,
        requirements: jobData.requirements as JobRequirements,
        created_at: (jobData.created_at as number) || Date.now(),
      },
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobAssigned(jobId: string, workerId: string, assignedAt: number): void {
    const event: JobAssignedEvent = {
      type: 'job_assigned',
      job_id: jobId,
      worker_id: workerId,
      old_status: 'pending',
      new_status: 'assigned',
      assigned_at: assignedAt,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobStatusChanged(
    jobId: string,
    oldStatus: string,
    newStatus: string,
    workerId?: string
  ): void {
    const event: JobStatusChangedEvent = {
      type: 'job_status_changed',
      job_id: jobId,
      old_status: oldStatus as JobStatus,
      new_status: newStatus as JobStatus,
      worker_id: workerId,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobProgress(jobId: string, workerId: string, progress: number): void {
    const event: JobProgressEvent = {
      type: 'update_job_progress',
      job_id: jobId,
      worker_id: workerId,
      progress: progress,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobCompleted(
    jobId: string,
    workerId: string,
    result?: unknown,
    completedAt?: number
  ): void {
    const event: JobCompletedEvent = {
      type: 'complete_job',
      job_id: jobId,
      worker_id: workerId,
      result: result,
      completed_at: completedAt || Date.now(),
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastJobFailed(jobId: string, error: string, workerId?: string, failedAt?: number): void {
    const event: JobFailedEvent = {
      type: 'job_failed',
      job_id: jobId,
      worker_id: workerId,
      error: error,
      failed_at: failedAt || Date.now(),
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  // Private helper methods

  private shouldReceiveEvent(monitorId: string, event: MonitorEvent): boolean {
    const subscription = this.subscriptions.get(monitorId);
    if (!subscription) return false;

    // Check topic subscription
    const eventTopics = this.getEventTopics(event);
    const hasMatchingTopic = eventTopics.some(topic => subscription.topics.includes(topic));

    if (!hasMatchingTopic) return false;

    // Check filters if present
    if (subscription.filters) {
      return this.passesFilters(event, subscription.filters);
    }

    return true;
  }

  private getEventTopics(event: MonitorEvent): SubscriptionTopic[] {
    switch (event.type) {
      case 'worker_connected':
      case 'worker_disconnected':
      case 'worker_status_changed':
        return ['workers'];

      case 'job_submitted':
      case 'job_assigned':
      case 'complete_job':
      case 'job_failed':
        return ['jobs', 'jobs:status'];

      case 'job_status_changed':
        return ['jobs', 'jobs:status'];

      case 'update_job_progress':
        return ['jobs', 'jobs:progress'];

      case 'system_stats':
        return ['system_stats'];

      case 'heartbeat':
      case 'heartbeat_ack':
        return ['heartbeat'];

      default:
        return [];
    }
  }

  private passesFilters(event: MonitorEvent, filters: SubscriptionFilters): boolean {
    // Job type filter
    if (filters.job_types && 'job_data' in event) {
      if (!filters.job_types.includes(event.job_data.job_type)) {
        return false;
      }
    }

    // Worker ID filter
    if (filters.worker_ids && 'worker_id' in event) {
      if (!filters.worker_ids.includes(event.worker_id)) {
        return false;
      }
    }

    // Priority range filter
    if (filters.priority_range && 'job_data' in event) {
      const [min, max] = filters.priority_range;
      if (event.job_data.priority < min || event.job_data.priority > max) {
        return false;
      }
    }

    return true;
  }

  private sendToMonitor(ws: WebSocket, event: MonitorEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
      } catch (error) {
        console.error('[EventBroadcaster] Error sending event:', error);
      }
    }
  }

  private addToHistory(event: MonitorEvent): void {
    this.eventHistory.push(event);

    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private startHeartbeatMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const staleThreshold = 60000; // 1 minute

      for (const [monitorId, subscription] of this.subscriptions) {
        const timeSinceHeartbeat = now - subscription.last_heartbeat;

        if (timeSinceHeartbeat > staleThreshold) {
          // Monitor heartbeat stale, removing
          this.removeMonitor(monitorId);
        } else {
          // Send heartbeat ack
          const ws = this.monitors.get(monitorId);
          if (ws) {
            const ackEvent: HeartbeatAckEvent = {
              type: 'heartbeat_ack',
              monitor_id: monitorId,
              server_timestamp: now,
              timestamp: now,
            };
            this.sendToMonitor(ws, ackEvent);
          }
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // Status methods
  getConnectedMonitors(): string[] {
    return Array.from(this.monitors.keys());
  }

  getMonitorCount(): number {
    return this.monitors.size;
  }

  getMonitorWebSocket(monitorId: string): WebSocket | undefined {
    return this.monitors.get(monitorId);
  }
}
