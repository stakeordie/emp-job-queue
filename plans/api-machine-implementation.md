# API Machine Implementation Plan

This document outlines the implementation of lightweight API workers that integrate with the existing EmProps Job Queue system to handle external API calls (OpenAI, RunwayML, Anthropic) through distributed Railway services.

## Architecture Overview

### Current System
- **GPU Machines**: Heavy ComfyUI/A1111 workers on Salad infrastructure
- **Direct API Integration**: RunwayML/OpenAI calls made directly from EmProps Open API
- **Single Redis Queue**: `jobs:pending` with `findMatchingJob.lua` for worker-job matching

### Proposed System
- **Specialized API Machines**: Lightweight workers for external API calls
- **Same Redis Queue**: Leverage existing infrastructure with new service types
- **Railway Deployment**: One service per API key for elastic scaling

## Redis Integration Strategy

### ✅ Zero Changes Required
The existing Redis architecture perfectly supports API workers through service-based routing:

```lua
-- findMatchingJob.lua already handles service matching
if job.service_required then
  for _, service in ipairs(worker.services) do
    if service == job.service_required then  -- 'openai', 'runwayml', etc.
      has_service = true
    end
  end
end
```

### New Service Types
```javascript
const SERVICE_TYPES = {
  // Existing GPU services
  'comfyui': 'ComfyUI Workflows',
  'a1111': 'Automatic1111',
  
  // New API services
  'openai': 'OpenAI API',
  'runwayml': 'RunwayML Video',
  'anthropic': 'Anthropic Claude',
  'generic-api': 'Generic HTTP API'
}
```

### Worker Registration Pattern
```javascript
// OpenAI Worker (new)
await registerWorker({
  worker_id: 'openai-alice-1',
  services: ['openai'],              // Service matching
  api_key_owner: 'alice',            // Billing/monitoring  
  concurrent_limit: 5,               // Rate limiting
  rate_limits: { rpm: 1000 }
})

// ComfyUI Worker (unchanged)
await registerWorker({
  worker_id: 'comfyui-gpu-1', 
  services: ['comfyui'],
  hardware: { gpu_memory_gb: 24 }
})
```

## Implementation Details

### Project Structure
```
apps/api-machine/
├── src/
│   ├── api-machine.js              # Main entry point  
│   ├── lib/
│   │   ├── api-worker-base.js      # Base class for API workers
│   │   ├── api-key-manager.js      # Encrypted key handling
│   │   └── rate-limiter.js         # Per-key rate limiting
│   ├── workers/
│   │   ├── openai-worker.js        # OpenAI API calls
│   │   ├── runwayml-worker.js      # RunwayML API calls  
│   │   ├── anthropic-worker.js     # Anthropic API calls
│   │   └── generic-api-worker.js   # Generic HTTP API worker
│   └── services/
│       ├── health-server.js        # Health monitoring
│       └── status-reporter.js      # Redis status reporting
├── Dockerfile                      # Lightweight Node.js container
├── railway.toml                    # Railway deployment config
├── pm2-ecosystem.config.js         # PM2 worker management
└── package.json                    # API-specific dependencies
```

### Base API Worker Class
```javascript
// src/lib/api-worker-base.js
export class ApiWorkerBase {
  constructor(serviceType, apiKey, options = {}) {
    this.serviceType = serviceType;
    this.apiKey = apiKey;
    this.workerId = `${serviceType}-${process.env.WORKER_ID}`;
    this.concurrentLimit = options.concurrentLimit || 5;
    this.rateLimits = options.rateLimits || { rpm: 1000 };
  }

  async registerWithRedis() {
    const capabilities = {
      worker_id: this.workerId,
      services: [this.serviceType],        // 'openai', 'runwayml', etc.
      api_key_owner: process.env.API_KEY_OWNER || 'unknown',
      concurrent_limit: this.concurrentLimit,
      rate_limits: this.rateLimits,
      hardware: { cpu_cores: 1, ram_gb: 1 } // Lightweight specs
    };
    
    // Uses EXISTING Redis worker registration
    await this.redis.hset(`worker:${this.workerId}`, capabilities);
  }

  async processJob(job) {
    // Abstract method - implemented by specific API workers
    throw new Error('processJob must be implemented by subclass');
  }

  async requestJob() {
    // Request job from Redis using existing findMatchingJob function
    const capabilities = {
      worker_id: this.workerId,
      services: [this.serviceType],
      concurrent_limit: this.concurrentLimit
    };
    
    return await this.redis.call('findMatchingJob', JSON.stringify(capabilities));
  }
}
```

