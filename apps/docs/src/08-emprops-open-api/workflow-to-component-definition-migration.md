# Workflow → Component Definition Migration Plan

## Overview
This document outlines the complete migration strategy to eliminate the "workflow" concept and replace it with "component_definition" across the EmProps API system.

## Current State Analysis

### Tables to Replace
1. **`workflow`** - Main table with: id, name, description, data, server_id, output_mime_type, display, label, order, type, est_gen_time, machine_type, min_vram, created_at
2. **`workflow_custom_node`** - Junction table: id, workflow_id, custom_node_id, created_at
3. **`workflow_model`** - Junction table: id, workflow_id, model_id, is_required, created_at

### New Tables (Already Added to Schema)
1. **`component_definition`** - Replaces workflow table (lines 344-362)
2. **`component_definition_custom_node`** - Replaces workflow_custom_node (lines 303-313)
3. **`component_definition_model`** - Replaces workflow_model (lines 290-301)

### Code Impact Areas Identified
- **API Routes**: `/workflows/*` → `/component-definitions/*`
- **Services**: `src/lib/credits/calculator/`, `src/lib/collections.ts`, `src/lib/workflows.ts`
- **Models**: `src/routes/models/index.ts` (workflow model references)
- **API Keys**: `src/routes/api-keys/index.ts` (workflow_name field)
- **15+ files** with workflow references

## Migration Strategy

### Phase 1: Database Schema & Data Migration (1-2 hours)

#### Step 1.1: Apply Schema Changes
- ✅ **COMPLETED**: Schema already updated with new component_definition tables
- **Next**: Apply to dev database using `prisma db push`
- **Database**: `postgresql://postgres:npg_fuMwsrJiI7d0@ep-orange-boat-afkxlijp-pooler.c-2.us-west-2.aws.neon.tech/emprops-open-api-dev`

#### Step 1.2: Data Migration Script
```sql
-- Migrate workflow data to component_definition
INSERT INTO component_definition (
  id, name, description, data, created_at, server_id,
  output_mime_type, display, label, "order", type,
  est_gen_time, machine_type, min_vram
)
SELECT
  id, name, description, data, created_at, server_id,
  output_mime_type, display, label, "order", type,
  est_gen_time, machine_type, min_vram
FROM workflow;

-- Migrate workflow_model to component_definition_model
INSERT INTO component_definition_model (
  id, component_definition_id, model_id, is_required, created_at
)
SELECT
  id, workflow_id, model_id, is_required, created_at
FROM workflow_model;

-- Migrate workflow_custom_node to component_definition_custom_node
INSERT INTO component_definition_custom_node (
  id, component_definition_id, custom_node_id, created_at
)
SELECT
  id, workflow_id, custom_node_id, created_at
FROM workflow_custom_node;
```

#### Step 1.3: Verify Data Integrity
- Count records in old vs new tables
- Verify foreign key relationships
- Test basic queries on new tables

### Phase 2: Code Migration (4-6 hours)

#### Step 2.1: Core Services Updates

**File: `src/lib/credits/calculator/index.ts`**
```typescript
// OLD
const workflows = await this.prisma.workflow.findMany({

// NEW
const componentDefinitions = await this.prisma.component_definition.findMany({
```

**File: `src/lib/collections.ts`**
```typescript
// OLD
const workflow = await prisma.workflow.findUnique({
  where: { name: step.nodeName },
});

// NEW
const componentDefinition = await prisma.component_definition.findUnique({
  where: { name: step.nodeName },
});
```

**File: `src/lib/workflows.ts`**
```typescript
// OLD
return this.prisma.workflow.findFirst({

// NEW
return this.prisma.component_definition.findFirst({
```

#### Step 2.2: API Routes Migration

**Create New Routes**: `src/routes/component-definitions/`
- Copy from `src/routes/workflows/`
- Update all `workflow` references to `component_definition`
- Update endpoint paths from `/workflows` to `/component-definitions`

**Files to Update**:
- `src/routes/workflows/index.ts` → `src/routes/component-definitions/index.ts`
- `src/routes/workflows/[id]/index.ts` → `src/routes/component-definitions/[id]/index.ts`

