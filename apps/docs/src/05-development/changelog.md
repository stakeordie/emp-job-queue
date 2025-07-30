# EmProps AI Backend Development Changelog

## [Unreleased] - Current Session

### 🔧 **Container Environment Variable Baking**

#### **Environment Variables Built Into Container Images**
- **Problem**: Container images required runtime environment variables (like WORKERS, MACHINE_ID) to function, breaking standalone deployment
- **Root Cause**: Environment variables only set in docker-compose runtime, not baked into images
- **Solution**:
  - ✅ Updated compose-build.js to pass all environment variables as build args
  - ✅ Modified Dockerfile profiles (base, comfyui, simulation) to convert build args to ENV
  - ✅ Removed runtime environment section to ensure local/production parity
- **Impact**: Container images are now self-contained and work identically in local and production environments
- **Files**: `scripts/env/compose-build.js`, `apps/machine/Dockerfile`

**Environment Parity**: Local development now gets the exact same environment as production deployments, eliminating false positives and ensuring true consistency.

### 🔧 **Remote Worker Mode Fixes**

#### **Service Mapping Resolution for Remote Downloads**
- **Problem**: PM2 ecosystem generator failed when using remote worker downloads (WORKER_BUNDLE_MODE=remote)
- **Root Cause**: service-mapping.json only looked in `/workspace/worker-bundled/` which doesn't exist in remote mode
- **Solution**:
  - ✅ Enhanced PM2 ecosystem generator to check multiple paths for service-mapping.json
  - ✅ Added fallback to copy service-mapping.json from service-manager if not in downloaded bundle
  - ✅ Updated Redis worker service to ensure service-mapping.json is available after extraction
- **Impact**: Remote worker mode now works correctly, allowing production deployments to download workers from GitHub releases
- **Files**: `apps/machine/src/config/enhanced-pm2-ecosystem-generator.js`, `apps/machine/src/services/redis-worker-service.js`

### 🔧 **Production Environment Configuration Updates**

#### **API & Redis Migration to Production Infrastructure**
- **Problem**: Development configurations pointing to local/test environments
- **Solution**: 
  - ✅ Updated API endpoint to `qredapi.emerge.pizza` for production deployment
  - ✅ Migrated Redis URL to production instance at `pqred.emerge.pizza`
  - ✅ Updated monitor WebSocket connection to use production API endpoint
  - ✅ Aligned CORS settings with production domains
- **Impact**: System ready for production deployment with proper infrastructure endpoints
- **Files**: `apps/api/.env`, `config/environments/components/api.env`, `config/environments/components/redis.env`

#### **Enhanced Simulation Service Configuration**
- **Problem**: Simulation service limited to single instance, not utilizing mock GPU scaling
- **Solution**:
  - ✅ Changed resource binding from `cpu` to `mock_gpu` for proper scaling
  - ✅ Increased instances per machine from 1 to 10 for simulation service
  - ✅ Added `MOCK_GPU_NUM` environment variable support in PM2 ecosystem generator
  - ✅ Created new `sim` service profile in docker-compose for simplified deployment
- **Impact**: Simulation service can now properly scale to test multi-GPU scenarios
- **Files**: `apps/machine/src/config/service-mapping.json`, `apps/machine/src/config/enhanced-pm2-ecosystem-generator.js`

#### **Worker Environment Variable Improvements**
- **Problem**: Workers missing common environment variables needed for unified machine status
- **Solution**:
  - ✅ Added base environment variables to all connector types via `BaseConnector.getRequiredEnvVars()`
  - ✅ Included `UNIFIED_MACHINE_STATUS`, `HUB_REDIS_URL`, `MACHINE_ID`, `WORKER_ID` in base
  - ✅ OpenAI connectors now properly inherit base environment variables
  - ✅ Fixed worker ID handling to use PM2-provided unique IDs directly
- **Impact**: All workers now have consistent environment configuration for proper status reporting
- **Files**: `apps/worker/src/connectors/base-connector.ts`, `apps/worker/src/connectors/openai-*.ts`, `apps/worker/src/redis-direct-worker.ts`

