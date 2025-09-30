/**
 * Base Progressive Mock - Simulates realistic AI service job progression
 *
 * Pattern: Submit -> Get ID -> Poll Progress (0->25->50->75->100) -> Success
 * This matches real AI services like RunPod, Replicate, OpenAI DALL-E, etc.
 */

import nock from 'nock';

export interface ProgressiveMockConfig {
  baseUrl: string;
  submitEndpoint: string;
  statusEndpoint: string; // Should include :id parameter, e.g., '/api/jobs/:id'
  progressSteps: number[]; // e.g., [0, 25, 50, 75, 100]
  stepDelayMs: number;
  finalResponse: any;
  serviceName: string;
}

export interface MockJobState {
  id: string;
  currentStep: number;
  startTime: number;
  requestCount: number;
}

export class BaseProgressiveMock {
  private config: ProgressiveMockConfig;
  private activeJobs: Map<string, MockJobState> = new Map();
  private scope: nock.Scope;

  constructor(config: ProgressiveMockConfig) {
    this.config = config;
    this.setupMocks();
  }

  private setupMocks() {
    // Clear any existing mocks for this URL
    nock.cleanAll();

    this.scope = nock(this.config.baseUrl);

    // Mock job submission endpoint
    this.scope
      .post(this.config.submitEndpoint)
      .reply((uri, requestBody) => {
        const jobId = this.generateJobId();
        const jobState: MockJobState = {
          id: jobId,
          currentStep: 0,
          startTime: Date.now(),
          requestCount: 0
        };

        this.activeJobs.set(jobId, jobState);

        console.log(`🎬 [${this.config.serviceName}] Mock job submitted: ${jobId}`);

        return [200, {
          id: jobId,
          status: 'submitted',
          message: `${this.config.serviceName} job submitted successfully`
        }];
      });

    // Mock status polling endpoint - handles :id parameter
    const statusPath = this.config.statusEndpoint.replace(':id', '([^/]+)');

    this.scope
      .get(new RegExp(statusPath))
      .reply((uri) => {
        // Extract job ID from URL
        const jobId = this.extractJobIdFromUrl(uri);
        const jobState = this.activeJobs.get(jobId);

        if (!jobState) {
          return [404, { error: 'Job not found' }];
        }

        jobState.requestCount++;
        const progress = this.calculateProgress(jobState);

        console.log(`📊 [${this.config.serviceName}] Job ${jobId} progress: ${progress}% (poll #${jobState.requestCount})`);

        if (progress >= 100) {
          // Job complete
          this.activeJobs.delete(jobId);
          return [200, {
            id: jobId,
            status: 'completed',
            progress: 100,
            result: this.config.finalResponse,
            processing_time: Date.now() - jobState.startTime
          }];
        } else {
          // Job in progress
          return [200, {
            id: jobId,
            status: 'processing',
            progress: progress,
            eta: this.estimateRemainingTime(jobState),
            step: this.getCurrentStepName(progress)
          }];
        }
      });
  }

  private generateJobId(): string {
    return `mock-${this.config.serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractJobIdFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2];
  }

  private calculateProgress(jobState: MockJobState): number {
    const elapsedTime = Date.now() - jobState.startTime;
    const expectedStepTime = this.config.stepDelayMs;
    const expectedStep = Math.floor(elapsedTime / expectedStepTime);

    // Progress through configured steps
    const stepIndex = Math.min(expectedStep, this.config.progressSteps.length - 1);
    return this.config.progressSteps[stepIndex];
  }

  private estimateRemainingTime(jobState: MockJobState): number {
    const elapsedTime = Date.now() - jobState.startTime;
    const progress = this.calculateProgress(jobState);

    if (progress === 0) return this.config.stepDelayMs * this.config.progressSteps.length;

    const totalEstimatedTime = (elapsedTime / progress) * 100;
    return Math.max(0, totalEstimatedTime - elapsedTime);
  }

  private getCurrentStepName(progress: number): string {
    if (progress === 0) return 'initializing';
    if (progress < 50) return 'processing';
    if (progress < 100) return 'finalizing';
    return 'completed';
  }

  // Allow adding custom endpoints for specific connector needs
  public addCustomEndpoint(method: 'get' | 'post' | 'put' | 'delete',
                          path: string,
                          response: any) {
    this.scope[method](path).reply(200, response);
  }

  // Simulate errors for testing error handling
  public simulateError(endpoint: string, errorCode: number = 500, errorResponse?: any) {
    this.scope
      .post(endpoint)
      .reply(errorCode, errorResponse || { error: 'Simulated error for testing' });
  }

  // Simulate network timeouts
  public simulateTimeout(endpoint: string) {
    this.scope
      .post(endpoint)
      .delay(30000) // 30 second delay to trigger timeout
      .reply(200, { delayed: true });
  }

  public cleanup() {
    nock.cleanAll();
    this.activeJobs.clear();
  }

  // Get stats for testing
  // Load and replay a specific production error case
  public async replayProductionError(errorCaseId: string) {
    try {
      const { errorRecorder } = await import('./error-case-recorder.js');
      const cases = await errorRecorder.loadErrorCases();
      const errorCase = cases.find(c => c.id === errorCaseId);

      if (!errorCase) {
        console.error(`Error case ${errorCaseId} not found`);
        return;
      }

      console.log(`🎬 Replaying production error case: ${errorCase.id}`);
      console.log(`   Service: ${errorCase.service}`);
      console.log(`   Error: ${errorCase.errorMessage}`);
      console.log(`   Job ID: ${errorCase.jobId}`);

      // Setup the exact error response from production
      this.scope
        .post(errorCase.endpoint)
        .reply(errorCase.responseCode, errorCase.responseBody);

      // Also handle any polling endpoints if it's a progressive job
      if (errorCase.endpoint !== this.config.statusEndpoint.replace(':id', '([^/]+)')) {
        this.scope
          .get(new RegExp(this.config.statusEndpoint.replace(':id', '([^/]+)')))
          .reply(errorCase.responseCode, errorCase.responseBody);
      }

      console.log(`✅ Production error case ${errorCaseId} loaded - next ${errorCase.service} job will trigger this error`);

    } catch (error) {
      console.error('Failed to replay production error:', error);
    }
  }

  // Convenient method to record errors that happen during mock testing
  public async recordNewErrorCase(jobId: string, endpoint: string, errorResponse: any, notes?: string) {
    try {
      const { errorRecorder } = await import('./error-case-recorder.js');

      await errorRecorder.recordProductionError({
        service: this.config.serviceName.toLowerCase() as any,
        endpoint,
        method: 'POST',
        jobId,
        responseCode: errorResponse.status || 500,
        responseBody: errorResponse.data || errorResponse,
        errorMessage: errorResponse.message || 'Unknown error',
        environment: 'staging',
        reproducible: true,
        notes: notes || 'Recorded during staging testing'
      });

      console.log(`📝 Recorded new error case for future replay`);
    } catch (error) {
      console.warn('Could not record error case:', error);
    }
  }

  public getStats() {
    return {
      activeJobs: this.activeJobs.size,
      totalJobsProcessed: this.activeJobs.size,
      serviceName: this.config.serviceName
    };
  }
}