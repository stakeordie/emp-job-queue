# Phase Differentiation Strategy

## Problem
How do we clearly differentiate between:
1. **Phase 1**: Mock workers (MockConnector only)
2. **Phase 2**: Real workers with mocked services (Real connectors + HTTP mocking)
3. **Production**: Real workers with real services

## Solution: Environment-Based Profiles

### Approach 1: Separate Environment Files (RECOMMENDED)

Create distinct `.env` files for each phase:

```
.env.phase1          # Phase 1: Mock workers
.env.phase2          # Phase 2: Real workers + mocked services
.env.local-dev       # Local development (real services)
.env.production      # Production
```

**Phase 1 Configuration** (`.env.phase1`):
```bash
# Phase 1: Mock Workers - Infrastructure Testing
TEST_PHASE=1

# API
API_PORT=3331
REDIS_URL=redis://localhost:6379

# Workers - ONLY MockConnector
WORKERS=mock:10
WORKER_MODE=mock

# No service mocking needed (no real connectors)
MOCK_MODE=false

# Telemetry
OTEL_COLLECTOR_ENDPOINT=http://localhost:43189
DASH0_AUTH_TOKEN=your_token
DASH0_DATASET=testrunner

# Mock connector behavior
MOCK_CONNECTOR_DELAY=2000
```

**Phase 2 Configuration** (`.env.phase2`):
```bash
# Phase 2: Real Workers + Mocked Services
TEST_PHASE=2

# API
API_PORT=3331
REDIS_URL=redis://localhost:6379

# Workers - Real connectors
WORKERS=openai:3,ollama:2
WORKER_MODE=real

# Enable HTTP service mocking
NODE_ENV=test
MOCK_MODE=true
MOCK_OPENAI=true
MOCK_OLLAMA=true
MOCK_COMFYUI=true

# Service URLs (intercepted by nock)
OPENAI_BASE_URL=https://api.openai.com
OLLAMA_HOST=http://localhost:11434
COMFYUI_HOST=http://localhost:8188

# Telemetry
OTEL_COLLECTOR_ENDPOINT=http://localhost:43189
DASH0_AUTH_TOKEN=your_token
DASH0_DATASET=testrunner
```

### Approach 2: Single Flag with Conditional Logic

Use a single `TEST_PHASE` environment variable:

```bash
TEST_PHASE=1  # Mock workers only
TEST_PHASE=2  # Real workers + mocked services
# No TEST_PHASE = production
```

**Worker Initialization** (`redis-direct-worker.ts`):
```typescript
// Conditional mock manager initialization
if (process.env.TEST_PHASE === '2') {
  await import('./staging-init.js');
  console.log('🎭 Phase 2: Real workers with mocked services');
} else if (process.env.TEST_PHASE === '1') {
  console.log('🎯 Phase 1: Mock workers for infrastructure testing');
} else {
  console.log('🏭 Production: Real workers with real services');
}
```

### Approach 3: Explicit Worker Type Check

Check the `WORKERS` environment variable to determine mode:

```typescript
const workersEnv = process.env.WORKERS || '';
const isMockMode = workersEnv.includes('mock');
const isRealWorkers = !isMockMode;

if (isRealWorkers && (process.env.NODE_ENV === 'test' || process.env.MOCK_MODE === 'true')) {
  // Phase 2: Real workers with mocked services
  await import('./staging-init.js');
} else if (isMockMode) {
  // Phase 1: Mock workers
  console.log('🎯 Using MockConnector for infrastructure testing');
} else {
  // Production
  console.log('🏭 Production mode');
}
```

## Comparison Matrix

| Aspect | Phase 1 | Phase 2 | Production |
|--------|---------|---------|------------|
| **WORKERS** | `mock:10` | `openai:3,ollama:2` | `comfyui:5` |
| **WORKER_MODE** | `mock` | `real` | `real` |
| **MOCK_MODE** | `false` | `true` | `false` |
| **NODE_ENV** | `test` | `test` | `production` |
| **TEST_PHASE** | `1` | `2` | (unset) |
| **staging-init.ts** | Not imported | Imported | Not imported |
| **Connectors Used** | MockConnector | Real connectors | Real connectors |
| **HTTP Mocking** | N/A | Yes (nock) | No |
| **External Services** | None | Mocked | Real |