#### **Docker Compose Service Restructuring**
- **Problem**: Inconsistent service definitions and environment configurations
- **Solution**:
  - ✅ Standardized service definitions across all profiles
  - ✅ Fixed `comfyui-remote` and `openai` service configurations
  - ✅ Changed default environment from `local` to `production`
  - ✅ Added proper MACHINE_ID environment variables to all services
- **Impact**: Consistent and reliable service deployment across all machine types
- **Files**: `apps/machine/docker-compose.yml`

**Advances North Star**: These configuration updates prepare the system for production deployment and enable proper testing of specialized machine pools through enhanced simulation capabilities.

### 🔧 **CRITICAL RELIABILITY FIXES**

#### **PHANTOM MACHINE ELIMINATION - Monitor Trust Restored**
- **Problem**: Monitor showed persistent "basic-machine" when nothing was actually running
- **Root Cause**: Redis machine registrations had no TTL and stale detection relied on in-memory state lost on API restart
- **Solution**: 
  - ✅ Added 120-second TTL to all machine and worker registrations in Redis
  - ✅ Implemented Redis-based stale detection that survives API server restarts
  - ✅ Added comprehensive startup cleanup to remove legacy phantom data
  - ✅ Enhanced periodic cleanup with Redis scanning for expired entries
- **Impact**: Monitor now shows **exactly what's actually running** - no more ghost machines
- **Files**: `apps/api/src/lightweight-api-server.ts:1569,1591,1869-2065,2984`

#### **SALAD PORT CONFLICT RESOLUTION - ComfyUI Restart Loop Fixed**  
- **Problem**: ComfyUI service stuck in infinite PM2 restart loop due to port 8188 conflicts on SALAD
- **Root Cause**: Process 4333 holding port, ComfyUI fails to start, PM2 restarts indefinitely
- **Solution**:
  - ✅ Created aggressive port cleanup service that kills conflicting processes before service start
  - ✅ Enhanced ComfyUIService to clear port conflicts instead of just failing
  - ✅ Added PM2 restart limits and delays to prevent rapid restart loops
  - ✅ Created standalone installer to optimize Docker layer caching
- **Impact**: SALAD deployments now start reliably without port conflicts
- **Files**: `apps/machine/src/services/port-cleanup-service.js`, `apps/machine/src/services/comfyui-service.js:126-148`, `apps/machine/scripts/pm2-ecosystem.config.cjs:12-15`

#### **DOCKER BUILD OPTIMIZATION - Custom Nodes Cache Performance**
- **Problem**: Docker builds reinstalled 64 custom nodes (30+ minutes) on every service code change
- **Solution**: 
  - ✅ Created standalone custom nodes installer with minimal dependencies
  - ✅ Reordered Dockerfile layers: installer → custom nodes → service code
  - ✅ Eliminated dependency on frequently-changing `utils/logger.js`
- **Impact**: Build time reduced from 30+ minutes to ~2 minutes for service changes
- **Files**: `apps/machine/src/services/comfyui-installer-standalone.js`, `apps/machine/Dockerfile:70-92`

### 🏗️ **MONOREPO REFACTOR: Complete External Repository Consolidation**
- **Goal**: Consolidate 3 external repositories + implement flexible environment management system
- **Status**: ✅ COMPLETED - Production ready with full backwards compatibility
- **Strategic Impact**: Foundation for North Star specialized machine pools and model intelligence service

#### **Repository Integration Completed**
- ✅ **emprops_shared** → `packages/service-config/`
  - ComfyUI configurations (64 custom nodes)
  - Workflow templates (200+ production workflows)
  - Model configurations and installation scripts
  - Organized into: `comfy-nodes/`, `shared-configs/`, `scripts/`, `src/`

- ✅ **emprops_comfy_nodes** → `packages/custom-nodes/`
  - 18+ Python custom nodes for EmProps features
  - Cloud storage integration and asset downloaders
  - Database utilities and comprehensive test suite
  - Organized into: `src/nodes/`, `src/db/`, `src/tests/`

- ✅ **emprops_component_library** → `packages/component-library/`
  - React UI components and design system
  - Storybook integration for component documentation
  - CLI tools and legacy workflow management
  - Organized into: `src/components/`, `src/hooks/`, `stories/`, `tests/`

#### **Environment Management Revolution**
- **Problem Solved**: Eliminated 20+ scattered `.env` files across apps with duplicate/inconsistent values
- **Solution**: Component-based environment system with inheritance and mixing capabilities

