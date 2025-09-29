#!/bin/bash
# Phase 2: Migrate Core Types and Interfaces
# This script performs the actual semantic renaming of types

set -e

REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${SCRIPT_DIR}/backups/phase2_${TIMESTAMP}"

echo "🔄 Phase 2: Core Types Migration"
echo "📁 Repository: $REPO_ROOT"
echo "💾 Backup Directory: $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "📦 Creating comprehensive backup..."
cp -r "$REPO_ROOT/packages" "$BACKUP_DIR/packages_backup"
cp -r "$REPO_ROOT/apps" "$BACKUP_DIR/apps_backup"

# Function to safely replace text in files
safe_replace() {
    local file="$1"
    local search="$2"
    local replace="$3"

    if [[ -f "$file" ]]; then
        # Use perl for more reliable regex replacement
        perl -i -pe "s/${search}/${replace}/g" "$file"
    fi
}

# Function to create new type definitions
create_new_types() {
    echo "📝 Creating new type definitions..."

    local types_dir="$REPO_ROOT/packages/core/src/types"

    # Create step.ts (based on current job.ts)
    echo "  Creating step.ts..."
    cp "$types_dir/job.ts" "$types_dir/step.ts"

    # Update step.ts to use correct terminology
    sed -i 's/\/\/ TODO-SEMANTIC: This file contains "Job" types that should be "Step" - worker processing unit/\/\/ Step types - what workers process (formerly Job types)/' "$types_dir/step.ts"
    sed -i 's/\/\/ Job types - core job definitions and lifecycle management/\/\/ Step types - core step definitions and lifecycle management/' "$types_dir/step.ts"

    # Rename interfaces in step.ts
    sed -i 's/export interface Job {/export interface Step {/' "$types_dir/step.ts"
    sed -i 's/export enum JobStatus/export enum StepStatus/' "$types_dir/step.ts"
    sed -i 's/export interface JobRequirements/export interface StepRequirements/' "$types_dir/step.ts"
    sed -i 's/export interface JobProgress/export interface StepProgress/' "$types_dir/step.ts"
    sed -i 's/export interface JobResult/export interface StepResult/' "$types_dir/step.ts"
    sed -i 's/export interface JobSubmissionRequest/export interface StepSubmissionRequest/' "$types_dir/step.ts"
    sed -i 's/export interface JobStatusResponse/export interface StepStatusResponse/' "$types_dir/step.ts"
    sed -i 's/export interface JobQueueInfo/export interface StepQueueInfo/' "$types_dir/step.ts"
    sed -i 's/export interface JobFilter/export interface StepFilter/' "$types_dir/step.ts"
    sed -i 's/export interface JobSearchResult/export interface StepSearchResult/' "$types_dir/step.ts"
    sed -i 's/export interface JobAttestation/export interface StepAttestation/' "$types_dir/step.ts"
    sed -i 's/export interface JobForensics/export interface StepForensics/' "$types_dir/step.ts"

    # Update internal references within step.ts
    sed -i 's/status: JobStatus/status: StepStatus/g' "$types_dir/step.ts"
    sed -i 's/requirements\?: JobRequirements/requirements?: StepRequirements/g' "$types_dir/step.ts"
    sed -i 's/job: Job/step: Step/g' "$types_dir/step.ts"
    sed -i 's/jobs: Job\[\]/steps: Step[]/g' "$types_dir/step.ts"

    # Rename property names in step.ts to reflect new semantics
    sed -i 's/workflow_id\?:/job_id?:/g' "$types_dir/step.ts"
    sed -i 's/workflow_priority\?:/job_priority?:/g' "$types_dir/step.ts"
    sed -i 's/workflow_datetime\?:/job_datetime?:/g' "$types_dir/step.ts"
    sed -i 's/job_trace_id/step_trace_id/g' "$types_dir/step.ts"
    sed -i 's/job_span_id/step_span_id/g' "$types_dir/step.ts"
    sed -i 's/job_id: string/step_id: string/g' "$types_dir/step.ts"

    echo "  ✅ Created step.ts"

    # Create job.ts (new, for user requests - based on WorkflowMetadata)
    echo "  Creating job.ts (new user request types)..."
    cat > "$types_dir/job.ts" << 'EOF'
// Job types - what users request (formerly Workflow types)

export interface Job {
  id: string;
  priority: number;
  submitted_at: number;
  customer_id?: string;
  status: 'active' | 'completed' | 'failed';
  total_steps?: number;
  completed_steps?: number;
  metadata?: Record<string, unknown>;
}

export interface JobSubmissionRequest {
  priority?: number;
  customer_id?: string;
  steps: StepSubmissionRequest[];
  metadata?: Record<string, unknown>;
}

export interface JobStatusResponse {
  job: Job;
  steps?: StepStatusResponse[];
  progress?: {
    completed_steps: number;
    total_steps: number;
    percentage: number;
  };
}

// Import Step types for reference
export type {
  Step,
  StepStatus,
  StepSubmissionRequest,
  StepStatusResponse,
  StepResult,
  StepProgress
} from './step.js';
EOF

    echo "  ✅ Created job.ts (new)"

    # Update index.ts to export both
    echo "  Updating index.ts exports..."
    cat >> "$types_dir/index.ts" << 'EOF'

// New semantic exports
export * from './step.js';
export * from './job.js';

// Legacy exports for backwards compatibility (deprecated)
export { Step as Job_DEPRECATED } from './step.js';
export { StepStatus as JobStatus_DEPRECATED } from './step.js';
EOF

    echo "  ✅ Updated index.ts"
}

