#!/bin/bash

# GitHub Issues Creation Script for Modernization Initiative
# Creates all 23 issues with proper labels, milestones, and assignees

echo "🚀 Creating GitHub Issues for Modernization Initiative..."
echo "This will create 23 issues across 4 phases"
echo ""

# First, create milestones
echo "📅 Creating milestones..."

gh milestone create \
  --title "Phase 1: Foundation & Quick Wins" \
  --description "Week 1: Cleanup, testing foundation, documentation" \
  --due-date "2025-09-01"

gh milestone create \
  --title "Phase 2: Service Architecture" \
  --description "Week 2: Extract JobService & WorkflowService, message bus" \
  --due-date "2025-09-08"

gh milestone create \
  --title "Phase 3: Database & EmProps Integration" \
  --description "Week 3: PostgreSQL, Prisma, EmProps migration" \
  --due-date "2025-09-15"

gh milestone create \
  --title "Phase 4: Production Readiness" \
  --description "Week 4: Monitoring, performance, security, deployment" \
  --due-date "2025-09-22"

echo "✅ Milestones created"
echo ""

# Phase 1 Issues (Week 1)
echo "📋 Creating Phase 1 issues..."

gh issue create \
  --title "[CLEANUP] Remove Dead Code and Unused Files" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: All

## Tasks
- [ ] Audit and remove unused TypeScript files
- [ ] Remove commented-out code blocks  
- [ ] Delete unused npm scripts
- [ ] Remove deprecated configuration files
- [ ] Clean up unused Docker artifacts
- [ ] Update .gitignore for better coverage

## Success Criteria
- Reduced codebase size by 20-30%
- Clean, organized file structure
- Updated .gitignore prevents clutter

## Phase 1: Foundation & Quick Wins - Day 1-2" \
  --label "type:cleanup,priority:high,component:all,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[CLEANUP] Standardize and Clean Up Logging" \
  --body "**Priority**: High | **Effort**: S (2-4 hours) | **Component**: All

## Tasks
- [ ] Remove console.log statements
- [ ] Convert debug logs to proper logger calls
- [ ] Standardize log levels (error, warn, info, debug)
- [ ] Remove excessive/noisy logging
- [ ] Add structured logging where missing
- [ ] Configure log levels per environment

## Success Criteria
- Consistent, useful logging across all services
- No more console.log in production code
- Proper log levels configured

## Phase 1: Foundation & Quick Wins - Day 1-2" \
  --label "type:cleanup,priority:high,component:all,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[REFACTOR] Fix TypeScript Configuration" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: All

## Tasks
- [ ] Enable strict mode incrementally
- [ ] Fix any type violations
- [ ] Remove @ts-ignore comments
- [ ] Add proper type definitions
- [ ] Ensure all packages build cleanly
- [ ] Update tsconfig for better IDE support

## Success Criteria
- Zero TypeScript errors
- Better type safety across codebase
- Improved IDE experience

## Phase 1: Foundation & Quick Wins - Day 1-2" \
  --label "type:refactor,priority:high,component:all,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[TEST] Create Core Integration Tests" \
  --body "**Priority**: Critical | **Effort**: L (1-2 days) | **Component**: Core

## Tasks
- [ ] Test Redis job matching function
- [ ] Test webhook persistence and retrieval
- [ ] Test job lifecycle state transitions
- [ ] Test worker capability matching
- [ ] Test message bus communication
- [ ] Add test fixtures and factories

## Success Criteria
- 80%+ code coverage on critical paths
- All Redis functions tested
- Webhook reliability tested

## Phase 1: Foundation & Quick Wins - Day 3-4" \
  --label "type:test,priority:critical,component:core,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[TEST] Add API Service Tests" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: API

## Tasks
- [ ] Test job submission endpoints
- [ ] Test workflow creation endpoints
- [ ] Test webhook registration endpoints
- [ ] Test error handling paths
- [ ] Add request/response validation tests
- [ ] Create API test client

## Success Criteria
- All API endpoints have test coverage
- Error paths properly tested
- API client for testing

## Phase 1: Foundation & Quick Wins - Day 3-4" \
  --label "type:test,priority:high,component:api,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[MAINTENANCE] Update Dependencies and Fix Vulnerabilities" \
  --body "**Priority**: Medium | **Effort**: S (2-4 hours) | **Component**: All

## Tasks
- [ ] Run npm audit and fix vulnerabilities
- [ ] Update major dependencies (with testing)
- [ ] Update pnpm to latest version
- [ ] Clean up duplicate dependencies
- [ ] Verify all packages still build
- [ ] Test application after updates

## Success Criteria
- Zero vulnerabilities
- Latest stable dependencies
- All packages building successfully

