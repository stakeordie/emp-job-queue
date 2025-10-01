/**
 * Phase 2 Test Setup - Real Workers with Mocked Services
 *
 * This script sets up the complete Phase 2 testing environment:
 * - OTLP Collector (telcollect)
 * - API service
 * - Webhook service (optional)
 * - Mock worker machines with real connectors
 *
 * The workers will use real connector classes (OllamaConnector, OpenAIConnector)
 * but HTTP calls to external services are intercepted by MockManager.
 *
 * Usage:
 *   import { setupPhase2Environment, teardownPhase2Environment } from './setup-phase2';
 *
 *   beforeAll(async () => {
 *     await setupPhase2Environment();
 *   });
 *
 *   afterAll(async () => {
 *     await teardownPhase2Environment();
 *   });
 */

import {
  ensureServicesRunning,
  cleanupStartedServices,
} from '../../../webhook-service/src/__tests__/test-service-setup.js';

export interface Phase2Config {
  profile?: string;
  workers?: {
    ollama?: number;
    openai?: number;
    comfyui?: number;
  };
  services?: string[];
}

const DEFAULT_CONFIG: Phase2Config = {
  profile: 'testrunner',
  workers: {
    ollama: 2,
    openai: 2,
  },
  services: ['telcollect', 'api', 'monitor'],
};

export async function setupPhase2Environment(config: Phase2Config = {}): Promise<void> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const profile = finalConfig.profile || 'testrunner';

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🎭 Phase 2: Real Workers with Mocked Services');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Profile: ${profile}`);
  console.log(`Workers: ${JSON.stringify(finalConfig.workers, null, 2)}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Build service specification list
  const serviceSpecs: string[] = [...(finalConfig.services || [])];

  // Add worker machines
  if (finalConfig.workers?.ollama) {
    serviceSpecs.push(`machine:ollama:${finalConfig.workers.ollama}`);
  }
  if (finalConfig.workers?.openai) {
    serviceSpecs.push(`machine:openai:${finalConfig.workers.openai}`);
  }
  if (finalConfig.workers?.comfyui) {
    serviceSpecs.push(`machine:comfyui:${finalConfig.workers.comfyui}`);
  }

  // Start all services
  await ensureServicesRunning(serviceSpecs, profile);

  console.log('\n✅ Phase 2 environment ready');
  console.log('   - Real worker connectors loaded');
  console.log('   - HTTP mocking active (NODE_ENV=test or MOCK_MODE=true)');
  console.log('   - External service calls intercepted by MockManager');

  if (finalConfig.services?.includes('monitor')) {
    console.log('\n📊 Monitor UI: http://localhost:3333');
    console.log('   Open in browser to watch real-time job processing!');
  }
  console.log('');
}

export async function teardownPhase2Environment(): Promise<void> {
  console.log('\n🛑 Tearing down Phase 2 environment...');
  cleanupStartedServices();
  console.log('✅ Phase 2 environment cleaned up\n');
}

// Convenience function for Docker-based Phase 2 testing
export async function setupPhase2Docker(
  workers: { ollama?: number; openai?: number; comfyui?: number } = { ollama: 2, openai: 2 }
): Promise<void> {
  return setupPhase2Environment({
    profile: 'testrunner-docker',
    workers,
    services: ['telcollect', 'api', 'webhook'],
  });
}
