# Changelog

## [Unreleased]

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