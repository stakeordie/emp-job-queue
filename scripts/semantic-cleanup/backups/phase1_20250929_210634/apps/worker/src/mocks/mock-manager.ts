/**
 * Mock Manager - Controls mock activation based on environment
 *
 * PRODUCTION SAFETY:
 * - Only activates when NODE_ENV=staging or MOCK_MODE=true
 * - Nock is a dev dependency - not installed in production
 * - Zero impact on production performance or behavior
 */

import { OllamaMock } from './ollama-mock.js';
import { OpenAIMock } from './openai-mock.js';

export class MockManager {
  private static instance: MockManager;
  private mocks: { [key: string]: any } = {};
  private isActive: boolean = false;

  private constructor() {
    this.isActive = this.shouldActivateMocks();

    if (this.isActive) {
      console.log('🎭 Mock Manager: Staging mode detected - activating HTTP mocks');
      this.initializeMocks();
    } else {
      console.log('🏭 Mock Manager: Production mode - mocks disabled');
    }
  }

  public static getInstance(): MockManager {
    if (!MockManager.instance) {
      MockManager.instance = new MockManager();
    }
    return MockManager.instance;
  }

  private shouldActivateMocks(): boolean {
    const nodeEnv = process.env.NODE_ENV?.toLowerCase();
    const mockMode = process.env.MOCK_MODE?.toLowerCase() === 'true';

    return nodeEnv === 'staging' ||
           nodeEnv === 'test' ||
           mockMode;
  }

  private async initializeMocks() {
    try {
      // Only import nock in staging/test environments
      const nock = await import('nock');

      // Initialize service mocks
      if (process.env.MOCK_OLLAMA !== 'false') {
        const ollamaUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
        this.mocks.ollama = new OllamaMock(ollamaUrl);
        console.log(`🦙 Ollama mock activated for ${ollamaUrl}`);
      }

      if (process.env.MOCK_OPENAI !== 'false') {
        const openaiUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
        this.mocks.openai = new OpenAIMock(openaiUrl);
        console.log(`🤖 OpenAI mock activated for ${openaiUrl}`);
      }

      // ComfyUI mock (TODO: implement when needed)
      if (process.env.MOCK_COMFYUI === 'true') {
        // this.mocks.comfyui = new ComfyUIMock();
        console.log('🎨 ComfyUI mock (TODO: not implemented yet)');
      }

      console.log(`✅ Mock Manager: ${Object.keys(this.mocks).length} service mocks active`);

    } catch (error) {
      console.warn('⚠️  Mock Manager: Could not initialize mocks (normal in production):', error.message);
      this.isActive = false;
    }
  }

  public isMockActive(serviceName: string): boolean {
    return this.isActive && this.mocks[serviceName] !== undefined;
  }

  public getMock(serviceName: string) {
    return this.mocks[serviceName];
  }

  public simulateError(serviceName: string, errorType: string) {
    if (!this.isActive || !this.mocks[serviceName]) {
      console.warn(`Cannot simulate error - ${serviceName} mock not active`);
      return;
    }

    const mock = this.mocks[serviceName];

    // Service-specific error simulation
    switch (serviceName) {
      case 'ollama':
        if (errorType === 'model_not_found') mock.simulateModelNotFound();
        if (errorType === 'out_of_memory') mock.simulateOutOfMemory();
        break;

      case 'openai':
        if (errorType === 'rate_limit') mock.simulateRateLimitError();
        if (errorType === 'insufficient_credits') mock.simulateInsufficientCredits();
        if (errorType === 'content_policy') mock.simulateContentPolicy();
        break;
    }

    console.log(`🚨 Simulated ${errorType} error for ${serviceName}`);
  }

  public cleanup() {
    if (this.isActive) {
      Object.values(this.mocks).forEach((mock: any) => {
        if (mock.cleanup) mock.cleanup();
      });
      console.log('🧹 Mock Manager: Cleaned up all mocks');
    }
  }

  public getStats() {
    if (!this.isActive) return { active: false };

    const stats = {
      active: true,
      mocks: Object.keys(this.mocks),
      serviceStats: {}
    };

    Object.entries(this.mocks).forEach(([name, mock]: [string, any]) => {
      if (mock.getStats) {
        stats.serviceStats[name] = mock.getStats();
      }
    });

    return stats;
  }
}

// Auto-initialize when imported (but only in staging)
export const mockManager = MockManager.getInstance();

// Export convenience functions
export function isMockMode(): boolean {
  return mockManager.isMockActive('ollama') || mockManager.isMockActive('openai');
}

export function simulateError(service: string, errorType: string) {
  return mockManager.simulateError(service, errorType);
}

export async function simulateProductionError(service: string, errorCaseId: string) {
  if (!mockManager.isMockActive(service)) {
    console.warn(`Cannot replay error - ${service} mock not active`);
    return;
  }

  const mock = mockManager.getMock(service);
  if (mock && mock.replayProductionError) {
    await mock.replayProductionError(errorCaseId);
  } else {
    console.error(`Service ${service} does not support error replay`);
  }
}

export async function recordProductionError(errorData: {
  service: string;
  jobId: string;
  error: string;
  httpCode?: number;
  endpoint?: string;
  requestBody?: any;
  responseBody?: any;
}) {
  try {
    const { errorRecorder } = await import('./error-case-recorder.js');
    const errorCase = await errorRecorder.quickRecordFromLogs(errorData);
    console.log(`📝 Production error recorded: ${errorCase.id}`);
    console.log(`To replay: simulateProductionError('${errorData.service}', '${errorCase.id}')`);
    return errorCase;
  } catch (error) {
    console.error('Failed to record production error:', error);
  }
}