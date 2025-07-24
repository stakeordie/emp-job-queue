# API Machine

Lightweight API machine for processing external service jobs through the EmProps Job Queue system. Designed for Railway deployment with minimal resource usage.

## Overview

The API Machine implements Phase 0 of the API Machine Implementation Plan, providing:

- **Simulation Service**: Mock external APIs for development and testing
- **Redis Worker Integration**: Pull-based job processing using existing Redis functions
- **Error Classification**: Service-specific error handling and retry logic
- **Health Monitoring**: Comprehensive health checks and status reporting

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis Queue   │◄──►│   API Machine   │◄──►│ Simulation API  │
│                 │    │                 │    │   (Mock)        │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │    Jobs     │ │    │ │   Workers   │ │    │ │   OpenAI    │ │
│ │  (pending)  │ │    │ │ (sim/openai)│ │    │ │    API      │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

### Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the API machine:**
   ```bash
   pnpm dev
   ```

4. **Check health:**
   ```bash
   curl http://localhost:9090/health
   ```

### Docker Development

1. **Build the image:**
   ```bash
   docker build -t emprops/api-machine .
   ```

2. **Run the container:**
   ```bash
   docker run -p 3000:3000 -p 9090:9090 -p 8000:8000 \
     -e REDIS_HOST=host.docker.internal \
     -e ENABLE_SIMULATION=true \
     emprops/api-machine
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MACHINE_ID` | Unique machine identifier | `api-machine-{random}` |
| `REDIS_HOST` | Redis server hostname | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `WORKER_COUNT` | Number of worker processes | `2` |
| `ENABLE_SIMULATION` | Enable simulation service | `true` |
| `SIMULATION_PORT` | Simulation service port | `8000` |
| `MAX_JOB_RETRIES` | Maximum job retry attempts | `3` |

See `.env.example` for complete configuration options.

## Services

### Simulation Service

The simulation service provides mock endpoints for development and testing:

**OpenAI Image Generation:**
```bash
curl -X POST http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cat wearing a hat", "size": "1024x1024"}'
```

**OpenAI Chat Completion:**
```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'
```

**Error Simulation:**
```bash
# Simulate different error types
curl -X POST http://localhost:8000/simulate/error/rate_limit
curl -X POST http://localhost:8000/simulate/error/server_error
curl -X POST http://localhost:8000/simulate/error/timeout
```

### Worker System

Workers automatically:
- Register with Redis using existing `findMatchingJob` function
- Poll for jobs matching their service capabilities
- Process jobs with proper error handling and classification
- Update job status and publish progress events
- Handle failures with retry logic

## Job Processing

### Supported Job Types

**OpenAI Image Generation:**
```json
{
  "service_required": "openai",
  "input": "{\"type\": \"image_generation\", \"prompt\": \"A sunset\", \"size\": \"1024x1024\"}"
}
```

**OpenAI Chat Completion:**
```json
{
  "service_required": "openai", 
  "input": "{\"type\": \"chat_completion\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}"
}
```

**Generic Simulation:**
```json
{
  "service_required": "simulation",
  "input": "{\"processing_time\": 3000, \"data\": \"test\"}"
}
```

### Error Handling

The system implements comprehensive error classification:

- **Retryable Errors**: Timeouts, connection errors, rate limits, server errors
- **Non-Retryable Errors**: Authentication errors, invalid requests
- **Automatic Retry**: Jobs are retried up to `MAX_JOB_RETRIES` times
- **Failure Recovery**: Failed jobs are marked with detailed error information

## API Endpoints

### Health Check
```
GET /health
```
Returns machine health status, worker information, and service availability.

### Status
```
GET /status  
```
Returns detailed system status including memory usage, Redis connection, and worker states.

### Ready
```
GET /ready
```
Simple health check for Railway/container orchestration.

## Testing

### Run Tests
```bash
pnpm test
```

### Test Job Submission
Submit a test job to Redis and watch it get processed:

```bash
# From the main project directory
cd packages/core
node -e "
import Redis from 'ioredis';
const redis = new Redis();
const job = {
  id: 'test-' + Date.now(),
  service_required: 'simulation',
  input: JSON.stringify({processing_time: 2000}),
  status: 'pending',
  created_at: new Date().toISOString()
};
redis.hset('job:' + job.id, job);
redis.zadd('jobs:pending', Date.now(), job.id);
console.log('Job submitted:', job.id);
"
```

## Monitoring

Monitor the API machine using:

1. **Health endpoint**: `curl http://localhost:9090/health`
2. **Logs**: Workers log all job processing activities
3. **Redis**: Monitor job status changes in Redis
4. **Monitor UI**: Use the existing monitor app to watch job progress

## Deployment

### Railway Deployment

1. **Create Railway project:**
   ```bash
   railway new api-machine
   ```

2. **Set environment variables:**
   ```bash
   railway variables set REDIS_HOST=your-redis-host
   railway variables set ENABLE_SIMULATION=true
   ```

3. **Deploy:**
   ```bash
   railway up
   ```

### Docker Deployment

```bash
docker build -t emprops/api-machine .
docker run -d \
  --name api-machine \
  -p 3000:3000 \
  -p 9090:9090 \
  -e REDIS_HOST=your-redis-host \
  emprops/api-machine
```

## Development

### Adding New Services

1. **Create service worker** in `src/workers/`
2. **Add service configuration** to `src/config/environment.js`
3. **Update main index** to start the new worker type
4. **Add service endpoints** if needed

### Error Classification

Extend error classification in worker's `classifyError()` method:

```javascript
classifyError(error) {
  // Add service-specific error handling
  if (error.response?.data?.error?.type === 'your_error_type') {
    return { type: 'your_classification', isRetryable: true };
  }
  // ... existing logic
}
```

## Phase Evolution

This Phase 0 implementation provides the foundation for:

- **Phase 1**: Real OpenAI integration with API key routing
- **Phase 2**: Additional services (RunwayML, etc.)
- **Phase 3**: Advanced features (model caching, load balancing)

Each phase builds on this simulation-first architecture.

## Support

For issues and questions:
- Check the logs: Workers log detailed processing information
- Monitor Redis: Use Redis CLI to inspect job states
- Health checks: Use `/health` endpoint to verify system status
- Integration tests: Run the test suite to verify functionality