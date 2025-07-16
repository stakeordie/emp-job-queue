# Changelog

## [Unreleased]

### Added
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

## [2025-01-14] - Health Check Polling and Connector Status Architecture

### Added
- **Health Check Polling**: ComfyUI connectors now wait for service health before attempting WebSocket connection
  - Polls health endpoint every 2 seconds for up to 60 seconds
  - Reports status progression: `waiting_for_service` → `connecting` → `active`
  - Prevents premature connection attempts during service startup
- **New Connector Statuses**: Added `waiting_for_service` and `connecting` states for better visibility
- **BaseConnector Architecture**: Implemented proper inheritance hierarchy
  - BaseConnector → HybridConnector → ComfyUIConnector
  - Centralized Redis status reporting in BaseConnector
- **Redis Injection Pattern**: Clean dependency injection for Redis connections
  - Redis connected first, then injected into ConnectorManager and all connectors
  - Enables reliable status reporting from all connector types
- **Full Stack Development Scripts**: Added convenience scripts for local development
  - `pnpm dev:full-stack`: Start Redis + API + Monitor + Machine with centralized logging
  - `pnpm dev:full-stack:status`: Check running services
  - `pnpm dev:full-stack:stop`: Clean shutdown of all services
- **Event Stream Logger**: New tool for debugging SSE events (`pnpm logs:eventstream`)
- **Testing Procedures**: Comprehensive documentation in `docs/TESTING_PROCEDURES.md`

### Changed
- **Worker Initialization Order**: Redis connection established before connector loading
- **Machine Status Updates**: Workers connecting now properly set machine status to 'ready'
- **Service Badge Colors**: Fixed mapping for connector statuses in SimpleWorkerCard
  - `active` → green (Active)
  - `inactive` → blue (Idle) 
  - `waiting_for_service` → yellow (Waiting)
  - `connecting` → orange (Connecting)
  - `error` → red (Error)
  - `unknown` → grey (Unknown)

### Fixed
- **ComfyUI Connection Timing**: Workers no longer fail to connect when ComfyUI is still starting
- **Machine Offline Display**: Machines correctly show as online when workers reconnect
- **Connector Status Reporting**: All connectors now properly report status via Redis pub/sub
- **TypeScript Compilation**: Added missing interface methods to all connector implementations

### Technical Details
- **North Star Alignment**: Advances predictive model management by improving service health monitoring
- **Production Ready**: Handles ephemeral machine restarts gracefully with proper status reporting
- **Backwards Compatible**: Existing deployments continue to work with immediate connection attempts