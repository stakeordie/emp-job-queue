# Playwright Service Implementation Guide

## Overview

This document provides a complete implementation guide for replacing the external Railway-hosted Puppeteer service with local Playwright services that run on each worker machine. The implementation follows the exact same patterns as ComfyUI services in the EMP job queue architecture.

## Current vs. Proposed Architecture

### Current Architecture (Puppeteer)
```
EmProps Open API → External Railway Puppeteer Service → Base64 Results → Azure Storage
```

**Problems:**
- External service dependency (network latency, costs)
- Single point of failure
- No GPU acceleration
- Network overhead for large video files

### Proposed Architecture (Playwright)
```
EmProps Open API → Redis Job Queue → Local Playwright Service → Azure Storage → CDN URLs
```

**Benefits:**
- ✅ Local GPU-accelerated rendering
- ✅ No external service dependency
- ✅ Reduced network latency
- ✅ Better resource utilization
- ✅ Fits Heavy Pool architecture for video rendering
- ✅ Direct Azure storage integration

## Implementation Architecture

### Service Pattern (Following ComfyUI)

Just like ComfyUI, Playwright will run as multiple PM2-managed services:

```bash
# PM2 Services (scaled by NUM_GPUS)
playwright-gpu0    # Port 3000
playwright-gpu1    # Port 3001
playwright-gpu2    # Port 3002
# etc...

# Corresponding Workers
redis-worker-gpu0  # Connects to playwright-gpu0 via PlaywrightConnector
redis-worker-gpu1  # Connects to playwright-gpu1 via PlaywrightConnector
redis-worker-gpu2  # Connects to playwright-gpu2 via PlaywrightConnector
```

### Job Flow

1. **Job Submission**: EmProps Open API submits P5.js/JS job to Redis queue
2. **Job Pickup**: Redis worker picks up job via PlaywrightConnector
3. **Service Processing**: Local Playwright service processes with GPU acceleration
4. **Result Storage**: Service uploads result directly to Azure storage
5. **CDN Verification**: Service verifies CDN availability
6. **Job Completion**: Returns CDN URL via Redis completion message

## File Structure

```
emp-job-queue/
├── apps/
│   ├── machines/basic_machine/
│   │   ├── src/services/
│   │   │   ├── playwright-service.js          # NEW: Playwright service implementation
│   │   │   ├── comfyui-service.js             # REFERENCE: Similar pattern
│   │   │   └── base-service.js                # BASE: Service foundation
│   │   └── scripts/
│   │       └── pm2-ecosystem.config.cjs       # MODIFIED: Add Playwright services
│   └── worker/
│       └── src/connectors/
│           ├── playwright-connector.ts         # NEW: Playwright connector
│           ├── comfyui-connector.ts            # REFERENCE: Similar pattern
│           └── base-connector.ts               # BASE: Connector foundation
├── docs/
│   └── playwright-service-implementation.md   # THIS FILE
└── packages/core/
    └── src/types/                              # MODIFIED: Add Playwright job types
```

## Implementation Details

### 1. Playwright Service Implementation

**File**: `apps/machines/basic_machine/src/services/playwright-service.js`

```javascript
import { BaseService } from './base-service.js';
import express from 'express';
import { chromium } from 'playwright';
import fs from 'fs-extra';
import path from 'path';

export default class PlaywrightService extends BaseService {
  constructor(options = {}, config) {
    super('playwright', options);
    this.config = config;
    this.gpu = options.gpu || 0;
    this.port = (config.services.playwright?.basePort || 3000) + this.gpu;
    this.workDir = process.env.WORKSPACE_DIR ? `${process.env.WORKSPACE_DIR}` : `/workspace`;
    this.browser = null;
    this.contextPool = [];
    this.maxContexts = 4;
    this.app = null;
    this.server = null;
  }

  async onStart() {
    // 1. Setup Express server
    // 2. Launch GPU-accelerated browser
    // 3. Create context pool
    // 4. Setup API endpoints
    // 5. Start listening
  }

  // API Endpoints (matching current Puppeteer API)
  setupRoutes() {
    // POST /screenshot - P5.js image generation
    // POST /video - P5.js video generation  
    // POST /execute - General JS execution
    // GET /health - Health check
  }
}
```

### 2. PM2 Ecosystem Configuration

**File**: `apps/machines/basic_machine/scripts/pm2-ecosystem.config.cjs`

Add Playwright services following the exact ComfyUI pattern:

