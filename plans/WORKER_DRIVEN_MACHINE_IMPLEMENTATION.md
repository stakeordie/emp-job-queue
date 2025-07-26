# Worker-Driven Machine Implementation Plan

This document outlines the complete plan to implement a unified worker-driven machine system, starting from the stable legacy foundation and incrementally adding capabilities.

## Executive Summary

**Goal**: Create a single unified machine architecture where workers drive service installation and configuration, eliminating the need for separate Docker setups while maintaining full compatibility with the existing Redis job broker system.

**Strategy**: Start with stable legacy foundation → Cherry-pick valuable improvements → Incrementally implement worker-driven architecture → Achieve specialized machine pools.

## Phase 1: Foundation Recovery (Cherry-Pick Phase)

### 1.1 Pre-Cherry-Pick Setup
```bash
# Ensure we're on clean turborepo branch
git checkout turborepo
git status  # Confirm clean state

# Add and commit the plan document
git add plans/SELECTIVE_CHERRY_PICK_PLAN.md plans/WORKER_DRIVEN_MACHINE_IMPLEMENTATION.md
git commit -m "docs: add implementation plans for worker-driven machine system"
```

### 1.2 Cherry-Pick Execution Order

**Phase 1A: Core Infrastructure (Low Risk)**
```bash
# 1. Core package improvements
git cherry-pick 9611dcd  # feat(core): cleanup and improve core package

# 2. General cleanup
git cherry-pick 01c7ed6  # chore: cleanup legacy files and configurations
git cherry-pick df4a176  # chore: ignore Docker build artifacts and archive files

# Test after Phase 1A
pnpm machine:local:up:build
```

**Phase 1B: Monitor Improvements (Low Risk)**
```bash
# 3-7. Monitor deployment fixes
git cherry-pick 5705b27  # fix(monitor): configure Vercel deployment for pnpm monorepo
git cherry-pick 507d0ae  # feat(monitor): enhance workflow priority display
git cherry-pick 4e8ad9c  # fix(monitor): correct @emp/core import path for Vercel build
git cherry-pick ecb8f39  # fix(monitor,core): resolve client-side build issues for Vercel deployment
git cherry-pick 9703abc  # fix(monitor): correct turbo filter syntax in Vercel build command

# Test after Phase 1B
pnpm dev:monitor
```

**Phase 1C: Documentation (Low Risk)**
```bash
# 8. Documentation restructure
git cherry-pick c716909  # docs: reorganize documentation with narrative structure

# Test after Phase 1C
pnpm dev:docs
```

**Phase 1D: Component Library & Final Docs (Low Risk)**
```bash
# 9-13. Component and docs fixes
git cherry-pick 0fb8453  # feat: add kling text-to-video component and utilities
git cherry-pick 7148f33  # fix(docs): replace <br/> tags with newlines and fix FullscreenDiagram tags
git cherry-pick 0d78de3  # feat(docs,machine): fix VitePress build errors and complete unified machine architecture
git cherry-pick f48d27f  # fix(deps): update pnpm lockfile for unified machine dependencies
git cherry-pick 3cba1ad  # fix(docs): configure VitePress output directory for Vercel deployment
git cherry-pick 8234f41  # fix(docs): configure correct output directory for Vercel deployment

# Final test of all components
pnpm dev:docs && pnpm dev:monitor && pnpm machine:local:up:build
```

### 1.3 Post-Cherry-Pick Validation
```bash
# Test legacy machine functionality
pnpm machine:local:up:build
curl -s http://localhost:9092/health | jq

# Test all services
pnpm dev:api &
pnpm dev:monitor &
pnpm dev:docs &

# Verify no regressions
pnpm lint && pnpm typecheck && pnpm build
```

## Phase 2: Worker-Driven Architecture Foundation (Weeks 1-2)

### 2.1 Concept: Single Machine, Multiple Configurations

**Core Principle**: One Docker setup with dynamic service installation based on `WORKER_CONNECTORS`

