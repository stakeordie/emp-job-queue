// ComfyUI Remote Connector - WebSocket connector for remote ComfyUI instances
// Extends ComfyUIWebSocketConnector with remote-specific configuration

import { logger } from '@emp/core';
import { ComfyUIWebSocketConnector } from './comfyui-websocket-connector.js';

export class ComfyUIRemoteConnector extends ComfyUIWebSocketConnector {
  // Keep service_type as 'comfyui' to maintain compatibility
  // The connector_id will distinguish this as 'comfyui-remote'

  constructor(connectorId: string = 'comfyui-remote') {
    // Use remote-specific environment variables
    const remoteHost = process.env.WORKER_COMFYUI_REMOTE_HOST || process.env.REMOTE_COMFYUI_HOST;
    const remotePort =
      process.env.WORKER_COMFYUI_REMOTE_PORT || process.env.REMOTE_COMFYUI_PORT || '8188';
    const remoteUsername =
      process.env.WORKER_COMFYUI_REMOTE_USERNAME || process.env.REMOTE_COMFYUI_USERNAME;
    const remotePassword =
      process.env.WORKER_COMFYUI_REMOTE_PASSWORD || process.env.REMOTE_COMFYUI_PASSWORD;
    const isSecure = process.env.WORKER_COMFYUI_REMOTE_SECURE === 'true';

    if (!remoteHost) {
      throw new Error(
        'ComfyUI Remote connector requires WORKER_COMFYUI_REMOTE_HOST or REMOTE_COMFYUI_HOST'
      );
    }

    // Override environment variables for parent constructor
    const originalEnv = { ...process.env };
    process.env.WORKER_COMFYUI_HOST = remoteHost;
    process.env.WORKER_COMFYUI_PORT = remotePort;
    process.env.WORKER_COMFYUI_USERNAME = remoteUsername;
    process.env.WORKER_COMFYUI_PASSWORD = remotePassword;
    process.env.WORKER_COMFYUI_SECURE = isSecure ? 'true' : 'false';

    // Call parent constructor with remote settings
    super(connectorId);

    // Restore original environment
    process.env = originalEnv;

    logger.info(
      `ComfyUI Remote connector ${connectorId} initialized for ${remoteHost}:${remotePort}`
    );
  }

  // Override service info to indicate this is a remote connection
  async getServiceInfo() {
    const info = await super.getServiceInfo();
    return {
      ...info,
      service_name: 'ComfyUI Remote WebSocket',
      capabilities: {
        ...info.capabilities,
        features: [...(info.capabilities?.features || []), 'remote_connection'],
      },
    };
  }
}
