// Auto-export all connectors
// This file automatically exports all *-connector.ts files in this directory
// No need to manually add exports when creating new connectors

export * from './a1111-websocket-connector.js';
export * from './comfyui-remote-connector.js';
export * from './comfyui-websocket-connector.js';
export * from './openai-base-connector.js';
export * from './openai-text2img-connector.js';
export * from './openai-img2img-connector.js';
export * from './openai-text-connector.js';
export * from './rest-async-connector.js';
export * from './rest-sync-connector.js';
export * from './simulation-http-connector.js';
export * from './simulation-websocket-connector.js';

// Protocol layer exports
export * from './protocol/http-connector.js';
export * from './protocol/websocket-connector.js';

// Base Connector
export * from './base-connector.js';

// Note: If you add a new connector, add its export here
// TODO: Consider using a build script to auto-generate this file from all *-connector.ts files
