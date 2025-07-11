# Basic Machine - Modern GPU Infrastructure

## Overview

The `basic_machine` is a complete refactor of `base_machine` using modern Node.js tooling and container-native design principles. This machine provides the same AI service infrastructure but with improved reliability, observability, and maintainability.

## Goals

### Primary Objectives
- **Replace 2600-line bash script** with structured Node.js service orchestration
- **Improve debugging and observability** with structured logging and real-time monitoring
- **Enable parallel service startup** for faster boot times
- **Add comprehensive health checks** and automatic recovery
- **Provide testable, modular architecture** for easier maintenance

### Technical Improvements
- **Error Handling**: Proper try/catch with detailed error context
- **Process Management**: Graceful shutdown and automatic service recovery
- **Configuration**: JSON-based configuration with validation
- **Logging**: Structured logs with correlation IDs and service context
- **Monitoring**: Built-in health endpoints and metrics collection

## Architecture

### Technology Stack
- **Runtime**: Node.js 18+ with ES modules
- **Process Management**: PM2 for service lifecycle
- **Logging**: Winston with structured JSON output
- **HTTP Client**: Axios for health checks and downloads
- **File Operations**: fs-extra for robust file handling
- **Configuration**: Joi for schema validation
- **Container**: Multi-stage Docker build

### Service Architecture
```
Service Orchestrator
├── GPU Manager (allocates GPU resources)
├── Port Manager (manages port allocation)
├── Health Manager (monitors service health)
└── Services
    ├── NGINX (reverse proxy)
    ├── ComfyUI (per-GPU instances)
    ├── Automatic1111 (per-GPU instances)
    ├── Redis Workers (per-GPU instances)
    └── Ollama (single instance)
```

### Directory Structure
```
basic_machine/
├── Dockerfile                   # Multi-stage Node.js + PyTorch
├── docker-compose.yml          # Development environment
├── package.json                # Node.js dependencies
├── PLAN.md                     # This document
├── README.md                   # Usage instructions
├── src/
│   ├── index.js                # Main entry point
│   ├── orchestrator.js         # Service coordinator
│   ├── config/
│   │   ├── services.json       # Service definitions
│   │   ├── environment.js      # Environment validation
│   │   └── schema.js           # Configuration schemas
│   ├── services/               # Service implementations
│   │   ├── base-service.js     # Abstract service class
│   │   ├── comfyui-service.js  # ComfyUI management
│   │   ├── a1111-service.js    # Automatic1111 management
│   │   ├── nginx-service.js    # NGINX management
│   │   ├── redis-worker.js     # Redis worker management
│   │   └── ollama-service.js   # Ollama management
│   ├── managers/               # Cross-cutting concerns
│   │   ├── gpu-manager.js      # GPU allocation/monitoring
│   │   ├── port-manager.js     # Port allocation
│   │   ├── health-manager.js   # Health monitoring
│   │   └── process-manager.js  # Process lifecycle
│   └── utils/
│       ├── logger.js           # Structured logging
│       ├── download.js         # File download utilities
│       ├── file-utils.js       # File operations
│       └── network-utils.js    # Network utilities
├── scripts/                    # Setup and maintenance scripts
│   ├── download-models.js      # Model synchronization
│   ├── setup-directories.js   # Directory initialization
│   └── health-check.js         # External health check
├── config/                     # Configuration templates
│   ├── nginx.conf.template     # NGINX configuration
│   ├── comfyui.yaml.template   # ComfyUI configuration
│   └── services.json           # Default service configuration
├── tests/                      # Test suite
│   ├── unit/
│   │   ├── services/
│   │   └── managers/
│   ├── integration/
│   └── fixtures/
└── docs/                       # Documentation
    ├── api.md                  # API documentation
    ├── configuration.md        # Configuration guide
    └── troubleshooting.md      # Common issues
```

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal**: Basic Node.js infrastructure with logging and configuration

**Deliverables**:
- [ ] Project structure and package.json
- [ ] Basic Dockerfile with Node.js + PyTorch
- [ ] Logging system with Winston
- [ ] Configuration system with validation
- [ ] Basic orchestrator shell
- [ ] Unit test framework setup

**Success Criteria**:
- Container builds successfully
- Logs are structured and readable
- Configuration validation works
- Basic health endpoint responds