### OpenAI Worker Implementation
```javascript
// src/workers/openai-worker.js  
import OpenAI from 'openai';
import { ApiWorkerBase } from '../lib/api-worker-base.js';

export class OpenAIWorker extends ApiWorkerBase {
  constructor(apiKey, options) {
    super('openai', apiKey, options);
    this.client = new OpenAI({ apiKey });
  }

  async processJob(job) {
    const { model, messages, ...params } = job.payload;
    
    try {
      if (model.startsWith('dall-e')) {
        // Image generation
        const response = await this.client.images.generate({
          model,
          prompt: messages[0].content,
          ...params
        });
        
        return {
          success: true,
          data: response.data,
          output_files: response.data.map(img => ({
            url: img.url,
            type: 'image',
            mime_type: 'image/png'
          }))
        };
      } else {
        // Chat completion
        const response = await this.client.chat.completions.create({
          model,
          messages,
          ...params
        });
        
        return {
          success: true,
          data: response.choices[0].message.content,
          metadata: {
            model: response.model,
            usage: response.usage
          }
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        retry_after: error.headers?.['retry-after']
      };
    }
  }
}
```

### RunwayML Worker Implementation
```javascript
// src/workers/runwayml-worker.js
import RunwayML from '@runwayml/sdk';
import { ApiWorkerBase } from '../lib/api-worker-base.js';

export class RunwayMLWorker extends ApiWorkerBase {
  constructor(apiKey, options) {
    super('runwayml', apiKey, options);
    this.client = new RunwayML({ apiKey });
  }

  async processJob(job) {
    const { promptImage, promptText, duration, ratio, ...other } = job.payload;
    
    try {
      // Submit to RunwayML
      const imageToVideo = await this.client.imageToVideo.create({
        model: "gen3a_turbo",
        promptImage,
        promptText,
        duration,
        ratio,
        ...other
      });
      
      const taskId = imageToVideo.id;
      
      // Poll for completion
      let task;
      do {
        await new Promise(resolve => setTimeout(resolve, 10000));
        task = await this.client.tasks.retrieve(taskId);
      } while (!["SUCCEEDED", "FAILED"].includes(task.status));
      
      if (task.status === "FAILED") {
        return {
          success: false,
          error: `RunwayML task failed: ${task.failure}`
        };
      }
      
      return {
        success: true,
        data: task.output[0],
        output_files: [{
          url: task.output[0],
          type: 'video',
          mime_type: 'video/mp4'
        }],
        metadata: {
          task_id: taskId,
          processing_time: task.createdAt - task.completedAt
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

## PM2 Configuration

### Dynamic Ecosystem Generation
```javascript
// pm2-ecosystem.config.js
const serviceType = process.env.SERVICE_TYPE || 'openai';
const apiKey = process.env.API_KEY;
const concurrentLimit = parseInt(process.env.CONCURRENT_LIMIT || '5');
const keyOwner = process.env.API_KEY_OWNER || 'unknown';

if (!apiKey) {
  console.error('API_KEY environment variable is required');
  process.exit(1);
}

module.exports = {
  apps: Array.from({ length: concurrentLimit }, (_, i) => ({
    name: `${serviceType}-worker-${i + 1}`,
    script: `src/workers/${serviceType}-worker.js`,
    env: {
      WORKER_ID: i + 1,
      SERVICE_TYPE: serviceType,
      API_KEY: apiKey,
      API_KEY_OWNER: keyOwner,
      REDIS_URL: process.env.REDIS_URL,
      HUB_API_URL: process.env.HUB_API_URL,
      LOG_LEVEL: process.env.LOG_LEVEL || 'info'
    },
    error_file: `logs/${serviceType}-worker-${i + 1}-error.log`,
    out_file: `logs/${serviceType}-worker-${i + 1}-out.log`,
    log_file: `logs/${serviceType}-worker-${i + 1}-combined.log`,
    time: true
  }))
};
```

## Railway Deployment Strategy

### Container Configuration
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Create logs directory
RUN mkdir -p logs

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY pm2-ecosystem.config.js ./

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start with PM2
CMD ["pm2-runtime", "pm2-ecosystem.config.js"]
```

### Railway Configuration
```toml
# railway.toml
[build]
  builder = "dockerfile"

[deploy]
  restartPolicyType = "always"
  healthcheckPath = "/health"
  healthcheckTimeout = 10

[[services]]
  name = "api-workers"
  source = "."

[services.api-workers.variables]
  SERVICE_TYPE = "openai"
  CONCURRENT_LIMIT = "5"
  LOG_LEVEL = "info"
  # API_KEY and other secrets set per deployment
```

