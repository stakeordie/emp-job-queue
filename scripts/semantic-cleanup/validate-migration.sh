#!/bin/bash
# Validation script for semantic migration
# This script validates that the migration was successful

set -e

REPO_ROOT="/Users/the_dusky/code/emprops/ai_infra/emp-job-queue"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔍 Semantic Migration Validation"
echo "📁 Repository: $REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status="$1"
    local message="$2"
    local color="$3"

    printf "${color}[${status}]${NC} ${message}\n"
}

# Function to count occurrences
count_occurrences() {
    local pattern="$1"
    local path="$2"
    find "$path" -name "*.ts" -o -name "*.js" | xargs grep -l "$pattern" 2>/dev/null | wc -l
}

# Function to validate TypeScript compilation
validate_typescript() {
    echo ""
    echo "🧪 Validating TypeScript Compilation..."

    cd "$REPO_ROOT"
    if pnpm typecheck > /tmp/typecheck.log 2>&1; then
        print_status "✅" "TypeScript compilation successful" "$GREEN"
        return 0
    else
        print_status "❌" "TypeScript compilation failed" "$RED"
        echo "Compilation errors:"
        cat /tmp/typecheck.log | head -20
        return 1
    fi
}

# Function to validate semantic consistency
validate_semantics() {
    echo ""
    echo "📋 Validating Semantic Consistency..."

    local issues_found=0

    # Check for remaining TODO-SEMANTIC comments
    local semantic_todos=$(find "$REPO_ROOT" -name "*.ts" -o -name "*.js" | xargs grep -l "TODO-SEMANTIC" 2>/dev/null | wc -l)
    if [[ $semantic_todos -gt 0 ]]; then
        print_status "📝" "Found $semantic_todos files with TODO-SEMANTIC comments" "$YELLOW"
        echo "  Files:"
        find "$REPO_ROOT" -name "*.ts" -o -name "*.js" | xargs grep -l "TODO-SEMANTIC" 2>/dev/null | head -10 | sed 's|^|    - |'
    else
        print_status "✅" "No TODO-SEMANTIC comments found" "$GREEN"
    fi

    # Check for mixed terminology usage
    echo ""
    echo "🔍 Checking for Mixed Terminology Usage..."

    # Look for potential Job/Step confusion
    local job_step_issues=$(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -E "(Job.*Step|Step.*Job)" 2>/dev/null | wc -l)
    if [[ $job_step_issues -gt 0 ]]; then
        print_status "⚠️" "Found $job_step_issues potential Job/Step mixed usage" "$YELLOW"
        issues_found=$((issues_found + 1))
    fi

    # Look for potential Workflow/Job confusion
    local workflow_job_issues=$(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -E "(Workflow.*Job|Job.*Workflow)" 2>/dev/null | wc -l)
    if [[ $workflow_job_issues -gt 0 ]]; then
        print_status "⚠️" "Found $workflow_job_issues potential Workflow/Job mixed usage" "$YELLOW"
        issues_found=$((issues_found + 1))
    fi

    # Check for inconsistent property naming
    local workflow_id_usage=$(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -E "workflow_id.*:" 2>/dev/null | wc -l)
    local job_id_usage=$(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -E "job_id.*:" 2>/dev/null | wc -l)

    print_status "📊" "workflow_id usage: $workflow_id_usage occurrences" "$BLUE"
    print_status "📊" "job_id usage: $job_id_usage occurrences" "$BLUE"

    if [[ $issues_found -eq 0 ]]; then
        print_status "✅" "No major semantic consistency issues found" "$GREEN"
    fi
}

# Function to validate file structure
validate_file_structure() {
    echo ""
    echo "📁 Validating File Structure..."

    # Check for required files
    local required_files=(
        "$REPO_ROOT/packages/core/src/types/step.ts"
        "$REPO_ROOT/packages/core/src/types/job.ts"
        "$REPO_ROOT/packages/core/src/types/index.ts"
    )

    local missing_files=0
    for file in "${required_files[@]}"; do
        if [[ -f "$file" ]]; then
            print_status "✅" "Found $(basename "$file")" "$GREEN"
        else
            print_status "❌" "Missing $(basename "$file")" "$RED"
            missing_files=$((missing_files + 1))
        fi
    done

    if [[ $missing_files -eq 0 ]]; then
        print_status "✅" "All required files present" "$GREEN"
    else
        print_status "❌" "$missing_files required files missing" "$RED"
        return 1
    fi
}