### Phase 2: Redis Workers (Week 2)
**Goal**: Migrate Redis worker management from bash to Node.js

**Deliverables**:
- [ ] RedisWorkerService implementation
- [ ] Worker package download and extraction
- [ ] Per-GPU worker configuration
- [ ] Worker process management
- [ ] Worker health monitoring

**Success Criteria**:
- Workers download and start automatically
- Workers connect to Railway Redis
- Worker logs are captured and structured
- Workers restart on failure

### Phase 3: AI Services (Week 3)
**Goal**: ComfyUI and Automatic1111 service management

**Deliverables**:
- [ ] ComfyUIService implementation
- [ ] Automatic1111Service implementation
- [ ] GPU allocation management
- [ ] Port allocation management
- [ ] Service health checks

**Success Criteria**:
- ComfyUI starts on correct ports per GPU
- A1111 starts on correct ports per GPU
- Services are accessible via HTTP
- Health checks detect service status

### Phase 4: Infrastructure Services (Week 4)
**Goal**: NGINX, Ollama, and supporting services

**Deliverables**:
- [ ] NGINXService with dynamic configuration
- [ ] OllamaService implementation
- [ ] Model download and synchronization
- [ ] Directory setup automation

**Success Criteria**:
- NGINX routes requests to correct services
- Ollama starts and serves models
- Models are downloaded and accessible
- All services start in correct order

### Phase 5: Monitoring & Operations (Week 5)
**Goal**: Production-ready monitoring and operational features

**Deliverables**:
- [ ] Comprehensive health monitoring
- [ ] Metrics collection and export
- [ ] Graceful shutdown handling
- [ ] Service recovery mechanisms
- [ ] API endpoints for service management

**Success Criteria**:
- All services report health status
- Metrics are exported for monitoring
- Services shutdown gracefully
- Failed services restart automatically
- Remote service management works

### Phase 6: Testing & Documentation (Week 6)
**Goal**: Comprehensive testing and documentation

**Deliverables**:
- [ ] Unit tests for all services
- [ ] Integration tests for service interactions
- [ ] Load testing for service startup
- [ ] API documentation
- [ ] Troubleshooting guides

**Success Criteria**:
- Test coverage > 80%
- All integration tests pass
- Documentation is complete
- Common issues are documented

### Phase 7: Worker Discovery & Real-time Monitoring (Week 7)
**Goal**: Enhanced worker visibility during startup and operation

**Deliverables**:
- [ ] Worker startup broadcast system via Redis pub/sub
- [ ] Monitor integration for discovering workers during boot
- [ ] Real-time worker status updates (booting, downloading, configuring, ready)
- [ ] Worker lifecycle events (started, health_check, error, stopped)
- [ ] Monitor UI updates to show pending workers
- [ ] Historical worker startup metrics

**Technical Approach**:
- Workers publish to `worker:announce` channel on startup
- Broadcast includes: worker_id, gpu, status, progress, eta
- Monitor subscribes to worker channels for real-time updates
- Status progression: `announcing` → `downloading` → `configuring` → `starting` → `ready`
- Failed workers broadcast error states for debugging

**Success Criteria**:
- Monitor shows workers within 1 second of startup
- Worker progress visible during long operations (downloads)
- Failed worker attempts visible in monitor
- Complete worker lifecycle tracking
- Zero missed worker announcements

## Service Specifications

### Service Interface
All services implement the BaseService interface:
```javascript
class BaseService {
  async start()     // Start the service
  async stop()      // Stop the service gracefully
  async restart()   // Restart the service
  async isHealthy() // Check if service is healthy
  getStatus()       // Get current service status
  getLogs()         // Get recent log entries
}
```

### Configuration Schema
```json
{
  "machine": {
    "id": "basic-machine-001",
    "gpu": {
      "count": 1,
      "memoryGB": 16,
      "model": "RTX 4090"
    }
  },
  "services": {
    "nginx": {
      "enabled": true,
      "port": 80,
      "healthEndpoint": "/health"
    },
    "comfyui": {
      "enabled": true,
      "basePort": 8188,
      "perGpu": true,
      "healthEndpoint": "/health"
    },
    "automatic1111": {
      "enabled": true,
      "basePort": 3001,
      "perGpu": true,
      "healthEndpoint": "/health"
    },
    "redisWorker": {
      "enabled": true,
      "perGpu": true,
      "downloadUrl": "https://github.com/stakeordie/emp-job-queue/releases/latest/download/emp-job-queue-worker.tar.gz"
    },
    "ollama": {
      "enabled": true,
      "port": 11434,
      "models": ["llama3"]
    }
  },
  "redis": {
    "url": "redis://default:password@host:port",
    "authToken": "auth-token"
  }
}
```