## Phase 1: Foundation & Quick Wins - Day 5" \
  --label "type:maintenance,priority:medium,component:all,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

gh issue create \
  --title "[DOCS] Create/Update Critical Documentation" \
  --body "**Priority**: Medium | **Effort**: S (2-4 hours) | **Component**: Docs

## Tasks
- [ ] Update README with current setup
- [ ] Document environment variables
- [ ] Create API documentation
- [ ] Document testing procedures
- [ ] Add troubleshooting guide
- [ ] Update architecture diagrams

## Success Criteria
- New developer can onboard in < 1 hour
- All environment variables documented
- Clear troubleshooting guide

## Phase 1: Foundation & Quick Wins - Day 5" \
  --label "type:docs,priority:medium,component:docs,phase:1" \
  --milestone "Phase 1: Foundation & Quick Wins" \
  --assignee "@me"

echo "✅ Phase 1 issues created (7 issues)"

# Phase 2 Issues (Week 2)
echo "📋 Creating Phase 2 issues..."

gh issue create \
  --title "[FEATURE] Create Message Bus Infrastructure" \
  --body "**Priority**: Critical | **Effort**: M (4-6 hours) | **Component**: Core

## Tasks
- [ ] Implement EventEmitter-based message bus
- [ ] Add Redis pub/sub integration
- [ ] Create message type definitions
- [ ] Add message serialization/deserialization
- [ ] Implement retry logic
- [ ] Add monitoring hooks

## Success Criteria
- Services can communicate via message bus
- Reliable message delivery
- Proper monitoring of message flow

## Phase 2: Service Architecture - Day 6-7" \
  --label "type:feature,priority:critical,component:core,phase:2" \
  --milestone "Phase 2: Service Architecture" \
  --assignee "@me"

gh issue create \
  --title "[ARCHITECTURE] Define Service Interfaces" \
  --body "**Priority**: High | **Effort**: S (2-4 hours) | **Component**: Core

## Tasks
- [ ] Define JobService interface
- [ ] Define WorkflowService interface
- [ ] Define WebhookService interface
- [ ] Create shared type definitions
- [ ] Document service contracts
- [ ] Add interface tests

## Success Criteria
- Clear contracts between services
- Type-safe service interfaces
- Documented service boundaries

## Phase 2: Service Architecture - Day 6-7" \
  --label "type:architecture,priority:high,component:core,phase:2" \
  --milestone "Phase 2: Service Architecture" \
  --assignee "@me"

gh issue create \
  --title "[REFACTOR] Extract JobService from API" \
  --body "**Priority**: Critical | **Effort**: L (1 day) | **Component**: API

## Tasks
- [ ] Create JobService class
- [ ] Move job submission logic
- [ ] Move job query logic
- [ ] Move job update logic
- [ ] Integrate with message bus
- [ ] Update API routes to use service
- [ ] Add comprehensive tests
- [ ] Verify no breaking changes

## Success Criteria
- JobService fully extracted and tested
- No breaking changes to API
- Clean separation of concerns

## Phase 2: Service Architecture - Day 8-9
## Depends On: Message Bus Infrastructure (#8)" \
  --label "type:refactor,priority:critical,component:api,phase:2" \
  --milestone "Phase 2: Service Architecture" \
  --assignee "@me"

gh issue create \
  --title "[REFACTOR] Extract WorkflowService from API" \
  --body "**Priority**: Critical | **Effort**: L (1 day) | **Component**: API

## Tasks
- [ ] Create WorkflowService class
- [ ] Consolidate workflow logic from API
- [ ] Merge duplicate workflow tracking
- [ ] Move EMPROPS workflow handling
- [ ] Integrate with message bus
- [ ] Update API routes to use service
- [ ] Add comprehensive tests
- [ ] Verify webhook integration works

## Success Criteria
- Single source of truth for workflows
- EMPROPS integration maintained
- Webhook notifications working

## Phase 2: Service Architecture - Day 8-9
## Depends On: Message Bus Infrastructure (#8)" \
  --label "type:refactor,priority:critical,component:api,phase:2" \
  --milestone "Phase 2: Service Architecture" \
  --assignee "@me"

gh issue create \
  --title "[TEST] Integration Testing for Services" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: All

## Tasks
- [ ] Test job submission through full stack
- [ ] Test workflow creation and tracking
- [ ] Test webhook notifications
- [ ] Test service communication via bus
- [ ] Test error propagation
- [ ] Performance testing
- [ ] Load testing basic scenarios

## Success Criteria
- All services work together seamlessly
- No regressions in functionality
- Performance meets expectations

## Phase 2: Service Architecture - Day 10
## Depends On: JobService (#10), WorkflowService (#11)" \
  --label "type:test,priority:high,component:all,phase:2" \
  --milestone "Phase 2: Service Architecture" \
  --assignee "@me"

