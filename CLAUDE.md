# CLAUDE.md - EMP-JOB-QUEUE Production System

This file provides guidance to Claude Code when working on the emp-job-queue system - a distributed AI workload broker designed for elastic scaling across ephemeral machines (SALAD, vast.ai).

## NORTH STAR ARCHITECTURE
- **ALWAYS** refer to `docs/NORTH_STAR_ARCHITECTURE.md` for strategic direction
- **ALL** technical decisions must advance toward: **Specialized Machine Pools + Predictive Model Management**
- **CORE PRINCIPLE**: Eliminate uniform machines competing for resources → Create specialized pools optimized for different workload patterns

## CRITICAL CONTEXT: Production Constraints

### Infrastructure Reality
- **Distributed Machines**: SALAD/vast.ai - no shared storage, geographically distributed
- **Ephemeral Scaling**: 10 → 50 → 10 machines daily, spot instances, immediate hardware release
- **No Persistence**: Machines spin up/down constantly, jobs must survive machine churn
- **Fast Startup Required**: Seconds not minutes (baked containers, not runtime downloads)

### Core Problems Being Solved
1. **No Shared Storage**: Each machine completely isolated
2. **Model Management**: 2-15GB models vs limited storage vs download times vs user wait times
3. **Performance Heterogeneity**: 1-second Ollama jobs vs 10-minute video jobs causing resource contention
4. **User Experience**: Eliminate first-user 5+ minute wait times for model downloads

## CURRENT SYSTEM STATE

### Working Components ✅
- **Redis-based job broker**: Atomic job matching and claiming
- **Pull-based workers**: Workers request jobs they can handle  
- **WebSocket monitoring**: Real-time job progress and machine status
- **ComfyUI + Custom Nodes**: 64 custom nodes with parallel installation
- **PM2 service management**: Per-GPU ComfyUI instances (comfyui-gpu0, comfyui-gpu1)
- **Machine restart functionality**: Both full machine and individual PM2 service restart

### Current Architecture
```
├── apps/api/                    # Lightweight API server (Redis orchestration)
├── apps/monitor/                # Real-time monitoring UI with machine cards
├── apps/worker/                 # Redis-direct worker with connectors
├── apps/machines/basic_machine/ # PM2-managed container deployment
├── packages/core/               # Shared types and Redis functions
└── docs/                        # North star architecture
```

### Redis Function (Core Job Matching)
```lua
-- Current: Basic capability matching
-- Evolution: Pool-aware, model-affinity routing
function findMatchingJob(workerCapabilities)
  -- Will evolve to handle:
  -- 1. Pool type determination (fast-lane/standard/heavy)
  -- 2. Model affinity routing (prefer workers with required models)
  -- 3. Cross-pool fallback strategies
  -- 4. Intelligent load balancing
end
```

## EVOLUTION TOWARD NORTH STAR

### Current → Target State
| Current | Target |
|---------|--------|
| Uniform machines | **Specialized Pools** (Fast Lane / Standard / Heavy) |
| Reactive model downloads | **Predictive Model Placement** |
| Python asset downloader | **TypeScript Model Intelligence Service** |
| Manual routing | **Multi-dimensional Job Router** |
| Runtime installations | **Baked Container Images per Pool** |

### Key Files to Understand Evolution
- `apps/machines/basic_machine/src/services/comfyui-installer.js` → Will become pool-specific
- `apps/worker/src/redis-direct-worker-client.ts` → Will report pool capabilities
- Redis Functions → Will handle sophisticated pool routing
- Container strategy → Will bake models for different pool types

## DEVELOPMENT WORKFLOW

### 1. Task Analysis
When given a task, analyze and respond with:
1. "Here's how this advances the north star:"
2. "Current state impact: [...]"
3. "Evolution path: [...]"
4. "Should I proceed? (y/n)"

### 2. Decision Framework
**For any technical choice, ask:**
- ✅ Does this advance toward specialized pools?
- ✅ Does this support predictive model management?
- ✅ Does this work with ephemeral distributed machines?
- ✅ Does this improve user wait times or resource utilization?

### 3. Commit Process
1. **Update Changelog**: Add entry to `/docs/changelog.md` with north star context
2. **Quality Checks**: `pnpm lint`, `pnpm typecheck`, `pnpm build`
3. **Alignment Check**: Confirm change advances north star goals
4. **Commit**: `git commit -m "type(scope): description - advances [north star goal]"`

## PHASE ALIGNMENT

### Current Phase: Foundation + Custom Nodes (Now)
- ✅ Redis job broker with atomic matching
- ✅ ComfyUI with 64 custom nodes installation
- ✅ PM2 service management and restart functionality
- ✅ Real-time monitoring with machine cards
- 🚧 **Next**: Enhanced Redis Function for pool awareness

### Phase 1: Pool Separation (Months 1-2)
- **Goal**: Eliminate performance heterogeneity
- **Key Work**: Duration-based routing, pool-specific containers
- **Deliverable**: Fast Lane / Standard / Heavy Pool deployment

### Phase 2: Model Intelligence (Months 3-4)  
- **Goal**: Eliminate first-user wait times
- **Key Work**: Predictive model placement, TypeScript model manager
- **Deliverable**: 80% reduction in model download wait times

### Phase 3: Advanced Optimization (Months 5-6)
- **Goal**: Resource optimization and specialization
- **Key Work**: ML-based demand prediction, specialty routing
- **Deliverable**: 95% optimal job routing

## CRITICAL IMPLEMENTATION NOTES

### ComfyUI Custom Nodes
- **Enhanced Installer**: Supports `recursive: true`, `requirements: true`, `.env` creation
- **Parallel Installation**: 5 nodes at a time for 64 total nodes
- **Config Format**: Handles `${VAR}` environment variables and "git clone" URL prefixes
- **Location**: `/workspace/ComfyUI/custom_nodes/` (not persisted - rebuilt each container start)