```javascript
// Playwright Service Instances (per GPU) - only if Playwright is enabled
if (process.env.ENABLE_PLAYWRIGHT === 'true') {
  for (let gpu = 0; gpu < gpuCount; gpu++) {
    const basePort = parseInt(process.env.PLAYWRIGHT_PORT_START || '3000');
    apps.push({
      ...generateServiceConfig('playwright', { gpu }),
      script: '/service-manager/src/services/standalone-wrapper.js',
      interpreter: 'node',
      args: ['playwright'],
      max_memory_restart: '4G', // Playwright can use significant memory
      env: {
        ...generateServiceConfig('playwright', { gpu }).env,
        STANDALONE_MODE: 'true',
        PLAYWRIGHT_PORT: basePort + gpu,
        PLAYWRIGHT_WORK_DIR: `/workspace`
      }
    });
  }
}
```

### 3. Playwright Connector Implementation

**File**: `apps/worker/src/connectors/playwright-connector.ts`

```typescript
import { JobData, JobResult, ProgressCallback, ServiceInfo, logger } from '@emp/core';
import { RestConnector, RestConnectorConfig } from './rest-connector.js';

export class PlaywrightConnector extends RestConnector {
  service_type = 'playwright' as const;
  version = '1.0.0';

  constructor(connectorId: string) {
    // Build configuration from environment (same pattern as ComfyUI)
    const host = process.env.WORKER_PLAYWRIGHT_HOST || 'localhost';
    const port = parseInt(process.env.WORKER_PLAYWRIGHT_PORT || '3000');

    const config: Partial<RestConnectorConfig> = {
      service_type: 'playwright',
      base_url: `http://${host}:${port}`,
      // ... rest of config
    };

    super(connectorId, config);
  }

  // Job type handlers
  async canProcessJob(jobData: JobData): Promise<boolean> {
    return ['p5js', 'javascript', 'video'].includes(jobData.job_type);
  }

  async processJobImpl(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    // Route to appropriate endpoint based on job type
    switch (jobData.job_type) {
      case 'p5js':
        return this.processP5Job(jobData, progressCallback);
      case 'javascript':
        return this.processJSJob(jobData, progressCallback);
      case 'video':
        return this.processVideoJob(jobData, progressCallback);
      default:
        throw new Error(`Unsupported job type: ${jobData.job_type}`);
    }
  }
}
```

### 4. Job Type Definitions

**File**: `packages/core/src/types/job-types.ts`

```typescript
// P5.js Image Generation Job
export interface P5JSJob {
  job_type: 'p5js';
  code: string;
  width?: number;
  height?: number;
  context?: {
    hash: string;
    variables: Record<string, any>;
    components: any[];
  };
  storage: {
    bucket: string;
    prefix: string;
    filename: string;
  };
}

// JavaScript Execution Job  
export interface JavaScriptJob {
  job_type: 'javascript';
  html: string;
  css: string;
  javascript: string;
  width?: number;
  height?: number;
  outputType: 'png' | 'html' | 'both';
  storage: {
    bucket: string;
    prefix: string;
    filename: string;
  };
}

// Video Generation Job
export interface VideoJob {
  job_type: 'video';
  code: string;
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  storage: {
    bucket: string;
    prefix: string;
    filename: string;
  };
}
```

## API Endpoints (Matching Current Puppeteer)

### POST /screenshot
```javascript
// Request body
{
  "code": "function setup() { createCanvas(800, 600); } function draw() { background(255); }",
  "width": 800,
  "height": 600,
  "context": {
    "hash": "abc123",
    "variables": { "color": "red" },
    "components": []
  }
}

// Response
{
  "success": true,
  "src": "https://cdn-dev.emprops.ai/user123/session456/output.png",
  "mimeType": "image/png"
}
```

### POST /video
```javascript
// Request body
{
  "id": "video-123",
  "code": "let t = 0; function setup() { createCanvas(800, 600); } function draw() { background(sin(t) * 255); t += 0.1; }",
  "duration": 5000,
  "fps": 30
}

// Response
{
  "success": true,
  "src": "https://cdn-dev.emprops.ai/user123/session456/output.mp4",
  "mimeType": "video/mp4"
}
```

### POST /execute
```javascript
// Request body
{
  "file": "console.log('Hello World');",
  "output": "image/png",
  "width": 800,
  "height": 600
}

