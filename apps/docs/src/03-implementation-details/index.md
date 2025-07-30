# Implementation Details

This section contains the deep technical implementation details for engineers working on the system.

## Technical Architecture

The system is built on several key technical decisions:
- **Docker Layer Strategy** - Optimized for build caching and deployment speed
- **PM2 Service Management** - Process management within containers
- **Redis Functions** - Atomic operations for job matching
- **WebSocket + HTTP** - Real-time monitoring with REST fallback

## In This Section

- [Machine Bootstrap & Lifecycle](./machine-bootstrap-lifecycle.md) - **Complete machine initialization pipeline**
- [Docker Build Architecture](./docker-build-architecture.md) - Docker layer strategy and build optimization  
- [Technical Implementation](./technical-implementation.md) - Deep dive into system internals
- [WebSocket API](./websocket-api.md) - Real-time communication protocol
- [Redis Data Structures](./redis-data-structures.md) - How data is organized in Redis *(to be written)*
- [Service Communication](./service-communication.md) - Inter-service protocols *(to be written)*
- [API Connectors](./api-connectors.md) - OpenAI, Replicate, RunPod integrations *(from plans)*

## Key Implementation Decisions

### Why Docker Layers?
- **90% cache hit rate** for incremental builds
- **50% faster development** iteration
- **Shared base layers** reduce storage needs

### Why PM2?
- **Process management** within containers
- **Log aggregation** and rotation
- **Graceful restarts** for zero-downtime updates
- **Resource monitoring** built-in

### Why Redis?
- **Atomic operations** for job claiming
- **Pub/Sub** for real-time updates
- **Persistence** for job recovery
- **Distributed** by design

## Code Organization

```
apps/
├── machine-base/       # Foundation layer
├── machine-gpu/        # GPU extension
├── machine-api/        # API extension
├── api/               # API server
├── worker/            # Worker implementation
└── monitor/           # Monitoring UI
```

## Next Steps

Once you understand the implementation, learn about [Running in Production](../04-running-in-production/).