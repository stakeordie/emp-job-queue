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

### Implementation Structure

**Integration with Existing Machine Architecture**:
```
apps/worker/src/connectors/
└── playwright-connector.ts          # New connector implementation

apps/machine/src/services/
└── playwright-management-client.js  # Service installation & PM2 management

apps/machine/src/config/
└── service-mapping.json            # Add playwright service configuration
```

**Service Installation Components**:
```typescript
// apps/machine/src/services/playwright-management-client.js
class PlaywrightManagementClient {
  async install() {
    // 1. Install Playwright browsers (chromium, firefox, webkit)
    // 2. Configure GPU detection and browser flags
    // 3. Set up browser binary paths and permissions
    // 4. Verify browser installations
  }

  async createServiceInstances(workerSpecs) {
    // 1. Generate PM2 ecosystem config for each worker
    // 2. Configure environment variables per instance
    // 3. Set up browser instance isolation
    // 4. Configure GPU allocation if available
  }

  async startServices() {
    // 1. Start PM2 processes: playwright-worker-0, playwright-worker-1, etc.
    // 2. Each PM2 process runs redis-direct-worker with PlaywrightConnector
    // 3. Health check browser instances
    // 4. Register with Redis queue
  }
}
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

  // GPU resource requirements
  usesWebGL: boolean;              // WebGL/3D graphics flag
  gpuComplexity: 'low' | 'medium' | 'high';  // Resource estimation
  estimatedGPUMemory?: number;     // MB estimate for complex jobs

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

## Worker Architecture

### Single-Job Worker Pattern
Following the existing emp-job-queue worker architecture:
- **One job per worker**: Each playwright worker handles one P5.js job at a time
- **Multiple workers**: Scale through worker count, not internal concurrency
- **Resource isolation**: Each worker has dedicated browser instance and GPU allocation
- **Simple failure recovery**: Worker failures don't affect other jobs

### GPU Resource Constraints

#### WebGL P5.js Jobs
P5.js sketches using WebGL create GPU contexts with shared memory constraints:
- **GPU Memory Sharing**: Multiple WebGL contexts compete for VRAM
- **Context Limits**: Typically 16-32 concurrent WebGL contexts per GPU
- **Resource Allocation**: ~1-2GB GPU memory per complex WebGL sketch

#### CPU-Only P5.js Jobs
Non-WebGL P5.js sketches have minimal GPU requirements:
- **Browser Rendering**: Software-based canvas operations
- **High Concurrency**: Limited only by CPU and RAM
- **Memory Usage**: ~50-100MB per sketch context

### Worker Configuration Strategy

```bash
# GPU-bound WebGL P5.js (8GB GPU machine)
WORKERS="comfyui:2,playwright:4"  # 4 playwright workers, ~1.5GB GPU each

# CPU-only P5.js (16GB CPU machine)
WORKERS="playwright:12"           # 12 workers, ~1GB RAM each

# Mixed workload (32GB GPU machine)
WORKERS="comfyui:2,playwright:8"  # Balance GPU between services
```

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

# Worker Configuration
WORKERS="playwright:8"            # Number of playwright workers
GPU_ACCELERATION=auto            # Auto-detect GPU availability
BROWSER_TIMEOUT=30000            # Browser instance timeout

# Service Configuration
SERVICE_ID=playwright-worker-1
LOG_LEVEL=info
```

### Service Mapping Configuration

