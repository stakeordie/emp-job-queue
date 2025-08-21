# Machine Development Workflow

## Quick Start

### Local Development (uses local Redis/API)
```bash
# Start ComfyUI machine with local services
pnpm dev:machine

# Start simulation machine with local services
pnpm dev:machine:sim
```

### Production Testing (uses production Redis/API)
```bash
# Test with production data but in dev container
pnpm dev:machine:prod

# Simulation with production data
pnpm dev:machine:sim:prod
```

## The Two-Environment Strategy

We maintain two comprehensive environment configurations:

1. **`.env.local-dev`** + **`.env.secret.local-dev`**
   - Points to local Redis (`redis://localhost:6379`)
   - Points to local API (`http://localhost:3331`)
   - Used for development and testing

2. **`.env.local-prod`** + **`.env.secret.local-prod`**
   - Points to production Redis
   - Points to production API
   - Used for testing with real production data locally

Both environments use the **same development container** with:
- Volume-mounted source code (instant changes)
- Node.js debugging enabled
- No build process required
- No encryption overhead

## Key Differences from Production Build

### Production Workflow (`pnpm d:machine:build`)
- ✅ Optimized for deployment
- ✅ Encrypted environment variables
- ✅ Immutable containers
- ✅ Baked-in source code
- ❌ Slow iteration (rebuild required)
- ❌ No debugging

### Development Workflow (`pnpm dev:machine`)
- ✅ Instant code changes (volume mounts)
- ✅ Full debugging (Node.js inspector)
- ✅ Simple docker-compose (no build pipeline)
- ✅ Direct environment variables
- ❌ Not for production
- ❌ Requires local source code

## Debugging

### 1. Start with Debug Pause
```bash
# Pause after PM2 ecosystem generation
DEBUG_PAUSE_ECOSYSTEM=true pnpm dev:machine:debug

# With production data
DEBUG_PAUSE_ECOSYSTEM=true pnpm dev:machine:debug:prod
```

### 2. Attach VS Code Debugger
1. Start the container (above)
2. In VS Code: Run → "🔥 Debug Dev Container (Live)"
3. Set breakpoints in your source files
4. Code changes are instant (just save)

### 3. Inspect Container
```bash
# While container is running
pnpm dev:machine:exec

# Inside container
cat /workspace/pm2-ecosystem.config.cjs
pm2 list
pm2 logs
```

### 4. Debug Hooks Available
Set these environment variables to pause at specific points:
- `DEBUG_HOOK_AFTER_ECOSYSTEM_GENERATION=true`
- `DEBUG_HOOK_BEFORE_PM2_SERVICES=true`
- `DEBUG_HOOK_AFTER_PM2_SERVICES=true`

## Common Tasks

### Switch Between Environments
```bash
# Local development
pnpm dev:machine

# Production data testing
pnpm dev:machine:prod
```

### Clean Up
```bash
pnpm dev:machine:down
```

### View Logs
```bash
pnpm dev:machine:logs
```

### Change Worker Configuration
```bash
# Override workers at runtime
WORKERS=comfyui:4 pnpm dev:machine
WORKERS=simulation-websocket:8 pnpm dev:machine:sim
```

### Use Mock GPU (no CUDA required)
```bash
GPU_MODE=mock pnpm dev:machine
```

## File Structure

```
docker-compose.dev.yml    # Development-only compose file
docker-compose.yml        # Production compose file (generated profiles)
Dockerfile               # Multi-stage: base, development, production targets

.env.local-dev           # Local services configuration
.env.secret.local-dev    # Local secrets
.env.local-prod          # Production services configuration  
.env.secret.local-prod   # Production secrets
.env.production          # Production deployment (Railway/VAST.ai)
```

## VS Code Integration

The project includes debug configurations:
- **"🔥 Debug Dev Container (Live)"** - Attach to running dev container
- **"🐳 Attach to Container (Machine)"** - Attach to production container

Breakpoints work immediately with volume-mounted source code.

## Tips

1. **Always use dev workflow for debugging** - It's 10x faster
2. **Keep both .env files updated** - They mirror production structure
3. **Test with production data** - Use `dev:machine:prod` before deploying
4. **Use debug hooks** - Pause at critical points to inspect state
5. **Volume mounts are read-only** - Edit files on host, changes apply instantly

## Troubleshooting

### Container won't start
- Check `.env.local-dev` or `.env.local-prod` exists
- Verify Redis is running locally or accessible
- Check Docker daemon is running

### Breakpoints not working
- Ensure you're using "🔥 Debug Dev Container (Live)" configuration
- Check port 9229 is exposed and not in use
- Verify `NODE_OPTIONS` includes `--inspect`

### Code changes not applying
- Verify volume mounts in `docker-compose.dev.yml`
- Check file permissions on host
- Ensure you're editing the right files (apps/machine/src/)

## Production Deployment

When ready to deploy:
```bash
# Build production image (uses production Dockerfile target)
pnpm d:machine:build comfyui-production

# Push to registry
pnpm d:machine:push comfyui-production

# Deploy to Railway/VAST.ai with .env.production
```

Remember: Development workflow is for **development only**. Always build and test production images before deployment.