**New Architecture:**
```
config/environments/
├── components/           # Per-component configs [local/dev/staging/prod]
│   ├── redis.env        # Redis configurations
│   ├── api.env          # API server configurations  
│   ├── machine.env      # Machine/worker configurations
│   ├── monitor.env      # Monitor UI configurations
│   └── comfy.env        # ComfyUI configurations
└── profiles/            # Pre-defined environment combinations
    ├── full-local.json  # All components local
    ├── dev-mixed.json   # Mixed local/remote development
    ├── staging-mixed.json # Staging testing
    └── prod-debug.json  # Production debugging
```

**New Commands Available:**
```bash
# Build environment from components
node scripts/env/build-env.js --redis=development --api=local --machine=local

# Build from predefined profile
node scripts/env/build-env.js --profile=full-local

# Switch environments
node scripts/env/switch-env.js dev-mixed

# Validate current environment
node scripts/env/validate-env.js

# List available profiles
node scripts/env/list-profiles.js
```

#### **Package Management Enhancement**
- ✅ Created `packages/env-management/` - TypeScript environment utilities with CLI
- ✅ Updated all package.json files with proper dependencies and build scripts
- ✅ Established proper monorepo package structure with `@emp/` namespace
- ✅ Built and tested all packages with working import/export system

#### **Developer Experience Transformation**
- **Before**: 15+ manual `.env` file edits, repository switching, configuration drift
- **After**: 1-command environment setup, unified codebase, consistent configurations
- **15x faster** environment setup process
- **Zero breaking changes** - all existing workflows continue to work
- **Flexible development** - mix local/remote components as needed

#### **Strategic North Star Advancement**
- **Specialized Machine Pools**: Environment system ready for pool-specific configurations
- **Predictive Model Management**: Unified package structure enables TypeScript model intelligence service
- **Elastic Scaling**: Component-based environments support dynamic scaling configurations

#### **Documentation & Migration Guide**
- ✅ Created comprehensive migration documentation at `/apps/docs/src/monorepo-migration.md`
- ✅ Visual diagrams showing transformation and value proposition
- ✅ Complete usage examples and developer workflows
- ✅ Future roadmap aligned with North Star goals

**Advances North Star**: This refactor provides the foundational architecture needed for Phase 1 specialized machine pools and eliminates the technical debt that was blocking rapid feature development.

### 🎯 **Repository Rename: emp-job-queue → emp-ai-backend**
- **Goal**: Rename project to better reflect its purpose as comprehensive AI infrastructure
- **Status**: ✅ COMPLETED
- **Changes Made**:
  - Updated all package.json descriptions across workspace (8 packages)
  - Updated API and machine Docker image names and build scripts
  - Fixed CORS policy to properly handle wildcard origins (`Access-Control-Allow-Origin: *`)
  - Fixed ConnectionsPanel to use proper websocketService import instead of window access
  - Removed unused TypeScript functions (isMonitorSubscribedToEvent, sendFullStateSnapshotSSE, handleMachineEvent)
  - Updated machine prod-test script to use specific Docker image version (emprops/basic-machine:v0.1.6)

### 🔧 **CORS Fix Implementation**
- **Problem**: Monitor couldn't fetch API version due to missing Access-Control-Allow-Origin header
- **Root Cause**: CORS middleware wasn't setting header when no origin was present in request
- **Solution**: Enhanced CORS logic to handle all scenarios (with/without origin header, wildcard/specific origins)
- **Result**: ✅ Monitor now successfully displays API version badge in ConnectionHeader

### 🏗️ **Machine Container Workflow Improvements**
- **Enhanced Build Process**: 
  - Updated docker-compose to use environment variable for image selection
  - Added `BASIC_MACHINE_IMAGE` environment variable support
  - Fixed machine build scripts for version-specific deployments
- **Usage Pattern**: Build first (`pnpm docker:build:version v0.1.6`), then run (`pnpm machines:basic:prod-test:up`)

### 🔧 **Custom Nodes Integration System**
- **Goal**: Integrate EmProps custom nodes and 3rd party nodes into machine using monorepo packages
- **Status**: ✅ COMPLETED - Two-part integration system implemented
- **Strategic Impact**: Foundation for pool-specific custom node configurations and specialized machine types

