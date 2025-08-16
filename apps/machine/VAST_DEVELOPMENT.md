# VAST.ai Development Workflow

Fast iteration development setup for VAST.ai GPU instances.

## One-Time Setup

1. **Set your Docker Hub registry**:
```bash
export DOCKERHUB_REGISTRY=your-dockerhub-username
# Add to your ~/.bashrc or ~/.zshrc
```

2. **Deploy base image**:
```bash
pnpm vast:deploy
```

This creates and pushes `your-dockerhub-username/emp-vast-dev` with all system dependencies.

## VAST.ai Usage

1. **Launch instance** with your base image:
   - Image: `your-dockerhub-username/emp-vast-dev:latest`
   - Container starts with message: "VAST.ai development container ready!"

2. **Develop iteratively** (inside container):
```bash
# Fresh environment every time
build_replication.sh

# Test your changes
node src/index-pm2.js

# Test specific components
node debug-telemetry.js

# Make code changes via git pull or editing
# Then repeat: build_replication.sh
```

## Available Commands

- `pnpm vast:deploy` - Build and push complete development image
- `pnpm vast:build` - Build image locally only  
- `pnpm vast:push` - Push existing image to Docker Hub
- `pnpm vast:test-local` - Test OpenTelemetry fixes locally

## Inside VAST.ai Container

- `build_replication.sh` - Reset environment and rebuild from source
- `reset_env.sh` - Clean environment without rebuilding
- `debug-telemetry.js` - Test OpenTelemetry setup in isolation

## Development Cycle

```
1. Code changes locally
2. git push
3. Inside VAST.ai: build_replication.sh (pulls latest)
4. Test: node src/index-pm2.js
5. Repeat steps 1-4 (no container restart needed)
```

## Benefits

- ✅ **5-second iteration** vs 30-minute Docker Hub cycles
- ✅ **Exact production environment** (same base image, dependencies)
- ✅ **Clean state every test** (build_replication.sh resets everything)
- ✅ **No Docker commands needed** inside VAST.ai container
- ✅ **Real GPU access** for testing