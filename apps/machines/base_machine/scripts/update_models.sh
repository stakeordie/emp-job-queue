#!/bin/bash

# update_models.sh - Script to selectively update models in MGPU containers
# 2025-04-28T11:52:00-04:00 - Created initial version

# Set up environment
ROOT="${ROOT:-/workspace}"
LOG_DIR="${ROOT}/logs"
UPDATE_LOG="${LOG_DIR}/model_update.log"
MARKER_FILE="${ROOT}/shared/.models_synced"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Enable debug mode if DEBUG is set
if [ "${DEBUG:-}" = "true" ]; then
    export PS4='+ ${BASH_SOURCE##*/}:${LINENO}: '
    set -x
fi

# Ensure log directory exists
mkdir -p "$LOG_DIR"
touch "$UPDATE_LOG"

# Logging functions
log() {
    local msg_type="${1:-INFO}"
    shift
    local color="$BLUE"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$msg_type" in
        "ERROR") color="$RED" ;;
        "WARNING") color="$YELLOW" ;;
        "SUCCESS") color="$GREEN" ;;
        *) msg_type="INFO" ;;
    esac
    
    printf "${color}[%s] %s:${NC} %s\n" "$timestamp" "$msg_type" "$*" | tee -a "$UPDATE_LOG"
}

# Shorthand logging functions
info() { log "INFO" "$@"; }
error() { log "ERROR" "$@"; }
warning() { log "WARNING" "$@"; }
success() { log "SUCCESS" "$@"; }