### Logging Schema
```json
{
  "timestamp": "2025-07-08T03:00:00.000Z",
  "level": "info",
  "service": "comfyui",
  "gpu": 0,
  "message": "ComfyUI started successfully",
  "context": {
    "port": 8188,
    "pid": 1234,
    "startupTime": 15000
  },
  "correlationId": "req-123"
}
```

## Operational Features

### Health Monitoring
- **Service Health**: Each service reports health status
- **Dependency Health**: Check downstream dependencies
- **Resource Health**: Monitor GPU/CPU/memory usage
- **Endpoint Health**: HTTP health checks with timeouts

### Metrics Collection
- **Service Metrics**: Startup time, restart count, error rate
- **Resource Metrics**: GPU utilization, memory usage
- **Request Metrics**: Request rate, response time
- **Business Metrics**: Jobs processed, models loaded

### Error Recovery
- **Automatic Restart**: Failed services restart with backoff
- **Dependency Recovery**: Restart dependent services
- **Resource Recovery**: Clear resources on service failure
- **State Recovery**: Restore service state after restart

### API Endpoints
- `GET /health` - Overall system health
- `GET /services` - List all services and status
- `GET /services/{name}/health` - Individual service health
- `POST /services/{name}/restart` - Restart specific service
- `GET /metrics` - Prometheus-compatible metrics
- `GET /logs?service={name}` - Service logs

## Migration Strategy

### Parallel Development
1. **Keep base_machine running** for production workloads
2. **Develop basic_machine** alongside existing infrastructure
3. **A/B test** both systems with identical workloads
4. **Gradual migration** once basic_machine proves stable

### Compatibility
- **Same external interfaces** (ports, endpoints, APIs)
- **Same environment variables** for easy switching
- **Same model/data directories** for seamless migration
- **Same Docker Compose** structure for development

### Rollback Plan
- **Keep base_machine images** tagged and ready
- **Configuration switchover** via environment variables
- **Data persistence** independent of machine type
- **Quick rollback** within 5 minutes if issues occur

## Success Metrics

### Performance
- **Startup Time**: < 2 minutes (vs 5+ minutes for base_machine)
- **Service Discovery**: < 30 seconds for all services healthy
- **Memory Usage**: < 2GB for orchestration layer
- **CPU Overhead**: < 5% for service management

### Reliability
- **Service Uptime**: > 99.9% for individual services
- **Recovery Time**: < 60 seconds for service restart
- **Error Rate**: < 0.1% for service operations
- **Health Check**: 100% accuracy for health detection

### Operability
- **Debug Time**: < 10 minutes to identify issues
- **Log Quality**: Structured logs with full context
- **Monitoring**: Real-time visibility into all services
- **Remote Management**: Full service control via API

## Risk Mitigation

### Technical Risks
- **Node.js Learning Curve**: Provide training and documentation
- **Performance Overhead**: Benchmark against base_machine
- **Dependency Complexity**: Pin versions and test thoroughly
- **Container Size**: Use multi-stage builds to minimize size

### Operational Risks
- **Service Compatibility**: Extensive testing with existing workloads
- **Migration Complexity**: Gradual rollout with rollback plan
- **Monitoring Gaps**: Comprehensive health checks and alerting
- **Documentation Lag**: Write docs alongside implementation

### Business Risks
- **Development Time**: Parallel development to avoid blocking
- **Resource Allocation**: Dedicated team for migration
- **User Impact**: Transparent migration with communication
- **Cost Increase**: Monitor resource usage and optimize

## Next Steps

1. **Create basic project structure** with package.json and Dockerfile
2. **Implement logging and configuration** foundation
3. **Start with Redis worker service** as proof of concept
4. **Add basic health monitoring** and service discovery
5. **Iterate on feedback** and refine architecture

This plan provides a roadmap for creating a modern, maintainable, and observable GPU infrastructure that addresses the limitations of the current bash-based approach while preserving all existing functionality.