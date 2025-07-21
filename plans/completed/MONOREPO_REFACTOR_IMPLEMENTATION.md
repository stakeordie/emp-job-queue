# EmProps Job Queue Monorepo Refactor - Implementation Guide

## Overview
This document provides a complete implementation guide for refactoring the EmProps Job Queue monorepo to support flexible environment configurations and consolidate external repositories.

## Current State Analysis

### Existing Structure
```
emp-job-queue/
├── apps/
│   ├── api/                     # API server
│   ├── monitor/                 # WebSocket monitoring UI
│   ├── worker/                  # Redis-direct worker
│   └── machines/
│       └── basic_machine/       # PM2-managed container deployment
├── packages/
│   ├── core/                    # Shared types and Redis functions
│   └── deployment/              # Deployment utilities
├── docs/                        # Architecture documentation
├── scripts/                     # Various build/dev scripts
└── tools/                       # Build tools
```

### Current Environment Management Issues
1. **20+ .env files** scattered across apps with duplicate configurations
2. **No environment inheritance** - values repeated everywhere
3. **No mixed environment support** - can't run local machine with production API
4. **External repositories** require separate maintenance

### External Repositories to Integrate
1. **emprops_shared** (`git@github.com:stakeordie/emprops_shared.git`)
   - Contains: `config_nodes.json`, `comfy_dir_config.yaml`, `static-models.json`, `workflows/`
   - Purpose: ComfyUI custom nodes installation scripts and shared configurations
   
2. **emprops_comfy_nodes** (`git@github.com:stakeordie/emprops_comfy_nodes.git`)
   - Contains: Python custom nodes, requirements.txt, examples, tests
   - Purpose: EmProps-specific ComfyUI nodes for cloud storage, asset downloading, etc.

3. **emprops_component_library** (`git@github.com:stakeordie/emprops_component_library.git`)
   - Contains: Shared UI components, design system, common utilities
   - Purpose: Reusable React components and design patterns across EmProps applications

## Target Architecture

### Final Directory Structure
```
emp-job-queue/
├── apps/
│   ├── api/
│   ├── monitor/
│   ├── worker/
│   └── machines/
├── packages/
│   ├── core/
│   ├── deployment/
│   ├── service-config/          # NEW: From emprops_shared
│   │   ├── comfy-nodes/
│   │   │   ├── config_nodes.json          # 64 custom nodes config
│   │   │   ├── config_nodes_test.json     # Test configuration
│   │   │   └── static-models.json         # Pre-installed models
│   │   ├── shared-configs/
│   │   │   ├── comfy_dir_config.yaml      # ComfyUI directory structure
│   │   │   └── workflows/                 # Shared workflow templates
│   │   ├── scripts/
│   │   │   ├── install-nodes.ts           # Node installation logic
│   │   │   └── validate-config.ts         # Configuration validation
│   │   ├── src/
│   │   │   ├── types.ts                   # TypeScript interfaces
│   │   │   └── index.ts                   # Package exports
│   │   └── package.json
│   ├── custom-nodes/            # NEW: From emprops_comfy_nodes
│   │   ├── src/
│   │   │   ├── nodes/                     # Python nodes
│   │   │   │   ├── emprops_asset_downloader.py
│   │   │   │   ├── emprops_cloud_storage_saver.py
│   │   │   │   ├── emprops_s3_video_combine.py
│   │   │   │   └── [18 other custom nodes]
│   │   │   ├── helpers/                   # Helper modules
│   │   │   ├── tests/                     # Python tests
│   │   │   └── examples/                  # Usage examples
│   │   ├── requirements.txt               # Python dependencies
│   │   ├── __init__.py                    # Python package init
│   │   ├── utils.py                       # Utility functions
│   │   └── package.json                   # NPM package metadata
│   ├── component-library/       # NEW: From emprops_component_library
│   │   ├── src/
│   │   │   ├── components/               # React components
│   │   │   │   ├── Button/
│   │   │   │   ├── Card/
│   │   │   │   ├── Modal/
│   │   │   │   ├── Form/
│   │   │   │   └── [other UI components]
│   │   │   ├── hooks/                    # Shared React hooks
│   │   │   ├── utils/                    # Utility functions
│   │   │   ├── styles/                   # Design system styles
│   │   │   ├── types/                    # TypeScript interfaces
│   │   │   └── index.ts                  # Package exports
│   │   ├── stories/                      # Storybook stories
│   │   ├── tests/                        # Component tests
│   │   └── package.json                  # NPM package metadata
│   └── env-management/          # NEW: Environment utilities
│       ├── src/
│       │   ├── builder.ts                 # Environment composition
│       │   ├── validator.ts               # Environment validation
│       │   ├── types.ts                   # Environment types
│       │   └── index.ts                   # Package exports
│       ├── cli/
│       │   ├── build.ts                   # Build command
│       │   ├── switch.ts                  # Switch command
│       │   ├── validate.ts                # Validate command
│       │   └── list.ts                    # List profiles command
│       └── package.json
├── config/                      # NEW: Component-based configuration
│   ├── environments/
│   │   ├── components/          # Per-component environment configs
│   │   │   ├── redis.env                 # Redis configurations
│   │   │   ├── api.env                   # API server configurations
│   │   │   ├── machine.env               # Machine/worker configurations
│   │   │   ├── monitor.env               # Monitor UI configurations
│   │   │   └── comfy.env                 # ComfyUI configurations
│   │   ├── profiles/            # Pre-defined environment combinations
│   │   │   ├── full-local.json           # All components local
│   │   │   ├── dev-mixed.json            # Common dev mixed setup
│   │   │   ├── staging-mixed.json        # Staging mixed setup
│   │   │   └── prod-debug.json           # Production debugging
│   │   └── secrets/
│   │       ├── .env.secrets.example      # Secret template
│   │       └── .env.secrets.local        # Local secrets (gitignored)
│   └── services/
│       ├── comfy-nodes.json              # Service-specific configurations
│       └── models.json                   # Model configurations
├── scripts/                     # Enhanced scripts
│   ├── env/                     # Environment management scripts
│   │   ├── build-env.js                  # Build environment from components
│   │   ├── validate-env.js               # Validate current environment
│   │   ├── switch-env.js                 # Switch between profiles
│   │   └── list-profiles.js              # List available profiles
│   ├── setup/
│   │   ├── install-deps.js               # Install dependencies
│   │   ├── init-dev.js                   # Initialize development environment
│   │   └── cleanup.js                    # Cleanup development environment
│   └── deployment/
│       ├── build.js                      # Build for deployment
│       └── deploy.js                     # Deploy to various environments
├── docs/
└── tools/
```