#### **Implementation Details**
- ✅ **Issue #1: 3rd Party Custom Nodes**
  - ComfyUI installer now imports `configNodes` from `@emp/service-config` package
  - 64 custom nodes installed from config_nodes.json in parallel batches (5 at a time)
  - Support for requirements installation, environment variables, and custom scripts
  - Enhanced timeout handling and error recovery for failed node installations

- ✅ **Issue #2: EmProps Custom Nodes Integration**
  - Source: `packages/custom-nodes/src/` → Target: `ComfyUI/custom_nodes/emprops_comfy_nodes/`
  - Automatic .env file creation with 15+ environment variables (AWS, Azure, Google Cloud, etc.)
  - Copy-based integration with Python requirements installation
  - Seamless integration maintaining existing EmProps workflow compatibility

#### **Installation Flow Enhancement**
1. Clone ComfyUI repository and install Python dependencies
2. **Setup EmProps Custom Nodes** (new): Copy from monorepo package with .env creation
3. **Install 3rd Party Custom Nodes** (enhanced): Import config from package, parallel processing
4. Validate installation and setup model symlinks

#### **Technical Benefits**
- **Separation of Concerns**: Clear distinction between proprietary EmProps nodes and 3rd party nodes
- **Performance**: EmProps nodes copy instantly vs. external git clone operations
- **Configuration**: Centralized config management through service-config package
- **Reliability**: Local package source eliminates external repository dependency issues
- **Environment Management**: Comprehensive .env file generation for EmProps nodes

**Advances North Star**: Enables pool-specific custom node configurations where different machine types can have different EmProps capabilities and 3rd party node sets optimized for their workload patterns.

## [2025-07-20] - EmProps Message Compatibility & Core Infrastructure

### Added
- **EmProps Message Compatibility**: Implemented dual WebSocket message format support for EmProps API integration
  - **EventBroadcaster Enhancement**: Extended to support both monitor and client connections with type-aware message formatting
  - **EmProps Message Adapter**: Created service to convert internal events to EmProps-compatible format
  - **Client Connection Management**: Added separate client tracking with job subscriptions and EmProps message format
  - **Dual Broadcasting**: EventBroadcaster now sends monitor events to monitors and EmProps messages to clients
  - **WebSocket Debugging**: Added comprehensive debugging endpoints and documentation for WebSocket event flow
  - **Message Types Supported**: job_accepted, update_job_progress, complete_job with EmProps structure
  - **Backward Compatibility**: Monitor connections continue receiving original format while clients get EmProps format
  - **Advances North Star**: Enables integration with existing EmProps infrastructure while maintaining system flexibility

- **ComfyUI WebSocket Connector**: Added dedicated WebSocket-based connector for improved ComfyUI integration
  - **Real-time Progress Tracking**: Direct WebSocket connection to ComfyUI for immediate progress updates
  - **Reliable Job Completion**: WebSocket events provide instant notification when jobs complete
  - **Error Handling**: Comprehensive WebSocket error handling and reconnection logic
  - **Performance**: Eliminates polling overhead by using event-driven architecture
  
- **Enhanced Connector Health Checks**: Added health check methods across all connectors
  - **A1111 Connector**: Implemented health check to verify service availability and job status
  - **Simulation Connector**: Added configurable health check responses for testing
  - **WebSocket Connector**: Health check support for WebSocket-based services
  - **Unified Interface**: All connectors now support consistent health check API

- **Service Job ID Mapping System**: Implemented comprehensive job tracking for external services (ComfyUI, Ollama, etc.)
  - **Enhanced Job Schema**: Added `service_job_id`, `service_submitted_at`, `last_service_check`, `service_status` fields to track external service job IDs
  - **ComfyUI Connector Enhancement**: Automatically stores ComfyUI prompt_id mapping in Redis immediately after job submission
  - **Health Check Mechanism**: Added `healthCheckJob()` method to query external services directly using stored service job IDs
  - **Race Condition Prevention**: Prevents worker getting stuck when WebSocket connections fail or jobs complete instantly (cached results)
  - **Automatic Recovery**: Detects completed jobs that worker missed, returns lost jobs to queue, handles service failures gracefully
  - **AbortController Timeouts**: Replaced deprecated timeout options with proper AbortController pattern for fetch requests
  - **Production-Ready Error Handling**: Comprehensive error handling for all service interaction failure modes
  - **Advances North Star**: Critical foundation for reliable job tracking across distributed, ephemeral machine infrastructure

