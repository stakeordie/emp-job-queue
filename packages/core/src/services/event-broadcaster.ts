/**
 * Event Broadcaster Service
 *
 * Manages real-time event broadcasting to connected monitors.
 * Replaces polling-based stats_broadcast with instant event updates.
 */

import WebSocket from 'ws';
import { Response } from 'express';
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
import { JobRequirements, JobStatus } from '../types/job.js';

// Union type for monitor connections
type MonitorConnection = WebSocket | Response;

export class EventBroadcaster {
  private monitors: Map<string, MonitorConnection> = new Map();
  private subscriptions: Map<string, MonitorSubscription> = new Map();
  private eventHistory: MonitorEvent[] = [];
  private maxHistorySize = 1000;

  constructor() {
    // Start heartbeat monitoring
    this.startHeartbeatMonitoring();
  }

  /**
   * Register a new monitor connection (WebSocket or SSE)
   */
  addMonitor(monitorId: string, connection: MonitorConnection): void {
    // Monitor connected

    this.monitors.set(monitorId, connection);

    // Set up handlers based on connection type
    if (connection instanceof WebSocket) {
      // WebSocket handlers
      connection.on('close', () => {
        this.removeMonitor(monitorId);
      });

      connection.on('error', error => {
        console.error(`[EventBroadcaster] Monitor ${monitorId} error:`, error);
        this.removeMonitor(monitorId);
      });
    } else {
      // SSE (Response) handlers
      connection.on('close', () => {
        this.removeMonitor(monitorId);
      });

      connection.on('error', error => {
        console.error(`[EventBroadcaster] SSE Monitor ${monitorId} error:`, error);
        this.removeMonitor(monitorId);
      });
    }

    // Initialize subscription with heartbeat tracking
    // Subscribe to all relevant topics by default for monitors
    this.subscriptions.set(monitorId, {
      monitor_id: monitorId,
      topics: [
        'workers',
        'jobs',
        'jobs:status',
        'jobs:progress',
        'machines',
        'system_stats',
        'heartbeat',
      ],
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
    for (const [monitorId, connection] of this.monitors) {
      if (this.shouldReceiveEvent(monitorId, event)) {
        this.sendToMonitor(connection, event);
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
    const connection = this.monitors.get(monitorId);
    if (!connection) return;

    const event: FullStateSnapshotEvent = {
      type: 'full_state_snapshot',
      data: stateData,
      timestamp: Date.now(),
    };

    this.sendToMonitor(connection, event);
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
    const connection = this.monitors.get(monitorId);
    if (!connection) return;

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

    this.sendToMonitor(connection, resyncResponse);

    // Log resync activity
    // eslint-disable-next-line no-console
    console.log(
      `[EventBroadcaster] Sent ${events.length} events to monitor ${monitorId} since ${sinceTimestamp}`
    );
  }

  // Event Broadcasting Methods

  // Machine Events
  broadcastMachineStartup(
    machineId: string,
    phase: 'starting' | 'configuring' | 'ready',
    hostInfo?: {
      hostname: string;
      ip_address?: string;
      os: string;
      cpu_cores: number;
      total_ram_gb: number;
      gpu_count: number;
      gpu_models?: string[];
    }
  ): void {
    const event = {
      type: 'machine_startup' as const,
      machine_id: machineId,
      phase,
      host_info: hostInfo,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastMachineStartupStep(
    machineId: string,
    stepName: string,
    stepPhase: string,
    elapsedMs: number,
    stepData?: Record<string, unknown>
  ): void {
    const event = {
      type: 'machine_startup_step' as const,
      machine_id: machineId,
      step_name: stepName,
      step_phase: stepPhase as
        | 'shared_setup'
        | 'core_infrastructure'
        | 'ai_services'
        | 'supporting_services',
      step_data: stepData,
      elapsed_ms: elapsedMs,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastMachineStartupComplete(
    machineId: string,
    totalStartupTimeMs: number,
    workerCount: number,
    servicesStarted: string[]
  ): void {
    const event = {
      type: 'machine_startup_complete' as const,
      machine_id: machineId,
      total_startup_time_ms: totalStartupTimeMs,
      worker_count: workerCount,
      services_started: servicesStarted,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastMachineShutdown(machineId: string, reason?: string): void {
    const event = {
      type: 'machine_shutdown' as const,
      machine_id: machineId,
      reason,
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastWorkerConnected(workerId: string, workerData: Record<string, unknown>): void {
    // Extract machine_id from worker data (same level as worker_id)
    const machineId = (workerData.machine_id as string) || 'unknown-machine';

    // Extract capabilities from nested WorkerCapabilities structure
    const rawCapabilities = workerData.capabilities as Record<string, unknown>;

    // Map nested WorkerCapabilities to flat structure expected by monitor
    const capabilities = {
      gpu_count: 1, // Default to 1 GPU
      gpu_memory_gb: rawCapabilities?.hardware?.gpu_memory_gb || 0,
      gpu_model: rawCapabilities?.hardware?.gpu_model || 'Unknown',
      cpu_cores: 1, // Default to 1 CPU core
      ram_gb: rawCapabilities?.hardware?.ram_gb || 1,
      services: rawCapabilities?.services || [], // ← CRITICAL FIX: Extract services from root level
      models: Object.keys(rawCapabilities?.models || {}), // Extract model keys
      customer_access: rawCapabilities?.customer_access?.isolation || 'none',
      max_concurrent_jobs: rawCapabilities?.performance?.concurrent_jobs || 1,
    };

    const event: WorkerConnectedEvent = {
      type: 'worker_connected',
      worker_id: workerId,
      machine_id: machineId,
      worker_data: {
        id: workerId,
        status: (workerData.status as string) || 'idle',
        capabilities,
        connected_at: (workerData.connected_at as string) || new Date().toISOString(),
        jobs_completed: (workerData.jobs_completed as number) || 0,
        jobs_failed: (workerData.jobs_failed as number) || 0,
      },
      timestamp: Date.now(),
    };
    this.broadcast(event);
  }

  broadcastWorkerDisconnected(workerId: string, machineId?: string): void {
    const event: WorkerDisconnectedEvent = {
      type: 'worker_disconnected',
      worker_id: workerId,
      machine_id: machineId || 'unknown-machine',
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

      case 'connector_status_changed':
        return ['workers'];

      case 'machine_startup':
      case 'machine_startup_step':
      case 'machine_startup_complete':
      case 'machine_shutdown':
        return ['machines', 'workers'];

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

  private sendToMonitor(connection: MonitorConnection, event: MonitorEvent): void {
    try {
      if (connection instanceof WebSocket) {
        // Send via WebSocket
        if (connection.readyState === WebSocket.OPEN) {
          connection.send(JSON.stringify(event));
        }
      } else {
        // Send via SSE (Response)
        if (!connection.destroyed) {
          const sseData = `data: ${JSON.stringify(event)}\n\n`;
          connection.write(sseData);
        }
      }
    } catch (error) {
      console.error('[EventBroadcaster] Error sending event:', error);
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
          const connection = this.monitors.get(monitorId);
          if (connection) {
            const ackEvent: HeartbeatAckEvent = {
              type: 'heartbeat_ack',
              monitor_id: monitorId,
              server_timestamp: now,
              timestamp: now,
            };
            this.sendToMonitor(connection, ackEvent);
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
    const connection = this.monitors.get(monitorId);
    return connection instanceof WebSocket ? connection : undefined;
  }

  getMonitorConnection(monitorId: string): MonitorConnection | undefined {
    return this.monitors.get(monitorId);
  }
}
