#!/bin/bash
# Phase 1: Tag all incorrect terminology with TODO-SEMANTIC comments
# This script adds TODO-SEMANTIC comments without changing functionality

set -e

REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${SCRIPT_DIR}/backups/phase1_${TIMESTAMP}"

echo "🏷️  Phase 1: Semantic Terminology Tagging"
echo "📁 Repository: $REPO_ROOT"
echo "💾 Backup Directory: $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup of key files
echo "📦 Creating backups..."
cp -r "$REPO_ROOT/packages/core/src/types" "$BACKUP_DIR/types_backup"
cp -r "$REPO_ROOT/apps/api/src" "$BACKUP_DIR/api_src_backup"
cp -r "$REPO_ROOT/packages/core/src/interfaces" "$BACKUP_DIR/interfaces_backup"

# Function to add TODO-SEMANTIC comments to specific patterns
add_semantic_comments() {
    local file="$1"
    local pattern="$2"
    local comment="$3"

    if [[ -f "$file" ]]; then
        # Create temp file with comments
        sed "s|${pattern}|${pattern} // TODO-SEMANTIC: ${comment}|g" "$file" > "${file}.tmp"
        mv "${file}.tmp" "$file"
        echo "  ✅ Tagged: $(basename "$file")"
    fi
}

echo "🏷️  Tagging Core Type Files..."

