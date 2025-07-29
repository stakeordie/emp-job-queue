# Playwright Service Architecture

**Status**: Completed (moved from plans/completed)  
**Priority**: Medium  
**Estimated Time**: 2-3 weeks  
**Dependencies**: Worker machines, Azure Storage, Redis

## Overview

Create a standalone Playwright service to replace the current external Puppeteer service for P5.js and JavaScript rendering. The service runs locally on worker machines, leveraging GPU acceleration for improved performance.

## Architecture Evolution

### Current Architecture
```
API → External Puppeteer Service → API → Redis Queue → ComfyUI Worker
```

**Problems with current approach:**
- External service dependency creates network latency
- Single point of failure
- Higher infrastructure costs
- No GPU acceleration
- Network overhead for large results

### Target Architecture
```
API → Redis Queue → Playwright Worker → Azure Storage → CDN URL
```

**Benefits:**
- Local GPU-accelerated rendering
- No external service dependency
- Reduced network latency
- Better resource utilization
- Direct Azure storage integration

## Service Architecture

### Repository Structure

```
emprops-playwright-service/
├── package.json
├── docker-compose.yml
├── Dockerfile
├── src/
│   ├── index.ts                # Main Redis worker entry point
│   ├── services/
│   │   ├── playwright-renderer.ts    # Core rendering logic
│   │   ├── azure-storage.ts          # Azure upload handling
│   │   └── cdn-verifier.ts           # CDN availability verification
│   ├── browser/
│   │   ├── context-pool.ts           # Browser context management
│   │   └── gpu-config.ts             # GPU acceleration setup
│   ├── templates/
│   │   ├── p5-template.html          # P5.js execution template
│   │   └── js-template.html          # General JS template
│   └── utils/
│       ├── job-processor.ts          # Redis job handling
│       └── logger.ts                 # Logging utilities
├── config/
│   ├── browser-config.ts             # Browser launch configuration
│   └── environment.ts               # Environment variables
└── README.md
```

### Job Processing Flow

1. **Job Reception**: Redis worker picks up P5.js/JS rendering jobs
2. **Browser Launch**: Playwright creates GPU-accelerated browser context
3. **Code Execution**: JavaScript/P5.js code runs in browser environment
4. **Content Capture**: Screenshots, videos, or HTML captured as needed
5. **Azure Upload**: Results uploaded directly to Azure storage
6. **CDN Verification**: Verify content availability via CDN
7. **Result Return**: Return CDN URLs via Redis

### Job Types

#### P5.js Rendering
```typescript
interface P5Job {
  type: 'p5';
  code: string;
  width: number;
  height: number;
  bucket: string;
  prefix: string;
  filename: string;
  context?: {
    hash: string;
    variables: Record<string, any>;
    components: any[];
  };
}
```

#### JavaScript Execution
```typescript
interface JSJob {
  type: 'js';
  html: string;
  css: string;
  javascript: string;
  width: number;
  height: number;
  outputType: 'png' | 'html' | 'both';
  bucket: string;
  prefix: string;
  filename: string;
}
```

#### Video Recording
```typescript
interface VideoJob {
  type: 'video';
  code: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  bucket: string;
  prefix: string;
  filename: string;
}
```

## Browser Configuration

```typescript
// GPU-accelerated browser setup
const browserOptions = {
  args: [
    '--use-gl=desktop',
    '--enable-gpu-sandbox',
    '--enable-webgl',
    '--enable-accelerated-2d-canvas',
    '--disable-web-security',
    '--disable-dev-shm-usage',
    '--no-sandbox'
  ],
  headless: true
};
```

## Context Pool Management

- Maintain pool of browser contexts for performance
- Reuse contexts when possible to reduce startup time
- Cleanup contexts after job completion
- Monitor memory usage and restart contexts as needed

## Deployment Architecture

### Worker Machine Setup

Each worker machine runs:
- **ComfyUI** (existing, port 8188)
- **Playwright Service** (new, Redis worker)
- **Shared GPU access** between both services

### Environment Variables

