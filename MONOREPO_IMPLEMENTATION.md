# Monorepo Implementation Plan - Phase 1: Turborepo + emp-worker-old Migration

## Overview

Transform emp-job-queue into a comprehensive monorepo that includes the TypeScript job queue system AND the proven emp-worker-old deployment infrastructure. This eliminates the need for parallel development across multiple repositories.

## Phase 1 Goals

1. **Add Turborepo** - Intelligent build system with caching and parallel execution
2. **Migrate emp-worker-old** - Bring in the proven deployment scripts and Docker configurations
3. **Preserve separation** - Keep existing emp-job-queue functionality intact
4. **Unified build system** - Single pipeline for all components

## Turborepo Integration

### Why Turborepo?
- **Intelligent Caching**: Builds only what changed, caches everything else
- **Parallel Execution**: Runs tasks across packages simultaneously  
- **Dependency Awareness**: Understands package dependencies and build order
- **Remote Caching**: Team-wide cache sharing (future benefit)
- **Incremental Builds**: Perfect for our API + Worker + Deployment workflow

### Complexity Assessment: **LOW-MEDIUM**
- **Setup Time**: ~30 minutes initial configuration
- **Learning Curve**: Minimal - uses existing package.json scripts
- **Migration Effort**: Existing builds mostly unchanged
- **Maintenance**: Very low - Turborepo handles complexity

### Turborepo Structure
```
emp-job-queue/ (monorepo root)
├── turbo.json              # Turborepo configuration
├── package.json            # Root package.json with workspaces
├── packages/
│   ├── api/                # Lightweight API server (existing)
│   ├── worker/             # TypeScript workers (existing) 
│   ├── core/               # Shared types, Redis functions (existing)
│   └── deployment/         # emp-worker-old deployment scripts (NEW)
├── apps/
│   ├── monitor/            # Monitor UI (existing)
│   └── docs/               # Documentation (existing)
└── tools/
    └── build/              # Build utilities
```

## Implementation Steps

### Step 1: Turborepo Setup (30 minutes)

#### 1.1 Install Turborepo
```bash
# Add Turborepo to root
pnpm add -D turbo

# Initialize Turborepo configuration
npx turbo init
```

#### 1.2 Configure Workspace Structure
```json
// package.json - Add workspaces
{
  "workspaces": [
    "packages/*",
    "apps/*",
    "tools/*"
  ]
}
```

#### 1.3 Create Turborepo Configuration
```json
// turbo.json
{
  "globalEnv": ["NODE_ENV"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

### Step 2: Restructure Existing Code (15 minutes)

#### 2.1 Move Components to Packages
```bash
# Create packages structure
mkdir -p packages/{api,worker,core,deployment}
mkdir -p tools/build

# Move existing code (preserve git history)
git mv src/api packages/api/src
git mv src/worker packages/worker/src  
git mv src/core packages/core/src
git mv src/redis-functions packages/core/redis-functions