## Component-Based Environment System

### Core Concept
Instead of monolithic `.env` files, each service component can use different environment configurations:

```bash
# Example: Local machine + Production API + Development Redis
REDIS_PROFILE=development
API_PROFILE=production
MACHINE_PROFILE=local
MONITOR_PROFILE=local
COMFY_PROFILE=local
```

### Component Environment Files

#### `config/environments/components/redis.env`
```ini
# Redis component configurations
[local]
REDIS_URL=redis://localhost:6379
REDIS_DB=0
REDIS_PASSWORD=
REDIS_MAX_CONNECTIONS=10

[development]
REDIS_URL=redis://dev-redis.emprops.com:6379
REDIS_DB=1
REDIS_PASSWORD=${DEV_REDIS_PASSWORD}
REDIS_MAX_CONNECTIONS=50

[staging]
REDIS_URL=redis://staging-redis.emprops.com:6379
REDIS_DB=0
REDIS_PASSWORD=${STAGING_REDIS_PASSWORD}
REDIS_MAX_CONNECTIONS=100

[production]
REDIS_URL=redis://prod-redis.emprops.com:6379
REDIS_DB=0
REDIS_PASSWORD=${PROD_REDIS_PASSWORD}
REDIS_MAX_CONNECTIONS=200
```

#### `config/environments/components/api.env`
```ini
# API component configurations
[local]
API_URL=http://localhost:3331
API_HOST=localhost
API_PORT=3331
API_LOG_LEVEL=debug
API_CORS_ORIGIN=http://localhost:3333

[development]
API_URL=https://dev-api.emprops.com
API_HOST=0.0.0.0
API_PORT=3331
API_LOG_LEVEL=info
API_CORS_ORIGIN=https://dev-monitor.emprops.com

[staging]
API_URL=https://staging-api.emprops.com
API_HOST=0.0.0.0
API_PORT=3331
API_LOG_LEVEL=info
API_CORS_ORIGIN=https://staging-monitor.emprops.com

[production]
API_URL=https://api.emprops.com
API_HOST=0.0.0.0
API_PORT=3331
API_LOG_LEVEL=warn
API_CORS_ORIGIN=https://monitor.emprops.com
```

