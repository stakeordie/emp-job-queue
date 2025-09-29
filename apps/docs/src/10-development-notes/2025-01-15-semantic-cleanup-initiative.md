# Semantic Cleanup Initiative - January 2025

## Overview

This document describes the major semantic terminology change initiative undertaken to align our job queue system with EmProps database terminology and eliminate confusion throughout the codebase.

## Background

### The Problem
Our system had **mixed terminology** that created confusion:
- "Job" was used for both user requests AND worker processing units
- "Workflow" was used inconsistently across different components
- Developers and agents frequently got confused about what "job" meant in different contexts
- EmProps database uses different terminology than our internal system

### The Solution
**Clear semantic model alignment:**
- **"Job"** → What users request (formerly "Workflow")
- **"Step"** → What workers process (formerly "Job")
- **Remove `step-` prefix** from step IDs to clean up string processing

## Terminology Mapping

### Before → After
| Old Term | New Term | Description |
|----------|----------|-------------|
| Workflow | Job | What users submit - collection of processing steps |
| Job | Step | Individual processing unit claimed by workers |
| workflow_id | job_id | UUID of user's request |
| job_id | step_id | UUID of individual processing unit |
| step-{uuid} | {uuid} | Clean UUIDs without prefixes |

### Examples

**Redis Keys:**
```bash
# Old Format
worker:failure:workflow-36ca3e85:job-step-fec9064e:permanent

# New Format
worker:failure:job-id:36ca3e85:step-id:fec9064e:permanent
```

**API Responses:**
```json
// Old Format
{
  "workflow_id": "36ca3e85-1fb3-4386-8046-17b174d4c057",
  "job_id": "step-fec9064e-3487-49bb-a87a-c1809c24aa54"
}

// New Format
{
  "job_id": "36ca3e85-1fb3-4386-8046-17b174d4c057",
  "step_id": "fec9064e-3487-49bb-a87a-c1809c24aa54"
}
```

## Implementation Phases

### Phase 1: Issue Identification ✅ COMPLETE
- **Objective**: Tag all incorrect terminology usage with TODO-SEMANTIC comments
- **Risk Level**: Zero - only adds comments, no functionality changes
- **Status**: Automated script created and executed
- **Duration**: ~30 minutes
- **Files Affected**: 300+ instances across entire codebase

**Comment Pattern:**
```typescript
// TODO-SEMANTIC: This 'job' should be 'step' - worker processing unit
const jobId = worker.getCurrentJob();

// TODO-SEMANTIC: This 'workflow' should be 'job' - user request
const workflowData = request.getWorkflow();
```

### Phase 2: Core Type Migration 🚀 READY
- **Objective**: Update core interfaces and type definitions
- **Risk Level**: Medium - requires careful testing
- **Files**: `packages/core/src/types/*.ts`
- **Duration**: ~2 hours
- **Key Changes**:
  - Interface Job → Step
  - Interface Workflow → Job (new)
  - Property job_id → step_id
  - Property workflow_id → job_id

### Phase 3: Redis Pattern Migration 📋 PLANNED
- **Objective**: Update Redis key patterns and search logic
- **Risk Level**: High - affects live attestation system
- **Duration**: ~4 hours
- **Key Changes**:
  - Update worker attestation key creation
  - Update monitor search patterns
  - Maintain backwards compatibility

### Phase 4: API Surface Migration 📋 PLANNED
- **Objective**: Update API endpoints, request/response formats
- **Risk Level**: High - affects external integrations
- **Duration**: ~6 hours
- **Key Changes**:
  - URL path updates (/workflows → /jobs, /jobs → /steps)
  - Request/response field mapping
  - Documentation updates

### Phase 5: Variable and Documentation 📋 PLANNED
- **Objective**: Clean up variable names, comments, documentation
- **Risk Level**: Low - mostly cosmetic
- **Duration**: ~4 hours
- **Key Changes**:
  - Function parameter names
  - Local variable names
  - Inline comments and documentation

## Automation Tools

### Location
All automation tools are located at:
```
/Users/the_dusky/code/emprops/ai_infra/emp-job-queue/scripts/semantic-cleanup/
```

