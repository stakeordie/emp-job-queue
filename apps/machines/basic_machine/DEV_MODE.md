# Basic Machine Development Mode

This document explains how to run the basic-machine container with a local worker build instead of downloading from GitHub releases.

## Overview

In production, the basic-machine downloads the worker package from GitHub releases. However, during development, this makes it difficult to test changes quickly. The development mode allows you to use a locally built worker instead.

## Quick Start

```bash
# Run in development mode with local worker
./run-dev.sh
```

This script will:
1. Build the worker locally
2. Mount the local worker build into the container
3. Skip the GitHub download
4. Start the container with development settings

## Manual Setup

### 1. Build the Worker

```bash
cd ../../worker
pnpm install
pnpm build
```

### 2. Configure Environment

Edit `.env.local.dev` and add:

```env
# Use local worker build
WORKER_LOCAL_PATH=/workspace/worker-dist
```

### 3. Run with Docker Compose

```bash
docker-compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  --env-file .env.local.dev \
  up --build
```

## How It Works

1. **Environment Variable**: `WORKER_LOCAL_PATH` tells the service to use a local directory instead of downloading
2. **Volume Mount**: `docker-compose.dev.yml` mounts your local worker build at `/workspace/worker-dist`
3. **Skip Download**: When `WORKER_LOCAL_PATH` is set, the service copies files from the local path instead of downloading

## Configuration Options

### Environment Variables

- `WORKER_LOCAL_PATH`: Path inside the container to the local worker files (e.g., `/workspace/worker-dist`)
- `WORKER_DOWNLOAD_URL`: URL for production downloads (ignored when `WORKER_LOCAL_PATH` is set)

### Docker Compose Files

- `docker-compose.yml`: Base configuration
- `docker-compose.dev.yml`: Development overrides (mounts local worker)
- `docker-compose.override.yml`: Generated port mappings

## Switching Between Modes

### Development Mode
```bash
# Use local worker build
./run-dev.sh

# Or manually:
docker-compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.local.dev up
```

### Production Mode
```bash
# Download from GitHub releases
./run.sh

# Or manually:
docker-compose --env-file .env.local.prod up
```

## Troubleshooting

### Worker files not found
- Ensure you've built the worker: `cd ../../worker && pnpm build`
- Check the volume mount in `docker-compose.dev.yml`
- Verify `WORKER_LOCAL_PATH` matches the mount point

### Changes not reflected
- Rebuild the worker: `cd ../../worker && pnpm build`
- Restart the container to pick up changes
- The container doesn't hot-reload worker changes

### Permission issues
- Ensure the worker dist directory is readable
- Check Docker volume mount permissions

## Benefits

1. **Faster iteration**: No need to create GitHub releases for testing
2. **Local debugging**: Test changes immediately
3. **Offline development**: No internet required after initial setup
4. **Version control**: Test specific branches or commits