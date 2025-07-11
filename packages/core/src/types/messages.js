/**
 * TypeScript definitions for Emp-Redis message types
 *
 * CRITICAL: This file must maintain 100% compatibility with the Python message system.
 * Any changes here must be coordinated with the Python core/core_types/base_messages.py
 *
 * Direct port from /core/client-types/messages.ts to ensure message compatibility
 */
/**
 * All possible message types in the system - MUST MATCH PYTHON EXACTLY
 */
export var MessageType;
(function (MessageType) {
    // Setup Messages
    MessageType["REGISTER_WORKER"] = "register_worker";
    MessageType["WORKER_REGISTERED"] = "worker_registered";
    MessageType["WORKER_HEARTBEAT"] = "worker_heartbeat";
    MessageType["WORKER_HEARTBEAT_ACK"] = "worker_heartbeat_ack";
    MessageType["WORKER_STATUS"] = "worker_status";
    MessageType["CONNECTION_ESTABLISHED"] = "connection_established";
    // Job Workflow Messages
    MessageType["SUBMIT_JOB"] = "submit_job";
    MessageType["JOB_ACCEPTED"] = "job_accepted";
    MessageType["JOB_AVAILABLE"] = "job_available";
    MessageType["CLAIM_JOB"] = "claim_job";
    MessageType["JOB_ASSIGNED"] = "job_assigned";
    MessageType["UPDATE_JOB_PROGRESS"] = "update_job_progress";
    MessageType["COMPLETE_JOB"] = "complete_job";
    MessageType["FAIL_JOB"] = "fail_job";
    MessageType["CANCEL_JOB"] = "cancel_job";
    MessageType["FORCE_RETRY_JOB"] = "force_retry_job";
    MessageType["JOB_COMPLETED_ACK"] = "complete_job_ack";
    MessageType["JOB_FAILED_ACK"] = "job_failed_ack";
    // Status Messages
    MessageType["REQUEST_JOB_STATUS"] = "request_job_status";
    MessageType["RESPONSE_JOB_STATUS"] = "response_job_status";
    MessageType["REQUEST_STATS"] = "request_stats";
    MessageType["RESPONSE_STATS"] = "response_stats";
    MessageType["SUBSCRIBE_STATS"] = "subscribe_stats";
    MessageType["SUBSCRIPTION_CONFIRMED"] = "subscription_confirmed";
    MessageType["STATS_BROADCAST"] = "stats_broadcast";
    // Job Specific Messages
    MessageType["SUBSCRIBE_JOB"] = "subscribe_job";
    MessageType["JOB_NOTIFICATIONS_SUBSCRIBED"] = "job_notifications_subscribed";
    MessageType["SUBSCRIBE_JOB_NOTIFICATIONS"] = "subscribe_job_notifications";
    // Service Messages
    MessageType["SERVICE_REQUEST"] = "service_request";
    MessageType["CONNECTOR_WS_STATUS"] = "connector_ws_status";
    // System Messages
    MessageType["ACK"] = "ack";
    MessageType["UNKNOWN"] = "unknown";
    MessageType["ERROR"] = "error";
    // Legacy compatibility - these are used in some places
    MessageType["JOB_UPDATE"] = "job_update";
    // JOB_PROGRESS = 'job_progress', // REMOVED - use UPDATE_JOB_PROGRESS instead
    // JOB_COMPLETED = 'complete_job', // REMOVED - use COMPLETE_JOB instead
    // Additional message types
    MessageType["SYSTEM_STATUS"] = "system_status";
    MessageType["SYNC_JOB_STATE"] = "sync_job_state";
})(MessageType || (MessageType = {}));
/**
 * Type guard to check if a message is of a specific type
 */
export function isMessageType(message, type) {
    return message.type === type;
}
// ============================================================================
// SUPPORTING TYPES FOR COMPATIBILITY
// ============================================================================
/**
 * Worker status enumeration
 */
export var WorkerStatus;
(function (WorkerStatus) {
    WorkerStatus["IDLE"] = "idle";
    WorkerStatus["BUSY"] = "busy";
    WorkerStatus["OFFLINE"] = "offline";
    WorkerStatus["ERROR"] = "error";
})(WorkerStatus || (WorkerStatus = {}));
//# sourceMappingURL=messages.js.map