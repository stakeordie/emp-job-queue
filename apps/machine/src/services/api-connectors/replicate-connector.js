/**
 * Replicate API Connector Service
 * Handles Replicate API requests for various ML models
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('replicate-connector');

class ReplicateConnector {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.REPLICATE_API_TOKEN;
    this.baseURL = config.baseURL || 'https://api.replicate.com/v1';
    this.timeout = config.timeout || 300000; // 5 minutes for ML models
    
    if (!this.apiKey) {
      throw new Error('Replicate API token is required');
    }
    
    logger.info('Replicate Connector initialized', {
      baseURL: this.baseURL,
      timeout: this.timeout
    });
  }

  /**
   * Process a job request
   */
  async processJob(job) {
    logger.info('Processing Replicate job', { 
      jobId: job.id, 
      type: job.type,
      model: job.params?.model 
    });

    try {
      let result;
      
      switch (job.type) {
        case 'prediction':
          result = await this.handlePrediction(job.params);
          break;
        case 'training':
          result = await this.handleTraining(job.params);
          break;
        default:
          throw new Error(`Unsupported job type: ${job.type}`);
      }

      logger.info('Replicate job completed successfully', { jobId: job.id });
      return {
        success: true,
        result: result,
        metadata: {
          provider: 'replicate',
          processingTime: Date.now() - job.startTime
        }
      };

    } catch (error) {
      logger.error('Replicate job failed', { 
        jobId: job.id, 
        error: error.message 
      });
      
      return {
        success: false,
        error: error.message,
        metadata: {
          provider: 'replicate',
          processingTime: Date.now() - job.startTime
        }
      };
    }
  }

  /**
   * Handle prediction requests
   */
  async handlePrediction(params) {
    // Create prediction
    const createResponse = await fetch(`${this.baseURL}/predictions`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: params.version,
        input: params.input,
        webhook: params.webhook,
        webhook_events_filter: params.webhook_events_filter
      })
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Replicate API error: ${createResponse.status} - ${error}`);
    }

    const prediction = await createResponse.json();
    logger.info('Replicate prediction created', { 
      predictionId: prediction.id,
      status: prediction.status 
    });

    // If webhook is provided, return immediately
    if (params.webhook) {
      return prediction;
    }

    // Otherwise, poll for completion
    return await this.pollPrediction(prediction.id);
  }

  /**
   * Poll prediction until completion
   */
  async pollPrediction(predictionId) {
    const maxAttempts = 100; // Max 5 minutes with 3-second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.baseURL}/predictions/${predictionId}`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Replicate API error: ${response.status} - ${error}`);
      }

      const prediction = await response.json();
      
      logger.debug('Polling prediction', { 
        predictionId, 
        status: prediction.status,
        attempt: attempts + 1 
      });

      if (prediction.status === 'succeeded') {
        return prediction;
      } else if (prediction.status === 'failed') {
        throw new Error(`Prediction failed: ${prediction.error}`);
      } else if (prediction.status === 'canceled') {
        throw new Error('Prediction was canceled');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }

    throw new Error('Prediction timed out');
  }

  /**
   * Handle training requests
   */
  async handleTraining(params) {
    const response = await fetch(`${this.baseURL}/trainings`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: params.version,
        input: params.input,
        webhook: params.webhook,
        webhook_events_filter: params.webhook_events_filter
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${response.status} - ${error}`);
    }

    const training = await response.json();
    logger.info('Replicate training started', { 
      trainingId: training.id,
      status: training.status 
    });

    return training;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseURL}/predictions`, {
        method: 'GET',
        headers: {
          'Authorization': `Token ${this.apiKey}`
        },
        signal: AbortSignal.timeout(5000)
      });

      return {
        healthy: response.ok,
        status: response.status,
        provider: 'replicate'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        provider: 'replicate'
      };
    }
  }
}

export default ReplicateConnector;