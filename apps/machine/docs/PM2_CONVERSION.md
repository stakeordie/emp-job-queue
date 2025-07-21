# PM2 Conversion - Basic Machine

## Overview
We've successfully converted the basic_machine to use PM2 for all process management. This provides better reliability, monitoring, and operational control.

## Architecture Changes

### Before (Direct Process Management)
```
Docker Container
  └── index.js (main process)
      └── orchestrator.js
          ├── shared-setup-service
          ├── redis-worker-service (per GPU)
          ├── health-server
          └── other services
```

### After (PM2 Management)
```
Docker Container
  └── PM2 Daemon
      ├── orchestrator (index-pm2.js) - monitors services
      ├── shared-setup - runs once at startup
      ├── redis-worker-gpu0 - standalone service
      ├── redis-worker-gpu1 - standalone service (if multi-GPU)
      └── hello-world - optional service
```

## Key Components

### 1. PM2 Ecosystem Config (`pm2-ecosystem.config.js`)
- Dynamically generates service configurations
- Handles GPU-specific services
- Configures logging, memory limits, and restarts
- Environment variable injection

### 2. Standalone Wrapper (`standalone-wrapper.js`)
- Allows services to run independently under PM2
- Handles signal management
- Provides configuration parsing

### 3. PM2-Aware Orchestrator (`index-pm2.js`)
- Monitors PM2 services instead of managing them
- Provides health checks and status reporting
- Maintains Redis notifications

### 4. PM2 Service Manager (`pm2-service-manager.js`)
- Programmatic PM2 control
- Service health monitoring
- Log management
- CLI interface

## Service Configuration

### Environment Variables
```bash
# Global
NODE_ENV=production
PM2_HOME=/workspace/.pm2

# Service-specific
ENABLE_REDIS_WORKER=true  # Enable redis workers
ENABLE_HELLO_WORLD=false  # Enable hello world service

# GPU Configuration
NUM_GPUS=1                # Number of GPUs
WORKER_NUM_GPUS=1         # Alternative GPU count

# Worker Configuration
WORKER_ID=basic-machine   # Worker ID prefix
```

### PM2 Commands
```bash
# List all services
pm2 list

# View logs
pm2 logs
pm2 logs redis-worker-gpu0
pm2 logs --lines 100

# Service control
pm2 stop all
pm2 restart orchestrator
pm2 delete redis-worker-gpu0

# Monitoring
pm2 monit
pm2 status

# Save/restore state
pm2 save
pm2 resurrect
```

## Benefits Achieved

### 1. **Reliability**
- Auto-restart on crashes
- Memory limit protection (2GB for workers, 500MB for utilities)
- Graceful shutdown handling

### 2. **Monitoring**
- Real-time resource usage (CPU, memory)
- Centralized logging with rotation
- Health check integration

### 3. **Operations**
- Zero-downtime reloads
- Easy scaling (pm2 scale)
- State persistence across restarts

### 4. **Development**
- Better debugging with pm2 logs
- Service isolation for testing
- Consistent service management

## Migration Steps Completed

1. ✅ Added PM2 to Dockerfile with log rotation
2. ✅ Created PM2 ecosystem configuration
3. ✅ Built standalone wrapper for services
4. ✅ Created PM2-aware orchestrator
5. ✅ Updated entrypoint to use PM2
6. ✅ Added PM2 service manager utilities

## Next Steps

1. **Testing**: Verify all services start correctly under PM2
2. **ComfyUI Integration**: Add ComfyUI as a PM2-managed service
3. **Production Hardening**: 
   - Configure PM2 cluster mode for Node services
   - Set up PM2 metrics export
   - Add PM2 health endpoints

## Service Templates

### Adding a New Service
```javascript
// In pm2-ecosystem.config.js
apps.push({
  ...generateServiceConfig('my-service'),
  script: '/service-manager/src/services/standalone-wrapper.js',
  interpreter: 'node',
  args: ['my-service'],
  max_memory_restart: '1G',
  env: {
    ...generateServiceConfig('my-service').env,
    STANDALONE_MODE: 'true',
    // Add service-specific env vars
  }
});
```

### Service Implementation
Services need to support standalone mode:
```javascript
// Check for standalone mode
if (process.argv.includes('--standalone') || process.env.STANDALONE_MODE) {
  // Run independently
}
```

## Debugging

### Check PM2 daemon
```bash
pm2 ping
pm2 info
```

### View detailed service info
```bash
pm2 describe redis-worker-gpu0
```

### Check PM2 logs
```bash
pm2 logs --nostream
pm2 logs --err
pm2 logs --timestamp
```

### Reset PM2
```bash
pm2 kill
pm2 resurrect
```

The PM2 conversion is now complete and ready for testing!