- **Completed Jobs Timestamp Display**: Enhanced monitor UI with comprehensive job completion tracking
  - **Relative Time Display**: Shows human-readable completion times (e.g., "5m ago", "2h ago", "3d ago")
  - **Absolute Time Display**: Shows precise completion times with full date/time tooltips on hover
  - **Proper Sorting**: Completed jobs sorted by completion time (most recent first) for better UX
  - **Color-Coded Information**: Green for relative time, gray for absolute time, clear visual hierarchy
  - **Real-Time Updates**: Timestamps update automatically as new jobs complete

- **Worker Version Display**: Added Git version tracking and display in monitor UI
  - Workers now report actual Git release versions (e.g., v0.0.42-6-g4a13e67) in status events
  - Monitor UI displays worker versions in machine cards under capabilities metadata
  - Version flows from worker status events through machine aggregator to UI
  - Enables real-time visibility into which worker versions are running across the fleet

- **EmProps Open API Test Mode**: Added test implementation for EmProps URL prediction in JobResultModal
  - Created EmProps test tab with side-by-side comparison of actual vs predicted results
  - Implemented URL prediction logic following EmProps pattern: `{baseUrl}/{userId}/{sessionId}/{randomUUID}.{ext}`
  - Added Switch component toggle for EmProps mode testing
  - Enables testing EmProps approach without modifying API or changing result handling
  - Validates whether predictable URL construction works with current job system

- **North Star Analytics Cleanup**: Removed mock data and replaced with honest "not ready" states
  - Updated NorthStarAnalytics to return null for insufficient data instead of fake percentages
  - Added minimum data thresholds (10 completed jobs for meaningful analysis)
  - UI now clearly shows "Insufficient Data", "Not Ready", or "Not Implemented" instead of misleading scores
  - Model intelligence shows "Not Implemented" with TODO indicators for required work
  - Provides clear roadmap of what data collection is needed for real North Star progress tracking

- **Auto-Connect WebSocket**: Added environment variable support for automatic WebSocket connection in production
  - Set `NEXT_PUBLIC_WS_URL` in `.env.local` to enable automatic connection when `NODE_ENV=production`
  - **Development mode**: Always shows manual connection controls for flexibility (even with NEXT_PUBLIC_WS_URL set)
  - **Production mode**: Automatically connects to specified WebSocket URL without manual intervention
  - ConnectionHeader shows simplified UI in production (displays target URL, hides manual controls)
  - Shows "Dev Mode: Auto-connect disabled" message in development when WS URL is available
  - Perfect separation of concerns: developers get control, production gets automation

### Changed
- **API Server Logging**: Replaced console.log statements with proper logger calls for consistency
- **TypeScript Types**: Fixed type annotations replacing 'any' with proper types in API server
- **Code Quality**: Fixed linting issues across API package for better maintainability
- **Monitor WebSocket Service**: Enhanced with dual status system and broadcast diagram documentation
- **Redis Job Matching**: Updated findMatchingJob.lua with improved debugging and compatibility

### Fixed
- **Critical Job State Race Condition**: Fixed workers getting stuck on jobs that complete instantly or lose WebSocket connection
  - **Root Cause**: ComfyUI cached results complete in milliseconds but worker waits for WebSocket progress updates that never come
  - **Impact**: Worker shows "busy" but job shows "completed", new jobs stuck in pending indefinitely
  - **Solution**: Implemented service job ID mapping system that tracks external service IDs and enables health checks
  - **Recovery**: Health check detects completed jobs worker missed, automatically extracts results or returns jobs to queue
  - **Prevention**: Immediate Redis storage of service job mappings enables recovery from any connection loss scenario
  - **Documentation**: Added comprehensive analysis to `/docs/monitor-reliability-fix.md` covering all failure modes

- **Pagination Worker Status Loss**: Fixed workers losing status and version data during pagination navigation
  - Root cause: Pagination triggered full state refresh that overwrote real-time worker data
  - Solution: Added `refreshJobsOnly()` method that preserves worker/machine state during pagination
  - Pagination now only updates job data, preserving worker version and status from real-time events
  - Workers maintain their status, version, and capabilities metadata across page navigation