// Response
{
  "success": true,
  "src": "https://cdn-dev.emprops.ai/user123/session456/output.png",
  "mimeType": "image/png"
}
```

## Browser Configuration

### GPU-Accelerated Playwright Setup

```javascript
const browserOptions = {
  args: [
    '--use-gl=desktop',
    '--enable-gpu-sandbox', 
    '--enable-webgl',
    '--enable-accelerated-2d-canvas',
    '--disable-web-security',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ],
  headless: true,
  viewport: { width: 1920, height: 1080 }
};
```

### Context Pool Management

```javascript
class ContextPool {
  constructor(browser, maxContexts = 4) {
    this.browser = browser;
    this.maxContexts = maxContexts;
    this.available = [];
    this.busy = new Set();
  }

  async getContext() {
    if (this.available.length > 0) {
      const context = this.available.pop();
      this.busy.add(context);
      return context;
    }

    if (this.busy.size < this.maxContexts) {
      const context = await this.browser.newContext();
      this.busy.add(context);
      return context;
    }

    // Wait for available context
    return new Promise((resolve) => {
      const checkAvailable = () => {
        if (this.available.length > 0) {
          const context = this.available.pop();
          this.busy.add(context);
          resolve(context);
        } else {
          setTimeout(checkAvailable, 100);
        }
      };
      checkAvailable();
    });
  }

  releaseContext(context) {
    this.busy.delete(context);
    this.available.push(context);
  }
}
```

## Integration with EmProps Open API

### Current Puppeteer Client Calls
```typescript
// src/modules/art-gen/nodes-v2/nodes/p5.ts
const image = await this.client.takeScreenshot(script);

// src/modules/art-gen/nodes-v2/nodes/p52vid.ts  
const video = await this.client.takeVideo(ctx.hash, script, payload.duration);
```

### New Redis Job Submission
```typescript
// Replace PuppeteerClient calls with Redis job submissions
import { RedisJobClient } from '@/clients/redis-job-client';

export class P5JsNode extends ImageNode {
  private jobClient: RedisJobClient;

  constructor(storageClient: StorageClient, jobClient: RedisJobClient) {
    super(storageClient);
    this.jobClient = jobClient;
  }

  async execute(ctx: Context, payload: { code: string }) {
    const job: P5JSJob = {
      job_type: 'p5js',
      code: payload.code,
      width: 800,
      height: 600,
      context: {
        hash: ctx.hash,
        variables: ctx.variables,
        components: ctx.outputs
      },
      storage: {
        bucket: process.env.AZURE_STORAGE_CONTAINER,
        prefix: `${ctx.userId}/${ctx.sessionId}`,
        filename: `${this.name}.png`
      }
    };

    // Submit job and wait for completion
    const result = await this.jobClient.submitJob(job);
    
    return {
      src: result.src,
      mimeType: result.mimeType
    };
  }
}
```

## Environment Variables

### Machine Configuration
```bash
# Enable Playwright services
ENABLE_PLAYWRIGHT=true

# Playwright service configuration
PLAYWRIGHT_PORT_START=3000
PLAYWRIGHT_MAX_CONTEXTS=4
PLAYWRIGHT_GPU_ACCELERATION=true
PLAYWRIGHT_TIMEOUT_SECONDS=300

# Azure storage (for direct uploads)
AZURE_STORAGE_ACCOUNT=empstartupstore
AZURE_STORAGE_KEY=...
AZURE_STORAGE_CONTAINER=...
CDN_URI=https://cdn-dev.emprops.ai
```

### Worker Configuration
```bash
# Playwright connector configuration
WORKER_PLAYWRIGHT_HOST=localhost
WORKER_PLAYWRIGHT_PORT=3000  # Will be set per GPU: 3000, 3001, 3002...
WORKER_PLAYWRIGHT_TIMEOUT_SECONDS=300
WORKER_PLAYWRIGHT_MAX_CONCURRENT_JOBS=1
```

## Performance Optimizations

### 1. Browser Context Pooling
- Pre-warm browser contexts to reduce startup time
- Reuse contexts for multiple jobs when possible
- Smart cleanup based on memory usage

### 2. GPU Acceleration
- Hardware-accelerated WebGL rendering
- GPU-accelerated video encoding with FFmpeg
- Canvas operations optimization

### 3. Parallel Processing
- Multiple browser contexts per service (per GPU)
- Concurrent job processing across contexts
- Load balancing across available contexts

### 4. Caching Strategies
- P5.js library caching for faster startup
- Template HTML caching
- DNS caching for CDN verification

## Testing Strategy

### Local Development Testing

```bash
# 1. Start full stack with Playwright enabled
ENABLE_PLAYWRIGHT=true pnpm dev:full-stack

# 2. Verify services start
pm2 list  # Should show playwright-gpu0, playwright-gpu1, etc.

