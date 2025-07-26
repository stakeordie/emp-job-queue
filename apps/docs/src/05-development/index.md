# Development

This section covers how our team develops and maintains the system.

## Development Philosophy

We follow these principles:
- **Test in production-like environments** - Local dev mimics production
- **Document as we go** - Documentation is part of development
- **Fail fast, recover faster** - Quick iteration with safety nets
- **Measure everything** - Data drives decisions

## In This Section

- [Development Changelog](./changelog.md) - Detailed history of system evolution
- [Monorepo Migration](./monorepo-migration.md) - How we unified the codebase
- [Local Development Setup](./local-development.md) - Getting started locally *(to be written)*
- [Testing Procedures](./testing-procedures.md) - How we test the system *(from plans)*
- [Contributing Guidelines](./contributing.md) - How to contribute *(to be written)*
- [Architecture Decisions](./architecture-decisions.md) - Why we made key choices *(to be written)*

## Development Workflow

### Local Development
```bash
# Start local Redis and API
pnpm dev:local-redis

# Run machine locally
pnpm machines:basic:local:up

# Monitor logs
pnpm logs:api
```

### Testing Changes
1. Write tests for new functionality
2. Test locally with real workflows
3. Deploy to staging environment
4. Validate with production-like load
5. Deploy to production with monitoring

## Key Development Tools

- **pnpm** - Fast, efficient package management
- **VitePress** - Documentation site generation
- **PM2** - Process management in development
- **Docker** - Production-like local environment

## Code Organization

The monorepo structure keeps related code together:
```
apps/
├── api/          # API server
├── worker/       # Worker implementation
├── monitor/      # Monitoring UI
├── machine-*/    # Machine types
└── docs/         # This documentation
```

## Making Changes

### Before You Start
1. Understand the [System Overview](../01-understanding-the-system/)
2. Review [How It Works](../02-how-it-works/)
3. Check existing [Implementation Details](../03-implementation-details/)

### Development Process
1. Create feature branch
2. Make changes with tests
3. Update documentation
4. Test in local environment
5. Submit PR with context

## Next Steps

To understand our future direction, see [Future Vision](../06-future-vision/).