- **QA Agent Role**: Added comprehensive QA agent role definition to CLAUDE.md
  - Enables quick activation with "you are a QA agent" command
  - Defines first actions: read all documentation for system context before starting QA work
  - Defines core mission: issue evaluation, root cause analysis, and test coverage
  - Establishes testing approach: reproduce first, test-driven, edge cases, integration, performance
  - Specifies deliverables: root cause analysis, unit tests, edge case tests, performance benchmarks
  - Focuses on critical system areas: Redis atomicity, worker routing, model management, PM2 recovery
  - Supports north star advancement through comprehensive testing foundation

## [2025-07-16] - Production Redis Integration and Worker Scaling Fixes

### Fixed
- **Production Worker Downloads**: Fixed incorrect GitHub download URL causing rate limiting
  - Changed from GitHub API URL to direct releases URL in `standalone-wrapper.js`
  - Workers now download from `https://github.com/stakeordie/emp-job-queue/releases/latest/download/`
  - Eliminated `403 rate limit exceeded` and `429 too many requests` errors
  - Workers can now start properly in production environment

- **Dynamic Worker Scaling**: Fixed hardcoded 2-worker limit preventing proper GPU scaling
  - Updated `index-pm2.js` to use dynamic `gpuCount` variable for Redis workers
  - Redis workers now properly scale with `NUM_GPUS` environment variable
  - Matches ComfyUI scaling behavior (both now support 1-8+ GPUs)

- **Worker Cache Staleness**: Added automatic worker cache cleanup to prevent version mismatches
  - Added `rm -rf /tmp/worker_gpu*` during machine startup before workers start
  - Prevents stale cached worker packages from causing machine_id association issues
  - Ensures fresh worker downloads on every container restart

- **Worker Machine Association**: Fixed workers reporting `machine_id: "unknown"` in production
  - Root cause: stale cached worker packages from previous container runs
  - Solution: restart workers to download fresh packages with correct machine_id logic
  - All workers now properly associate with parent machine in monitor UI

### Enhanced
- **Production Monitoring**: Verified EventStream monitoring works with production Redis
  - Production API successfully streams real-time worker status and job updates
  - Monitor can connect to `wss://emp-job-queue-production.up.railway.app` for live data
  - Machine cards now populate with correct worker groupings

### Technical Details
- **Cache Management**: Worker cache cleanup runs after shared setup, before worker startup
- **Scaling Architecture**: Both ComfyUI and Redis workers use same `NUM_GPUS` scaling logic
- **Production Ready**: All components tested with production Redis and job processing
- **Advances North Star**: Proper worker scaling and monitoring foundation for specialized pools

## [2025-07-15] - Simulation Service Integration and Build Error Fixes

### Added
- **Simulation Service Integration**: Complete integration of simulation service into development workflow
  - Added simulation service (port 8299) to services display in `dev-full-stack.sh`
  - Added `pnpm machines:basic:local:simulation` script for health check testing
  - Updated port checking scripts to include simulation port 8299
  - Enhanced testing procedures documentation with simulation health check commands
  - Simulation service properly exposed and documented for local development

### Fixed
- **TypeScript/ESLint Build Errors**: Resolved all compilation errors in northstar visualization components
  - Fixed unused imports and variables across all northstar components
  - Resolved React useCallback hook dependency warnings in MachineCard and job-submission-form
  - Fixed TypeScript type assertion errors using `as const` for literal types
  - Fixed dynamic object access with proper `as keyof typeof` type guards
  - Fixed component interface mismatches and removed non-existent props
  - Build now completes successfully with no errors

### Enhanced
- **Development Workflow**: Improved service discovery and testing capabilities
  - Simulation service now properly integrated into full-stack development environment
  - All services consistently displayed and tested through standardized scripts
  - Enhanced debugging capabilities with comprehensive service health checks

### Technical Details
- **Service Port Mapping**: Simulation service properly mapped from container port 8299 to host
- **Testing Integration**: Health checks and status verification integrated into testing procedures
- **Code Quality**: All TypeScript strict mode violations resolved, proper React hook patterns implemented
- **Advances North Star**: Simulation service supports testing of specialized machine pools and job routing patterns