### Per-API-Key Deployment
```bash
# Template for deploying API workers with specific keys

# OpenAI Workers
railway service create openai-alice-personal
railway variables set SERVICE_TYPE=openai
railway variables set API_KEY=sk-alice-key  
railway variables set API_KEY_OWNER=alice
railway variables set CONCURRENT_LIMIT=5
railway variables set REDIS_URL=$REDIS_URL
railway variables set HUB_API_URL=$HUB_API_URL
railway deploy

railway service create openai-company-shared
railway variables set SERVICE_TYPE=openai
railway variables set API_KEY=sk-company-key
railway variables set API_KEY_OWNER=company  
railway variables set CONCURRENT_LIMIT=20
railway deploy

# RunwayML Workers
railway service create runwayml-project-video
railway variables set SERVICE_TYPE=runwayml
railway variables set API_KEY=rw-project-key
railway variables set API_KEY_OWNER=project-video
railway variables set CONCURRENT_LIMIT=3
railway deploy

# Anthropic Workers
railway service create anthropic-research
railway variables set SERVICE_TYPE=anthropic
railway variables set API_KEY=ant-research-key
railway variables set API_KEY_OWNER=research-team
railway variables set CONCURRENT_LIMIT=10
railway deploy
```

## API Key Override System

### Flexible API Key Management
The system supports both managed EmProps API keys and user-provided API key overrides, with intelligent routing to the least busy available worker.

#### Component Input Configuration
```json
// component-library/Components/runwayml/inputs.json
[
  {
    "id": "promptImage",
    "pathJq": ".promptImage"
  },
  {
    "id": "promptText", 
    "pathJq": ".promptText"
  },
  {
    "id": "api_key",
    "pathJq": ".api_key",
    "optional": true,
    "description": "Override default API key for custom billing/rate limits"
  }
]
```

#### Intelligent Job Routing
```javascript
// Enhanced job routing logic
function routeJobToWorker(job, availableWorkers) {
  if (job.payload.api_key) {
    // User provided specific API key - route to workers using that key
    const targetWorkers = availableWorkers.filter(worker => 
      worker.api_key_hash === hashApiKey(job.payload.api_key) &&
      worker.services.includes(job.service_required)
    );
    
    if (targetWorkers.length === 0) {
      throw new Error(`No workers available for provided API key`);
    }
    
    // Route to least busy worker with that specific key
    return targetWorkers.sort((a, b) => a.active_jobs - b.active_jobs)[0];
    
  } else {
    // No API key specified - route to least busy worker across all keys
    const serviceWorkers = availableWorkers.filter(worker => 
      worker.services.includes(job.service_required)
    );
    
    // Route to least busy worker regardless of API key
    return serviceWorkers.sort((a, b) => a.active_jobs - b.active_jobs)[0];
  }
}
```

#### Usage Patterns
```javascript
// Default: Use EmProps managed keys (automatic load balancing)
const defaultJob = {
  service_required: 'runwayml',
  payload: {
    promptText: "make video",
    promptImage: "https://example.com/image.jpg",
    duration: 5
  }
  // No api_key - system chooses least busy worker
};

// Override: Use specific API key for billing/control
const customKeyJob = {
  service_required: 'runwayml', 
  payload: {
    promptText: "make video",
    promptImage: "https://example.com/image.jpg", 
    duration: 5,
    api_key: "rw-client-project-key"  // Routes to workers with this key
  }
};

// Company workflow using company key
const companyJob = {
  service_required: 'openai',
  payload: {
    model: 'gpt-4',
    messages: [...],
    api_key: "sk-company-key"
  }
};
```

#### Load Balancing Examples
```javascript
// Worker pool state:
// Worker 1 (EmProps key A): 2 active jobs, 3 idle capacity
// Worker 2 (EmProps key B): 5 active jobs, 0 idle capacity  
// Worker 3 (User key C): 0 active jobs, 5 idle capacity
// Worker 4 (User key C): 1 active jobs, 4 idle capacity

// Job with no api_key override → Routes to Worker 3 (least busy overall)
// Job with User key C → Routes to Worker 3 (least busy with that key)
// Job with EmProps managed keys → Routes to Worker 1 (least busy EmProps worker)
```

#### Benefits
- **Zero Configuration Default**: Users get automatic load balancing across EmProps keys
- **Billing Flexibility**: Route specific projects to specific API keys for cost attribution
- **Rate Limit Optimization**: Spread load across multiple keys automatically
- **Custom Key Support**: Users can provide their own keys for higher limits or control
- **Intelligent Routing**: Always routes to least busy available worker

#### Worker Registration Updates
```javascript
// Workers register with API key hash for routing
await registerWorker({
  worker_id: 'runwayml-user-key-1',
  services: ['runwayml'],
  api_key_hash: hashApiKey(process.env.API_KEY),  // For routing decisions
  api_key_owner: process.env.API_KEY_OWNER,       // For billing/monitoring
  concurrent_limit: 5,
  active_jobs: 0  // Tracked for load balancing
});
```

