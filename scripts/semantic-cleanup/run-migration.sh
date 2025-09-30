#!/bin/bash
# Helper script to run Phase 4.3.2 data migration
# Makes it easy to run with different configurations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_SCRIPT="$SCRIPT_DIR/migrate-job-keys-to-steps.ts"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
DRY_RUN="${DRY_RUN:-true}"
BATCH_SIZE="${BATCH_SIZE:-100}"
VALIDATE_COPIES="${VALIDATE_COPIES:-true}"

print_header() {
    echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     Phase 4.3.2: Job → Step Data Migration           ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_config() {
    echo -e "${YELLOW}Configuration:${NC}"
    echo "  REDIS_URL:        $REDIS_URL"
    echo "  DRY_RUN:          $DRY_RUN"
    echo "  BATCH_SIZE:       $BATCH_SIZE"
    echo "  VALIDATE_COPIES:  $VALIDATE_COPIES"
    echo ""
}

confirm() {
    if [ "$DRY_RUN" = "false" ]; then
        echo -e "${YELLOW}⚠️  WARNING: This will COPY data in Redis${NC}"
        echo -e "${YELLOW}⚠️  Ensure you have a backup and enough memory${NC}"
        echo ""
        read -p "Are you sure you want to continue? (yes/no): " -r
        echo
        if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
            echo -e "${RED}Migration cancelled${NC}"
            exit 1
        fi
    fi
}

run_migration() {
    echo -e "${GREEN}Starting migration...${NC}"
    echo ""

    export REDIS_URL
    export DRY_RUN
    export BATCH_SIZE
    export VALIDATE_COPIES

    pnpm tsx "$MIGRATION_SCRIPT"

    MIGRATION_EXIT_CODE=$?

    echo ""
    if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Migration completed successfully!${NC}"
    else
        echo -e "${RED}❌ Migration failed with exit code: $MIGRATION_EXIT_CODE${NC}"
        exit $MIGRATION_EXIT_CODE
    fi
}

print_next_steps() {
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"

    if [ "$DRY_RUN" = "true" ]; then
        echo "  1. Review the output above"
        echo "  2. Fix any issues if needed"
        echo "  3. Run live migration:"
        echo -e "     ${GREEN}DRY_RUN=false ./run-migration.sh${NC}"
    else
        echo "  1. Verify key counts match:"
        echo -e "     ${GREEN}redis-cli --scan --pattern 'job:*' | wc -l${NC}"
        echo -e "     ${GREEN}redis-cli --scan --pattern 'step:*' | wc -l${NC}"
        echo "  2. Spot check some keys:"
        echo -e "     ${GREEN}redis-cli HGETALL job:abc123${NC}"
        echo -e "     ${GREEN}redis-cli HGETALL step:abc123${NC}"
        echo "  3. Monitor for 1-2 weeks"
        echo "  4. Proceed to Phase 4.3.3 (dual-read implementation)"
    fi
}

show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --dry-run              Run in dry-run mode (default: true)"
    echo "  --live                 Run live migration (sets DRY_RUN=false)"
    echo "  --redis-url URL        Redis connection URL"
    echo "  --batch-size N         Keys per batch (default: 100)"
    echo "  --no-validate          Skip validation (faster)"
    echo "  --help                 Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  REDIS_URL             Redis connection string"
    echo "  DRY_RUN               true/false"
    echo "  BATCH_SIZE            Integer"
    echo "  VALIDATE_COPIES       true/false"
    echo ""
    echo "Examples:"
    echo "  # Dry run (safe, no changes)"
    echo "  $0 --dry-run"
    echo ""
    echo "  # Live migration"
    echo "  $0 --live"
    echo ""
    echo "  # Custom Redis URL"
    echo "  $0 --redis-url redis://user:pass@host:6379/0"
    echo ""
    echo "  # Fast migration (no validation)"
    echo "  $0 --live --batch-size 1000 --no-validate"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --live)
            DRY_RUN=false
            shift
            ;;
        --redis-url)
            REDIS_URL="$2"
            shift 2
            ;;
        --batch-size)
            BATCH_SIZE="$2"
            shift 2
            ;;
        --no-validate)
            VALIDATE_COPIES=false
            shift
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Main execution
print_header
print_config
confirm
run_migration
print_next_steps