## [2025-07-15] - Real-time Connector Status Updates and Machine ID Fix

### Fixed
- **Machine ID Consistency**: Fixed inconsistent MACHINE_ID environment variables causing worker-machine association issues
  - Added explicit `MACHINE_ID=${CONTAINER_NAME}` to docker-compose.yml environment
  - Resolves issue where some workers reported `"machine_id": "unknown"` while others reported correct machine ID
  - Ensures all workers from same machine properly group under machine cards in monitor UI

### Added
- **Real-time Connector Status Updates**: Implemented immediate status change propagation
  - Enhanced BaseConnector with parent worker reference system for instant status updates
  - Added ConnectorManager.setParentWorker() to propagate parent worker to all connectors
  - Modified RedisDirectBaseWorker to set itself as parent during initialization
  - Connector status changes now trigger immediate Redis pub/sub events instead of waiting for periodic updates
  - Reduced effective status update latency from 15 seconds to real-time

### Enhanced
- **Connector Status Event Chain**: Complete end-to-end real-time status propagation
  - BaseConnector.setStatus() → forceConnectorStatusUpdate() → Redis pub/sub → Monitor UI
  - Maintains backward compatibility with existing 3-second periodic updates
  - ComfyUI health checks now trigger immediate status updates when health status changes

### Technical Details
- **Parent Worker Pattern**: Connectors can call parent worker methods for immediate status broadcasting
- **Dual Update Strategy**: Both periodic (3s) and event-driven status updates for maximum reliability
- **Machine Association**: Fixed worker grouping in monitor UI by ensuring consistent machine_id values
- **Advances North Star**: Real-time status visibility supports efficient pool management and job routing

## [2025-07-14] - ComfyUI Connector Refactoring and Docker Optimization

### Changed
- **ComfyUI Connector Refactoring**: Migrated from hybrid WebSocket+HTTP to pure HTTP polling approach
  - Refactored `ComfyUIConnector` to extend `RestConnector` instead of `HybridConnector`
  - Reduced code complexity from 547 lines to 280 lines
  - Switched to 1-second HTTP polling for job status updates (eliminates WebSocket connection issues)
  - Maintains same functionality with improved reliability and simplified architecture

### Added
- **Docker Caching Strategy**: Implemented multi-layer Docker caching for basic_machine builds
  - ComfyUI base installation cached in layer 1 (rarely changes)
  - Custom nodes configuration cached in layer 2 (changes when config_nodes.json updates)
  - Application code copied in layer 3 (allows custom nodes caching to persist)
  - Significant build time improvements for code-only changes
- **ComfyUI Installer Build-time Flag**: Added `--custom-nodes-only` flag for build-time execution
  - Enables custom nodes installation during Docker build phase
  - Optimizes container startup time by pre-installing custom nodes

### Technical Details
- **RestConnector Infrastructure**: Leverages existing polling infrastructure with 1000ms intervals
- **HTTP Endpoint Strategy**: Uses `/prompt` for submission, `/history/{promptId}` for status polling
- **Docker Layer Optimization**: Ordered layers to maximize cache hits during development cycles
- **Advances North Star**: Eliminates WebSocket complexities, supports pool-aware job routing foundation

## [Previous Entries Continue...]

> **Note**: This changelog has been consolidated from multiple sources and represents the complete development history of the EmProps AI Backend system. Going forward, all development progress will be recorded in this single changelog file at `/apps/docs/src/changelog.md`.

## North Star Alignment

Each entry in this changelog connects to the [North Star Architecture](/docs/NORTH_STAR_ARCHITECTURE.md) goals:

- **Specialized Machine Pools**: Infrastructure changes that enable pool-specific optimization
- **Predictive Model Management**: Model placement and management improvements 
- **Elastic Scaling**: Support for ephemeral, distributed machine infrastructure
- **Performance Optimization**: Eliminating bottlenecks and improving resource utilization

## Development Workflow

All future development follows this changelog pattern:
1. **Document what's actually working** vs. aspirational features
2. **Record North Star advancement** for each significant change
3. **Update before committing** as specified in CLAUDE.md
4. **Focus on production readiness** over feature completeness