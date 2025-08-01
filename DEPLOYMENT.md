# Deployment Guide

This document outlines the deployment strategies for the EMP Job Queue system components.

## Overview

The system consists of several deployable services:
- **API Server**: Core job orchestration and WebSocket API
- **Webhook Service**: HTTP webhook notification delivery
- **Monitor**: Web-based monitoring dashboard
- **Worker**: Job processing workers (deployed on machines)

## Docker Images

### Building Images

Each service has multiple Dockerfile variants:

- `Dockerfile`: Optimized multi-stage production build
- `Dockerfile.ci`: Single-stage build for CI/CD
- `Dockerfile.railway`: Railway-specific optimized build

```bash
# Build API service
cd apps/api
./scripts/build-with-version.sh v1.0.0 --push

# Build Webhook service
cd apps/webhook-service
./scripts/build-with-version.sh v1.0.0 --push
```

### Image Registry

Images are pushed to GitHub Container Registry:
- `ghcr.io/your-org/emp-job-queue/api:latest`
- `ghcr.io/your-org/emp-job-queue/webhook-service:latest`

## Deployment Platforms

### Railway

Each service can be deployed to Railway using the respective `railway.toml` files:

#### API Service
```bash
cd apps/api
railway up
```

#### Webhook Service
```bash
cd apps/webhook-service
railway up
```

Required environment variables:
- `REDIS_URL`: Redis connection string
- `NODE_ENV`: production
- `LOG_LEVEL`: info
- `CORS_ORIGINS`: comma-separated allowed origins

### Docker Compose

For local/staging deployment:

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  
  api:
    image: emp-api:latest
    ports:
      - "3001:3001"
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - redis
  
  webhook-service:
    image: emp-webhook-service:latest
    ports:
      - "3332:3332"
    environment:
      - REDIS_URL=redis://redis:6379
      - NODE_ENV=production
    depends_on:
      - redis
      - api
```

### Kubernetes

Kubernetes manifests can be generated from the Docker images:

```bash
# Generate Kubernetes deployment
kubectl create deployment api --image=emp-api:latest --dry-run=client -o yaml > k8s-api.yaml
kubectl create deployment webhook-service --image=emp-webhook-service:latest --dry-run=client -o yaml > k8s-webhook.yaml
```

## Environment Configuration

### Production Environment Variables

#### API Service
- `REDIS_URL`: Redis connection string
- `NODE_ENV`: production
- `API_PORT`: 3001 (default)
- `WS_AUTH_TOKEN`: WebSocket authentication token
- `LOG_LEVEL`: info
- `CORS_ORIGINS`: comma-separated allowed origins

#### Webhook Service
- `REDIS_URL`: Redis connection string
- `NODE_ENV`: production
- `WEBHOOK_SERVICE_PORT`: 3332 (default)
- `LOG_LEVEL`: info
- `CORS_ORIGINS`: comma-separated allowed origins

### Secrets Management

Sensitive configuration should be managed through:
- Railway environment variables
- Kubernetes secrets
- Docker secrets
- Environment-specific `.env` files (not committed)

## Health Checks

All services expose health endpoints:
- API: `GET /health` on port 3001
- Webhook Service: `GET /health` on port 3332

Health check responses include:
- Service status
- Redis connectivity
- Uptime
- Version information

## Monitoring and Logging

### Logging
- All services use structured JSON logging
- Log levels: error, warn, info, debug
- Production: `LOG_LEVEL=info`

### Metrics
- Health endpoints provide basic metrics
- Redis pub/sub for real-time event monitoring
- Consider adding Prometheus metrics for production

## CI/CD Pipeline

### GitHub Actions

The CI/CD pipeline includes:
1. **Test**: Lint, type check, unit tests
2. **Build**: Docker image build and test
3. **Deploy**: Automatic deployment on main branch

### Workflow Files
- `.github/workflows/ci.yml`: Main CI pipeline
- `.github/workflows/webhook-service-deploy.yml`: Webhook service deployment

### Deployment Triggers
- Push to `main`/`master`: Production deployment
- Push to `develop`: Staging deployment
- Pull requests: Test builds only

## Scaling Considerations

### Horizontal Scaling
- API and Webhook services are stateless
- Can run multiple instances behind a load balancer
- Redis handles distributed coordination

### Resource Requirements
- **API**: 256MB RAM, 0.5 CPU minimum
- **Webhook Service**: 128MB RAM, 0.25 CPU minimum
- **Redis**: 512MB RAM minimum for production

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**
   - Check `REDIS_URL` environment variable
   - Verify Redis service is running
   - Check network connectivity

2. **Health Check Failures**
   - Verify service is bound to correct port
   - Check logs for startup errors
   - Ensure dependencies (Redis) are available

3. **Build Issues**
   - Ensure pnpm lockfile is up to date
   - Check TypeScript compilation errors
   - Verify all dependencies are available

### Logs Location
- Container logs: `docker logs <container-name>`
- Railway logs: Available in Railway dashboard
- Local development: `logs/` directory

## Security Considerations

- Never commit secrets to version control
- Use environment variables for sensitive configuration
- Implement proper CORS policies
- Consider API rate limiting for production
- Use HTTPS in production environments
- Regularly update dependencies for security patches