# Function to validate exports
validate_exports() {
    echo ""
    echo "📤 Validating Type Exports..."

    cd "$REPO_ROOT"

    # Try to import new types
    local temp_test_file="/tmp/semantic_import_test.ts"
    cat > "$temp_test_file" << 'EOF'
import { Step, StepStatus, StepResult, Job, JobStatusResponse } from './packages/core/src/types/index.js';

// Test that types are properly exported
const testStep: Step = {} as any;
const testJob: Job = {} as any;
const testStatus: StepStatus = 'pending';
EOF

    if tsc --noEmit --skipLibCheck "$temp_test_file" 2>/dev/null; then
        print_status "✅" "Type exports working correctly" "$GREEN"
    else
        print_status "❌" "Type export issues detected" "$RED"
        return 1
    fi

    rm -f "$temp_test_file"
}

# Function to generate migration status report
generate_status_report() {
    echo ""
    echo "📊 Generating Migration Status Report..."

    local report_file="$SCRIPT_DIR/migration_status_$(date +%Y%m%d_%H%M%S).md"

    cat > "$report_file" << EOF
# Semantic Migration Status Report

Generated: $(date)

## File Structure Status
$(validate_file_structure 2>&1)

## TypeScript Compilation Status
$(validate_typescript 2>&1)

## Semantic Consistency Status
$(validate_semantics 2>&1)

## Current State Analysis

### Type Usage Statistics
- Step interface usage: $(count_occurrences "interface Step" "$REPO_ROOT/packages") files
- Job interface usage: $(count_occurrences "interface Job" "$REPO_ROOT/packages") files
- StepStatus usage: $(count_occurrences "StepStatus" "$REPO_ROOT/packages") files

### Property Name Statistics
- job_id usage: $(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -c "job_id" 2>/dev/null | awk '{sum += $1} END {print sum}') occurrences
- workflow_id usage: $(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -c "workflow_id" 2>/dev/null | awk '{sum += $1} END {print sum}') occurrences
- step_id usage: $(find "$REPO_ROOT/packages" -name "*.ts" | xargs grep -c "step_id" 2>/dev/null | awk '{sum += $1} END {print sum}') occurrences

### TODO-SEMANTIC Comments
- Remaining tagged items: $(count_occurrences "TODO-SEMANTIC" "$REPO_ROOT") files

## Recommendations
1. Complete implementation file updates to use new types
2. Update Redis patterns in Phase 3
3. Update API endpoints in Phase 3
4. Remove TODO-SEMANTIC comments as issues are resolved
5. Remove compatibility layer after full migration

## Next Steps
1. Run comprehensive tests
2. Update implementation files
3. Migrate Redis patterns
4. Update API documentation
EOF

    echo "📊 Report saved to: $report_file"
}

# Function to run tests
validate_tests() {
    echo ""
    echo "🧪 Running Tests..."

    cd "$REPO_ROOT"
    if pnpm test > /tmp/test_results.log 2>&1; then
        print_status "✅" "Tests passing" "$GREEN"
    else
        print_status "⚠️" "Some tests failing" "$YELLOW"
        echo "Test failures (first 20 lines):"
        head -20 /tmp/test_results.log
    fi
}

# Main validation execution
echo "🚀 Starting Migration Validation..."

validation_passed=true

# Run validations
if ! validate_file_structure; then
    validation_passed=false
fi

if ! validate_exports; then
    validation_passed=false
fi

if ! validate_typescript; then
    validation_passed=false
fi

validate_semantics
validate_tests
generate_status_report

echo ""
echo "🏁 Validation Complete!"

if $validation_passed; then
    print_status "✅" "Migration validation successful" "$GREEN"
    echo ""
    echo "🎉 The semantic migration appears to be working correctly!"
    echo "📋 Next steps:"
    echo "  1. Review the generated status report"
    echo "  2. Update implementation files to use new types"
    echo "  3. Run Phase 3 (Redis and API migration)"
    echo "  4. Thoroughly test all functionality"
    exit 0
else
    print_status "❌" "Migration validation failed" "$RED"
    echo ""
    echo "💥 Issues detected during validation!"
    echo "📋 Required actions:"
    echo "  1. Review the errors above"
    echo "  2. Fix TypeScript compilation issues"
    echo "  3. Ensure all required files are present"
    echo "  4. Re-run validation"
    exit 1
fi