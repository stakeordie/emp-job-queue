#!/usr/bin/env node

/**
 * Docker run with environment argument support
 * Usage: node docker-run-with-env.js SERVICE_NAME PORT [ENV_NAME]
 * 
 * Examples:
 *   node docker-run-with-env.js api 3001 local-dev
 *   node docker-run-with-env.js webhook-service 3332 production
 *   node docker-run-with-env.js fluentd 24224
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const [,, serviceName, port, envName = 'local-dev'] = process.argv;

if (!serviceName || !port) {
  console.error('Usage: node docker-run-with-env.js SERVICE_NAME PORT [ENV_NAME]');
  console.error('  SERVICE_NAME: api, webhook-service, fluentd');
  console.error('  PORT: service port number');
  console.error('  ENV_NAME: environment name (default: local-dev)');
  process.exit(1);
}

// Determine environment file
const envFile = `.env.${envName}`;

// Check if env file exists
if (!existsSync(envFile)) {
  console.error(`❌ Environment file ${envFile} not found`);
  console.error(`Available environments: local-dev, staging, production`);
  process.exit(1);
}

// Determine image name
const imageName = `emprops/${serviceName}:latest`;

// Determine container name
const containerName = serviceName;

console.log(`🐳 Running ${serviceName} with environment: ${envName}`);
console.log(`   Image: ${imageName}`);
console.log(`   Port: ${port}`);
console.log(`   Env File: ${envFile}`);

// Build docker run command
const dockerArgs = [
  'run',
  '--rm',
  '--name', containerName,
  '-p', `${port}:${port}`,
  '--env-file', envFile,
  imageName
];

console.log(`   Command: docker ${dockerArgs.join(' ')}`);

// Execute docker run
const dockerProcess = spawn('docker', dockerArgs, {
  stdio: 'inherit',
  cwd: process.cwd()
});

dockerProcess.on('error', (error) => {
  console.error(`❌ Failed to start docker: ${error.message}`);
  process.exit(1);
});

dockerProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`❌ Docker process exited with code ${code}`);
    process.exit(code);
  }
});