#### `config/environments/components/machine.env`
```ini
# Machine component configurations
[local]
MACHINE_ID=local-dev-machine
MACHINE_HOST=localhost
HEALTH_PORT=9090
TEST_MODE=true
NUM_GPUS=1
GPU_MEMORY_GB=16
GPU_MODEL="Simulated RTX 4090"
COMFYUI_INSTALL_CUSTOM_NODES=true

[development]
MACHINE_ID=${HOSTNAME}-dev
MACHINE_HOST=0.0.0.0
HEALTH_PORT=9090
TEST_MODE=false
NUM_GPUS=2
GPU_MEMORY_GB=24
GPU_MODEL="NVIDIA RTX 4090"
COMFYUI_INSTALL_CUSTOM_NODES=true

[staging]
MACHINE_ID=${HOSTNAME}-staging
MACHINE_HOST=0.0.0.0
HEALTH_PORT=9090
TEST_MODE=false
NUM_GPUS=2
GPU_MEMORY_GB=24
GPU_MODEL="NVIDIA RTX 4090"
COMFYUI_INSTALL_CUSTOM_NODES=true

[production]
MACHINE_ID=${HOSTNAME}-prod
MACHINE_HOST=0.0.0.0
HEALTH_PORT=9090
TEST_MODE=false
NUM_GPUS=4
GPU_MEMORY_GB=40
GPU_MODEL="NVIDIA RTX 4090"
COMFYUI_INSTALL_CUSTOM_NODES=true
```

#### `config/environments/components/monitor.env`
```ini
# Monitor component configurations
[local]
MONITOR_URL=http://localhost:3333
MONITOR_PORT=3333
MONITOR_LOG_LEVEL=debug
WEBSOCKET_URL=ws://localhost:3331

[development]
MONITOR_URL=https://dev-monitor.emprops.com
MONITOR_PORT=3333
MONITOR_LOG_LEVEL=info
WEBSOCKET_URL=wss://dev-api.emprops.com

[staging]
MONITOR_URL=https://staging-monitor.emprops.com
MONITOR_PORT=3333
MONITOR_LOG_LEVEL=info
WEBSOCKET_URL=wss://staging-api.emprops.com

[production]
MONITOR_URL=https://monitor.emprops.com
MONITOR_PORT=3333
MONITOR_LOG_LEVEL=warn
WEBSOCKET_URL=wss://api.emprops.com
```

#### `config/environments/components/comfy.env`
```ini
# ComfyUI component configurations
[local]
COMFYUI_BASE_PATH=/workspace/ComfyUI
COMFYUI_MODELS_PATH=/workspace/ComfyUI/models
COMFYUI_CUSTOM_NODES_PATH=/workspace/ComfyUI/custom_nodes
COMFYUI_PORT_BASE=8188
CLOUD_PROVIDER=aws
STORAGE_TEST_MODE=true
SKIP_STORAGE_SYNC=true

[development]
COMFYUI_BASE_PATH=/workspace/ComfyUI
COMFYUI_MODELS_PATH=/workspace/ComfyUI/models
COMFYUI_CUSTOM_NODES_PATH=/workspace/ComfyUI/custom_nodes
COMFYUI_PORT_BASE=8188
CLOUD_PROVIDER=aws
STORAGE_TEST_MODE=false
SKIP_STORAGE_SYNC=false
AWS_DEFAULT_REGION=us-east-1

[staging]
COMFYUI_BASE_PATH=/workspace/ComfyUI
COMFYUI_MODELS_PATH=/workspace/ComfyUI/models
COMFYUI_CUSTOM_NODES_PATH=/workspace/ComfyUI/custom_nodes
COMFYUI_PORT_BASE=8188
CLOUD_PROVIDER=aws
STORAGE_TEST_MODE=false
SKIP_STORAGE_SYNC=false
AWS_DEFAULT_REGION=us-east-1

[production]
COMFYUI_BASE_PATH=/workspace/ComfyUI
COMFYUI_MODELS_PATH=/workspace/ComfyUI/models
COMFYUI_CUSTOM_NODES_PATH=/workspace/ComfyUI/custom_nodes
COMFYUI_PORT_BASE=8188
CLOUD_PROVIDER=aws
STORAGE_TEST_MODE=false
SKIP_STORAGE_SYNC=false
AWS_DEFAULT_REGION=us-west-2
```

### Environment Profiles

#### `config/environments/profiles/full-local.json`
```json
{
  "name": "Full Local Development",
  "description": "All components running locally for offline development",
  "components": {
    "redis": "local",
    "api": "local",
    "machine": "local",
    "monitor": "local",
    "comfy": "local"
  },
  "secrets": [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY_ENCODED"
  ],
  "validation": {
    "required_services": ["redis"],
    "port_conflicts": [6379, 3331, 3333, 8188, 9090]
  }
}
```