echo "✅ Phase 2 issues created (5 issues)"

# Phase 3 Issues (Week 3)
echo "📋 Creating Phase 3 issues..."

gh issue create \
  --title "[INFRASTRUCTURE] Integrate PostgreSQL and Prisma" \
  --body "**Priority**: Critical | **Effort**: L (1 day) | **Component**: Infrastructure

## Tasks
- [ ] Add PostgreSQL to Docker Compose
- [ ] Configure Prisma in monorepo
- [ ] Create initial schema migration
- [ ] Add database connection pooling
- [ ] Configure for multiple environments
- [ ] Add database backup strategy
- [ ] Create seed data scripts
- [ ] Add database health checks

## Success Criteria
- PostgreSQL running with Prisma ORM
- Database accessible from all services
- Proper connection management

## Phase 3: Database & EmProps Integration - Day 11-12" \
  --label "type:infrastructure,priority:critical,component:database,phase:3" \
  --milestone "Phase 3: Database & EmProps Integration" \
  --assignee "@me"

gh issue create \
  --title "[ARCHITECTURE] Create Database Abstraction Layer" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: Core

## Tasks
- [ ] Create repository pattern interfaces
- [ ] Implement Prisma repositories
- [ ] Add transaction support
- [ ] Add query builders
- [ ] Implement caching layer
- [ ] Add migration tooling
- [ ] Create database utilities

## Success Criteria
- Clean database access patterns
- Type-safe database operations
- Proper abstraction layer

## Phase 3: Database & EmProps Integration - Day 11-12
## Depends On: PostgreSQL Setup (#13)" \
  --label "type:architecture,priority:high,component:core,phase:3" \
  --milestone "Phase 3: Database & EmProps Integration" \
  --assignee "@me"

gh issue create \
  --title "[MIGRATION] Migrate EmProps Open API Service" \
  --body "**Priority**: Critical | **Effort**: XL (2 days) | **Component**: EmProps

## Tasks
- [ ] Copy EmProps service to monorepo
- [ ] Convert from npm to pnpm
- [ ] Update import paths
- [ ] Integrate with monorepo build
- [ ] Update TypeScript config
- [ ] Fix any breaking changes
- [ ] Add to Docker Compose
- [ ] Update environment configs
- [ ] Integrate with existing services
- [ ] Add health checks

## Success Criteria
- EmProps service runs in monorepo
- Single pnpm install workflow
- All existing functionality maintained

## Phase 3: Database & EmProps Integration - Day 13-14
## Depends On: Database Layer (#14)" \
  --label "type:migration,priority:critical,component:emprops,phase:3" \
  --milestone "Phase 3: Database & EmProps Integration" \
  --assignee "@me"

gh issue create \
  --title "[INTEGRATION] Integrate EmProps with Job Queue" \
  --body "**Priority**: Critical | **Effort**: L (1 day) | **Component**: Integration

## Tasks
- [ ] Connect EmProps to message bus
- [ ] Integrate collection creation with jobs
- [ ] Add workflow status synchronization
- [ ] Implement progress tracking
- [ ] Add error handling
- [ ] Create integration tests
- [ ] Update webhook notifications
- [ ] Document integration points

## Success Criteria
- Seamless EmProps + Job Queue integration
- Collections trigger job workflows
- Status synchronization working

## Phase 3: Database & EmProps Integration - Day 13-14
## Depends On: EmProps Migration (#15)" \
  --label "type:integration,priority:critical,component:integration,phase:3" \
  --milestone "Phase 3: Database & EmProps Integration" \
  --assignee "@me"

gh issue create \
  --title "[MIGRATION] Data Migration and Compatibility" \
  --body "**Priority**: Medium | **Effort**: M (4-6 hours) | **Component**: Database

## Tasks
- [ ] Audit existing Redis data
- [ ] Create migration scripts if needed
- [ ] Ensure backward compatibility
- [ ] Add data validation
- [ ] Create rollback procedures
- [ ] Test migration on staging data
- [ ] Document migration process

## Success Criteria
- Zero data loss
- Smooth transition
- Rollback capability available

## Phase 3: Database & EmProps Integration - Day 15" \
  --label "type:migration,priority:medium,component:database,phase:3" \
  --milestone "Phase 3: Database & EmProps Integration" \
  --assignee "@me"

echo "✅ Phase 3 issues created (5 issues)"

# Phase 4 Issues (Week 4)
echo "📋 Creating Phase 4 issues..."

gh issue create \
  --title "[OBSERVABILITY] Enhance Monitoring and Metrics" \
  --body "**Priority**: High | **Effort**: L (1 day) | **Component**: Observability

