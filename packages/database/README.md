# @emp/database

Centralized database package for the EmProps job queue system. Provides consistent Prisma client configuration, connection pooling, and both snake_case (database) and camelCase (API) type compatibility.

## Features

- **Centralized Schema Management**: Single Prisma schema for the entire monorepo
- **Case Convention Solution**: Provides both `job` (snake_case) and `Job` (camelCase) types
- **Pre-configured Connection Pooling**: Optimized settings for production use
- **Health Monitoring**: Built-in database health checks and connection monitoring
- **Common Operations**: Helper classes for frequent database operations

## Installation

```bash
pnpm add @emp/database
```

## Usage

### Basic Usage

```typescript
import { prisma, Job, checkDatabaseHealth } from '@emp/database'

// Use the pre-configured Prisma client
const jobs = await prisma.job.findMany()

// Use camelCase types for API consistency
const newJob: Job = {
  id: 'uuid',
  name: 'My Job',
  status: 'pending',
  // ...
}

// Health check
const health = await checkDatabaseHealth()
console.log(health) // { healthy: true, message: "Database is responding" }
```

### Helper Operations

```typescript
import { JobOperations, WorkflowOperations } from '@emp/database'

// Find pending jobs
const pendingJobs = await JobOperations.findPending(10)

// Update job status
await JobOperations.updateStatus('job-id', 'completed')

// Find workflow by name
const workflow = await WorkflowOperations.findByName('image-generation')
```

### Connection Pool Monitoring

```typescript
import { createPgPool, monitorPool } from '@emp/database'

const pool = createPgPool()
monitorPool(pool, 'api-pool') // Logs pool statistics
```

## Solving the camelCase/snake_case Problem

This package solves the common issue where `prisma db pull` overwrites your camelCase field names:

### Problem
- Database has snake_case columns: `user_id`, `created_at`
- You want camelCase in your API: `userId`, `createdAt`
- `prisma db pull` keeps overriding your mappings

### Solution
The database package provides **both naming conventions**:

```typescript
// Import both types
import type { job, Job } from '@emp/database'

// Database-compatible (snake_case)
const dbRecord: job = {
  user_id: 'uuid',
  created_at: new Date(),
  // ...
}

// API-compatible (camelCase)
const apiRecord: Job = {
  userId: 'uuid',
  createdAt: new Date(),
  // ...
}
```

### Schema Management Strategy

1. **Keep one schema** in `/packages/database/prisma/schema.prisma`
2. **Use @map directives** for any camelCase fields needed:
   ```prisma
   model User {
     id        String   @id
     userId    String   @map("user_id")
     createdAt DateTime @map("created_at") @default(now())
   }
   ```
3. **Export both types** from this package
4. **All apps use this package** instead of their own Prisma setup

## Environment Variables

Required:
- `DATABASE_URL` - PostgreSQL connection string

Optional:
- `SHADOW_DATABASE_URL` - For migrations (development)
- `NODE_ENV` - Controls logging verbosity
- `PRISMA_TELEMETRY_DISABLED` - Disable Prisma telemetry

## Scripts

```bash
# Database operations
pnpm db:generate    # Generate Prisma client
pnpm db:studio      # Open Prisma Studio
pnpm db:migrate     # Run migrations

# Development
pnpm build          # Build the package
pnpm test:connection # Test database connectivity

# Environment-specific Prisma commands
pnpm prisma:local   # Use local-dev environment
pnpm prisma:prod    # Use production environment
```

## Package Structure

```
packages/database/
├── src/
│   ├── index.ts           # Main exports
│   ├── client.ts          # Prisma client configuration
│   ├── operations.ts      # Helper operations
│   ├── pg-pool.ts         # PostgreSQL pool utilities
│   ├── connection-monitor.ts # Health monitoring
│   └── generated/         # Generated Prisma client
├── prisma/
│   └── schema.prisma      # Database schema
└── dist/                  # Built package
```

## Migration from App-Specific Prisma

To migrate from app-specific Prisma setups:

1. Replace imports:
   ```typescript
   // Before
   import { PrismaClient } from '@prisma/client'
   import { Job } from './types'

   // After
   import { prisma, Job } from '@emp/database'
   ```

2. Remove app-specific Prisma files:
   - `app/prisma/schema.prisma`
   - `app/lib/database.ts`
   - App-specific Prisma configurations

3. Use centralized types and client