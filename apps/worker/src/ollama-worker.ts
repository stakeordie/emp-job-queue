#!/usr/bin/env tsx
// Ollama GPU Worker - Local LLM processing using Ollama
// Specialized worker for GPU-accelerated text generation, chat, and embeddings

import { RedisDirectWorkerClient } from './redis-direct-worker-client.js';
import { OllamaConnector } from './connectors/ollama-connector.js';
import { WorkerCapabilities, logger } from '@emp/core';

async function startOllamaWorker() {
  try {
    // Environment validation
    const requiredEnvVars = OllamaConnector.getRequiredEnvVars();
    const missingVars: string[] = [];

    Object.entries(requiredEnvVars).forEach(([envVar, template]) => {
      // Extract the actual env var name from template (e.g., ${OLLAMA_HOST:-localhost} -> OLLAMA_HOST)
      const match = template.match(/\$\{([^:}]+)/);
      const actualVarName = match ? match[1] : envVar;

      // Only check for truly required vars (those without defaults)
      if (!template.includes(':-') && !process.env[actualVarName]) {
        missingVars.push(actualVarName);
      }
    });

    if (missingVars.length > 0) {
      logger.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
      process.exit(1);
    }

    // Redis connection
    const hubRedisUrl = process.env.HUB_REDIS_URL;
    if (!hubRedisUrl) {
      logger.error('❌ HUB_REDIS_URL is required');
      process.exit(1);
    }

    // Worker ID
    const workerId = process.env.WORKER_ID || `ollama-worker-${Date.now()}`;
    const machineId = process.env.MACHINE_ID || 'unknown';

    logger.info(`🦙 Starting Ollama GPU Worker:`, {
      workerId,
      machineId,
      ollamaHost: process.env.OLLAMA_HOST || 'localhost',
      ollamaPort: process.env.OLLAMA_PORT || '11434',
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2'
    });

    // Create Ollama connector
    const ollamaConnector = new OllamaConnector(`ollama-${workerId}`);

    // Check Ollama health before starting
    const healthCheck = await ollamaConnector.checkHealth();
    if (!healthCheck) {
      logger.error('❌ Ollama service is not reachable. Please ensure Ollama is running.');
      logger.info('💡 To start Ollama: ollama serve');
      process.exit(1);
    }

    // Check if models are available
    const availableModels = await ollamaConnector.getAvailableModels();
    if (availableModels.length === 0) {
      logger.warn('⚠️  No models found in Ollama. You may need to pull a model first.');
      logger.info(`💡 To pull the default model: ollama pull ${process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2'}`);
    }

    logger.info('✅ Ollama health check passed');

    // Worker capabilities - GPU worker with text generation focus
    const capabilities: WorkerCapabilities = {
      worker_id: workerId,
      machine_id: machineId,
      services: ['ollama', 'text_generation', 'chat_completion', 'embeddings'],

      // Hardware specifications
      hardware: {
        gpu_memory_gb: parseInt(process.env.GPU_MEMORY_GB || '8'),
        gpu_model: process.env.GPU_MODEL || 'unknown',
        ram_gb: parseInt(process.env.RAM_GB || '16'),
        storage_gb: parseInt(process.env.STORAGE_GB || '100'),
        network_speed: process.env.NETWORK_SPEED || '1Gbps',
      },

      // Performance characteristics
      performance: {
        concurrent_jobs: parseInt(process.env.OLLAMA_MAX_CONCURRENT_JOBS || '2'),
        quality_levels: ['fast', 'balanced'], // Ollama supports speed vs quality tradeoffs
        max_processing_time_minutes: 10, // 10 minutes max per job
        average_job_time_seconds: 30, // 30 seconds average
      },

      // Models available (all to handle any Ollama model)
      models: 'all',

      // Components and workflows (all for flexibility)
      components: 'all',
      workflows: 'all',
    };

    // Create Redis worker client
    const workerClient = new RedisDirectWorkerClient(hubRedisUrl, workerId);

    // Note: OllamaConnector will be used directly by the job processing system

    // Connect and start processing
    await workerClient.connect(capabilities);

    logger.info('🚀 Ollama GPU Worker is ready and processing jobs');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('🛑 Shutting down Ollama worker...');
      await workerClient.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('🛑 Terminating Ollama worker...');
      await workerClient.disconnect();
      process.exit(0);
    });

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('❌ Uncaught exception in Ollama worker:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('❌ Unhandled rejection in Ollama worker:', reason);
      process.exit(1);
    });

  } catch (error) {
    logger.error('❌ Failed to start Ollama worker:', error);
    process.exit(1);
  }
}

// Start the worker if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startOllamaWorker();
}

export { startOllamaWorker };