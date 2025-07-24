/**
 * RunPod API Connector Service
 * Handles RunPod Serverless API requests
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('runpod-connector');

class RunPodConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.RUNPOD_API_KEY;
    this.baseURL = config.baseURL || 'https://api.runpod.ai/v2';
    this.timeout = config.timeout || 300000; // 5 minutes
    
    if (!this.apiKey) {
      throw new Error('RunPod API key is required');
    }
    
    logger.info('RunPod Connector initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout
    });
  }

  /**
   * Process a job request
   */
  async processJob(job) {
    logger.info('Processing RunPod job', { 
      jobId: job.id, 
      type: job.type,
      endpoint: job.params?.endpoint 
    });

    try {
      let result;
      
      switch (job.type) {
        case 'serverless-run':
          result = await this.handleServerlessRun(job.params);
          break;
        case 'serverless-stream':
          result = await this.handleServerlessStream(job.params);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }

      logger.info('RunPod job completed successfully', { jobId: job.id });
      return {
        success: true,
        result: result,
        metadata: {
          provider: 'runpod',
          processingTime: Date.now() - job.startTime
        }
      };

    } catch (error) {
      logger.error('RunPod job failed', { 
        jobId: job.id, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          provider: 'runpod',
          processingTime: Date.now() - job.startTime
        }
      };
    }
  }

  /**
   * Handle serverless run requests
   */
  async handleServerlessRun(params) {
    const { endpointId, input, webhook } = params;
    
    if (!endpointId) {
      throw new Error('RunPod endpoint ID is required');
    }

    // Submit the run request
    const runResponse = await fetch(`${this.baseURL}/${endpointId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: input || {},
        webhook: webhook
      })
    });

    if (!runResponse.ok) {
      const error = await runResponse.text();
      throw new Error(`RunPod API error: ${runResponse.status} - ${error}`);
    }

    const runResult = await runResponse.json();
    const requestId = runResult.id;
    
    logger.info('RunPod run submitted', { 
      requestId,
      endpointId,
      status: runResult.status 
    });

    // If webhook is provided, return immediately
    if (webhook) {
      return runResult;
    }

    // Otherwise, poll for completion
    return await this.pollRun(endpointId, requestId);
  }

  /**
   * Poll run until completion
   */
  async pollRun(endpointId, requestId) {
    const maxAttempts = 100; // Max 5 minutes with 3-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.baseURL}/${endpointId}/status/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`RunPod API error: ${response.status} - ${error}`);
      }

      const result = await response.json();
      
      logger.debug('Polling RunPod run', { 
        requestId, 
        status: result.status,
        attempt: attempts + 1 
      });

      if (result.status === 'COMPLETED') {
        return result;
      } else if (result.status === 'FAILED') {
        throw new Error(`RunPod run failed: ${result.error}`);
      } else if (result.status === 'CANCELLED') {
        throw new Error('RunPod run was cancelled');
      } else if (result.status === 'TIMED_OUT') {
        throw new Error('RunPod run timed out');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }

    throw new Error('RunPod run timed out during polling');
  }

  /**
   * Handle serverless stream requests
   */
  async handleServerlessStream(params) {
    const { endpointId, input } = params;
    
    if (!endpointId) {
      throw new Error('RunPod endpoint ID is required');
    }

    const response = await fetch(`${this.baseURL}/${endpointId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: {
          ...input,
          stream: true
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`RunPod API error: ${response.status} - ${error}`);
    }

    // Return the stream response for the caller to handle
    return {
      stream: response.body,
      headers: Object.fromEntries(response.headers.entries())
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        status: response.status,
        provider: 'runpod'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        provider: 'runpod'
      };
    }
  }
}

export default RunPodConnector;