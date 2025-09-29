# Semantic Cleanup Migration Scripts

This directory contains scripts for systematically migrating the job queue system from mixed terminology to clear semantic distinctions.

## Semantic Model

The new semantic model clarifies the terminology:

- **"Job"** (new) → What users request (formerly "Workflow")
- **"Step"** (new) → What workers process (formerly "Job")

## Migration Phases

### Phase 1: Tag Terminology Issues
**Script:** `phase1-tag-terminology.sh`

**Purpose:** Add TODO-SEMANTIC comments to identify all incorrect terminology usage without changing functionality.

**What it does:**
- Scans all TypeScript files for semantic issues
- Adds TODO-SEMANTIC comments next to incorrect usage
- Creates backups of all modified files
- Generates a comprehensive report of tagged issues

**Safety:** This phase only adds comments - no functional changes.

```bash
./phase1-tag-terminology.sh
```

### Phase 2: Migrate Core Types
**Script:** `phase2-migrate-types.sh`

**Purpose:** Create new type definitions and update interfaces with correct semantics.

**What it does:**
- Creates `step.ts` (worker processing units, formerly Job types)
- Creates `job.ts` (user requests, formerly Workflow types)
- Updates all interface definitions
- Creates compatibility layer for backwards compatibility
- Updates type exports

**Risk Level:** Medium - affects TypeScript compilation but maintains compatibility.

```bash
./phase2-migrate-types.sh
```

### Phase 3: Update Implementations
**Script:** `phase3-update-implementations.sh` (to be created)

**Purpose:** Update all implementation files to use new types and function signatures.

**What it does:**
- Update service implementations
- Update Redis patterns and keys
- Update variable names throughout codebase
- Update function implementations

### Phase 4: Migrate API and Documentation
**Script:** `phase4-api-docs.sh` (to be created)

**Purpose:** Update API endpoints, routes, and documentation.

## Validation

### Validation Script
**Script:** `validate-migration.sh`

**Purpose:** Comprehensive validation that migration is working correctly.

**What it checks:**
- TypeScript compilation
- File structure integrity
- Type export functionality
- Semantic consistency
- Test suite execution
- Generates status reports

```bash
./validate-migration.sh
```

## Usage Instructions

### 1. Pre-Migration Setup
```bash
# Ensure you're in the repo root
cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue

# Make scripts executable
chmod +x scripts/semantic-cleanup/*.sh

# Create backups (optional - scripts create their own)
git stash push -u -m "Pre-semantic-migration backup"
```

### 2. Execute Phase 1 (Safe)
```bash
# Add TODO-SEMANTIC tags (safe - only comments)
./scripts/semantic-cleanup/phase1-tag-terminology.sh

# Validate no functional changes
pnpm typecheck
pnpm test

# Review tagged issues
grep -r "TODO-SEMANTIC" packages/ | head -20
```

### 3. Execute Phase 2 (Medium Risk)
```bash
# Migrate core types
./scripts/semantic-cleanup/phase2-migrate-types.sh

# Validate migration
./scripts/semantic-cleanup/validate-migration.sh

# Check TypeScript compilation
pnpm typecheck

# Run tests to ensure compatibility
pnpm test
```

### 4. Execute Remaining Phases
```bash
# Phase 3: Update implementations (when ready)
./scripts/semantic-cleanup/phase3-update-implementations.sh

# Phase 4: Update API and docs (when ready)
./scripts/semantic-cleanup/phase4-api-docs.sh

# Final validation
./scripts/semantic-cleanup/validate-migration.sh
```

## Safety Measures

### Automatic Backups
Each script creates timestamped backups in `scripts/semantic-cleanup/backups/`:
- `phase1_YYYYMMDD_HHMMSS/` - Phase 1 backups
- `phase2_YYYYMMDD_HHMMSS/` - Phase 2 backups
- etc.

### Rollback Instructions
```bash
# Find your backup directory
ls -la scripts/semantic-cleanup/backups/

# Rollback from Phase 2
BACKUP_DIR="scripts/semantic-cleanup/backups/phase2_20231201_143000"
cp -r $BACKUP_DIR/packages_backup/* packages/
cp -r $BACKUP_DIR/apps_backup/* apps/

# Validate rollback
pnpm typecheck
pnpm test
```

### Git Integration
```bash
# Create checkpoint before each phase
git add .
git commit -m "Checkpoint: Before semantic migration phase N"

# If issues occur, rollback via git
git reset --hard HEAD~1
```

## Validation Checklist

After each phase:

- [ ] TypeScript compilation successful (`pnpm typecheck`)
- [ ] Tests passing (`pnpm test`)
- [ ] No functional changes in Phase 1
- [ ] New types exported correctly in Phase 2
- [ ] Implementation files updated in Phase 3
- [ ] API endpoints working in Phase 4

## Monitoring

### Key Metrics to Track
- TODO-SEMANTIC comment count (should decrease)
- TypeScript compilation errors (should remain 0)
- Test pass rate (should remain 100%)
- Mixed terminology usage (should decrease)

### Validation Commands
```bash
# Count remaining semantic issues
find . -name "*.ts" | xargs grep -c "TODO-SEMANTIC" 2>/dev/null | awk '{sum += $1} END {print "Total TODO-SEMANTIC: " sum}'

# Check for mixed terminology
grep -r "Job.*Step\|Step.*Job" packages/
grep -r "Workflow.*Job\|Job.*Workflow" packages/

# Validate type exports
node -e "const types = require('./packages/core/dist/types'); console.log(Object.keys(types))"
```

## Emergency Procedures

### If TypeScript Compilation Breaks
1. Check the validation output for specific errors
2. Rollback to the last working backup
3. Fix issues incrementally
4. Re-run validation

### If Tests Start Failing
1. Identify which tests are failing
2. Check if failures are related to type changes
3. Update test files to use new types
4. Ensure no functional logic was changed accidentally

### If System Becomes Unstable
1. Immediately rollback using git or backups
2. Analyze what went wrong
3. Fix issues in isolation
4. Re-run migration phases incrementally

## Post-Migration Cleanup

After successful migration:

1. Remove all TODO-SEMANTIC comments
2. Remove compatibility layer (`packages/core/src/types/compatibility.ts`)
3. Update documentation with new terminology
4. Clean up old backup files
5. Update team knowledge and guidelines

## Support

If you encounter issues:

1. Check the validation script output
2. Review backup and rollback procedures
3. Examine the generated status reports
4. Test incrementally with smaller changes

The scripts are designed to be safe and reversible - when in doubt, rollback and analyze the issue.