# Function to update interface definitions
update_interfaces() {
    echo "🔌 Updating interface definitions..."

    local interfaces_dir="$REPO_ROOT/packages/core/src/interfaces"

    for interface_file in "$interfaces_dir"/*.ts; do
        if [[ -f "$interface_file" ]]; then
            echo "  Updating $(basename "$interface_file")..."

            # Import new types
            sed -i '1i import type { Step, StepStatus, StepResult, StepProgress, StepSubmissionRequest, Job, JobStatusResponse } from "../types/index.js";' "$interface_file"

            # Update method signatures
            sed -i 's/submitJob(/submitStep(/g' "$interface_file"
            sed -i 's/getJob(/getStep(/g' "$interface_file"
            sed -i 's/updateJobStatus(/updateStepStatus(/g' "$interface_file"
            sed -i 's/updateJobProgress(/updateStepProgress(/g' "$interface_file"
            sed -i 's/completeJob(/completeStep(/g' "$interface_file"
            sed -i 's/failJob(/failStep(/g' "$interface_file"
            sed -i 's/cancelJob(/cancelStep(/g' "$interface_file"
            sed -i 's/claimJob(/claimStep(/g' "$interface_file"
            sed -i 's/releaseJob(/releaseStep(/g' "$interface_file"

            # Update workflow-related methods
            sed -i 's/getWorkflowMetadata(/getJobMetadata(/g' "$interface_file"
            sed -i 's/createWorkflow(/createJob(/g' "$interface_file"
            sed -i 's/updateWorkflowStatus(/updateJobStatus(/g' "$interface_file"

            # Update type references
            sed -i 's/: Job/: Step/g' "$interface_file"
            sed -i 's/JobStatus/StepStatus/g' "$interface_file"
            sed -i 's/JobResult/StepResult/g' "$interface_file"
            sed -i 's/JobProgress/StepProgress/g' "$interface_file"
            sed -i 's/JobSubmissionRequest/StepSubmissionRequest/g' "$interface_file"
            sed -i 's/WorkflowMetadata/Job/g' "$interface_file"

            # Update parameter names
            sed -i 's/jobId: string/stepId: string/g' "$interface_file"
            sed -i 's/workflowId: string/jobId: string/g' "$interface_file"

            echo "    ✅ Updated $(basename "$interface_file")"
        fi
    done
}

# Function to create migration compatibility layer
create_compatibility_layer() {
    echo "🔗 Creating compatibility layer..."

    local compat_file="$REPO_ROOT/packages/core/src/types/compatibility.ts"

    cat > "$compat_file" << 'EOF'
// Compatibility layer for semantic transition
// TODO: Remove this file after migration is complete

import type { Step, StepStatus, StepResult, StepProgress, StepSubmissionRequest } from './step.js';
import type { Job as NewJob } from './job.js';

// Legacy type aliases for backwards compatibility
export type Job = Step;
export type JobStatus = StepStatus;
export type JobResult = StepResult;
export type JobProgress = StepProgress;
export type JobSubmissionRequest = StepSubmissionRequest;
export type WorkflowMetadata = NewJob;

// Property name mapping helpers
export interface LegacyJobWithNewProperties extends Omit<Step, 'job_id' | 'job_priority' | 'job_datetime'> {
  workflow_id?: string;
  workflow_priority?: number;
  workflow_datetime?: number;
}

// Migration helper functions
export function stepToLegacyJob(step: Step): LegacyJobWithNewProperties {
  const { job_id, job_priority, job_datetime, ...rest } = step as any;
  return {
    ...rest,
    workflow_id: job_id,
    workflow_priority: job_priority,
    workflow_datetime: job_datetime,
  };
}

export function legacyJobToStep(legacyJob: LegacyJobWithNewProperties): Step {
  const { workflow_id, workflow_priority, workflow_datetime, ...rest } = legacyJob;
  return {
    ...rest,
    job_id: workflow_id,
    job_priority: workflow_priority,
    job_datetime: workflow_datetime,
  } as Step;
}
EOF

    echo "  ✅ Created compatibility layer"
}

# Main execution
echo "🚀 Starting Phase 2 Migration..."

create_new_types
update_interfaces
create_compatibility_layer

echo "🧪 Running TypeScript compilation check..."
cd "$REPO_ROOT"
if pnpm typecheck; then
    echo "  ✅ TypeScript compilation successful"
else
    echo "  ⚠️  TypeScript compilation issues detected"
    echo "  📋 Check the output above for specific errors"
fi

echo "📊 Creating migration report..."
report_file="$BACKUP_DIR/phase2_migration_report.md"
cat > "$report_file" << EOF
# Phase 2 Migration Report

## Changes Made

### New Type Files Created
- \`packages/core/src/types/step.ts\` - Worker processing units (formerly Job)
- \`packages/core/src/types/job.ts\` - User requests (formerly Workflow)
- \`packages/core/src/types/compatibility.ts\` - Backwards compatibility layer

### Interface Updates
$(find "$REPO_ROOT/packages/core/src/interfaces" -name "*.ts" | wc -l) interface files updated with new type references

### Type Mappings Applied
- Job → Step (worker processing units)
- JobStatus → StepStatus
- JobProgress → StepProgress
- JobResult → StepResult
- WorkflowMetadata → Job (user requests)

### Property Renaming
- workflow_id → job_id (user request identifier)
- workflow_priority → job_priority
- workflow_datetime → job_datetime
- job_trace_id → step_trace_id (in Step context)
- job_span_id → step_span_id (in Step context)

### Function Signature Updates
- submitJob() → submitStep()
- getJob() → getStep()
- updateJobStatus() → updateStepStatus()
- getWorkflowMetadata() → getJobMetadata()
- And many more...

## Next Steps
1. Update implementation files to use new types
2. Update Redis patterns and keys
3. Test all functionality
4. Update API endpoints

## Rollback Instructions
If issues are encountered, restore from backup:
\`\`\`bash
cp -r $BACKUP_DIR/packages_backup/* $REPO_ROOT/packages/
cp -r $BACKUP_DIR/apps_backup/* $REPO_ROOT/apps/
\`\`\`
EOF

echo "✅ Phase 2 Migration Complete!"
echo "📊 Report generated: $report_file"
echo "💾 Backups stored in: $BACKUP_DIR"
echo ""
echo "🔍 Next Steps:"
echo "  1. Review TypeScript compilation results"
echo "  2. Update implementation files to use new types"
echo "  3. Run comprehensive tests"
echo "  4. Proceed to Phase 3 (Redis and API updates)"
echo ""
echo "⚠️  Important Notes:"
echo "  - Compatibility layer maintains backwards compatibility"
echo "  - Implementation files still need updates"
echo "  - Redis patterns need updating in Phase 3"
echo "  - API endpoints need updating in Phase 3"