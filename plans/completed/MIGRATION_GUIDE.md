# Migration Guide: New Environment Management System

This guide helps migrate from the old .env file system to the new component-based environment management.

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build Environment Management Package
```bash
pnpm build --filter=@emp/env-management
```

### 3. Set Up Secrets (Optional)
```bash
cp config/environments/secrets/.env.secrets.example config/environments/secrets/.env.secrets.local
# Edit .env.secrets.local with your actual secret values
```

### 4. Choose Your Environment Profile

**Full Local Development (Recommended for new developers):**
```bash
pnpm dev:full-local
```

**Mixed Development (Local machine + Production API):**
```bash  
pnpm dev:mixed
```

**Staging Testing:**
```bash
pnpm dev:staging
```

## Available Commands

### Environment Management
- `pnpm env:list` - List available environment profiles
- `pnpm env:switch <profile>` - Switch to a different profile
- `pnpm env:build --profile=<name>` - Build from profile
- `pnpm env:build --redis=local --api=production` - Build from components
- `pnpm env:validate` - Validate current environment

### Development Workflows
- `pnpm dev:full-local` - Full local development
- `pnpm dev:mixed` - Mixed environment development
- `pnpm dev:staging` - Staging environment testing
- `pnpm setup:developer` - Complete developer setup

## Environment Profiles

### full-local
All components running locally for offline development.
- Redis: local
- API: local  
- Machine: local
- Monitor: local
- ComfyUI: local

### dev-mixed
Local development with production API and development Redis.
- Redis: development
- API: production
- Machine: local
- Monitor: local
- ComfyUI: local

### staging-mixed
Local machine testing against staging infrastructure.
- Redis: staging
- API: staging
- Machine: local
- Monitor: local
- ComfyUI: staging

### prod-debug
Local debugging tools with production infrastructure (use carefully).
- Redis: production
- API: production
- Machine: local
- Monitor: local
- ComfyUI: production

### remote-comfyui
Local worker connecting to a remote ComfyUI server.
- Redis: local
- API: local
- Machine: remote-comfyui (worker-only, no local ComfyUI)
- Monitor: local
- ComfyUI: local

## Migrating Existing .env Files

The old .env files are now replaced by the component-based system. To migrate:

1. **Identify your current setup** by checking existing .env files
2. **Choose the closest profile** or create a custom one
3. **Update secrets** in `config/environments/secrets/.env.secrets.local`
4. **Test the new setup** with `pnpm env:validate`

## Custom Configurations

You can create custom component combinations:

```bash
# Example: Production Redis + Local everything else
pnpm env:build --redis=production --api=local --machine=local --monitor=local --comfy=local
```

## Troubleshooting

### Environment not building
- Check that all component files exist in `config/environments/components/`
- Verify profile exists in `config/environments/profiles/`
- Ensure secrets file exists if profile requires secrets

### Validation failing
- Run `pnpm env:validate` to see specific issues
- Check that required services (like Redis) are running for local profiles
- Verify network access for remote profiles

### Missing secrets
- Copy `config/environments/secrets/.env.secrets.example` to `.env.secrets.local`
- Fill in actual secret values
- Ensure the secrets file is not committed to git

## Advanced Usage

### Creating Custom Profiles
Create a new JSON file in `config/environments/profiles/` following the existing format.

### Adding New Components
Add new component environment files in `config/environments/components/` using the INI format with sections for each environment.

### Environment Validation
The system can validate:
- Required environment variables
- Service availability (Redis, etc.)
- Port conflicts
- Network connectivity to remote services

## Remote ComfyUI Setup

The ComfyUI connector supports connecting to remote ComfyUI servers instead of running ComfyUI locally.

### Configuration

To connect workers to a remote ComfyUI server:

1. **Set up secrets** in `config/environments/secrets/.env.secrets.local`:
```bash
REMOTE_COMFYUI_HOST=your-comfyui-server.com
REMOTE_COMFYUI_PORT=8188
REMOTE_COMFYUI_USERNAME=your-username  # optional
REMOTE_COMFYUI_PASSWORD=your-password  # optional
```

2. **Use the remote-comfyui profile**:
```bash
pnpm env:build --profile=remote-comfyui
pnpm machines:basic:local:up
```

### Features

The remote-comfyui profile creates a worker that:
- ✅ Connects to your Redis and API locally (for job management)
- ✅ Connects to the remote ComfyUI server for job processing
- ✅ Does not install or run local ComfyUI (saves resources)
- ✅ Supports HTTP basic authentication if your ComfyUI server requires it
- ✅ Configurable timeouts and concurrency limits
- ✅ Full progress tracking and result handling

### Custom Remote Configuration

You can also manually configure remote ComfyUI settings:

```bash
# Build environment with custom remote ComfyUI settings
pnpm env:build --machine=remote-comfyui

# Or create a custom profile by copying remote-comfyui.json
```

### Supported Environment Variables

The ComfyUI connector reads these environment variables:

- `WORKER_COMFYUI_HOST` - ComfyUI server hostname/IP (default: localhost)
- `WORKER_COMFYUI_PORT` - ComfyUI server port (default: 8188)
- `WORKER_COMFYUI_USERNAME` - Basic auth username (optional)
- `WORKER_COMFYUI_PASSWORD` - Basic auth password (optional)
- `WORKER_COMFYUI_TIMEOUT_SECONDS` - Request timeout (default: 300)
- `WORKER_COMFYUI_MAX_CONCURRENT_JOBS` - Max concurrent jobs (default: 1)