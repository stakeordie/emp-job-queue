// ComfyUI Remote Connector - WebSocket connector for remote ComfyUI instances
// Extends ComfyUIWebSocketConnector with remote-specific configuration

import { logger } from '@emp/core';
import { ComfyUIWebSocketConnector } from './comfyui-websocket-connector.js';

export class ComfyUIRemoteConnector extends ComfyUIWebSocketConnector {
  // Keep service_type as 'comfyui' to maintain compatibility
  // The connector_id will distinguish this as 'comfyui-remote'

  constructor(connectorId: string = 'comfyui-remote') {
    // Read REMOTE-specific environment variables
    // These are mapped by machine.interface.ts from COMFYUI_REMOTE_* to WORKER_COMFYUI_REMOTE_*
    const remoteHost = process.env.WORKER_COMFYUI_REMOTE_HOST;
    const remotePort = parseInt(process.env.WORKER_COMFYUI_REMOTE_PORT || '8188');
    const remoteUsername = process.env.WORKER_COMFYUI_REMOTE_USERNAME;
    const remotePassword = process.env.WORKER_COMFYUI_REMOTE_PASSWORD;
    const remoteApiKey = process.env.WORKER_COMFYUI_REMOTE_API_KEY;
    const isSecure = process.env.WORKER_COMFYUI_REMOTE_SECURE === 'true';
    const timeoutSeconds = parseInt(process.env.WORKER_COMFYUI_REMOTE_TIMEOUT_SECONDS || '15');

    if (!remoteHost) {
      throw new Error(
        'ComfyUI Remote connector requires WORKER_COMFYUI_REMOTE_HOST environment variable. ' +
        'This should be set to the hostname/IP of your external ComfyUI instance. ' +
        'Check that COMFYUI_REMOTE_HOST is set in your environment.'
      );
    }

    // Call parent constructor with remote configuration
    super(connectorId, {
      host: remoteHost,
      port: remotePort,
      secure: isSecure,
      username: remoteUsername,
      password: remotePassword,
      apiKey: remoteApiKey,
    });

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