# Create package.json files for each package
```

#### 2.2 Update Import Paths
```typescript
// Before: import { JobBroker } from '../core/job-broker'
// After:  import { JobBroker } from '@emp/core'
```

### Step 3: Migrate emp-worker-old (45 minutes)

#### 3.1 Copy emp-worker-old Content
```bash
# Copy entire emp-worker-old into packages/deployment
cp -r ../emp-worker-old/* packages/deployment/

# Preserve git history with subtree merge (alternative approach)
git subtree add --prefix=packages/deployment emp-worker-old master --squash
```

#### 3.2 Create Deployment Package Structure
```
packages/deployment/
├── package.json           # Deployment package configuration
├── scripts/               # All emp-worker-old scripts (mgpu, wgpu, etc.)
│   ├── mgpu
│   ├── wgpu
│   ├── start.sh
│   └── worker
├── docker/
│   ├── Dockerfile         # emp-worker-old Dockerfile
│   └── docker-compose.yml # emp-worker-old compose
├── config/
│   └── .env.sample       # Environment templates
└── README.md             # Deployment documentation
```

#### 3.3 Update Deployment Scripts for Monorepo
```bash
# In packages/deployment/scripts/start.sh
# Update setup_redis_workers() function to use monorepo worker builds

setup_redis_workers() {
    log "Setting up TypeScript Redis Workers from monorepo..."
    
    # Use local monorepo build instead of GitHub releases
    local WORKER_BUILD_DIR="../../worker/dist"
    
    if [ ! -d "$WORKER_BUILD_DIR" ]; then
        log "ERROR: Worker build not found. Run 'turbo build' from monorepo root first."
        return 1
    fi
    
    # Copy worker build to each GPU directory
    for i in $(seq 0 $((NUM_GPUS-1))); do
        local WORKER_DIR="${ROOT}/worker_gpu${i}"
        log "Setting up worker in ${WORKER_DIR}"
        
        mkdir -p "${WORKER_DIR}"
        cp -r "$WORKER_BUILD_DIR"/* "${WORKER_DIR}/"
        
        # Create worker_main.js entry point
        cat > "${WORKER_DIR}/worker_main.js" <<EOF
#!/usr/bin/env node
require('./worker/index.js');
EOF
        chmod +x "${WORKER_DIR}/worker_main.js"
    done
}
```

### Step 4: Unified Build Configuration (20 minutes)

#### 4.1 Root Package.json Scripts
```json
{
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "build:worker-release": "turbo run build --filter=worker && node tools/build/package-worker.js",
    "deploy:local": "turbo run build && cd packages/deployment && ./scripts/start.sh",
    "docker:build": "cd packages/deployment && docker compose build",
    "docker:up": "cd packages/deployment && docker compose up"
  }
}
```

#### 4.2 Individual Package Configs
```json
// packages/worker/package.json
{
  "name": "@emp/worker",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest"
  },
  "dependencies": {
    "@emp/core": "workspace:*"
  }
}
```

## Expected Benefits

### Development Experience
- **Single Clone**: One `git clone` gets everything
- **Unified Dependencies**: Shared packages, no version conflicts
- **Parallel Builds**: `turbo build` builds all packages simultaneously
- **Intelligent Caching**: Only rebuilds what changed
- **Type Safety**: Shared types across all packages

### Deployment Simplification  
- **Single Source**: All deployment scripts in one repo
- **Version Sync**: API and workers always compatible
- **Local Testing**: Full stack testing in one place
- **Release Coordination**: Coordinated releases of all components

### Operational Benefits
- **Simplified CI/CD**: Single pipeline for all components
- **Unified Documentation**: All docs in one place
- **Easier Debugging**: Full stack visibility
- **Team Collaboration**: Single repo for all contributors

## Implementation Timeline

### Phase 1A: Turborepo Setup (1 hour)
- [ ] Install Turborepo
- [ ] Configure workspace structure  
- [ ] Restructure existing code into packages
- [ ] Verify all builds work with Turborepo

### Phase 1B: emp-worker-old Migration (1.5 hours)
- [ ] Copy emp-worker-old content to packages/deployment
- [ ] Update deployment scripts for monorepo integration
- [ ] Test local deployment with monorepo worker builds
- [ ] Verify Docker builds work

### Phase 1C: Integration Testing (30 minutes)
- [ ] End-to-end build test: `turbo build`
- [ ] Local deployment test: `pnpm deploy:local`
- [ ] Docker deployment test: `pnpm docker:up`
- [ ] Verify all existing functionality preserved

## Success Criteria

1. **🚧 Turborepo Working**: `turbo build` builds most packages, TypeScript errors in @emp/core need resolution
2. **⏳ emp-worker-old Integrated**: All deployment scripts accessible and functional
3. **🚧 Unified Builds**: Single command builds most components, core package needs fixes
4. **⏳ Local Deployment**: Can deploy full stack locally from monorepo
5. **⏳ Docker Integration**: Docker builds work with monorepo structure
6. **✅ No Regression**: All existing emp-job-queue functionality preserved

## Current Status (Updated 2025-01-07)

### Phase 1A: Turborepo Setup ✅ COMPLETED
- [x] Install Turborepo
- [x] Configure workspace structure using pnpm-workspace.yaml
- [x] Restructure existing code into packages/ and apps/
- [x] Clean up unused files and configurations
- [x] Distribute environment files to component directories
- [x] Create individual package.json files for each component

### Phase 1B: Build System Integration 🚧 IN PROGRESS
- [x] Created turbo.json configuration
- [x] Updated root package.json scripts
- [x] Configured individual package build scripts
- [ ] **CURRENT ISSUE**: TypeScript compilation errors in @emp/core package
  - Module resolution issues with .js extensions in imports
  - Files outside rootDir causing tsconfig errors
  - Duplicate export conflicts in index.ts files

### Phase 1C: emp-worker-old Migration ⏳ PENDING
- [ ] Copy emp-worker-old content to packages/deployment
- [ ] Update deployment scripts for monorepo integration
- [ ] Test local deployment with monorepo worker builds
- [ ] Verify Docker builds work

## Current Project Structure

```
emp-job-queue/ (monorepo root)
├── turbo.json              # ✅ Turborepo configuration
├── package.json            # ✅ Root package.json with turbo scripts
├── pnpm-workspace.yaml     # ✅ Workspace configuration
├── packages/
│   └── core/               # 🚧 Shared types, Redis functions (build errors)
│       ├── src/
│       ├── package.json
│       └── .env.local
├── apps/
│   ├── api/                # ✅ Lightweight API server
│   ├── worker/             # ✅ TypeScript workers
│   ├── monitor-nextjs/     # ✅ Monitor UI
│   └── docs/               # ✅ Documentation
└── tools/                  # ✅ Empty, ready for build utilities
```

## Immediate Next Steps

1. **Fix @emp/core TypeScript compilation errors**
   - Resolve module resolution issues with .js extensions
   - Ensure all source files are under src/ directory
   - Fix duplicate export conflicts
   - Test `npx turbo build` until successful

2. **Complete Phase 1B**
   - Verify all packages build successfully
   - Test development workflow with `turbo dev`
   - Ensure proper dependency resolution between packages

3. **Begin Phase 1C**
   - Migrate emp-worker-old deployment infrastructure
   - Update deployment scripts for monorepo builds
   - Test end-to-end deployment workflow

## Key Achievements

- **Monorepo Structure**: Successfully restructured from single package to proper monorepo
- **Package Separation**: Clean separation between packages (libraries) and apps (deployables)
- **Environment Distribution**: Each component has its own .env.local configuration
- **Build System**: Turborepo configured with proper dependency management
- **Clean Branch**: Removed ~30+ unnecessary files and configurations
- **Git History**: Preserved commit history during restructuring with git mv operations

## Known Issues

1. **TypeScript Build Errors**: @emp/core package has module resolution issues
2. **Import Path Conflicts**: Some imports using .js extensions causing resolution problems
3. **File Organization**: Some files may be outside expected src/ directory structure

## Risk Mitigation

1. **Gradual Migration**: Keep existing structure until monorepo proven
2. **Git History**: Preserve commit history during restructuring
3. **Backup Branch**: Keep master branch unchanged until migration complete
4. **Rollback Plan**: Can revert to separate repos if needed
5. **Testing**: Comprehensive testing at each phase

This approach gives us the best of both worlds: proven deployment infrastructure from emp-worker-old combined with modern TypeScript job queue system, all unified under Turborepo for optimal development experience.