**Add to `apps/machine/src/config/service-mapping.json`**:
```json
{
  "services": {
    "playwright": {
      "connector": "PlaywrightConnector",
      "type": "internal",
      "installer": "PlaywrightManagementClient",
      "installer_filename": "./services/playwright-management-client.js",
      "is_gpu_bound": false,
      "build_stage": "playwright",
      "service_instances_per_machine": "${PLAYWRIGHT_INSTANCES_PER_MACHINE:-8}",
      "ports": ["${PLAYWRIGHT_BASE_PORT:-9200}"],
      "port_increment": "${PLAYWRIGHT_PORT_INCREMENT:-1}",
      "description": "Playwright P5.js and JavaScript rendering service",
      "installer_config": {
        "browsers": "${PLAYWRIGHT_BROWSERS:-chromium}",
        "gpu_detection": "${PLAYWRIGHT_GPU_DETECTION:-auto}",
        "browser_timeout": "${PLAYWRIGHT_BROWSER_TIMEOUT:-30000}",
        "install_timeout": "${PLAYWRIGHT_INSTALL_TIMEOUT:-300}"
      },
      "telemetry_logs": [
        {
          "path": "/workspace/logs/playwright-*.log",
          "name": "playwright-main",
          "description": "Playwright browser automation and P5.js rendering logs"
        },
        {
          "path": "/workspace/logs/playwright-errors-*.log",
          "name": "playwright-errors",
          "description": "Playwright browser crashes and rendering errors"
        }
      ]
    }
  },

  "connectors": {
    "PlaywrightConnector": {
      "path": "./redis-direct-worker.js",
      "description": "Playwright browser automation for P5.js and JavaScript rendering"
    }
  }
}
```

### PM2 Process Configuration

**Generated by playwright-management-client.js**:
```json
{
  "apps": [
    {
      "name": "playwright-worker-0",
      "script": "./redis-direct-worker.js",
      "cwd": "/workspace/worker",
      "env": {
        "WORKER_TYPE": "playwright",
        "INSTANCE_ID": "0",
        "GPU_AVAILABLE": "true",
        "BROWSER_EXECUTABLE_PATH": "/workspace/playwright/chromium/chrome",
        "PLAYWRIGHT_PORT": "9200"
      },
      "log_file": "/workspace/logs/playwright-worker-0.log",
      "error_file": "/workspace/logs/playwright-worker-0-error.log"
    }
  ]
}
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

### Browser Instance Management
- One dedicated browser instance per worker
- Fast browser startup with optimized flags
- Graceful browser restart on memory leaks
- Process isolation for failure recovery

### GPU Resource Management

#### Auto-Detection and Configuration
```typescript
const gpuAvailable = await detectGPU();
const browserOptions = {
  args: gpuAvailable ? [
    '--use-gl=desktop',
    '--enable-gpu-sandbox',
    '--enable-webgl',
    '--enable-accelerated-2d-canvas'
  ] : [
    '--disable-gpu',
    '--disable-software-rasterizer'
  ]
};
```

#### WebGL Resource Allocation
- Monitor GPU memory usage per worker
- Intelligent job routing based on WebGL requirements
- Fallback to CPU rendering for resource-constrained scenarios

### Worker Scaling Strategy
- **CPU Pool**: High worker count for non-WebGL P5.js jobs
- **GPU Pool**: Limited workers sharing GPU memory efficiently
- **Dynamic Scaling**: Adjust worker count based on job queue depth and type

### Caching Optimizations
- Browser binary caching for faster startup
- P5.js library caching to reduce download time
- Template caching for common sketch patterns
- DNS caching for CDN verification

## Implementation Phases

### Phase 0: Proof of Concept (POC)
**Standalone Service Development**:
```
playwright-poc/
├── src/
│   ├── playwright-worker.ts     # Simple Redis worker
│   ├── p5-renderer.ts          # Core P5.js execution logic
│   ├── job-processor.ts        # Job format handling
│   └── browser-manager.ts      # Basic browser lifecycle
├── test-jobs/
│   ├── simple-p5.json         # Non-WebGL P5.js test
│   ├── webgl-p5.json          # WebGL rendering test
│   ├── complex-animation.json  # Performance stress test
│   └── error-cases.json       # Error handling validation
├── docker-compose.yml         # Local Redis + playwright service
└── README.md                  # POC setup and testing guide
```

**POC Objectives**:
1. **Core Functionality**: Validate P5.js code execution and screenshot capture
2. **GPU Testing**: Verify WebGL vs CPU rendering performance and compatibility
3. **Job Format**: Test job format compatibility with emprops-open-api expectations
4. **Performance Baseline**: Establish rendering time benchmarks
5. **Error Handling**: Validate browser crash recovery and timeout handling

**Test Job Examples**:
```typescript
// Simple CPU P5.js test
{
  "type": "p5",
  "code": "function setup(){createCanvas(400,400);} function draw(){background(220);ellipse(200,200,100,100);}",
  "width": 400,
  "height": 400,
  "usesWebGL": false,
  "timeout": 10000
}