```
Legacy:                    Worker-Driven:
├── apps/machines/         ├── apps/machine/           # Single unified machine
│   ├── gpu_machine/       │   ├── src/
│   ├── api_machine/       │   │   ├── services/
│   └── hybrid_machine/    │   │   │   ├── comfyui-installer.js
                           │   │   │   ├── playwright-installer.js
                           │   │   │   ├── service-manager.js
                           │   │   │   └── worker-driven-installer.js
                           │   │   └── config/
                           │   │       └── ecosystem-generator.js  # Enhanced
                           │   └── Dockerfile                      # Single unified
```

### 2.2 Environment Variable Strategy

**Worker-Driven Variables**:
```bash
# Core machine identity
MACHINE_ID=machine-001
MACHINE_TYPE=worker-driven  # New type

# Worker connector configuration (drives service installation)
WORKER_CONNECTORS=comfyui,openai,replicate,playwright

# Hardware configuration
MACHINE_HAS_GPU=true
MACHINE_GPU_COUNT=2
MACHINE_RAM_GB=32

# Service management
PM2_INSTANCES_PER_GPU=1
SERVICE_INSTALL_TIMEOUT=300

# Redis integration (unchanged)
HUB_REDIS_URL=redis://localhost:6379
```

### 2.3 Implementation Tasks

**Task 2.1: Enhanced Service Installer Framework**
- Location: `apps/machine/src/services/worker-driven-installer.js`
- Parse `WORKER_CONNECTORS` to determine required services
- Install services dynamically on container startup
- Support both Internal (ComfyUI, Playwright) and External (OpenAI, Replicate) services

**Task 2.2: Enhanced Ecosystem Generator**
- Location: `apps/machine/src/config/ecosystem-generator.js`
- Generate PM2 processes based on `WORKER_CONNECTORS`
- Support GPU-specific instances (comfyui-gpu0, comfyui-gpu1)
- Handle mixed internal/external service workers

**Task 2.3: Service-Specific Installers**
- `comfyui-installer.js` - Enhanced for multi-GPU support
- `playwright-installer.js` - New installer for browser automation
- `service-manager.js` - Unified service lifecycle management

## Phase 3: Service Integration & Testing (Weeks 3-4)

### 3.1 Service Integration Matrix

| Service | Type | Installation | Worker Integration |
|---------|------|-------------|-------------------|
| ComfyUI | Internal | Custom nodes + models | PM2 instance per GPU |
| Playwright | Internal | Browser + dependencies | PM2 service manager |
| OpenAI | External | API key only | Direct HTTP connector |
| Replicate | External | API key only | Direct HTTP connector |
| RunPod | External | API key only | Direct HTTP connector |

### 3.2 Implementation Tasks

**Task 3.1: ComfyUI Integration**
- Preserve existing custom nodes installation (64 nodes)
- Support multi-GPU PM2 instances
- Maintain model download capabilities
- Ensure compatibility with existing workflows

**Task 3.2: Playwright Integration**
- Create Playwright service installer
- Browser instance management
- Screenshot and automation capabilities
- Integration with worker connector framework

**Task 3.3: External Service Configuration**
- Unified API key management
- Service endpoint configuration
- Rate limiting and retry logic
- Error handling and fallback strategies

### 3.3 Testing Strategy

**Test 3.1: Individual Service Testing**
```bash
# Test GPU-only configuration
WORKER_CONNECTORS=comfyui pnpm machine:local:up:build

# Test API-only configuration  
WORKER_CONNECTORS=openai,replicate pnpm machine:local:up:build

# Test mixed configuration
WORKER_CONNECTORS=comfyui,openai,playwright pnpm machine:local:up:build
```

**Test 3.2: Service Installation Validation**
- Verify correct PM2 processes started
- Confirm service health endpoints
- Test worker connector functionality
- Validate Redis job processing

## Phase 4: Advanced Features & Optimization (Weeks 5-6)

### 4.1 Predictive Service Management

**Concept**: Predict which services will be needed based on job queue patterns

**Implementation**:
- `service-predictor.js` - Analyze job patterns
- `preload-manager.js` - Pre-install likely needed services
- `cache-optimizer.js` - Optimize model and dependency caching

### 4.2 Dynamic Service Scaling

**Concept**: Add/remove services based on demand without container restart

**Implementation**:
- `hot-service-manager.js` - Runtime service addition/removal
- `resource-monitor.js` - Track service resource usage
- `scaling-controller.js` - Automatic service scaling decisions

### 4.3 Pool Specialization Foundation

