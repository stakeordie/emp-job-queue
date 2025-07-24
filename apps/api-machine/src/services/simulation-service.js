import express from 'express';
import { createLogger } from '../utils/logger.js';
import config from '../config/environment.js';

/**
 * Simulation Service - Mock External API for Testing
 * 
 * This service simulates OpenAI and other external APIs for development and testing.
 * It provides realistic response times and error conditions to test the job queue system.
 */
export class SimulationService {
  constructor() {
    this.logger = createLogger('simulation-service');
    this.app = express();
    this.server = null;
    this.responseDelay = config.services.simulation.responseDelay;
    
    this.setupRoutes();
  }

  setupRoutes() {
    // Middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use((req, res, next) => {
      this.logger.info(`Simulation API: ${req.method} ${req.path}`, {
        body: req.method === 'POST' ? JSON.stringify(req.body).substring(0, 200) : undefined
      });
      next();
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'simulation',
        timestamp: new Date().toISOString() 
      });
    });

    // OpenAI Image Generation Simulation
    this.app.post('/v1/images/generations', async (req, res) => {
      try {
        const { prompt, size = '1024x1024', n = 1, quality = 'standard' } = req.body;
        
        if (!prompt) {
          return res.status(400).json({
            error: {
              message: 'Prompt is required',
              type: 'invalid_request_error'
            }
          });
        }

        // Simulate processing delay
        await this.delay(this.responseDelay);

        // 10% chance of simulated failure for testing
        if (Math.random() < 0.1) {
          return res.status(500).json({
            error: {
              message: 'Simulated server error for testing',
              type: 'server_error'
            }
          });
        }

        // Generate mock response
        const images = Array.from({ length: n }, (_, i) => ({
          url: `https://simulation.emprops.ai/generated/${Date.now()}-${i}.png`,
          revised_prompt: `Enhanced simulation: ${prompt}`
        }));

        res.json({
          created: Math.floor(Date.now() / 1000),
          data: images
        });

        this.logger.info('Simulation: Generated image response', {
          prompt: prompt.substring(0, 100),
          count: n,
          size,
          quality
        });

      } catch (error) {
        this.logger.error('Simulation API error:', error);
        res.status(500).json({
          error: {
            message: 'Internal simulation error',
            type: 'server_error'
          }
        });
      }
    });

    // OpenAI Text Generation Simulation
    this.app.post('/v1/chat/completions', async (req, res) => {
      try {
        const { messages, model = 'gpt-4', max_tokens = 1000 } = req.body;
        
        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({
            error: {
              message: 'Messages array is required',
              type: 'invalid_request_error'
            }
          });
        }

        // Simulate processing delay
        await this.delay(this.responseDelay);

        // 5% chance of simulated failure
        if (Math.random() < 0.05) {
          return res.status(429).json({
            error: {
              message: 'Simulated rate limit for testing',
              type: 'rate_limit_exceeded'
            }
          });
        }

        const lastMessage = messages[messages.length - 1];
        const mockResponse = `Simulation response to: "${lastMessage.content?.substring(0, 50)}..."`;

        res.json({
          id: `chatcmpl-sim-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: mockResponse
            },
            finish_reason: 'stop'
          }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 25,
            total_tokens: 75
          }
        });

        this.logger.info('Simulation: Generated chat response', {
          model,
          messageCount: messages.length
        });

      } catch (error) {
        this.logger.error('Simulation chat API error:', error);
        res.status(500).json({
          error: {
            message: 'Internal simulation error',
            type: 'server_error'
          }
        });
      }
    });

    // Job status check endpoint (for testing failure recovery)
    this.app.get('/job/:jobId/status', async (req, res) => {
      const { jobId } = req.params;
      
      // Simulate different job states for testing
      const states = ['processing', 'completed', 'failed', 'not_found'];
      const randomState = states[Math.floor(Math.random() * states.length)];
      
      res.json({
        job_id: jobId,
        status: randomState,
        created_at: new Date(Date.now() - 60000).toISOString(),
        updated_at: new Date().toISOString()
      });
    });

    // Error simulation endpoints for testing
    this.app.post('/simulate/error/:type', (req, res) => {
      const { type } = req.params;
      
      switch (type) {
        case 'timeout':
          // Don't respond to simulate timeout
          return;
        case 'rate_limit':
          return res.status(429).json({
            error: { message: 'Rate limit exceeded', type: 'rate_limit_exceeded' }
          });
        case 'auth_error':
          return res.status(401).json({
            error: { message: 'Invalid API key', type: 'invalid_request_error' }
          });
        case 'server_error':
          return res.status(500).json({
            error: { message: 'Internal server error', type: 'server_error' }
          });
        default:
          return res.status(400).json({
            error: { message: 'Unknown error type', type: 'invalid_request_error' }
          });
      }
    });
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async start() {
    const port = config.services.simulation.port;
    
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (err) => {
        if (err) {
          this.logger.error('Failed to start simulation service:', err);
          reject(err);
        } else {
          this.logger.info(`Simulation service listening on port ${port}`);
          resolve();
        }
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.logger.info('Simulation service stopped');
          resolve();
        });
      });
    }
  }
}