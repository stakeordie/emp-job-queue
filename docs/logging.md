# Development Logging System

## Overview

Every component in the monorepo now logs to its own `logs/dev.log` file when running in development mode. This provides centralized logging with the ability to monitor individual components or all components simultaneously.

## Log Files

Centralized logging system with all logs in `/logs` directory:
- `logs/api-redis.log` - API server logs (when connected to local Redis)
- `logs/redis.log` - Actual Redis server logs (symlink to Redis install)
- `logs/monitor.log` - Monitor UI server logs
- `logs/machine.log` - Machine container build and startup logs
- `logs/monitorEventStream.log` - Raw SSE events from `/api/events/monitor`
- `logs/api.log` - API server only (when run individually)
- `logs/worker.log` - Worker service logs (when run individually)
- `logs/docs.log` - Documentation site logs

## Log Viewer Commands

### Individual Component Logs
```bash
pnpm logs:api-redis          # API server (when connected to local Redis)
pnpm logs:redis              # Actual Redis server logs
pnpm logs:monitor            # Monitor UI logs
pnpm logs:machines           # Machine container logs
pnpm logs:monitorEventStream # Raw event stream
pnpm logs:api               # API only
pnpm logs:worker            # Worker only
pnpm logs:docs              # Documentation site logs
```

### All Components
```bash
pnpm logs:all         # Tail all logs with colored prefixes
```

### Management
```bash
pnpm logs:clear       # Clear all log files
pnpm logs             # Show help message
```

## Development Workflow

1. **Start full stack**: `pnpm dev:full-stack` (starts Redis + API + Monitor + Machine with centralized logging)
2. **Monitor logs**: `pnpm logs:all` (shows all components with colored prefixes)
3. **Switch between logs**: `Ctrl+C` to stop current tail, then `pnpm logs:monitor`
4. **Check service status**: `pnpm dev:full-stack:status` (shows what's running)
5. **Clean shutdown**: `pnpm dev:full-stack:stop` (stops all services)

## Log Format

All logs use structured JSON format with:
- `timestamp` - ISO timestamp
- `level` - Log level (info, warn, error, debug)
- `message` - Human readable message
- `service` - Component name
- Additional context fields as needed

## Colored Output

The log viewer uses different colors for each component:
- 🟢 **API** - Green
- 🔵 **Worker** - Blue  
- 🟣 **Monitor** - Magenta
- 🟡 **Docs** - Cyan
- 🟡 **Machines** - Yellow
- 🔴 **Local Redis** - Red

## File Management

- Log files are automatically created when components start
- Logs are ignored by git (in `.gitignore`)
- Use `pnpm logs:clear` to clean up old logs
- Log files persist until manually cleared

## Examples

```bash
# Start full development stack
pnpm dev:full-stack

# In another terminal, monitor all logs
pnpm logs:all

# Start just Redis + API for testing
pnpm dev:local-redis
pnpm logs:api-redis

# Clear all logs and start fresh
pnpm logs:clear
pnpm dev:full-stack

# Check what's running
pnpm dev:full-stack:status

# Clean shutdown
pnpm dev:full-stack:stop
```