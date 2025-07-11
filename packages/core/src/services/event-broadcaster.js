/**
 * Event Broadcaster Service
 *
 * Manages real-time event broadcasting to connected monitors.
 * Replaces polling-based stats_broadcast with instant event updates.
 */
import WebSocket from 'ws';
export class EventBroadcaster {
    monitors = new Map();
    subscriptions = new Map();
    eventHistory = [];
    maxHistorySize = 1000;
    constructor() {
        // Start heartbeat monitoring
        this.startHeartbeatMonitoring();
    }
    /**
     * Register a new monitor connection
     */
    addMonitor(monitorId, ws) {
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
    removeMonitor(monitorId) {
        // Monitor disconnected
        this.monitors.delete(monitorId);
        this.subscriptions.delete(monitorId);
    }
    /**
     * Update monitor subscription
     */
    updateSubscription(monitorId, topics, filters) {
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
    updateHeartbeat(monitorId) {
        const subscription = this.subscriptions.get(monitorId);
        if (subscription) {
            subscription.last_heartbeat = Date.now();
        }
    }
    /**
     * Broadcast event to all subscribed monitors
     */
    broadcast(event) {
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
    async sendFullState(monitorId, stateData) {
        const ws = this.monitors.get(monitorId);
        if (!ws)
            return;
        const event = {
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
    getEventsSince(timestamp, maxEvents) {
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
    getOldestTimestamp() {
        if (this.eventHistory.length === 0) {
            return Date.now();
        }
        return this.eventHistory[0].timestamp;
    }
    /**
     * Handle resync request from monitor
     */
    handleResyncRequest(monitorId, sinceTimestamp, maxEvents) {
        const ws = this.monitors.get(monitorId);
        if (!ws)
            return;
        const { events, hasMore } = this.getEventsSince(sinceTimestamp, maxEvents);
        const oldestTimestamp = this.getOldestTimestamp();
        const resyncResponse = {
            type: 'resync_response',
            monitor_id: monitorId,
            events: events,
            has_more: hasMore,
            oldest_available_timestamp: oldestTimestamp,
            timestamp: Date.now(),
        };
        this.sendToMonitor(ws, resyncResponse);
        // Log resync activity
        // eslint-disable-next-line no-console
        console.log(`[EventBroadcaster] Sent ${events.length} events to monitor ${monitorId} since ${sinceTimestamp}`);
    }
    // Event Broadcasting Methods
    broadcastWorkerConnected(workerId, workerData) {
        const event = {
            type: 'worker_connected',
            worker_id: workerId,
            worker_data: {
                id: workerId,
                status: workerData.status || 'idle',
                capabilities: workerData.capabilities ||
                    {},
                connected_at: workerData.connected_at || new Date().toISOString(),
                jobs_completed: workerData.jobs_completed || 0,
                jobs_failed: workerData.jobs_failed || 0,
            },
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastWorkerDisconnected(workerId) {
        const event = {
            type: 'worker_disconnected',
            worker_id: workerId,
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastWorkerStatusChanged(workerId, oldStatus, newStatus, currentJobId) {
        const event = {
            type: 'worker_status_changed',
            worker_id: workerId,
            old_status: oldStatus,
            new_status: newStatus,
            current_job_id: currentJobId,
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastJobSubmitted(jobId, jobData) {
        const event = {
            type: 'job_submitted',
            job_id: jobId,
            job_data: {
                id: jobId,
                job_type: jobData.job_type,
                status: 'pending',
                priority: jobData.priority,
                workflow_id: jobData.workflow_id,
                workflow_priority: jobData.workflow_priority,
                workflow_datetime: jobData.workflow_datetime,
                step_number: jobData.step_number,
                customer_id: jobData.customer_id,
                requirements: jobData.requirements,
                created_at: jobData.created_at || Date.now(),
            },
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastJobAssigned(jobId, workerId, assignedAt) {
        const event = {
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
    broadcastJobStatusChanged(jobId, oldStatus, newStatus, workerId) {
        const event = {
            type: 'job_status_changed',
            job_id: jobId,
            old_status: oldStatus,
            new_status: newStatus,
            worker_id: workerId,
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastJobProgress(jobId, workerId, progress) {
        const event = {
            type: 'update_job_progress',
            job_id: jobId,
            worker_id: workerId,
            progress: progress,
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastJobCompleted(jobId, workerId, result, completedAt) {
        const event = {
            type: 'complete_job',
            job_id: jobId,
            worker_id: workerId,
            result: result,
            completed_at: completedAt || Date.now(),
            timestamp: Date.now(),
        };
        this.broadcast(event);
    }
    broadcastJobFailed(jobId, error, workerId, failedAt) {
        const event = {
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
    shouldReceiveEvent(monitorId, event) {
        const subscription = this.subscriptions.get(monitorId);
        if (!subscription)
            return false;
        // Check topic subscription
        const eventTopics = this.getEventTopics(event);
        const hasMatchingTopic = eventTopics.some(topic => subscription.topics.includes(topic));
        if (!hasMatchingTopic)
            return false;
        // Check filters if present
        if (subscription.filters) {
            return this.passesFilters(event, subscription.filters);
        }
        return true;
    }
    getEventTopics(event) {
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
    passesFilters(event, filters) {
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
    sendToMonitor(ws, event) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(event));
            }
            catch (error) {
                console.error('[EventBroadcaster] Error sending event:', error);
            }
        }
    }
    addToHistory(event) {
        this.eventHistory.push(event);
        // Trim history if too large
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }
    startHeartbeatMonitoring() {
        setInterval(() => {
            const now = Date.now();
            const staleThreshold = 60000; // 1 minute
            for (const [monitorId, subscription] of this.subscriptions) {
                const timeSinceHeartbeat = now - subscription.last_heartbeat;
                if (timeSinceHeartbeat > staleThreshold) {
                    // Monitor heartbeat stale, removing
                    this.removeMonitor(monitorId);
                }
                else {
                    // Send heartbeat ack
                    const ws = this.monitors.get(monitorId);
                    if (ws) {
                        const ackEvent = {
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
    getConnectedMonitors() {
        return Array.from(this.monitors.keys());
    }
    getMonitorCount() {
        return this.monitors.size;
    }
    getMonitorWebSocket(monitorId) {
        return this.monitors.get(monitorId);
    }
}
//# sourceMappingURL=event-broadcaster.js.map