```bash
# Azure Storage Configuration
AZURE_STORAGE_ACCOUNT=empstartupstore
AZURE_STORAGE_KEY=...
CDN_URI=https://cdn-dev.emprops.ai

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_QUEUE_NAME=playwright-jobs

# Browser Configuration
BROWSER_POOL_SIZE=4
GPU_ACCELERATION=true
CONTEXT_TIMEOUT=300000

# Service Configuration
SERVICE_ID=playwright-worker-1
LOG_LEVEL=info
```

### Docker Configuration

```yaml
# docker-compose.yml
services:
  playwright-service:
    build: .
    environment:
      - AZURE_STORAGE_ACCOUNT=${AZURE_STORAGE_ACCOUNT}
      - AZURE_STORAGE_KEY=${AZURE_STORAGE_KEY}
      - CDN_URI=${CDN_URI}
      - REDIS_URL=${REDIS_URL}
    devices:
      - /dev/dri:/dev/dri  # GPU access
    volumes:
      - /tmp/.X11-unix:/tmp/.X11-unix
    depends_on:
      - redis
```

## Integration Points

### API Integration

The emprops-open-api submits jobs to Redis queue instead of calling external service:

```typescript
// Replace current Puppeteer calls
const job = {
  type: 'p5',
  code: userCode,
  width: 800,
  height: 800,
  bucket: process.env.AZURE_STORAGE_CONTAINER,
  prefix: `${userId}/${sessionId}`,
  filename: 'output.png'
};

await redisClient.lpush('playwright-jobs', JSON.stringify(job));
```

### Result Handling

Jobs return CDN URLs directly:

```typescript
interface JobResult {
  success: boolean;
  src?: string;          // CDN URL for image/video
  htmlSrc?: string;      // CDN URL for HTML file
  mimeType?: string;
  error?: string;
}
```

### Monitoring Integration

The service integrates with existing monitoring:
- Health check endpoints
- Job processing metrics
- Performance monitoring
- Error reporting

## Performance Optimizations

### Browser Context Pooling
- Pre-warm browser contexts
- Reuse contexts for multiple jobs
- Smart cleanup based on memory usage

### GPU Acceleration
- Hardware-accelerated WebGL rendering
- GPU-accelerated video encoding
- Canvas operations optimization

### Parallel Processing
- Multiple browser contexts per worker
- Concurrent job processing
- Load balancing across contexts

### Caching
- Template caching for faster startup
- Asset caching for common libraries
- DNS caching for CDN verification

## Implementation Phases

### Phase 1: Service Development
1. Create new repository: `emprops-playwright-service`
2. Implement core Redis worker functionality
3. Add browser context management
4. Implement Azure storage integration
5. Add CDN verification logic

### Phase 2: Testing & Integration
1. Deploy service on development worker machines
2. Update API to submit jobs to Redis queue
3. Test with existing P5.js/JS workloads
4. Performance benchmarking vs current system

### Phase 3: Production Deployment
1. Deploy to production worker machines
2. Migrate traffic from external Puppeteer service
3. Monitor performance and stability
4. Decommission external service

### Phase 4: Optimization
1. Fine-tune browser context pooling
2. Optimize GPU acceleration settings
3. Implement advanced caching strategies
4. Add detailed monitoring and alerting

## Success Metrics

- **Performance**: 50% reduction in rendering time
- **Reliability**: 99.9% job completion rate
- **Cost**: 30% reduction in infrastructure costs
- **Scalability**: Support for 10x current workload
- **Latency**: Sub-100ms local service calls

## Security Considerations

- **Code Sandboxing**: JavaScript runs in isolated browser contexts
- **Resource Limits**: Memory and CPU limits per job
- **Storage Security**: Secure Azure storage credential management
- **Network Isolation**: No external network access from executed code
- **Input Validation**: Sanitize all user-provided code and parameters

## Monitoring and Observability

- **Job Processing Metrics**: Queue depth, processing time, success rates
- **Resource Usage**: CPU, memory, GPU utilization
- **Browser Health**: Context pool status, memory leaks
- **Storage Operations**: Upload success rates, CDN verification
- **Error Tracking**: Failed jobs, browser crashes, timeouts

---

*This architecture provides a robust, performant, and cost-effective solution for JavaScript and P5.js rendering while maintaining the existing job queue infrastructure and improving overall system reliability.*