## Failure Recovery & Error Handling

### Service-Specific Error Interpretation
Each API service returns different error formats that must be interpreted for proper retry orchestration. The system needs to understand which errors are retryable vs permanent failures.

#### Error Classification Framework
```javascript
// src/lib/error-classifier.js
export class ServiceErrorClassifier {
  static classifyError(service, error, response) {
    const classification = {
      shouldRetry: false,
      retryAfter: null,          // Seconds to wait before retry
      retryWithDifferentWorker: false,  // Try different API key/worker
      permanentFailure: false,   // Don't retry, mark job as failed
      userError: false,          // User input issue, don't retry
      rateLimitHit: false,       // Specific rate limit handling
      escalateToHuman: false     // Complex error requiring intervention
    };

    switch (service) {
      case 'openai':
        return this.classifyOpenAIError(error, response, classification);
      case 'runwayml':
        return this.classifyRunwayMLError(error, response, classification);
      case 'anthropic':
        return this.classifyAnthropicError(error, response, classification);
      default:
        return this.classifyGenericError(error, response, classification);
    }
  }

  static classifyOpenAIError(error, response, classification) {
    const status = response?.status || error.status;
    const code = error.code || response?.data?.error?.code;
    const message = error.message || response?.data?.error?.message || '';

    switch (status) {
      case 400: // Bad Request
        if (code === 'invalid_request_error') {
          classification.userError = true;
          classification.permanentFailure = true;
        } else if (message.includes('content_policy_violation')) {
          classification.userError = true;
          classification.permanentFailure = true;
        }
        break;

      case 401: // Unauthorized
        classification.retryWithDifferentWorker = true; // Try different API key
        classification.permanentFailure = !classification.retryWithDifferentWorker;
        break;

      case 429: // Rate Limited
        classification.shouldRetry = true;
        classification.rateLimitHit = true;
        classification.retryWithDifferentWorker = true; // Try different API key
        classification.retryAfter = parseInt(response?.headers?.['retry-after']) || 60;
        break;

      case 500: // Internal Server Error
      case 502: // Bad Gateway
      case 503: // Service Unavailable
        classification.shouldRetry = true;
        classification.retryAfter = 30;
        break;

      case 504: // Gateway Timeout
        classification.shouldRetry = true;
        classification.retryAfter = 60;
        break;

      default:
        classification.shouldRetry = status >= 500;
        classification.retryAfter = 30;
    }

    return classification;
  }

  static classifyRunwayMLError(error, response, classification) {
    const status = response?.status || error.status;
    const runwayCode = response?.data?.code;
    const message = error.message || response?.data?.message || '';

    switch (status) {
      case 400:
        if (runwayCode === 'INVALID_PROMPT') {
          classification.userError = true;
          classification.permanentFailure = true;
        } else if (runwayCode === 'INSUFFICIENT_CREDITS') {
          classification.retryWithDifferentWorker = true;
        }
        break;

      case 429:
        classification.shouldRetry = true;
        classification.rateLimitHit = true;
        classification.retryWithDifferentWorker = true;
        classification.retryAfter = 60;
        break;

      case 500:
      case 503:
        classification.shouldRetry = true;
        classification.retryAfter = 45;
        break;

      default:
        classification.shouldRetry = status >= 500;
    }

    return classification;
  }
}
```

#### Enhanced Worker Error Handling
```javascript
// src/lib/api-worker-base.js - Enhanced processJob with error handling
export class ApiWorkerBase {
  async processJob(job) {
    const startTime = Date.now();
    let lastError = null;

    try {
      // Call service-specific implementation
      const result = await this.processJobImpl(job);
      
      return {
        ...result,
        processing_time_ms: Date.now() - startTime,
        worker_id: this.workerId,
        api_key_owner: process.env.API_KEY_OWNER
      };

    } catch (error) {
      lastError = error;
      
      // Classify the error for retry orchestration
      const classification = ServiceErrorClassifier.classifyError(
        this.serviceType, 
        error, 
        error.response
      );

      const errorResult = {
        success: false,
        error: error.message,
        error_code: error.code || error.response?.data?.error?.code,
        processing_time_ms: Date.now() - startTime,
        worker_id: this.workerId,
        api_key_owner: process.env.API_KEY_OWNER,
        
        // Retry orchestration metadata
        retry_classification: classification,
        should_retry: classification.shouldRetry,
        retry_after_seconds: classification.retryAfter,
        retry_with_different_worker: classification.retryWithDifferentWorker,
        permanent_failure: classification.permanentFailure,
        user_error: classification.userError,
        rate_limit_hit: classification.rateLimitHit
      };

      // Log detailed error information
      this.logError(job, error, classification);

      return errorResult;
    }
  }

  logError(job, error, classification) {
    const errorDetails = {
      job_id: job.id,
      worker_id: this.workerId,
      service_type: this.serviceType,
      api_key_owner: process.env.API_KEY_OWNER,
      error_message: error.message,
      error_code: error.code,
      http_status: error.response?.status,
      classification: classification,
      timestamp: new Date().toISOString()
    };

    if (classification.permanentFailure) {
      logger.error('Permanent job failure', errorDetails);
    } else if (classification.rateLimitHit) {
      logger.warn('Rate limit exceeded', errorDetails);
    } else if (classification.shouldRetry) {
      logger.info('Transient error, will retry', errorDetails);
    } else {
      logger.error('Unclassified error', errorDetails);
    }
  }
}
```

