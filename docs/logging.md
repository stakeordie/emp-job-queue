# Development Logging System

## Overview

Every component in the monorepo now logs to its own `logs/dev.log` file when running in development mode. This provides centralized logging with the ability to monitor individual components or all components simultaneously.

## Log Files

Each component creates its own log file:
- `apps/api/logs/dev.log` - API server logs
- `apps/worker/logs/dev.log` - Worker service logs  
- `apps/monitor/logs/dev.log` - Monitor UI logs
- `apps/docs/logs/dev.log` - Documentation site logs
- `logs/local-redis.log` - Local Redis development logs

## Log Viewer Commands

### Individual Component Logs
```bash
pnpm logs:api         # Tail API logs
pnpm logs:worker      # Tail worker logs
pnpm logs:monitor     # Tail monitor logs
pnpm logs:docs        # Tail docs logs
pnpm logs:local-redis # Tail local Redis logs
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

1. **Start a component**: `pnpm dev:api` (automatically logs to `apps/api/logs/dev.log`)
2. **Monitor logs**: `pnpm logs:api` (in another terminal)
3. **Switch between logs**: `Ctrl+C` to stop current tail, then `pnpm logs:worker`
4. **Monitor all**: `pnpm logs:all` (shows all components with colored prefixes)

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
# Start API and monitor logs
pnpm dev:api &
pnpm logs:api

# Start multiple components and monitor all
pnpm dev:api &
pnpm dev:worker &
pnpm dev:monitor &
pnpm logs:all

# Clear logs and start fresh
pnpm logs:clear
pnpm dev:local-redis
```