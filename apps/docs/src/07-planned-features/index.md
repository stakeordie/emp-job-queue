# Planned Features

This section contains upcoming features, architectural improvements, and implementation plans that are actively being considered or developed.

## Overview

The Planned Features section tracks current development priorities and implementation roadmaps. These are concrete plans with defined scopes, timelines, and technical specifications.

## In This Section

- [Webhook Ingest Service](./webhook-ingest-service.md) - **General-purpose webhook service for external API integration**
- [Playwright Service Architecture](./playwright-service-architecture.md) - **Local GPU-accelerated rendering service to replace external Puppeteer**
- [Collection & Workflow Model Management](./collection-model-management.md) - **Automated model downloading and inventory system based on assigned collections and workflows**

## Implementation Status

### High Priority
- **Collection & Workflow Model Management** - Planning phase, 3-5 day implementation
- **Webhook Ingest Service** - Planning phase, 1-2 day implementation

### In Progress  
- **Direct Job Component Response Configuration** - OpenAI component updates

### Completed Plans
- **Playwright Service Architecture** - GPU-accelerated local rendering service plan
- **WebSocket Ping/Pong Optimization** - Moved heartbeat to WebSocket frames

---

## Adding New Plans

When adding new planned features:

1. Create a dedicated markdown file for the feature
2. Include implementation phases and timelines
3. Specify technical requirements and dependencies
4. Add status tracking and success metrics
5. Update this index with links and status

---

*This section focuses on concrete, actionable plans rather than long-term vision. For strategic direction, see [Future Vision](../06-future-vision/).*