# 3. Test service directly
curl http://localhost:3000/health

# 4. Submit test job via Redis
pnpm test:playwright-job

# 5. Verify job completion and CDN URL
```

### Integration Testing

```bash
# Test with EmProps Open API integration
# 1. Update API to use Redis job submission
# 2. Submit P5.js job via API
# 3. Verify job routes to Playwright service
# 4. Verify result uploaded to Azure/CDN
# 5. Verify API returns correct CDN URL
```

## Migration Plan

### Phase 1: Service Development (Week 1)
1. ✅ Create PlaywrightService class
2. ✅ Update PM2 ecosystem configuration
3. ✅ Create PlaywrightConnector
4. ✅ Test local service startup/shutdown

### Phase 2: Integration (Week 2)
1. ✅ Add job type definitions
2. ✅ Update worker job routing
3. ✅ Test end-to-end job processing
4. ✅ Performance benchmark vs external service

### Phase 3: API Migration (Week 3)
1. ✅ Create Redis job client for EmProps API
2. ✅ Update P5.js and video nodes
3. ✅ Test API integration
4. ✅ Gradual traffic migration

### Phase 4: Production Deployment (Week 4)
1. ✅ Deploy to staging environment
2. ✅ Performance and load testing
3. ✅ Production deployment
4. ✅ Monitor and optimize

## Success Metrics

### Performance Targets
- **Rendering Time**: 50% reduction vs external service
- **Latency**: Sub-100ms for local service calls (vs 200ms+ external)
- **Throughput**: Support 10x current job volume
- **Reliability**: 99.9% job completion rate

### Cost Targets
- **Infrastructure**: 30% reduction (eliminate Railway costs)
- **Network**: 80% reduction in data transfer costs
- **Resource**: Better GPU utilization across services

### Monitoring Metrics
- **Service Health**: Playwright service uptime per GPU
- **Job Processing**: Queue depth, processing time, success rates
- **Resource Usage**: CPU, memory, GPU utilization per service
- **Browser Health**: Context pool status, memory leaks, crashes

## Security Considerations

### Code Sandboxing
- JavaScript runs in isolated browser contexts
- No access to host filesystem or network
- Resource limits per job (memory, CPU, time)

### Storage Security
- Secure Azure storage credential management
- Pre-signed URLs for uploads
- Access control for generated content

### Input Validation
- Sanitize all user-provided code and parameters
- Validate job payload structure and size limits
- Rate limiting and abuse prevention

## Troubleshooting Guide

### Common Issues

#### Service Won't Start
```bash
# Check PM2 logs
pm2 logs playwright-gpu0

# Check port conflicts
netstat -tulpn | grep 3000

# Check browser launch
node -e "const { chromium } = require('playwright'); chromium.launch().then(b => b.close())"
```

#### Browser Crashes
```bash
# Check system resources
free -h
nvidia-smi  # GPU memory

# Check browser logs
tail -f /workspace/logs/playwright-gpu0-error.log

# Restart service
pm2 restart playwright-gpu0
```

#### Job Timeouts
```bash
# Check connector logs
grep "timeout" /workspace/logs/redis-worker-gpu0-combined.log

# Check service health
curl http://localhost:3000/health

# Increase timeout
export WORKER_PLAYWRIGHT_TIMEOUT_SECONDS=600
```

## North Star Alignment

This implementation advances the North Star architecture goals:

### ✅ Specialized Machine Pools
- **Heavy Pool Integration**: Playwright services ideal for Heavy Pool (video rendering)
- **Resource Optimization**: GPU-accelerated rendering optimized for different job types
- **Pool Specialization**: Video jobs can route specifically to Heavy Pool machines

### ✅ Predictive Model Management  
- **Asset Caching**: P5.js libraries and templates cached for faster startup
- **Context Pre-warming**: Browser contexts pre-warmed based on demand patterns
- **Resource Prediction**: Monitor usage patterns to optimize context pool sizes

### ✅ Distributed Architecture
- **No Shared Storage**: Each machine runs independent Playwright services
- **Ephemeral Scaling**: Services start/stop with machine lifecycle
- **Local Processing**: No external service dependencies

### ✅ Performance Optimization
- **Elimination of Network Latency**: Local service calls vs external API calls
- **GPU Acceleration**: Hardware-accelerated rendering
- **Resource Efficiency**: Better utilization of local machine resources

This Playwright service implementation provides a foundation for specialized video rendering pools while maintaining compatibility with the existing job queue architecture and advancing toward the North Star vision of intelligent, specialized machine pools.