### Model Management Evolution
- **Current**: Python-based SQLite downloader (problematic)
- **Target**: TypeScript Model Intelligence Service with pool awareness
- **Strategy**: Bake common models into containers, intelligent runtime management for dynamic needs

### Machine Types by Pool
- **Fast Lane**: CPU-optimized, 20-40GB storage, text/simple image processing
- **Standard**: Balanced GPU, 80-120GB storage, typical ComfyUI workflows  
- **Heavy**: High-end GPU, 150-300GB storage, video/complex processing

### Redis Functions Evolution
Redis Functions are **expanding**, not being removed:
- Enhanced for pool-aware job routing
- Model affinity optimization
- Cross-pool fallback strategies
- Intelligent load balancing across distributed machines

## DEBUGGING & MONITORING

### Standard Testing Procedures
**ALWAYS** follow standardized testing procedures documented in `docs/TESTING_PROCEDURES.md`

**Local Development Setup:**
```bash
pnpm dev:local-redis          # Start local Redis + API (logs to apps/api/logs/dev.log)
tail -f apps/api/logs/dev.log  # Monitor all API activity
```

**Machine Registration Testing:**
```bash
pnpm machines:basic:local:up:build   # Start machine (auto-cleans first via :down)
docker logs basic-machine-local -f  # Watch machine startup events
```

### Event Flow Issues
```bash
cd tools && pnpm debug:full    # Test entire event chain
pnpm debug:redis              # Monitor Redis events
pnpm debug:api                # Test API server processing
```

### Machine Management
- **Restart Machine**: Full container restart (preserves Redis job state)
- **Restart Services**: Individual PM2 service restart (comfyui-gpu0, etc.)
- **Monitor Logs**: Real-time PM2 service logs with tab-based UI
- **Custom Nodes**: Check `/workspace/ComfyUI/custom_nodes/` for installation status

### Key Metrics to Track
- Job completion time by pool type
- Model download frequency and duration  
- Queue wait times vs. job duration
- Machine utilization across pool types

## SUCCESS METRICS

**Current System**: 
- Job matching works reliably
- ComfyUI instances run per GPU
- Real-time monitoring functional

**North Star Achievement**:
- 95% of jobs route to optimal machines
- <10 second wait times for 95% of jobs  
- 99.9% job completion rate with elastic scaling
- 10x job volume support vs. current architecture

## AGENT ROLES

### QA Agent
When instructed "you are a QA agent", Claude Code will operate with the following responsibilities:

**First Actions**: Before starting any QA work, read all documentation to understand system context:
- `docs/NORTH_STAR_ARCHITECTURE.md` - Strategic direction and system goals
- `docs/TESTING_PROCEDURES.md` - Standard testing procedures and commands
- `docs/changelog.md` - Recent changes and known issues
- `CLAUDE.md` - Current system state and development workflow

**Core Mission**: Evaluate reported issues, perform root cause analysis, and create comprehensive test coverage to prevent production incidents.

**Primary Responsibilities**:
1. **Issue Evaluation**: Analyze reported problems to understand their scope and impact
2. **Root Cause Analysis**: Investigate underlying causes, not just symptoms
3. **Unit Test Creation**: Write tests that detect issues before they reach production
4. **Edge Case Testing**: Design stress tests to understand system limits and failure modes
5. **Test Coverage**: Ensure comprehensive coverage across identified failure scenarios

**Testing Approach**:
- **Reproduce First**: Always reproduce the issue locally before proposing fixes
- **Test-Driven**: Write failing tests that demonstrate the bug, then verify fixes
- **Edge Cases**: Consider boundary conditions, concurrent operations, and resource limits
- **Integration**: Test interactions between components, especially Redis and job routing
- **Performance**: Include tests for latency, throughput, and resource utilization

**Deliverables**:
- Root cause analysis report
- Unit tests covering the specific issue
- Edge case tests exploring system boundaries
- Performance benchmarks where relevant
- Documentation of discovered limitations

**Testing Focus Areas**:
- Redis job matching and claiming atomicity
- Worker capability matching and pool routing
- Model download and placement logic
- PM2 service management and recovery
- WebSocket event flow and monitoring
- Machine registration and health checks
- **Component visibility persistence**: Components (machines, workers, service connections) should always remain visible once registered, with status updates reflected but components never disappearing
- **Dual status system**: Both 15-second periodic comprehensive updates and immediate change events working correctly

**Testing Framework**: The project uses **vitest exclusively** across all packages for consistency and performance:
- **Framework**: vitest (migrated from Jest for better performance and TypeScript support)
- **Configuration**: Each package has vitest.config.ts/js with Node.js environment setup
- **Test Scripts**: `pnpm test`, `pnpm test:watch`, `pnpm test:ui`, `pnpm test:coverage`
- **Visual Feedback**: Use `pnpm test:ui` for excellent visual testing experience
- **Existing Tests**: Redis integration tests in `packages/core/src/redis-functions/__tests__/`

**Testing Commands**:
```bash
# Run all tests across monorepo
pnpm test

# Run tests for specific package
pnpm test --filter=@emp/core

# Run tests with visual UI
pnpm test:ui

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

**Test Structure Pattern**:
```typescript
import { describe, it, expect, beforeEach } from 'vitest'

describe('Component/Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
  })

  it('should handle expected behavior', () => {
    // Test implementation
    expect(result).toBe(expected)
  })
})
```

---

**Remember**: Every decision should advance toward the north star of specialized machine pools with intelligent model management. When in doubt, check `docs/NORTH_STAR_ARCHITECTURE.md` for strategic alignment.