**Concept**: Lay groundwork for specialized machine pools

**Implementation**:
- Pool-aware job routing in Redis functions
- Service affinity preferences
- Performance characteristic tracking
- Machine capability advertisement

## Phase 5: Production Deployment & Validation (Weeks 7-8)

### 5.1 Container Optimization

**Task 5.1: Multi-Stage Docker Build**
```dockerfile
# Base layer - common dependencies
FROM nvidia/cuda:12.1-devel-ubuntu22.04 AS base
# ... common setup

# Service-specific layers
FROM base AS comfyui-layer
# ... ComfyUI dependencies

FROM base AS playwright-layer  
# ... Playwright dependencies

# Final unified layer
FROM base AS unified
COPY --from=comfyui-layer /workspace/ComfyUI /opt/services/comfyui
COPY --from=playwright-layer /opt/playwright /opt/services/playwright
```

**Task 5.2: Configuration Templates**
- Machine configuration templates for common setups
- Environment variable validation
- Service compatibility checking
- Resource requirement calculation

### 5.2 Production Validation

**Validation 5.1: Performance Testing**
- Service startup time benchmarks
- Resource utilization under load
- Job processing throughput comparison
- Memory and storage efficiency

**Validation 5.2: Reliability Testing**
- Service failure recovery
- Container restart resilience
- Redis connection handling
- Error propagation and logging

## Phase 6: Documentation & Knowledge Transfer (Week 9)

### 6.1 Documentation Updates

**Doc 6.1: Machine Architecture Guide**
- Worker-driven machine concept explanation
- Service installation and configuration
- Troubleshooting common issues
- Performance tuning guidelines

**Doc 6.2: Operational Procedures**
- Machine deployment procedures
- Service management commands
- Monitoring and alerting setup
- Scaling and optimization strategies

### 6.2 Migration Guide

**Guide 6.1: Legacy to Worker-Driven**
- Step-by-step migration process
- Configuration mapping
- Validation procedures
- Rollback strategies

## Success Metrics & Validation

### Technical Metrics
- ✅ Single Docker setup supports all service combinations
- ✅ Service installation time < 5 minutes for full stack
- ✅ Zero downtime service addition/removal
- ✅ 100% compatibility with existing Redis job broker
- ✅ Resource utilization improvement > 20%

### Operational Metrics
- ✅ Simplified deployment (1 Docker setup vs 3)
- ✅ Reduced configuration complexity
- ✅ Improved debugging and monitoring
- ✅ Faster development iteration cycles

### User Experience Metrics
- ✅ No change to existing job submission API
- ✅ No change to monitoring interface
- ✅ Improved machine capability visibility
- ✅ Faster job processing through better resource utilization

## Risk Mitigation

### High-Risk Areas
1. **Service Interference**: Multiple services competing for resources
   - **Mitigation**: Resource allocation controls, isolated service environments
   
2. **Installation Complexity**: Complex service dependency management
   - **Mitigation**: Incremental rollout, comprehensive testing, rollback procedures

3. **Performance Regression**: Unified machine performing worse than specialized
   - **Mitigation**: Extensive benchmarking, A/B testing, performance monitoring

### Rollback Strategy
- Maintain legacy machine setup during transition
- Feature flags for worker-driven vs legacy mode
- Automated performance comparison and alerting
- Quick rollback procedures documented and tested

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1 | 1 week | Cherry-picked improvements, stable foundation |
| 2 | 2 weeks | Worker-driven architecture foundation |
| 3 | 2 weeks | Service integration and testing |
| 4 | 2 weeks | Advanced features and optimization |
| 5 | 2 weeks | Production deployment and validation |
| 6 | 1 week | Documentation and knowledge transfer |

**Total Duration**: 10 weeks to full production deployment

## Next Steps

1. **Execute Phase 1**: Begin cherry-pick process following the established plan
2. **Validate Foundation**: Ensure legacy machine functionality is preserved
3. **Plan Phase 2**: Detailed technical design for worker-driven architecture
4. **Team Alignment**: Review plan with stakeholders and adjust timeline as needed

This plan provides a structured path from our current stable state to a unified, worker-driven machine architecture that maintains all existing functionality while enabling future specialized machine pools and predictive model management.