## Tasks
- [ ] Add Prometheus metrics
- [ ] Create Grafana dashboards
- [ ] Add distributed tracing
- [ ] Implement health endpoints
- [ ] Add performance monitoring
- [ ] Create alert rules
- [ ] Add SLO tracking
- [ ] Document monitoring setup

## Success Criteria
- Full observability of all services
- Comprehensive dashboards
- Proper alerting configured

## Phase 4: Production Readiness - Day 16-17" \
  --label "type:observability,priority:high,component:monitoring,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

gh issue create \
  --title "[BUG] Fix Webhook Persistence Bug" \
  --body "**Priority**: Critical | **Effort**: M (4-6 hours) | **Component**: Core

## Problem
Users report webhooks disappearing from the system.

## Root Cause
refreshCache() only loads active webhooks, making inactive ones invisible.

## Tasks
- [ ] Change refreshCache to load ALL webhooks
- [ ] Add consistency verification
- [ ] Implement retry logic
- [ ] Add persistence tests
- [ ] Verify with production data
- [ ] Add monitoring metrics
- [ ] Document the fix

## Success Criteria
- No more webhook disappearance
- Tests confirm inactive webhooks remain visible
- Production data verified

## Phase 4: Production Readiness - Day 16-17" \
  --label "type:bug,priority:critical,component:core,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

gh issue create \
  --title "[PERFORMANCE] Performance Optimization" \
  --body "**Priority**: High | **Effort**: L (1 day) | **Component**: All

## Tasks
- [ ] Profile API endpoints
- [ ] Optimize database queries
- [ ] Add caching where appropriate
- [ ] Optimize Redis operations
- [ ] Reduce memory footprint
- [ ] Optimize Docker images
- [ ] Add connection pooling
- [ ] Load test critical paths

## Success Criteria
- 2x performance improvement
- Reduced resource usage
- Faster response times

## Phase 4: Production Readiness - Day 18-19" \
  --label "type:performance,priority:high,component:all,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

gh issue create \
  --title "[SECURITY] Security Hardening" \
  --body "**Priority**: Critical | **Effort**: M (4-6 hours) | **Component**: All

## Tasks
- [ ] Audit authentication/authorization
- [ ] Add rate limiting
- [ ] Implement input validation
- [ ] Add SQL injection protection
- [ ] Secure environment variables
- [ ] Add security headers
- [ ] Implement CORS properly
- [ ] Security scan all dependencies

## Success Criteria
- Pass security audit
- No vulnerabilities found
- Proper access controls

## Phase 4: Production Readiness - Day 18-19" \
  --label "type:security,priority:critical,component:all,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

gh issue create \
  --title "[DEPLOYMENT] Production Deployment Preparation" \
  --body "**Priority**: Critical | **Effort**: L (1 day) | **Component**: Infrastructure

## Tasks
- [ ] Create production Docker images
- [ ] Update Railway configuration
- [ ] Create deployment scripts
- [ ] Add rollback procedures
- [ ] Update CI/CD pipeline
- [ ] Create runbooks
- [ ] Add deployment monitoring
- [ ] Test deployment process
- [ ] Create backup strategy

## Success Criteria
- One-command deployment
- Automated rollback capability
- Production monitoring ready

## Phase 4: Production Readiness - Day 20" \
  --label "type:deployment,priority:critical,component:infrastructure,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

gh issue create \
  --title "[DOCS] Final Documentation and Handoff" \
  --body "**Priority**: High | **Effort**: M (4-6 hours) | **Component**: Docs

## Tasks
- [ ] Update all README files
- [ ] Create operations guide
- [ ] Document troubleshooting
- [ ] Create architecture diagrams
- [ ] Update API documentation
- [ ] Create migration guide
- [ ] Document known issues
- [ ] Create release notes

## Success Criteria
- Complete documentation package
- Operations team can maintain system
- Clear migration and rollback docs

## Phase 4: Production Readiness - Day 20" \
  --label "type:docs,priority:high,component:docs,phase:4" \
  --milestone "Phase 4: Production Readiness" \
  --assignee "@me"

echo "✅ Phase 4 issues created (6 issues)"
echo ""
echo "🎉 All GitHub issues created successfully!"
echo ""
echo "📊 Summary:"
echo "  • 4 Milestones created"
echo "  • 23 Issues created"
echo "  • Phase 1: 7 issues (Foundation & Quick Wins)"
echo "  • Phase 2: 5 issues (Service Architecture)"
echo "  • Phase 3: 5 issues (Database & EmProps Integration)"
echo "  • Phase 4: 6 issues (Production Readiness)"
echo ""
echo "🚀 Ready to start modernization initiative!"
echo "Run: gh project list --owner @me"
echo "Then: Add these issues to your project board"