#### Job Queue Retry Orchestration
```javascript
// Enhanced job completion handler in API server
async handleJobCompletion(jobId, result) {
  if (result.success) {
    // Job succeeded - mark as completed
    await this.markJobCompleted(jobId, result);
    return;
  }

  // Job failed - determine retry strategy
  const classification = result.retry_classification;
  const job = await this.getJob(jobId);
  
  if (classification.permanentFailure || classification.userError) {
    // Don't retry permanent failures or user errors
    await this.markJobFailed(jobId, result, 'permanent_failure');
    return;
  }

  if (classification.retryWithDifferentWorker) {
    // Try with different API key/worker
    await this.requeueJobWithWorkerFilter(jobId, {
      excludeApiKeyHash: result.api_key_hash,
      reason: classification.rateLimitHit ? 'rate_limit' : 'api_key_issue'
    });
    return;
  }

  if (classification.shouldRetry && job.retry_count < job.max_retries) {
    // Standard retry with backoff
    const retryDelay = classification.retryAfter || 
      Math.min(30 * Math.pow(2, job.retry_count), 300); // Exponential backoff, max 5 min
    
    setTimeout(async () => {
      await this.requeueJob(jobId, {
        increment_retry: true,
        reason: 'transient_error'
      });
    }, retryDelay * 1000);
    return;
  }

  // Exceeded max retries or shouldn't retry
  await this.markJobFailed(jobId, result, 'max_retries_exceeded');
}
```

#### Simulation Service Error Testing
```javascript
// src/workers/simulation-openai-worker.js - Enhanced with realistic error simulation
export class SimulationOpenAIWorker extends ApiWorkerBase {
  async processJob(job) {
    // Simulate different types of failures for testing
    const shouldFail = Math.random() < SimulationConfig.failureRate;
    
    if (shouldFail) {
      const failureType = this.pickRandomFailure();
      return this.simulateError(failureType, job);
    }

    // Normal processing simulation
    const processingTime = Math.random() * 8000 + 2000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    return this.simulateSuccess(job);
  }

  pickRandomFailure() {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [type, probability] of Object.entries(SimulationConfig.failureTypes)) {
      cumulative += probability;
      if (rand <= cumulative) return type;
    }
    
    return 'networkTimeout';
  }

  simulateError(failureType, job) {
    const errors = {
      rateLimitExceeded: {
        error: 'Rate limit exceeded',
        error_code: 'rate_limit_exceeded',
        http_status: 429,
        retry_after: 60
      },
      serviceUnavailable: {
        error: 'Service temporarily unavailable',
        http_status: 503
      },
      invalidRequest: {
        error: 'Invalid request parameters',
        error_code: 'invalid_request_error',
        http_status: 400
      },
      contentPolicyViolation: {
        error: 'Content policy violation',
        error_code: 'content_policy_violation', 
        http_status: 400
      },
      networkTimeout: {
        error: 'Request timeout',
        http_status: 504
      }
    };

    const errorData = errors[failureType];
    const mockError = new Error(errorData.error);
    mockError.code = errorData.error_code;
    mockError.response = {
      status: errorData.http_status,
      headers: errorData.retry_after ? { 'retry-after': errorData.retry_after } : {},
      data: { error: errorData }
    };

    throw mockError;
  }
}
```