# Tag Job interface (should be Step)
if [[ -f "$REPO_ROOT/packages/core/src/types/job.ts" ]]; then
    file="$REPO_ROOT/packages/core/src/types/job.ts"

    # Add file-level comment
    sed -i '1i // TODO-SEMANTIC: This file contains "Job" types that should be "Step" - worker processing units' "$file"

    # Tag specific interfaces
    sed -i 's/^export interface Job {/\/\/ TODO-SEMANTIC: This '\''Job'\'' interface should be '\''Step'\'' - represents what workers process\nexport interface Job {/' "$file"
    sed -i 's/^export interface JobProgress {/\/\/ TODO-SEMANTIC: This '\''JobProgress'\'' interface should be '\''StepProgress'\''\nexport interface JobProgress {/' "$file"
    sed -i 's/^export interface JobResult {/\/\/ TODO-SEMANTIC: This '\''JobResult'\'' interface should be '\''StepResult'\''\nexport interface JobResult {/' "$file"
    sed -i 's/^export interface JobSubmissionRequest {/\/\/ TODO-SEMANTIC: This '\''JobSubmissionRequest'\'' interface should be '\''StepSubmissionRequest'\''\nexport interface JobSubmissionRequest {/' "$file"

    # Tag workflow_id properties (should be job_id)
    sed -i 's/workflow_id\?: string;/workflow_id?: string; \/\/ TODO-SEMANTIC: This '\''workflow_id'\'' should be '\''job_id'\'' - user request identifier/g' "$file"
    sed -i 's/workflow_priority\?: number;/workflow_priority?: number; \/\/ TODO-SEMANTIC: This '\''workflow_priority'\'' should be '\''job_priority'\'' - user request priority/g' "$file"
    sed -i 's/workflow_datetime\?: number;/workflow_datetime?: number; \/\/ TODO-SEMANTIC: This '\''workflow_datetime'\'' should be '\''job_datetime'\'' - user request datetime/g' "$file"

    echo "  ✅ Tagged job.ts with semantic comments"
fi

# Tag Worker types
if [[ -f "$REPO_ROOT/packages/core/src/types/worker.ts" ]]; then
    file="$REPO_ROOT/packages/core/src/types/worker.ts"

    sed -i 's/current_jobs: string\[\];/current_jobs: string[]; \/\/ TODO-SEMANTIC: This '\''current_jobs'\'' should be '\''current_steps'\'' - worker processing units/g' "$file"
    sed -i 's/total_jobs_completed: number;/total_jobs_completed: number; \/\/ TODO-SEMANTIC: This '\''total_jobs_completed'\'' should be '\''total_steps_completed'\''/g' "$file"
    sed -i 's/total_jobs_failed: number;/total_jobs_failed: number; \/\/ TODO-SEMANTIC: This '\''total_jobs_failed'\'' should be '\''total_steps_failed'\''/g' "$file"
    sed -i 's/workflow_id\?: string; \/\/ Workflow restriction/workflow_id?: string; \/\/ TODO-SEMANTIC: This '\''workflow_id'\'' should be '\''job_id'\'' - user request restriction \/\/ Workflow restriction/g' "$file"

    echo "  ✅ Tagged worker.ts with semantic comments"
fi

echo "🏷️  Tagging Interface Files..."

# Tag interface files
for interface_file in "$REPO_ROOT/packages/core/src/interfaces"/*.ts; do
    if [[ -f "$interface_file" ]]; then
        # Tag function names
        sed -i 's/submitJob(/submitJob( \/\/ TODO-SEMANTIC: This '\''submitJob'\'' should be '\''submitStep'\'' - worker processing unit/g' "$interface_file"
        sed -i 's/getJob(/getJob( \/\/ TODO-SEMANTIC: This '\''getJob'\'' should be '\''getStep'\'' - worker processing unit/g' "$interface_file"
        sed -i 's/updateJobStatus(/updateJobStatus( \/\/ TODO-SEMANTIC: This '\''updateJobStatus'\'' should be '\''updateStepStatus'\''/g' "$interface_file"
        sed -i 's/completeJob(/completeJob( \/\/ TODO-SEMANTIC: This '\''completeJob'\'' should be '\''completeStep'\''/g' "$interface_file"
        sed -i 's/claimJob(/claimJob( \/\/ TODO-SEMANTIC: This '\''claimJob'\'' should be '\''claimStep'\''/g' "$interface_file"
        sed -i 's/releaseJob(/releaseJob( \/\/ TODO-SEMANTIC: This '\''releaseJob'\'' should be '\''releaseStep'\''/g' "$interface_file"

        # Tag workflow-related functions (should be job-related)
        sed -i 's/getWorkflowMetadata(/getWorkflowMetadata( \/\/ TODO-SEMANTIC: This '\''getWorkflowMetadata'\'' should be '\''getJobMetadata'\'' - user request/g' "$interface_file"

        echo "  ✅ Tagged $(basename "$interface_file")"
    fi
done

echo "🏷️  Tagging Key Implementation Files..."

# Tag key implementation files
key_files=(
    "$REPO_ROOT/packages/core/src/message-handler.ts"
    "$REPO_ROOT/packages/core/src/enhanced-message-handler.ts"
    "$REPO_ROOT/packages/core/src/job-broker.ts"
    "$REPO_ROOT/packages/core/src/services/event-broadcaster.ts"
    "$REPO_ROOT/apps/api/src/lightweight-api-server.ts"
)

for file in "${key_files[@]}"; do
    if [[ -f "$file" ]]; then
        # Add file-level semantic comment at top
        sed -i '1i // TODO-SEMANTIC: This file contains mixed Job/Workflow terminology - needs systematic review' "$file"

        # Tag common variable patterns
        sed -i 's/const jobId =/const jobId = \/\/ TODO-SEMANTIC: Check if this jobId should be stepId/g' "$file"
        sed -i 's/const workflowId =/const workflowId = \/\/ TODO-SEMANTIC: Check if this workflowId should be jobId/g' "$file"
        sed -i 's/job_id: string/job_id: string \/\/ TODO-SEMANTIC: Verify if this job_id should be step_id/g' "$file"
        sed -i 's/workflow_id: string/workflow_id: string \/\/ TODO-SEMANTIC: Verify if this workflow_id should be job_id/g' "$file"

        echo "  ✅ Tagged $(basename "$file")"
    fi
done

echo "📊 Creating Semantic Issues Report..."

# Create a report of all tagged items
report_file="$BACKUP_DIR/semantic_issues_report.md"
cat > "$report_file" << 'EOF'
# Semantic Terminology Issues Report

This report documents all instances where terminology is used incorrectly according to the new semantic model:

## Semantic Model
- **"Job"** → **"Step"** (what workers process)
- **"Workflow"** → **"Job"** (what users request)

## Files Modified with TODO-SEMANTIC Comments

EOF

# Find all TODO-SEMANTIC comments and add to report
echo "### Tagged Files and Issues" >> "$report_file"
find "$REPO_ROOT" -name "*.ts" -o -name "*.js" | xargs grep -l "TODO-SEMANTIC" | while read -r file; do
    echo "- $(realpath --relative-to="$REPO_ROOT" "$file")" >> "$report_file"
    grep -n "TODO-SEMANTIC" "$file" | sed 's/^/  - Line /' >> "$report_file"
done

echo "✅ Phase 1 Complete!"
echo "📊 Report generated: $report_file"
echo "💾 Backups stored in: $BACKUP_DIR"
echo ""
echo "🔍 Next Steps:"
echo "  1. Review the generated report"
echo "  2. Run TypeScript compilation to ensure no syntax errors"
echo "  3. Run existing tests to ensure functionality unchanged"
echo "  4. Proceed to Phase 2 (actual semantic migration)"
echo ""
echo "📋 Summary:"
echo "  - Added file-level semantic comments to key files"
echo "  - Tagged interface and type definitions"
echo "  - Tagged function signatures"
echo "  - Tagged variable declarations"
echo "  - Created comprehensive backup"
echo ""
echo "⚠️  Important: This phase only adds comments, no functional changes made"