# Function to check model directories
check_model_directories() {
    info "Checking model directories..."
    
    # Check for common model directories
    local key_dirs=(
        "/workspace/shared/models/checkpoints"
        "/workspace/shared/models/loras"
        "/workspace/shared/models/controlnet"
        "/workspace/shared/models/clip_vision"
        "/workspace/shared/models/vae"
        "/workspace/shared/models/upscale_models"
    )
    
    local dir_count=0
    local total_size=0
    local missing_dirs=""
    
    for dir in "${key_dirs[@]}"; do
        if [ -d "$dir" ]; then
            local dir_size=$(du -sm "$dir" 2>/dev/null | cut -f1)
            total_size=$((total_size + dir_size))
            dir_count=$((dir_count + 1))
            info "Found model directory: $dir (${dir_size}MB)"
        else
            missing_dirs="$missing_dirs $dir"
            warning "Missing model directory: $dir"
        fi
    done
    
    # Check marker file
    if [ -f "$MARKER_FILE" ]; then
        # Read timestamp from marker file
        local sync_timestamp=$(cat "$MARKER_FILE" | grep "TIMESTAMP=" | cut -d= -f2)
        local provider=$(cat "$MARKER_FILE" | grep "PROVIDER=" | cut -d= -f2)
        local bucket=$(cat "$MARKER_FILE" | grep "BUCKET=" | cut -d= -f2)
        
        if [ -n "$sync_timestamp" ]; then
            # Calculate age in days
            local current_timestamp=$(date +%s)
            local age_seconds=$((current_timestamp - sync_timestamp))
            local sync_age_days=$((age_seconds / 86400))
            
            info "Last sync was $sync_age_days days ago using provider: $provider, bucket: $bucket"
        else
            warning "Marker file exists but has no timestamp"
        fi
    else
        warning "No marker file found"
    fi
    
    # Print summary
    if [ $dir_count -eq ${#key_dirs[@]} ]; then
        success "All model directories exist with total size: ${total_size}MB"
    elif [ $dir_count -gt 0 ]; then
        warning "Some model directories exist (${dir_count}/${#key_dirs[@]}) with total size: ${total_size}MB"
        warning "Missing directories:$missing_dirs"
    else
        error "No model directories found"
    fi
}

# Function to sync models from cloud storage
sync_models() {
    local force=$1
    local specific_dirs=$2
    
    info "=== Starting model sync process ==="
    
    # Check if CLOUD_PROVIDER is set
    local provider="${CLOUD_PROVIDER:-aws}"
    info "Using cloud provider: ${provider}"
    
    # Determine which bucket to use based on STORAGE_TEST_MODE
    local bucket="emprops-share"
    if [ "${STORAGE_TEST_MODE:-${AWS_TEST_MODE:-false}}" = "true" ]; then
        info "Using test bucket: emprops-share-test"
        bucket="emprops-share-test"
    else
        info "Using production bucket: emprops-share"
    fi
    
    # Prepare exclude/include patterns
    local include_pattern=""
    local exclude_pattern="--exclude custom_nodes/*"
    
    # If specific directories are specified, adjust the patterns
    if [ -n "$specific_dirs" ]; then
        include_pattern="--include models/*"
        for dir in $specific_dirs; do
            include_pattern="$include_pattern --include models/$dir/*"
        done
        exclude_pattern="--exclude * --exclude models/* $include_pattern"
        info "Syncing specific directories: $specific_dirs"
    fi
    
    # Sync based on selected provider
    if [ "${provider}" = "aws" ]; then
        # Check if AWS CLI is installed
        if ! command -v aws &> /dev/null; then
            error "AWS CLI not found. Please install it first."
            return 1
        fi
        
        # Sync models from S3
        info "Starting sync from s3://$bucket to /workspace/shared..."
        
        if [ "$CHECK_ONLY" = "true" ]; then
            info "CHECK_ONLY mode: Would sync from s3://$bucket to /workspace/shared"
            info "Command: aws s3 sync s3://$bucket /workspace/shared --size-only --dryrun $exclude_pattern"
            aws s3 sync "s3://$bucket" /workspace/shared --size-only --dryrun $exclude_pattern 2>&1 | tee -a "$UPDATE_LOG"
        else
            info "Running AWS S3 sync command..."
            aws s3 sync "s3://$bucket" /workspace/shared --size-only $exclude_pattern 2>&1 | tee -a "$UPDATE_LOG"
            local sync_status=$?
            
            if [ $sync_status -eq 0 ]; then
                success "AWS S3 sync completed successfully"
                # Create marker file with timestamp
                echo "TIMESTAMP=$(date +%s)" > "$MARKER_FILE"
                echo "PROVIDER=$provider" >> "$MARKER_FILE"
                echo "BUCKET=$bucket" >> "$MARKER_FILE"
                info "Created marker file: $MARKER_FILE"
            else
                error "AWS S3 sync failed with status $sync_status"
                return 1
            fi
        fi
    elif [ "${provider}" = "google" ]; then
        # Check if gsutil is installed
        if ! command -v gsutil &> /dev/null; then
            error "gsutil command not found. Please install Google Cloud SDK."
            return 1
        fi
        
        # Check for credentials
        if [ -z "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
            export GOOGLE_APPLICATION_CREDENTIALS="/credentials/stake-or-die.json"
            info "GOOGLE_APPLICATION_CREDENTIALS not set. Using default: ${GOOGLE_APPLICATION_CREDENTIALS}"
        fi
        
        # Verify credentials file exists
        if [ ! -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
            error "Credentials file not found at: ${GOOGLE_APPLICATION_CREDENTIALS}"
            if [ -f "/credentials/emprops.json" ]; then
                export GOOGLE_APPLICATION_CREDENTIALS="/credentials/emprops.json"
                info "Using fallback credentials: ${GOOGLE_APPLICATION_CREDENTIALS}"
            else
                error "No valid credentials found. GCS sync may fail."
            fi
        fi
        
        # Activate service account
        info "Activating service account..."
        gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS}" 2>&1 | tee -a "$UPDATE_LOG"
        
        # Test bucket access
        info "Testing bucket access: gs://${bucket}"
        gsutil ls "gs://${bucket}" 2>&1 | head -n 5 | tee -a "$UPDATE_LOG"
        
        if [ "$CHECK_ONLY" = "true" ]; then
            info "CHECK_ONLY mode: Would sync from gs://${bucket} to /workspace/shared"
            # List what would be synced
            info "Files that would be synced:"
            gsutil -m rsync -n -r "gs://${bucket}" /workspace/shared 2>&1 | tee -a "$UPDATE_LOG"
        else
            # Run the gsutil sync command
            info "Running gsutil sync command from gs://${bucket} to /workspace/shared..."
            gsutil -m rsync -r "gs://${bucket}" /workspace/shared 2>&1 | tee -a "$UPDATE_LOG"
            local sync_status=$?
            
            if [ $sync_status -eq 0 ]; then
                success "Google Cloud Storage sync completed successfully"
                # Create marker file with timestamp
                echo "TIMESTAMP=$(date +%s)" > "$MARKER_FILE"
                echo "PROVIDER=$provider" >> "$MARKER_FILE"
                echo "BUCKET=$bucket" >> "$MARKER_FILE"
                info "Created marker file: $MARKER_FILE"
            else
                error "Google Cloud Storage sync failed with status ${sync_status}"
                return 1
            fi
        fi
    elif [ "${provider}" = "azure" ]; then
        # Check if Azure CLI is installed
        if ! command -v az &> /dev/null; then
            error "Azure CLI not found. Please install it first."
            return 1
        fi
        
        # Get Azure credentials from environment
        local account_name="${AZURE_STORAGE_ACCOUNT}"
        local account_key="${AZURE_STORAGE_KEY}"
        local container="${AZURE_STORAGE_CONTAINER}"
        
        if [ -z "$account_name" ] || [ -z "$account_key" ]; then
            error "Azure credentials not found in environment variables"
            return 1
        fi
        
        if [ "$CHECK_ONLY" = "true" ]; then
            info "CHECK_ONLY mode: Would sync from Azure container ${container} to /workspace/shared"
        else
            # Use AzCopy for Azure sync (if available)
            if command -v azcopy &> /dev/null; then
                info "Using AzCopy for Azure sync..."
                
                # Create SAS token for authentication
                local end_date=$(date -u -d "1 day" '+%Y-%m-%dT%H:%MZ')
                local sas_token=$(az storage container generate-sas --name "$container" --account-name "$account_name" --account-key "$account_key" --permissions rl --expiry "$end_date" --output tsv)
                
                # Run AzCopy
                info "Running AzCopy from Azure container ${container} to /workspace/shared..."
                azcopy copy "https://${account_name}.blob.core.windows.net/${container}?${sas_token}" "/workspace/shared" --recursive 2>&1 | tee -a "$UPDATE_LOG"
                local sync_status=$?
                
                if [ $sync_status -eq 0 ]; then
                    success "Azure sync completed successfully"
                    # Create marker file with timestamp
                    echo "TIMESTAMP=$(date +%s)" > "$MARKER_FILE"
                    echo "PROVIDER=$provider" >> "$MARKER_FILE"
                    echo "CONTAINER=$container" >> "$MARKER_FILE"
                    info "Created marker file: $MARKER_FILE"
                else
                    error "Azure sync failed with status ${sync_status}"
                    return 1
                fi
            else
                error "AzCopy not found. Azure sync requires AzCopy."
                return 1
            fi
        fi
    else
        error "Unknown CLOUD_PROVIDER: ${provider}. Must be 'aws', 'google', or 'azure'"
        return 1
    fi
    
    info "=== Model sync process complete ==="
}

# Function to show usage
usage() {
    echo "Usage: update_models.sh [options]"
    echo ""
    echo "Options:"
    echo "  --check-only          Check what would be updated without making changes"
    echo "  --force               Force update even if models exist"
    echo "  --specific-dirs DIR1,DIR2,...  Only update specific model directories"
    echo "  --max-age DAYS        Force update if last sync is older than DAYS days"
    echo "  --provider PROVIDER   Override cloud provider (aws, google, azure)"
    echo "  --bucket BUCKET       Override bucket/container name"
    echo "  --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  update_models.sh --check-only                  # Check what would be updated"
    echo "  update_models.sh --force                       # Force update all models"
    echo "  update_models.sh --specific-dirs checkpoints,loras  # Only update specific directories"
    echo "  update_models.sh --max-age 3                   # Update if sync is older than 3 days"
    echo ""
    exit 1
}

# Main function
main() {
    # Parse command line arguments
    CHECK_ONLY=false
    FORCE_UPDATE=false
    SPECIFIC_DIRS=""
    MAX_AGE_DAYS=7
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check-only)
                CHECK_ONLY=true
                shift
                ;;
            --force)
                FORCE_UPDATE=true
                export FORCE_MODEL_SYNC=true
                shift
                ;;
            --specific-dirs)
                SPECIFIC_DIRS="${2//,/ }"
                shift 2
                ;;
            --max-age)
                MAX_AGE_DAYS="$2"
                export MAX_SYNC_AGE_DAYS="$MAX_AGE_DAYS"
                shift 2
                ;;
            --provider)
                export CLOUD_PROVIDER="$2"
                shift 2
                ;;
            --bucket)
                export CUSTOM_BUCKET="$2"
                shift 2
                ;;
            --help)
                usage
                ;;
            *)
                echo "Error: Unknown argument '$1'"
                usage
                ;;
        esac
    done
    
    info "=== Model Update Tool ==="
    info "Check only: $CHECK_ONLY"
    info "Force update: $FORCE_UPDATE"
    info "Max age days: $MAX_AGE_DAYS"
    
    if [ -n "$SPECIFIC_DIRS" ]; then
        info "Specific directories: $SPECIFIC_DIRS"
    fi
    
    # Check current model state
    check_model_directories
    
    # If force update or check only, sync models
    if [ "$FORCE_UPDATE" = "true" ] || [ "$CHECK_ONLY" = "true" ] || [ -n "$SPECIFIC_DIRS" ]; then
        sync_models "$FORCE_UPDATE" "$SPECIFIC_DIRS"
    else
        # Check if marker file exists
        if [ -f "$MARKER_FILE" ]; then
            # Read timestamp from marker file
            local sync_timestamp=$(cat "$MARKER_FILE" | grep "TIMESTAMP=" | cut -d= -f2)
            
            if [ -n "$sync_timestamp" ]; then
                # Calculate age in days
                local current_timestamp=$(date +%s)
                local age_seconds=$((current_timestamp - sync_timestamp))
                local sync_age_days=$((age_seconds / 86400))
                
                if [ $sync_age_days -gt $MAX_AGE_DAYS ]; then
                    warning "Last sync is older than $MAX_AGE_DAYS days. Forcing update."
                    sync_models true
                else
                    info "Last sync is within $MAX_AGE_DAYS days. No update needed."
                    info "Use --force to override."
                fi
            else
                warning "Marker file exists but has no timestamp. Forcing update."
                sync_models true
            fi
        else
            warning "No marker file found. Forcing update."
            sync_models true
        fi
    fi
    
    success "=== Model Update Tool Completed ==="
}

# Execute main function
main "$@"
