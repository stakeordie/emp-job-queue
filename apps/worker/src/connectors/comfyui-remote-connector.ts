// ComfyUI Remote Connector - WebSocket connector for remote ComfyUI instances
// Extends ComfyUIWebSocketConnector with remote-specific configuration

import { logger } from '@emp/core';
import { ComfyUIWebSocketConnector } from './comfyui-websocket-connector.js';

export class ComfyUIRemoteConnector extends ComfyUIWebSocketConnector {
  // Keep service_type as 'comfyui' to maintain compatibility
  // The connector_id will distinguish this as 'comfyui-remote'

  constructor(connectorId: string = 'comfyui-remote') {
    // Read REMOTE-specific environment variables
    const remoteHost = process.env.COMFYUI_REMOTE_HOST;
    const remotePort = parseInt(process.env.COMFYUI_REMOTE_PORT || '8188');
    const remoteUsername = process.env.COMFYUI_REMOTE_USERNAME;
    const remotePassword = process.env.COMFYUI_REMOTE_PASSWORD;
    const remoteApiKey = process.env.COMFYUI_REMOTE_API_KEY;
    const isSecure = process.env.COMFYUI_REMOTE_SECURE === 'true';

    if (!remoteHost) {
      throw new Error(
        'ComfyUI Remote connector requires COMFYUI_REMOTE_HOST environment variable. ' +
        'Set it to the hostname/IP of your external ComfyUI instance.'
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