## Implementation: Recommended Approach

### 1. Update Worker Entry Point

**File**: `apps/worker/src/redis-direct-worker.ts`

```typescript
#!/usr/bin/env node
// Redis-Direct Worker Entry Point

// Conditional mock initialization based on TEST_PHASE
const testPhase = process.env.TEST_PHASE;

if (testPhase === '2') {
  // Phase 2: Real workers with mocked services
  await import('./staging-init.js');
  console.log('🎭 TEST PHASE 2: Real workers + Mocked HTTP services');
} else if (testPhase === '1') {
  // Phase 1: Mock workers
  console.log('🎯 TEST PHASE 1: Mock workers for infrastructure testing');
} else {
  // Production
  console.log('🏭 PRODUCTION: Real workers + Real services');
}

// Initialize OpenTelemetry
import { initTracer } from '@emp/core/otel';

// Rest of worker initialization...
import { RedisDirectBaseWorker } from './redis-direct-base-worker.js';
import { ConnectorManager } from './connector-manager.js';
// ...
```

### 2. Create Package Scripts

**File**: `package.json` (root)

```json
{
  "scripts": {
    "test:phase1": "TEST_PHASE=1 pnpm test:load:phase1",
    "test:phase2": "TEST_PHASE=2 pnpm test:load:phase2",

    "test:load:phase1": "pnpm --filter=@emp/api test src/__tests__/job-load.e2e.test.ts",
    "test:load:phase2": "pnpm --filter=@emp/api test src/__tests__/connector-integration.e2e.test.ts",

    "worker:phase1": "TEST_PHASE=1 WORKERS=mock:10 pnpm --filter=@emp/worker dev",
    "worker:phase2": "TEST_PHASE=2 WORKERS=openai:3,ollama:2 MOCK_MODE=true pnpm --filter=@emp/worker dev"
  }
}
```

### 3. Test Identification

Tests can read `TEST_PHASE` to verify correct setup:

```typescript
describe('Phase 1: Mock Workers', () => {
  beforeAll(() => {
    if (process.env.TEST_PHASE !== '1') {
      throw new Error('These tests require TEST_PHASE=1');
    }
  });

  it('should use MockConnector', async () => {
    // Test infrastructure with mock workers
  });
});

describe('Phase 2: Real Workers + Mocked Services', () => {
  beforeAll(() => {
    if (process.env.TEST_PHASE !== '2') {
      throw new Error('These tests require TEST_PHASE=2');
    }
  });

  it('should use real connectors with mocked HTTP', async () => {
    // Test connector logic with mocked APIs
  });
});
```

## Validation

### Check Active Phase

Add a health check endpoint to verify configuration:

```typescript
// API endpoint: GET /test/phase
app.get('/test/phase', (req, res) => {
  res.json({
    phase: process.env.TEST_PHASE || 'production',
    workers: process.env.WORKERS,
    mock_mode: process.env.MOCK_MODE === 'true',
    node_env: process.env.NODE_ENV
  });
});
```

### Worker Registration Check

Workers should report their mode in Redis:

```json
{
  "worker_id": "mock-worker-1",
  "test_phase": "1",
  "connector_type": "mock",
  "capabilities": ["mock"]
}
```

## Migration Path

1. ✅ Create `.env.phase1` and `.env.phase2` files
2. ✅ Update `redis-direct-worker.ts` with conditional import
3. ✅ Add package.json scripts
4. ✅ Update tests to validate TEST_PHASE
5. ✅ Document startup commands
6. ✅ Test both phases independently

## Summary

**Recommended: Use `TEST_PHASE` environment variable**

- **Phase 1**: `TEST_PHASE=1 WORKERS=mock:10`
- **Phase 2**: `TEST_PHASE=2 WORKERS=openai:3 MOCK_MODE=true`
- **Production**: No TEST_PHASE set

This provides:
- ✅ Clear differentiation
- ✅ Easy to understand
- ✅ Safe (production won't accidentally use mocks)
- ✅ Flexible (can extend to more phases)
- ✅ Self-documenting