// WebGL P5.js test
{
  "type": "p5",
  "code": "function setup(){createCanvas(400,400,WEBGL);} function draw(){background(0);rotateY(frameCount*0.01);box(100);}",
  "width": 400,
  "height": 400,
  "usesWebGL": true,
  "gpuComplexity": "medium",
  "timeout": 15000
}
```

**Local Testing Workflow**:
```bash
# 1. Start POC environment
cd playwright-poc
docker-compose up -d

# 2. Submit test jobs
redis-cli lpush "p5-jobs" "$(cat test-jobs/simple-p5.json)"
redis-cli lpush "p5-jobs" "$(cat test-jobs/webgl-p5.json)"

# 3. Monitor results
redis-cli brpop "p5-results" 10

# 4. Validate outputs
ls output/screenshots/  # Check generated images
```

**Success Criteria**:
- ✅ All test jobs execute without browser crashes
- ✅ Screenshots generated match expected P5.js output
- ✅ WebGL jobs render correctly with GPU acceleration
- ✅ CPU fallback works when GPU unavailable
- ✅ Performance meets baseline: <5s for simple jobs, <15s for complex
- ✅ Error handling graceful for malformed code
- ✅ Memory usage stable across multiple job cycles

**POC Deliverables**:
- Working standalone playwright service
- Comprehensive test suite with various P5.js scenarios
- Performance benchmarks and resource usage analysis
- Documentation of technical limitations and edge cases
- Recommendations for full integration approach

### Phase 1: Connector & Service Development
**Worker Integration**:
1. Create `PlaywrightConnector` in `apps/worker/src/connectors/`
2. Implement P5.js code execution and screenshot capture
3. Add Azure storage integration and CDN verification
4. Integrate with existing Redis job queue system

**Service Management**:
1. Create `PlaywrightManagementClient` in `apps/machine/src/services/`
2. Implement browser installation (Playwright browsers: chromium, firefox, webkit)
3. Add GPU detection and browser configuration logic
4. Create PM2 ecosystem generation for worker instances

**Configuration**:
1. Add playwright service entry to `service-mapping.json`
2. Configure telemetry logging and health checks
3. Set up environment variable handling
4. Add Docker build stage for playwright dependencies

### Phase 2: Machine Integration & Testing
**Development Deployment**:
1. Update machine Docker images with playwright build stage
2. Deploy to development worker machines with `WORKERS="playwright:4"`
3. Test service installer and PM2 process management
4. Verify browser installation and GPU detection

**Job Processing Testing**:
1. Update emprops-open-api to submit P5.js jobs to Redis queue
2. Test WebGL vs CPU-only P5.js job routing
3. Performance testing: job throughput and rendering time
4. Validate Azure storage uploads and CDN verification

### Phase 3: Production Deployment & Migration
**Gradual Rollout**:
1. Deploy playwright service to production worker machines
2. Implement dual-mode: route simple P5.js to playwright, complex to Puppeteer
3. Monitor job completion rates and error patterns
4. Gradual traffic migration from external Puppeteer service

**Service Monitoring**:
1. Set up playwright-specific monitoring dashboards
2. Track GPU memory usage and browser crash rates
3. Monitor Redis queue depth and worker utilization
4. Implement alerting for service failures

### Phase 4: Optimization & Scaling
**Performance Optimization**:
1. Fine-tune worker count based on machine GPU/CPU resources
2. Optimize browser startup time and memory usage
3. Implement intelligent job routing based on WebGL complexity
4. Add browser binary caching and P5.js library optimization

**Advanced Features**:
1. Dynamic worker scaling based on queue depth
2. Specialized machine pools for WebGL vs CPU P5.js workloads
3. Advanced monitoring with browser performance metrics
4. Decommission external Puppeteer service completely

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