### Available Scripts

#### `phase1-tag-terminology.sh`
- **Purpose**: Add TODO-SEMANTIC comments to identify issues
- **Risk**: Zero
- **Usage**: `./phase1-tag-terminology.sh`
- **Output**: Tagged files with issue identification

#### `phase2-migrate-types.sh`
- **Purpose**: Migrate core type definitions
- **Risk**: Medium
- **Prerequisites**: Phase 1 complete, git clean
- **Usage**: `./phase2-migrate-types.sh`
- **Output**: Updated type definitions with new semantics

#### `validate-migration.sh`
- **Purpose**: Comprehensive validation after each phase
- **Risk**: Zero (read-only)
- **Usage**: `./validate-migration.sh`
- **Output**: Validation report with issues found

### Safety Features
- **Automatic Backups**: Timestamped backups before each phase
- **Git Integration**: Automatic commits at checkpoints
- **Rollback Procedures**: Scripts to undo changes if needed
- **TypeScript Validation**: Ensures compilation after changes
- **Test Integration**: Runs test suites to catch regressions

## Backwards Compatibility Strategy

### During Transition
- **Dual Support**: Old and new terminology supported simultaneously
- **Legacy Patterns**: Redis search includes old key patterns
- **API Compatibility**: Old field names mapped to new ones
- **Gradual Migration**: Components updated incrementally

### Timeline
- **Week 1**: Phase 1 + Phase 2 (Core types)
- **Week 2**: Phase 3 (Redis patterns)
- **Week 3**: Phase 4 (API surface)
- **Week 4**: Phase 5 (Variables/docs) + cleanup

## Impact Assessment

### Benefits
- ✅ **Clear Terminology**: No more confusion about job vs workflow
- ✅ **EmProps Alignment**: Matches database terminology exactly
- ✅ **Developer Experience**: Easier onboarding and maintenance
- ✅ **Future-Proof**: Clean foundation for system evolution
- ✅ **Agent-Friendly**: AI agents won't get confused by mixed terms

### Risks Mitigated
- **Breaking Changes**: Phased approach with backwards compatibility
- **Data Loss**: Comprehensive backup and rollback procedures
- **Performance Impact**: Redis patterns designed for efficiency
- **Team Confusion**: Clear documentation and communication plan

## Current Status

### Completed
- [x] Comprehensive codebase analysis (300+ instances identified)
- [x] Automation framework developed and tested
- [x] Phase 1 execution begun (TODO-SEMANTIC tagging)
- [x] Documentation created (this document)

### In Progress
- [ ] Phase 1 completion (tagging remaining files)
- [ ] Team review of migration plan
- [ ] Phase 2 preparation (type definition updates)

### Next Actions
1. **Complete Phase 1**: Finish tagging all incorrect terminology
2. **Team Review**: Review migration plan and timeline
3. **Execute Phase 2**: Begin core type migration
4. **Validate**: Run comprehensive validation suite
5. **Continue Phases**: Proceed through remaining phases systematically

## Communication Plan

### Team Notifications
- **Before Each Phase**: Email notification with objectives and timeline
- **During Migration**: Slack updates on progress and any issues
- **After Each Phase**: Summary report with validation results

### Developer Guidelines
- **New Code**: Must use new terminology immediately
- **Bug Fixes**: Update terminology when touching affected code
- **Reviews**: Check for correct semantic usage in all PRs

## References

### Related Documents
- [North Star Architecture](../02-north-star-architecture.md) - System evolution goals
- [Redis Direct Architecture](../03-implementation-details/redis-direct-architecture.md) - Current Redis patterns
- [Attestation System Integration](./2025-01-14-attestation-system-integration.md) - Recent Redis key updates

### Automation Scripts
- [Semantic Cleanup Scripts](/scripts/semantic-cleanup/) - Complete automation framework
- [Migration Validation](/scripts/semantic-cleanup/validate-migration.sh) - Validation procedures
- [Rollback Procedures](/scripts/semantic-cleanup/README.md) - Safety and recovery

---

**Status**: Phase 1 In Progress | **Owner**: Development Team | **Updated**: January 15, 2025