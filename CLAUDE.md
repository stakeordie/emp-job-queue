# CLAUDE.md - JavaScript Rebuild of emp-redis

This file provides guidance to Claude Code when working on the JavaScript/TypeScript rebuild of the emp-redis system.

## RULES

### Task Management Workflow
When given a task, analyze and respond with:
1. "Here's the prompt I would execute:"
2. [Complete optimized prompt]
3. "This will use: [MCP servers/tools needed]"
4. "Should I proceed? (y/n)"

**MCP Server Usage:**
- Playwright MCP for UI changes and testing
- Shopify MCP for Shopify-specific development
- Always specify which servers will be used
  
**Auto-execution:** Add `-y` to prompt for immediate execution after confirmation

### Context Files
- Always read `CHANGELOG.md` for project context
- Check `tasks/todo.md` for current priorities and next steps

### commit process 
- pnpm lint -> fix -> repeat
- npx tsc -> fix -> repeat
- tasks/todo.md
- CHANGELOG.md
- git add .
- git commit -m "complete message"
- "tell me to push"


## Project Overview

This is a complete rebuild of the Python-based emp-redis system into JavaScript/TypeScript, maintaining the proven pull-based job broker architecture while improving developer experience and deployment.

## Goals of the Rebuild

### 1. Language Migration
- **From**: Python-based system with complex imports and deployment issues
- **To**: TypeScript/Node.js with modern tooling and easier deployment
- **Keep**: All the proven architectural patterns and job selection logic

### 2. Architecture Improvements
- **Pull-based job selection**: Workers actively request jobs they can handle
- **Dynamic capability matching**: Real-time filtering based on models, hardware, availability
- **Priority + FIFO**: Highest priority first, then oldest within priority level
- **Multi-service support**: ComfyUI, A1111, and other AI service connectors
- **Flexible worker deployment**: Easy GPU server setup with single download

### 3. Developer Experience
- **TypeScript**: Full type safety and better IDE support
- **Modern tooling**: pnpm, esbuild, proper package management
- **Clean interfaces**: Well-defined contracts between components
- **Better error handling**: Structured logging and debugging

## Architecture Components

### Core System (Redis-based Job Broker)
```
├── core/
│   ├── JobBroker.ts          # Redis-based job queue and matching
│   ├── WorkerRegistry.ts     # Worker capability tracking
│   ├── JobMatcher.ts         # Multi-dimensional job-worker matching
│   ├── MessageRouter.ts      # WebSocket/Redis message routing
│   └── types/
│       ├── Job.ts            # Job request/response types
│       ├── Worker.ts         # Worker capability types
│       └── Message.ts        # WebSocket message types
```

### Hub Service (Central Orchestrator)
```
├── hub/
│   ├── HubServer.ts          # FastAPI equivalent - job submission API
│   ├── WebSocketManager.ts   # Real-time worker communication
│   ├── JobQueue.ts           # Redis-based priority job queue
│   └── Dashboard.ts          # Monitoring and admin interface
```

### Worker System (Distributed Processors)
```
├── worker/
│   ├── BaseWorker.ts         # Core worker logic and job processing
│   ├── ConnectorManager.ts   # Dynamic connector loading
│   ├── connectors/
│   │   ├── BaseConnector.ts  # Abstract connector interface
│   │   ├── ComfyUIConnector.ts
│   │   ├── A1111Connector.ts
│   │   └── SimulationConnector.ts
│   └── WorkerClient.ts       # WebSocket client for hub communication
```

### Deployment
```
├── apps/
│   ├── standalone-hub/       # Hub deployment package
│   ├── standalone-worker/    # Worker deployment package
│   └── docker/              # Container deployment
```

## Key Design Decisions

### 1. Job Selection Model
**Pull-based**: Workers query the job broker: "What's the highest priority job I can handle?"
- Workers send capability queries to Redis-based job broker
- Broker returns job ID + job data for best matching job
- Worker processes job and reports progress/completion
- True priority ordering with FIFO within priority

### 2. Capability Matching
**Multi-dimensional scoring** similar to existing emp-bullmq:
- Service type (comfyui, a1111, etc.)
- Hardware requirements (GPU memory, CPU, etc.)
- Model availability (specific models loaded on worker)
- Customer isolation (strict/loose/none)
- Geographic/compliance constraints
- Cost efficiency
- Current worker load

