/**
 * Event Broadcaster Service
 *
 * Manages real-time event broadcasting to connected monitors.
 * Replaces polling-based stats_broadcast with instant event updates.
 */
import WebSocket from 'ws';
import { MonitorEvent, SubscriptionTopic, SubscriptionFilters, FullStateSnapshotEvent } from '../types/monitor-events.js';
export declare class EventBroadcaster {
    private monitors;
    private subscriptions;
    private eventHistory;
    private maxHistorySize;
    constructor();
    /**
     * Register a new monitor connection
     */
    addMonitor(monitorId: string, ws: WebSocket): void;
    /**
     * Remove monitor connection
     */
    removeMonitor(monitorId: string): void;
    /**
     * Update monitor subscription
     */
    updateSubscription(monitorId: string, topics: SubscriptionTopic[], filters?: SubscriptionFilters): void;
    /**
     * Update monitor heartbeat
     */
    updateHeartbeat(monitorId: string): void;
    /**
     * Broadcast event to all subscribed monitors
     */
    broadcast(event: MonitorEvent): void;
    /**
     * Send full state snapshot to specific monitor
     */
    sendFullState(monitorId: string, stateData: FullStateSnapshotEvent['data']): Promise<void>;
    /**
     * Get events since timestamp (for resync)
     */
    getEventsSince(timestamp: number, maxEvents?: number): {
        events: MonitorEvent[];
        hasMore: boolean;
    };
    /**
     * Get oldest available timestamp in history
     */
    getOldestTimestamp(): number;
    /**
     * Handle resync request from monitor
     */
    handleResyncRequest(monitorId: string, sinceTimestamp: number, maxEvents?: number): void;
    broadcastWorkerConnected(workerId: string, workerData: Record<string, unknown>): void;
    broadcastWorkerDisconnected(workerId: string): void;
    broadcastWorkerStatusChanged(workerId: string, oldStatus: string, newStatus: string, currentJobId?: string): void;
    broadcastJobSubmitted(jobId: string, jobData: Record<string, unknown>): void;
    broadcastJobAssigned(jobId: string, workerId: string, assignedAt: number): void;
    broadcastJobStatusChanged(jobId: string, oldStatus: string, newStatus: string, workerId?: string): void;
    broadcastJobProgress(jobId: string, workerId: string, progress: number): void;
    broadcastJobCompleted(jobId: string, workerId: string, result?: unknown, completedAt?: number): void;
    broadcastJobFailed(jobId: string, error: string, workerId?: string, failedAt?: number): void;
    private shouldReceiveEvent;
    private getEventTopics;
    private passesFilters;
    private sendToMonitor;
    private addToHistory;
    private startHeartbeatMonitoring;
    getConnectedMonitors(): string[];
    getMonitorCount(): number;
    getMonitorWebSocket(monitorId: string): WebSocket | undefined;
}
//# sourceMappingURL=event-broadcaster.d.ts.map