#### `config/environments/profiles/dev-mixed.json`
```json
{
  "name": "Development Mixed",
  "description": "Local development with production API and development Redis",
  "components": {
    "redis": "development",
    "api": "production",
    "machine": "local",
    "monitor": "local",
    "comfy": "local"
  },
  "secrets": [
    "DEV_REDIS_PASSWORD",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY_ENCODED"
  ],
  "validation": {
    "required_services": [],
    "network_access": ["dev-redis.emprops.com", "api.emprops.com"]
  }
}
```

#### `config/environments/profiles/staging-mixed.json`
```json
{
  "name": "Staging Mixed",
  "description": "Local machine testing against staging infrastructure",
  "components": {
    "redis": "staging",
    "api": "staging",
    "machine": "local",
    "monitor": "local",
    "comfy": "staging"
  },
  "secrets": [
    "STAGING_REDIS_PASSWORD",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY_ENCODED"
  ],
  "validation": {
    "required_services": [],
    "network_access": ["staging-redis.emprops.com", "staging-api.emprops.com"]
  }
}
```

#### `config/environments/profiles/prod-debug.json`
```json
{
  "name": "Production Debug",
  "description": "Local debugging tools with production infrastructure",
  "components": {
    "redis": "production",
    "api": "production",
    "machine": "local",
    "monitor": "local",
    "comfy": "production"
  },
  "secrets": [
    "PROD_REDIS_PASSWORD",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY_ENCODED"
  ],
  "validation": {
    "required_services": [],
    "network_access": ["prod-redis.emprops.com", "api.emprops.com"],
    "warnings": ["This profile uses production data - use carefully"]
  }
}
```

## Implementation Steps

### Phase 1: Repository Integration

#### Step 1.1: Move emprops_shared
```bash
# Create service-config package
mkdir -p packages/service-config

# Copy content from temp_shared (already cloned)
cp -r temp_shared/* packages/service-config/

# Create package.json for service-config
# Create TypeScript interfaces for configurations
# Clean up and organize structure
```

#### Step 1.2: Move emprops_comfy_nodes
```bash
# Create custom-nodes package
mkdir -p packages/custom-nodes

# Copy content from temp_comfy_nodes (already cloned)
cp -r temp_comfy_nodes/* packages/custom-nodes/

# Create package.json for custom-nodes
# Organize Python code structure
# Update import paths
```

#### Step 1.3: Move emprops_component_library
```bash
# Create component-library package
mkdir -p packages/component-library

# Clone and copy emprops_component_library
git clone git@github.com:stakeordie/emprops_component_library.git temp_component_library
cp -r temp_component_library/* packages/component-library/

# Create package.json for component-library
# Update React component imports
# Integrate with existing design system
```

#### Step 1.4: Create package.json files
Create proper package.json files for all three new packages with dependencies and build scripts.

### Phase 2: Environment Management System

#### Step 2.1: Create Environment Management Package
```bash
mkdir -p packages/env-management/{src,cli}
```

Create TypeScript package with:
- Environment builder (parses component files, builds .env.local)
- Environment validator (checks connectivity, validates variables)
- CLI interface (build, switch, validate, list commands)

#### Step 2.2: Create Component Environment Files
Create all component environment files in `config/environments/components/` with proper sections for each environment.

#### Step 2.3: Create Environment Profiles
Create JSON profile files that define common component combinations.

### Phase 3: Script Enhancement

#### Step 3.1: Environment Management Scripts
Create scripts in `scripts/env/` that use the env-management package:
- `build-env.js` - Build .env.local from profile or component selection
- `validate-env.js` - Validate current environment configuration
- `switch-env.js` - Switch between predefined profiles
- `list-profiles.js` - List available profiles and their descriptions

#### Step 3.2: Update Package.json Scripts
Add new scripts to root package.json:
```json
{
  "scripts": {
    "env:build": "node scripts/env/build-env.js",
    "env:switch": "node scripts/env/switch-env.js", 
    "env:validate": "node scripts/env/validate-env.js",
    "env:list": "node scripts/env/list-profiles.js",
    
    "dev:full-local": "pnpm env:build --profile=full-local && pnpm dev",
    "dev:mixed": "pnpm env:build --profile=dev-mixed && pnpm dev",
    "dev:staging": "pnpm env:build --profile=staging-mixed && pnpm dev",
    
    "setup:developer": "pnpm env:build --profile=full-local && pnpm install && pnpm dev:local-redis"
  }
}
```

### Phase 4: Migration and Testing

#### Step 4.1: Update App Dependencies
Update all apps to use the new monorepo packages:
- Update import statements
- Update configuration loading
- Test all functionality

#### Step 4.2: Environment Migration
- Audit all existing .env files
- Extract unique values
- Migrate to component-based system
- Remove old .env files