#### Monitoring & Alerting
```javascript
// Enhanced monitoring for failure patterns
export class FailureMonitor {
  trackJobFailure(jobId, service, errorClassification, apiKeyOwner) {
    const metrics = {
      service,
      error_type: errorClassification.rateLimitHit ? 'rate_limit' : 
                  errorClassification.permanentFailure ? 'permanent' :
                  errorClassification.userError ? 'user_error' : 'transient',
      api_key_owner: apiKeyOwner,
      timestamp: Date.now()
    };

    // Send to monitoring system
    this.recordMetric('job_failure', metrics);

    // Check for failure patterns requiring intervention
    this.checkFailurePatterns(service, apiKeyOwner);
  }

  async checkFailurePatterns(service, apiKeyOwner) {
    const recentFailures = await this.getRecentFailures(service, apiKeyOwner, 300); // 5 minutes
    
    if (recentFailures.rateLimitCount > 10) {
      this.alert('high_rate_limit_failures', {
        service,
        api_key_owner: apiKeyOwner,
        count: recentFailures.rateLimitCount
      });
    }

    if (recentFailures.permanentFailureRate > 0.5) {
      this.alert('high_permanent_failure_rate', {
        service,
        api_key_owner: apiKeyOwner,
        rate: recentFailures.permanentFailureRate
      });
    }
  }
}
```

### Benefits of Enhanced Failure Handling
- **Intelligent Retry Logic** - Different strategies for different error types
- **API Key Routing** - Automatically try different keys when one is rate limited
- **User Error Detection** - Don't waste retries on bad user input
- **Cost Optimization** - Avoid unnecessary API calls for permanent failures
- **Monitoring Integration** - Track failure patterns for operational insights
- **Testing Coverage** - Simulation service tests all failure scenarios

## EmProps Open API Integration

### Migration from Direct API Calls
```javascript
// OLD: Direct API calls in emprops-open-api
export class RunwayMLNode extends ImageNode {
  async execute(ctx, payload) {
    // Direct API call - blocks the server
    const imageToVideo = await this.client.imageToVideo.create({...});
    
    // Polling loop - blocks the server  
    let task;
    do {
      await new Promise(resolve => setTimeout(resolve, 10000));
      task = await this.client.tasks.retrieve(taskId);
    } while (!["SUCCEEDED", "FAILED"].includes(task.status));
    
    return { src: task.output[0], mimeType: "video/mp4" };
  }
}

// NEW: Job queue integration
export class RunwayMLNode extends ImageNode {
  async execute(ctx, payload) {
    // Submit job to queue - non-blocking
    const job = await this.jobQueue.submitJob({
      service_required: 'runwayml',
      payload,
      priority: 50,
      timeout_minutes: 10,
      customer_id: ctx.userId
    });
    
    // Poll job status - non-blocking for server
    return await this.jobQueue.waitForCompletion(job.id);
  }
}
```

### Job Submission Patterns
```javascript
// Chat completion
const chatJob = {
  service_required: 'openai',
  payload: {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' }
    ],
    temperature: 0.7
  },
  priority: 50,
  customer_id: userId
};

// Image generation  
const imageJob = {
  service_required: 'openai',
  payload: {
    model: 'dall-e-3',
    messages: [{ content: 'A sunset over mountains' }],
    size: '1024x1024',
    quality: 'standard'
  },
  priority: 60,
  customer_id: userId
};

// Video generation
const videoJob = {
  service_required: 'runwayml',
  payload: {
    promptImage: 'https://example.com/image.jpg',
    promptText: 'Make this image move naturally',
    duration: 5,
    ratio: '1280:768'
  },
  priority: 70,
  customer_id: userId
};
```

## API Key Management

### Secure Key Storage
```javascript
// src/lib/api-key-manager.js
export class ApiKeyManager {
  constructor() {
    this.apiKey = process.env.API_KEY;
    this.keyOwner = process.env.API_KEY_OWNER;
    
    if (!this.apiKey) {
      throw new Error('API_KEY environment variable is required');
    }
  }
  
  getKey() {
    return this.apiKey;
  }
  
  getOwner() {
    return this.keyOwner;
  }
  
  // For future: support encrypted keys from KMS
  async getEncryptedKey(keyId) {
    // Implementation for KMS-encrypted keys
  }
}
```

### Rate Limit Management
```javascript
// src/lib/rate-limiter.js
export class RateLimiter {
  constructor(limits = {}) {
    this.rpm = limits.rpm || 1000;    // Requests per minute
    this.tpm = limits.tpm || 50000;   // Tokens per minute
    this.requests = [];
    this.tokens = 0;
    this.tokensResetTime = Date.now() + 60000;
  }
  
  async checkLimit(estimatedTokens = 100) {
    const now = Date.now();
    
    // Clean old requests (sliding window)
    this.requests = this.requests.filter(time => now - time < 60000);
    
    // Reset token counter every minute
    if (now > this.tokensResetTime) {
      this.tokens = 0;
      this.tokensResetTime = now + 60000;
    }
    
    // Check limits
    if (this.requests.length >= this.rpm) {
      const waitTime = 60000 - (now - this.requests[0]);
      throw new Error(`Rate limit exceeded. Wait ${waitTime}ms`);
    }
    
    if (this.tokens + estimatedTokens > this.tpm) {
      const waitTime = this.tokensResetTime - now;
      throw new Error(`Token limit exceeded. Wait ${waitTime}ms`);
    }
    
    // Record request
    this.requests.push(now);
    this.tokens += estimatedTokens;
  }
}
```

