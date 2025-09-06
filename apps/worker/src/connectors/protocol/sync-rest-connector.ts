/**
 * SyncRESTConnector - Base class for synchronous REST API connectors
 * 
 * This connector follows the synchronous pattern:
 * 1. Submit request to REST endpoint
 * 2. Receive complete response immediately
 * 3. Parse and return result
 * 
 * No polling, no job IDs - just direct request/response.
 * Use this for APIs that return complete results immediately.
 * 
 * Examples: Simple REST APIs, immediate calculations, direct data queries
 * 
 * TODO: Implement when needed - currently placeholder
 */

import { BaseConnector } from '../base-connector.js';
import { JobData, JobResult, ProgressCallback, ServiceInfo } from '@emp/core';

export interface SyncRESTConnectorConfig {
  connector_id: string;
  service_type: string;
  base_url: string;
  // TODO: Add sync-specific configuration
}

export abstract class SyncRESTConnector extends BaseConnector {
  constructor(connectorId: string, config: SyncRESTConnectorConfig) {
    super(connectorId, {
      connector_id: config.connector_id,
      service_type: config.service_type,
      base_url: config.base_url,
    } as any);
  }

  async initializeService(): Promise<void> {
    throw new Error('SyncRESTConnector not implemented yet - placeholder only');
  }

  async checkHealth(): Promise<boolean> {
    throw new Error('SyncRESTConnector not implemented yet - placeholder only');
  }

  async processJob(jobData: JobData, progressCallback?: ProgressCallback): Promise<JobResult> {
    throw new Error('SyncRESTConnector not implemented yet - placeholder only');
  }

  async getServiceInfo(): Promise<ServiceInfo> {
    throw new Error('SyncRESTConnector not implemented yet - placeholder only');
  }

  getConfiguration(): any {
    throw new Error('SyncRESTConnector not implemented yet - placeholder only');
  }
}