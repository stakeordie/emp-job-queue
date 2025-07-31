# Webhook Service

Dedicated microservice for handling webhook notifications in the EMP Job Queue system.

## Overview

The Webhook Service listens to Redis events from the job broker and delivers HTTP webhooks to registered endpoints. It provides:

- **Event Processing**: Listens to job, worker, and machine events from Redis
- **HTTP Delivery**: Sends webhook notifications with retry logic and HMAC signatures
- **Management API**: CRUD operations for webhook configurations
- **Monitoring**: Delivery statistics and history tracking

## Quick Start

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start

# Testing
pnpm test
```

## Environment Variables

```bash
WEBHOOK_SERVICE_PORT=3335      # HTTP server port
REDIS_URL=redis://localhost:6379  # Redis connection URL
CORS_ORIGINS=*                 # Comma-separated CORS origins
NODE_ENV=development          # Environment mode
```

## API Endpoints

### Webhook Management
- `POST /webhooks` - Register new webhook
- `GET /webhooks` - List all webhooks
- `GET /webhooks/:id` - Get specific webhook
- `PUT /webhooks/:id` - Update webhook
- `DELETE /webhooks/:id` - Delete webhook
- `POST /webhooks/:id/test` - Test webhook delivery

### Monitoring
- `GET /webhooks/:id/stats` - Webhook delivery statistics
- `GET /webhooks/:id/deliveries` - Webhook delivery history
- `GET /stats/summary` - Overall statistics
- `GET /deliveries/recent` - Recent deliveries
- `GET /health` - Service health check

## Webhook Events

The service processes these event types:

**Job Events:**
- `job.submitted` - New job submitted
- `job.assigned` - Job assigned to worker
- `job.progress` - Job progress update
- `job.completed` - Job completed successfully
- `job.failed` - Job failed
- `job.status_changed` - Job status change

**Worker Events:**
- `worker.connected` - Worker connected
- `worker.disconnected` - Worker disconnected

**Machine Events:**
- `machine.startup_complete` - Machine startup finished
- `machine.shutdown` - Machine shutting down

## Architecture

```
Redis Events → WebhookProcessor → WebhookNotificationService → HTTP Delivery
```

The service maintains separation from the main API server, handling only webhook-related functionality.