## Health Monitoring

### Health Check Endpoint
```javascript
// src/services/health-server.js
import express from 'express';

export class HealthServer {
  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.workers = new Map();
  }
  
  start() {
    this.app.get('/health', (req, res) => {
      const workers = Array.from(this.workers.values());
      const healthy = workers.every(w => w.status === 'idle' || w.status === 'busy');
      
      res.status(healthy ? 200 : 503).json({
        status: healthy ? 'healthy' : 'unhealthy',
        service_type: process.env.SERVICE_TYPE,
        api_key_owner: process.env.API_KEY_OWNER,
        workers: workers.length,
        active_jobs: workers.filter(w => w.status === 'busy').length,
        uptime: process.uptime()
      });
    });
    
    this.app.listen(this.port, () => {
      console.log(`Health server listening on port ${this.port}`);
    });
  }
  
  updateWorkerStatus(workerId, status) {
    this.workers.set(workerId, { workerId, status, lastUpdate: Date.now() });
  }
}
```

## Priority: OpenAI Image Generation (Fast Track)

### Goal: Get OpenAI DALL-E 3 image generation working through job queue ASAP

### Development Strategy: Simulation-First Approach
To minimize complexity and speed up development, we'll start with a **simulation service** that mimics OpenAI's API responses, then swap to real OpenAI API once the infrastructure is working.

#### Phase 0: Simulation Service (Week 1)
Build a lightweight simulation service that mimics OpenAI image generation for testing:

```javascript
// src/workers/simulation-openai-worker.js
export class SimulationOpenAIWorker extends ApiWorkerBase {
  constructor(apiKey = 'sim-key', options) {
    super('openai', apiKey, options);
  }

  async processJob(job) {
    const { model, messages, size = '1024x1024' } = job.payload;
    
    // Simulate processing time (2-10 seconds instead of real 10-30 seconds)
    const processingTime = Math.random() * 8000 + 2000;
    await new Promise(resolve => setTimeout(resolve, processingTime));
    
    if (model.startsWith('dall-e')) {
      // Return simulated image generation response
      return {
        success: true,
        data: [{
          url: `https://picsum.photos/${size.replace('x', '/')}?random=${Date.now()}`,
          revised_prompt: messages[0].content + " (enhanced by AI)"
        }],
        output_files: [{
          url: `https://picsum.photos/${size.replace('x', '/')}?random=${Date.now()}`,
          type: 'image',
          mime_type: 'image/png',
          size: size
        }],
        metadata: {
          model: model,
          processing_time_ms: processingTime,
          simulation: true
        }
      };
    }
    
    // Simulate other models (chat, etc.)
    return {
      success: true,
      data: `Simulated response for ${model}: ${messages[0].content}`,
      metadata: { model, simulation: true }
    };
  }
}
```

#### Benefits of Simulation-First:
- ✅ **Fast Development** - No API key setup, rate limits, or real costs
- ✅ **End-to-End Testing** - Test entire job queue flow with predictable responses  
- ✅ **Component Integration** - Verify component → job queue → worker → result flow
- ✅ **Load Testing** - Test worker scaling and load balancing without API costs
- ✅ **Debugging** - Controllable responses for testing edge cases

#### Simulation Service Features:
```javascript
// Configurable simulation behavior with failure testing
const SimulationConfig = {
  // Response times
  minProcessingTime: 2000,  // 2 seconds
  maxProcessingTime: 10000, // 10 seconds
  
  // Failure simulation for testing retry logic
  failureRate: 0.05, // 5% failure rate
  failureTypes: {
    rateLimitExceeded: 0.3,    // 30% of failures
    serviceUnavailable: 0.2,   // 20% of failures  
    invalidRequest: 0.1,       // 10% of failures
    contentPolicyViolation: 0.1, // 10% of failures
    networkTimeout: 0.3        // 30% of failures
  },
  
  // Rate limit simulation
  simulateRateLimits: true,
  maxRequestsPerMinute: 100,
  
  // API key simulation
  simulateMultipleKeys: true,
  keyPerformance: {
    'sim-key-fast': { minTime: 1000, maxTime: 3000 },
    'sim-key-slow': { minTime: 5000, maxTime: 15000 }
  }
};
```

#### Simulation → Real OpenAI Swap:
```javascript
// Easy swap from simulation to real API
// Change one line in deployment:

