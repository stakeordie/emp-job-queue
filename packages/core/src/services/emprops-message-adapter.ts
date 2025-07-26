/**
 * EmProps Message Adapter Service
 *
 * Converts internal Job Queue API messages to EmProps-compatible format.
 * Enables EmProps API to receive messages in the expected format while
 * maintaining backward compatibility for monitor clients.
 */

import {
  JobSubmittedEvent,
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  BaseMonitorEvent,
} from '../types/monitor-events.js';

export interface EmPropsConnectionMessage {
  type: 'connection_established';
  message: string;
  timestamp: number;
}

export interface EmPropsJobAcceptedMessage {
  type: 'job_accepted';
  job_id: string;
  status: string;
  position?: number;
  estimated_start?: string;
  timestamp: number;
}

export interface EmPropsProgressMessage {
  type: 'update_job_progress';
  job_id: string;
  progress: number;
  timestamp: number;
}

export interface EmPropsCompletionMessage {
  type: 'complete_job';
  job_id: string;
  worker_id?: string;
  result: {
    status: 'success' | 'failed';
    data?: unknown;
    error?: string;
  };
  timestamp: number;
}

export interface EmPropsErrorMessage {
  type: 'error';
  error: string;
  details?: Record<string, unknown>;
  timestamp: number;
}

export type EmPropsMessage =
  | EmPropsConnectionMessage
  | EmPropsJobAcceptedMessage
  | EmPropsProgressMessage
  | EmPropsCompletionMessage
  | EmPropsErrorMessage;

/**
 * Service to adapt internal Job Queue messages to EmProps API format
 */
export class EmPropsMessageAdapter {
  /**
   * Create connection established message for EmProps clients
   */
  adaptConnectionMessage(): EmPropsConnectionMessage {
    return {
      type: 'connection_established',
      message: 'Connected to server',
      timestamp: Date.now(),
    };
  }

  /**
   * Convert job_submitted event to job_accepted message for EmProps
   */
  adaptJobSubmittedToAccepted(jobSubmitted: JobSubmittedEvent): EmPropsJobAcceptedMessage {
    return {
      type: 'job_accepted',
      job_id: jobSubmitted.job_id,
      status: 'queued',
      timestamp: jobSubmitted.timestamp,
    };
  }

  /**
   * Convert internal progress event to EmProps update_job_progress format
   */
  adaptProgressUpdate(progress: JobProgressEvent): EmPropsProgressMessage {
    return {
      type: 'update_job_progress',
      job_id: progress.job_id,
      progress: progress.progress,
      timestamp: progress.timestamp,
    };
  }

  /**
   * Convert job completion event to EmProps complete_job format
   */
  adaptJobCompletion(completion: JobCompletedEvent): EmPropsCompletionMessage {
    return {
      type: 'complete_job',
      job_id: completion.job_id,
      worker_id: completion.worker_id,
      result: {
        status: 'success',
        data: completion.result,
      },
      timestamp: completion.timestamp,
    };
  }

  /**
   * Convert job failure event to EmProps complete_job format with failed status
   */
  adaptJobFailure(failure: JobFailedEvent): EmPropsCompletionMessage {
    return {
      type: 'complete_job',
      job_id: failure.job_id,
      worker_id: failure.worker_id,
      result: {
        status: 'failed',
        error: failure.error,
      },
      timestamp: failure.timestamp,
    };
  }

  /**
   * Create error message in EmProps format
   */
  createErrorMessage(error: string, details?: Record<string, unknown>): EmPropsErrorMessage {
    return {
      type: 'error',
      error,
      details,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if a message should be adapted for EmProps format
   */
  shouldAdaptMessage(messageType: string): boolean {
    const adaptableTypes = ['job_submitted', 'update_job_progress', 'complete_job', 'job_failed'];
    return adaptableTypes.includes(messageType);
  }

  /**
   * Generic adapter that routes messages to appropriate adaptation method
   */
  adaptMessage(event: BaseMonitorEvent): EmPropsMessage | null {
    switch (event.type) {
      case 'job_submitted':
        return this.adaptJobSubmittedToAccepted(event as JobSubmittedEvent);

      case 'update_job_progress':
        return this.adaptProgressUpdate(event as JobProgressEvent);

      case 'complete_job':
        return this.adaptJobCompletion(event as JobCompletedEvent);

      case 'job_failed':
        return this.adaptJobFailure(event as JobFailedEvent);

      default:
        // Message doesn't need adaptation
        return null;
    }
  }
}

/**
 * Singleton instance for use across the application
 */
export const empropsMessageAdapter = new EmPropsMessageAdapter();