#### Step 4.3: Testing
- Test all environment profiles
- Validate mixed environment scenarios
- Update CI/CD pipelines
- Create comprehensive documentation

## Usage Examples

### Development Scenarios

#### Full Local Development
```bash
# Start everything locally
pnpm dev:full-local

# Equivalent to:
pnpm env:build --profile=full-local
pnpm dev
```

#### API Development Against Production Data
```bash
# Local API + Production Redis + Local machine
pnpm env:build --redis=production --api=local --machine=local
pnpm dev:api
```

#### Machine Testing Against Staging
```bash
# Local machine + Staging API + Staging Redis
pnpm env:build --profile=staging-mixed
pnpm machines:basic:local:up
```

#### Frontend Development
```bash
# Local monitor + Production API + Production Redis
pnpm env:build --redis=production --api=production --monitor=local
pnpm dev:monitor
```

#### Custom Environment
```bash
# Build custom environment combination
pnpm env:build --redis=development --api=staging --machine=local --monitor=local --comfy=production

# Validate current environment
pnpm env:validate

# Switch to predefined profile
pnpm env:switch full-local
```

## File Templates

### Package Template: `packages/service-config/package.json`
```json
{
  "name": "@emp/service-config",
  "version": "1.0.0",
  "description": "EmProps service configuration and ComfyUI node management",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "comfy-nodes/",
    "shared-configs/"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "yaml": "^2.3.4",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0"
  },
  "exports": {
    ".": "./dist/index.js",
    "./comfy-nodes": "./comfy-nodes/config_nodes.json",
    "./workflows": "./shared-configs/workflows",
    "./types": "./dist/types.js"
  }
}
```

### Package Template: `packages/custom-nodes/package.json`
```json
{
  "name": "@emp/custom-nodes",
  "version": "1.0.0",
  "description": "EmProps custom ComfyUI nodes",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "src/",
    "requirements.txt",
    "__init__.py",
    "utils.py"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "python -m pytest tests/",
    "test:js": "vitest",
    "lint": "eslint src/ && python -m flake8 src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0"
  },
  "python": {
    "requirements": "requirements.txt",
    "main": "__init__.py"
  }
}
```

### Package Template: `packages/component-library/package.json`
```json
{
  "name": "@emp/component-library",
  "version": "1.0.0",
  "description": "EmProps shared UI component library",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "src/"
  ],
  "scripts": {
    "build": "tsc && vite build",
    "dev": "tsc --watch",
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "@radix-ui/react-dialog": "^1.0.0",
    "@radix-ui/react-button": "^1.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@storybook/react": "^7.0.0",
    "@storybook/react-vite": "^7.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "vite": "^5.0.0",
    "eslint": "^8.0.0",
    "tailwindcss": "^3.0.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0",
    "react-dom": ">=18.0.0"
  }
}
```

### Package Template: `packages/env-management/package.json`
```json
{
  "name": "@emp/env-management",
  "version": "1.0.0",
  "description": "Environment management utilities for EmProps Job Queue",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "emp-env": "dist/cli/index.js"
  },
  "files": [
    "dist/"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "commander": "^11.0.0",
    "chalk": "^5.3.0",
    "ini": "^4.1.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ini": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0"
  }
}
```

## Current Implementation State

### Completed
- ✅ Cloned external repositories to temp directories
- ✅ Analyzed existing structure and environment files
- ✅ Created comprehensive implementation plan

### Next Steps (In Order)
1. **Move emprops_shared to packages/service-config/**
2. **Move emprops_comfy_nodes to packages/custom-nodes/**
3. **Move emprops_component_library to packages/component-library/**
4. **Create environment management package structure**
5. **Create component environment files**
6. **Build environment management CLI**
7. **Create environment profiles**
8. **Update package.json scripts**
9. **Test environment system**
10. **Migrate existing .env files**
11. **Update app dependencies**

### Commands to Continue Implementation
```bash
# Start with repository integration
mkdir -p packages/service-config packages/custom-nodes packages/component-library packages/env-management

# Move repositories (preserving structure)
cp -r temp_shared/* packages/service-config/
cp -r temp_comfy_nodes/* packages/custom-nodes/

# Clone and move component library
git clone git@github.com:stakeordie/emprops_component_library.git temp_component_library
cp -r temp_component_library/* packages/component-library/

# Create environment structure
mkdir -p config/environments/{components,profiles,secrets}
mkdir -p scripts/env

# Continue with detailed implementation...
```

This document serves as a complete roadmap for implementing the monorepo refactor, whether continued by the current agent or picked up by another agent later.