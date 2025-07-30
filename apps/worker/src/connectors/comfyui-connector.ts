// ComfyUI Local Connector - WebSocket connector for local ComfyUI instances
// Extends ComfyUIWebSocketConnector with local-specific configuration

import { logger } from '@emp/core';
import { ComfyUIWebSocketConnector } from './comfyui-websocket-connector.js';

export class ComfyUIConnector extends ComfyUIWebSocketConnector {
  // Keep service_type as 'comfyui' to maintain compatibility
  // The connector_id will distinguish this as 'comfyui' (local)

  constructor(connectorId: string = 'comfyui') {
    // Use local ComfyUI environment variables with sensible defaults
    const localHost = process.env.WORKER_COMFYUI_HOST || process.env.COMFYUI_HOST || 'localhost';
    const localPort = process.env.WORKER_COMFYUI_PORT || process.env.COMFYUI_PORT || '8188';
    const localUsername = process.env.WORKER_COMFYUI_USERNAME || process.env.COMFYUI_USERNAME;
    const localPassword = process.env.WORKER_COMFYUI_PASSWORD || process.env.COMFYUI_PASSWORD;
    const isSecure = (process.env.WORKER_COMFYUI_SECURE || process.env.COMFYUI_SECURE) === 'true';

    // Override environment variables for parent constructor
    const originalEnv = { ...process.env };
    process.env.WORKER_COMFYUI_HOST = localHost;
    process.env.WORKER_COMFYUI_PORT = localPort;
    process.env.WORKER_COMFYUI_USERNAME = localUsername;
    process.env.WORKER_COMFYUI_PASSWORD = localPassword;
    process.env.WORKER_COMFYUI_SECURE = isSecure ? 'true' : 'false';

    // Call parent constructor with local settings
    super(connectorId);

    // Restore original environment
    process.env = originalEnv;

    logger.info(
      `ComfyUI Local connector ${connectorId} initialized for ${localHost}:${localPort}`
    );
  }

  // Override service info to indicate this is a local connection
  async getServiceInfo() {
    const info = await super.getServiceInfo();
    return {
      ...info,
      service_name: 'ComfyUI Local WebSocket',
      capabilities: {
        ...info.capabilities,
        features: [...(info.capabilities?.features || []), 'local_installation'],
      },
    };
  }
}