### 3. Redis Data Structures
**Efficient job storage and retrieval**:
- `jobs:pending` - Sorted set ordered by priority + timestamp
- `jobs:active` - Hash of active jobs by worker ID
- `jobs:completed` - TTL-based completed job storage
- `workers:active` - Worker capability registry
- `workers:heartbeat` - Worker health tracking

### 4. TypeScript Architecture
**Clean separation of concerns**:
- Interfaces define contracts
- Dependency injection for testability
- Event-driven communication
- Proper error handling and logging

## Development Commands

### Setup
```bash
# Install dependencies
pnpm install

# Clean install if needed
pnpm install:clean

# Build entire project
pnpm build

# Build specific components
pnpm build:hub     # Hub only
pnpm build:worker  # Worker only
pnpm build:core    # Shared core only
```

### Development
```bash
# Start development hub
pnpm dev:hub

# Start development worker
pnpm dev:worker

# Run tests
pnpm test
pnpm test:watch
pnpm test:coverage
```

### Deployment
```bash
# Create release packages
pnpm package:hub     # Hub deployment package
pnpm package:worker  # Worker deployment package

# Docker builds
pnpm docker:build
pnpm docker:up
```

## Configuration

### Environment Variables

#### Hub Configuration
```env
# Redis connection
REDIS_URL=redis://localhost:6379

# API server
HUB_PORT=3001
HUB_HOST=0.0.0.0

# WebSocket
WS_PORT=3002
WS_AUTH_TOKEN=secret

# Job processing
MAX_JOB_TIMEOUT_MINUTES=30
DEFAULT_JOB_PRIORITY=50
```

#### Worker Configuration
```env
# Hub connection
HUB_REDIS_URL=redis://hub-host:6379
HUB_WS_URL=ws://hub-host:3002
HUB_AUTH_TOKEN=secret

# Worker identity
WORKER_ID=gpu-worker-01
WORKER_TYPE=gpu

# Service configuration
SERVICES=comfyui,a1111
COMFYUI_URL=http://localhost:8188
A1111_URL=http://localhost:7860

# Hardware specs
GPU_COUNT=1
GPU_MEMORY_GB=16
GPU_MODEL=RTX 4090
CPU_CORES=8
RAM_GB=32
```

## Migration Notes

### From Python emp-redis
1. **Message types**: Convert Python message classes to TypeScript interfaces
2. **Connector interface**: Port Python connector pattern to TypeScript
3. **Redis operations**: Use ioredis instead of redis-py
4. **WebSocket handling**: Use ws library instead of Python websockets
5. **Job lifecycle**: Maintain same state transitions and progress reporting

### From emp-bullmq
1. **Worker capabilities**: Enhanced capability matching from JobMatcher
2. **Monitoring**: Better dashboards and metrics collection
3. **Deployment**: Improved release packaging and PM2 integration
4. **Testing**: Comprehensive test suite for job routing and worker management

## Testing Strategy

### Unit Tests
- Job matching algorithms
- Worker capability validation
- Message routing logic
- Connector implementations

### Integration Tests
- Full job lifecycle (submit → match → process → complete)
- Worker registration and heartbeat
- Multi-worker job distribution
- Priority and FIFO ordering

### Load Tests
- High job throughput
- Many concurrent workers
- Job backlog processing
- Worker failure recovery

## Success Metrics

1. **Job Selection**: Workers can filter and select appropriate jobs
2. **Priority Handling**: High priority jobs processed first
3. **FIFO Ordering**: Same priority jobs processed oldest-first
4. **Multi-Service**: Single worker handles multiple service types
5. **Dynamic Matching**: Real-time capability-based job assignment
6. **Easy Deployment**: Single download/extract/run for workers
7. **Type Safety**: Full TypeScript coverage with strict checking
8. **Performance**: Sub-second job matching and assignment

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Redis job broker implementation
- [ ] Worker registry and capability matching
- [ ] Basic message routing
- [ ] TypeScript type definitions

### Phase 2: Hub Service
- [ ] Job submission API
- [ ] WebSocket worker communication
- [ ] Priority queue management
- [ ] Basic monitoring dashboard

### Phase 3: Worker System
- [ ] Base worker implementation
- [ ] Connector system
- [ ] ComfyUI and A1111 connectors
- [ ] Worker deployment packaging

### Phase 4: Testing & Polish
- [ ] Comprehensive test suite
- [ ] Performance optimization
- [ ] Documentation
- [ ] Release automation

This rebuild will provide a modern, maintainable, and efficient job broker system that preserves all the benefits of the Python emp-redis while being much easier to develop, deploy, and maintain.