/**
 * StreamRESTConnector - Base class for streaming REST API connectors
 * 
 * This connector follows the streaming pattern:
 * 1. Submit request to REST endpoint
 * 2. Receive streaming response chunks
 * 3. Aggregate/process stream data
 * 4. Return final result
 * 
 * Handles server-sent events (SSE), chunked responses, or websocket-like patterns.
 * Use this for APIs that stream data over time.
 * 
 * Examples: OpenAI streaming completions, real-time data feeds, progressive results
 * 
 * TODO: Implement when needed - currently placeholder
 */

import { BaseConnector } from '../base-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo } from '@emp/core';

export interface StreamRESTConnectorConfig {
  connector_id: string;
  service_type: string;
  base_url: string;
  // TODO: Add streaming-specific configuration
}

export abstract class StreamRESTConnector extends BaseConnector {
  constructor(connectorId: string, config: StreamRESTConnectorConfig) {
    super(connectorId, {
      connector_id: config.connector_id,
      service_type: config.service_type,
      base_url: config.base_url,
    } as any);
  }

  async initializeService(): Promise<void> {
    throw new Error('StreamRESTConnector not implemented yet - placeholder only');
  }

  async checkHealth(): Promise<boolean> {
    throw new Error('StreamRESTConnector not implemented yet - placeholder only');
  }

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    throw new Error('StreamRESTConnector not implemented yet - placeholder only');
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    throw new Error('StreamRESTConnector not implemented yet - placeholder only');
  }

  getConfiguration(): any {
    throw new Error('StreamRESTConnector not implemented yet - placeholder only');
  }
}