// Simulation
SERVICE_TYPE=openai
WORKER_CLASS=SimulationOpenAIWorker
API_KEY=sim-key-123

// Real OpenAI  
SERVICE_TYPE=openai
WORKER_CLASS=OpenAIWorker
API_KEY=sk-real-openai-key
```

#### Component Testing:
```json
// Test with simulation service first
{
  "service_required": "openai",
  "payload": {
    "model": "dall-e-3",
    "messages": [{"content": "A sunset over mountains"}],
    "size": "1024x1024"
  }
  // No api_key = uses simulation workers
}

// Then test API key override with simulation
{
  "service_required": "openai", 
  "payload": {
    "model": "dall-e-3",
    "messages": [{"content": "A sunset over mountains"}],
    "size": "1024x1024",
    "api_key": "sim-key-fast"  // Routes to fast simulation worker
  }
}
```

## Development Timeline

### Phase 0: Simulation Service (Week 1) - PRIORITY
- [ ] Create `apps/api-machine` project structure
- [ ] Implement `ApiWorkerBase` class
- [ ] Create `SimulationOpenAIWorker` for testing
- [ ] Set up PM2 ecosystem configuration
- [ ] Basic health monitoring and status reporting
- [ ] Railway deployment for simulation workers
- [ ] Test API key override routing with simulation keys
- [ ] Create OpenAI image generation component (using simulation)
- [ ] End-to-end testing: Component → Job Queue → Simulation Worker → Result

### Phase 1: Real OpenAI Integration (Week 2) - PRIORITY
- [ ] Implement real `OpenAIWorker` with OpenAI SDK
- [ ] Support DALL-E 3 image generation API
- [ ] Support GPT-4 chat completions API  
- [ ] API key management and rate limiting
- [ ] Swap simulation workers for real OpenAI workers
- [ ] Production testing with real OpenAI API keys
- [ ] Component updates for real API response formats
- [ ] Load testing with multiple API keys

### Phase 2: Additional Services (Week 3)  
- [ ] Implement `RunwayMLWorker`
- [ ] Implement `AnthropicWorker`
- [ ] Create `GenericApiWorker` for HTTP APIs
- [ ] Docker containerization optimization
- [ ] Railway deployment templates

### Phase 3: Production Scale (Week 4)
- [ ] Production Railway deployments for all services
- [ ] EmProps Open API component migration
- [ ] Multi-API-key load balancing testing
- [ ] Performance optimization and monitoring
- [ ] Documentation and operational guides

## Success Criteria

### Technical Goals
- [ ] **Zero Redis Changes** - Existing `findMatchingJob.lua` handles new service types
- [ ] **API Key Scaling** - Each Railway service supports one API key with N workers
- [ ] **Rate Limit Compliance** - Built-in rate limiting per API provider
- [ ] **Fault Tolerance** - Jobs survive worker failures with retry logic
- [ ] **Cost Efficiency** - Lightweight containers vs expensive GPU machines

### Performance Goals
- [ ] **Response Time** - API jobs complete within 30 seconds average
- [ ] **Throughput** - Support 1000+ API calls per minute across all services
- [ ] **Availability** - 99.9% uptime for API worker services
- [ ] **Scalability** - Linear scaling with additional API keys/workers

### Business Goals
- [ ] **Cost Reduction** - 80% lower infrastructure costs vs direct API calls
- [ ] **Customer Onboarding** - Self-service API key addition in <5 minutes
- [ ] **Usage Tracking** - Accurate billing attribution per API key owner
- [ ] **Service Reliability** - Eliminate API server blocking on external calls

## Monitoring and Operations

### Key Metrics
- **Job Processing Rate** - Jobs/minute per service type
- **API Response Times** - P50, P95, P99 latencies per provider
- **Rate Limit Utilization** - Percentage of API limits used
- **Worker Utilization** - Active workers vs total capacity
- **Error Rates** - Failed jobs by error type and provider

### Alerting Thresholds
- Job failure rate > 5%
- Average response time > 30 seconds
- Worker utilization > 90%
- Rate limit utilization > 95%
- Any Railway service down > 5 minutes

### Operational Procedures
- **Adding API Keys** - Railway service deployment checklist
- **Scaling Workers** - Adjust `CONCURRENT_LIMIT` and redeploy
- **Rate Limit Issues** - Add additional API keys or workers
- **Service Failures** - Automatic retry and fallback procedures

This implementation plan provides a complete roadmap for building lightweight, scalable API workers that integrate seamlessly with the existing EmProps Job Queue infrastructure while enabling elastic scaling per API key on Railway.