**Update Model References**: `src/routes/models/index.ts`
```typescript
// OLD
const workflowModels = await prisma.workflowModel.findMany({
  where: { modelId: id },
  include: { workflow: true },
});

// NEW
const componentDefinitionModels = await prisma.componentDefinitionModel.findMany({
  where: { modelId: id },
  include: { componentDefinition: true },
});
```

**Update API Keys**: `src/routes/api-keys/index.ts`
```typescript
// OLD
const existingWorkflow = await prisma.workflow.findUnique({
  where: { name: workflow_name },
});

// NEW
const existingComponentDefinition = await prisma.component_definition.findUnique({
  where: { name: component_definition_name },
});
```

#### Step 2.3: Type & Schema Updates
- Update Zod validation schemas
- Update TypeScript interfaces
- Update import statements
- Update any hardcoded "workflow" strings

### Phase 3: Testing & Verification (2-3 hours)

#### Step 3.1: Database Testing
- [ ] Test all CRUD operations on component_definition tables
- [ ] Verify foreign key constraints work
- [ ] Test data migration accuracy (count matching)
- [ ] Test complex queries with joins

#### Step 3.2: API Testing
- [ ] Test all component-definition endpoints
- [ ] Test credit calculation with new tables
- [ ] Test collection generation workflow
- [ ] Test model dependency queries
- [ ] Verify error handling

#### Step 3.3: Integration Testing
- [ ] End-to-end workflow testing
- [ ] Test Redis job submissions still work
- [ ] Test miniapp integration
- [ ] Test any external API consumers

### Phase 4: Cleanup & Production (1-2 hours)

#### Step 4.1: Remove Old Tables (After verification)
```sql
-- Drop old workflow tables (ONLY after full verification)
DROP TABLE workflow_custom_node;
DROP TABLE workflow_model;
DROP TABLE workflow;
```

#### Step 4.2: Remove Old Code
- [ ] Remove old `/workflows` routes
- [ ] Remove any unused imports
- [ ] Update documentation
- [ ] Remove old validation schemas

## Risk Mitigation

### 1. Backup Strategy
- **Database**: Take full backup before migration
- **Code**: Current commit provides rollback point

### 2. Gradual Migration
- New tables exist alongside old tables during transition
- Can rollback by reverting code changes (data remains safe)

### 3. Verification Steps
- Data count verification at each step
- Functional testing before old table removal
- Monitor logs for any workflow/component_definition errors

### 4. Rollback Plan
```sql
-- Emergency rollback (if needed)
-- 1. Revert code to previous commit
-- 2. Drop new tables if necessary
DROP TABLE component_definition_custom_node;
DROP TABLE component_definition_model;
DROP TABLE component_definition;
```

## Timeline Estimate

| Phase | Duration | Description |
|-------|----------|-------------|
| Phase 1 | 1-2 hours | Database schema & data migration |
| Phase 2 | 4-6 hours | Code migration & updates |
| Phase 3 | 2-3 hours | Testing & verification |
| Phase 4 | 1-2 hours | Cleanup & production |
| **Total** | **8-13 hours** | Complete migration |

## Current Status

- ✅ **Schema Analysis**: Complete
- ✅ **Code Impact Analysis**: Complete
- ✅ **New Schema Design**: Complete (added to schema.prisma)
- ⏳ **Database Migration**: Ready to apply
- ❌ **Code Migration**: Pending
- ❌ **Testing**: Pending
- ❌ **Cleanup**: Pending

## Next Steps

1. Apply schema changes to dev database: `prisma db push`
2. Run data migration script
3. Start code migration with core services
4. Update API routes
5. Complete testing phase

## Database Connection

**Dev Database**:
```
DATABASE_URL="postgresql://postgres:npg_fuMwsrJiI7d0@ep-orange-boat-afkxlijp-pooler.c-2.us-west-2.aws.neon.tech/emprops-open-api-dev?sslmode=require&channel_binding=require"
```

## Notes

- This is a **breaking change** migration - no backward compatibility needed
- Clean break approach: completely eliminate "workflow" terminology
- Internal API system - full control over all clients
- Maximum downtime tolerance: 30 minutes for final cutover