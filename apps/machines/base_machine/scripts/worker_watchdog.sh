#!/bin/bash
# Worker Watchdog Script for the EmProps MGPU System
# Created: 2025-04-07T16:16:30-04:00
# Updated: 2025-04-07T16:53:30-04:00 - Simplified for Docker environment
# This script monitors worker processes and automatically restarts them if they crash

# Set fixed paths for Docker environment
ROOT="/workspace"
DOCKER_ENV=true

# Debug output
echo "[DEBUG] Using ROOT directory: $ROOT"

# Source common functions if available
if [ -f "${ROOT}/scripts/common.sh" ]; then
    source "${ROOT}/scripts/common.sh"
fi

# Configuration (can be overridden by environment variables)
MAX_RESTART_ATTEMPTS=${WORKER_MAX_RESTART_ATTEMPTS:-5}  # Maximum number of restart attempts
RESTART_DELAY=${WORKER_RESTART_DELAY:-60}               # Delay between restart attempts in seconds
CHECK_INTERVAL=${WORKER_CHECK_INTERVAL:-30}             # How often to check worker status in seconds
LOG_DIR="${ROOT}/logs"                                  # Log directory
LOG_FILE="${LOG_DIR}/watchdog.log"                      # Log file for the watchdog

# Create log directory if it doesn't exist
if [ ! -d "$LOG_DIR" ]; then
    mkdir -p "$LOG_DIR" 2>/dev/null
    if [ $? -ne 0 ]; then
        # Try alternate locations if we can't create the directory
        for alt_dir in "/var/log/emprops" "/tmp"; do
            if mkdir -p "$alt_dir" 2>/dev/null; then
                LOG_DIR="$alt_dir"
                LOG_FILE="${LOG_DIR}/watchdog.log"
                echo "[DEBUG] Using alternate log directory: $LOG_DIR"
                break
            fi
        done
    fi
fi
touch "$LOG_FILE"

# Logging function
# Updated: 2025-04-07T16:48:30-04:00 - Improved log formatting
log() {
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "[$timestamp] $1" | tee -a "$LOG_FILE"
}

# Debug logging function that doesn't interfere with other logs
# Updated: 2025-04-07T16:52:00-04:00 - Added more debug functions
debug_log() {
    if [ "${DEBUG:-false}" = true ]; then
        log "[DEBUG] $1"
    fi
}

# Function to create restart flag file for testing
create_restart_flag() {
    local gpu_num=$1
    local work_dir=$(get_work_dir $gpu_num)
    local restart_flag="${work_dir}/restart_enabled"
    
    if [ -d "$work_dir" ]; then
        touch "$restart_flag"
        log "Created restart flag at $restart_flag"
        return 0
    else
        log "ERROR: Work directory does not exist: $work_dir"
        return 1
    fi
}

# Function to check if a file exists with detailed output
check_file_exists() {
    local file_path=$1
    local description=$2
    
    if [ -f "$file_path" ]; then
        log "[DEBUG] $description exists: $(ls -la "$file_path")"
        return 0
    else
        log "[DEBUG] $description does not exist: $file_path"
        return 1
    fi
}

log "Worker watchdog started with configuration:"
log "MAX_RESTART_ATTEMPTS: $MAX_RESTART_ATTEMPTS"
log "RESTART_DELAY: $RESTART_DELAY seconds"
log "CHECK_INTERVAL: $CHECK_INTERVAL seconds"

# Check if worker is running
# Updated: 2025-04-07T17:03:30-04:00 - Using wgpu status command
check_worker() {
    local gpu_num=$1
    
    # Use the wgpu status command to check if the worker is running
    log "Checking worker status for GPU $gpu_num using wgpu status"
    
    # Run wgpu status and capture the output
    local status_output
    status_output=$(wgpu status $gpu_num 2>&1)
    local status_code=$?
    
    # Check if the command was successful and if the output indicates the worker is running
    if [ $status_code -eq 0 ] && echo "$status_output" | grep -q "Worker is running"; then
        # Extract PID from the output if available
        local worker_pid
        worker_pid=$(echo "$status_output" | grep -o "PID: [0-9]*" | awk '{print $2}')
        
        if [ -n "$worker_pid" ]; then
            log "Worker for GPU $gpu_num is running with PID $worker_pid"
        else
            log "Worker for GPU $gpu_num is running (PID unknown)"
        fi
        return 0  # Worker is running
    else
        log "Worker for GPU $gpu_num is not running"
        return 1  # Worker is not running
    fi
}

# Get worker script path
# Updated: 2025-04-07T16:54:00-04:00 - Simplified for Docker environment
get_worker_script() {
    # Check standard locations in order of preference
    if [ -f "/workspace/scripts/worker" ]; then
        echo "/workspace/scripts/worker"
        return 0
    elif [ -f "/etc/init.d/worker" ]; then
        echo "/etc/init.d/worker"
        return 0
    fi
    
    # No worker script found
    log "ERROR: Cannot find worker script"
    return 1
}

# Get work directory for a GPU
# Updated: 2025-04-07T16:54:00-04:00 - Simplified for Docker environment
get_work_dir() {
    local gpu_num=$1
    echo "/workspace/worker_gpu${gpu_num}"
}

# Function to check and restart workers if needed
# Updated: 2025-04-07T16:55:00-04:00 - Simplified for Docker environment
check_workers() {
    local gpu_nums
    
    # Look for worker_gpu* directories in /workspace
    log "Looking for worker directories in Docker environment"
    for dir in /workspace/worker_gpu*; do
        if [ -d "$dir" ]; then
            local gpu_num=$(basename "$dir" | sed 's/worker_gpu//')
            log "Found worker directory: $dir for GPU $gpu_num"
            gpu_nums="$gpu_nums $gpu_num"
        fi
    done
    
    # If no GPU directories found, check for GPU 0 as a fallback
    if [ -z "$gpu_nums" ]; then
        log "No worker directories found, checking for GPU 0 as fallback"
        gpu_nums="0"
    fi
    
    # Process each GPU
    for gpu_num in $gpu_nums; do
        # Get the work directory for this GPU
        local work_dir=$(get_work_dir $gpu_num)
        log "Checking worker for GPU $gpu_num in $work_dir"
        
        # Check if restart is enabled for this worker
        local restart_flag="${work_dir}/restart_enabled"
        
        if [ ! -f "$restart_flag" ]; then
            log "Worker GPU $gpu_num: Restart not enabled (no flag at $restart_flag), skipping check"
            continue
        fi
        
        log "Found restart flag at $restart_flag - proceeding with worker check"
        
        # Check if worker is running
        if ! check_worker $gpu_num; then
            log "Worker GPU $gpu_num: Not running, checking restart conditions"
            
            # Check restart counter
            local restart_count=0
            if [ -f "${work_dir}/restart_count" ]; then
                restart_count=$(cat "${work_dir}/restart_count")
            fi
            
            # Check if max restart attempts reached
            if [ "$restart_count" -ge "$MAX_RESTART_ATTEMPTS" ]; then
                log "Worker GPU $gpu_num: Maximum restart attempts ($MAX_RESTART_ATTEMPTS) reached, disabling auto-restart"
                rm -f "${work_dir}/restart_enabled"
                rm -f "${work_dir}/restart_count"
                continue
            fi
            
            # Increment restart counter
            restart_count=$((restart_count + 1))
            echo "$restart_count" > "${work_dir}/restart_count"
            
            log "Worker GPU $gpu_num: Attempting restart (attempt $restart_count of $MAX_RESTART_ATTEMPTS)"
            
            # Remove stale PID file if it exists
            if [ -f "${work_dir}/worker.pid" ]; then
                rm -f "${work_dir}/worker.pid"
            fi
            
            # Restart the worker
            restart_worker $gpu_num $work_dir
            
            log "Worker GPU $gpu_num: Restart initiated, waiting $RESTART_DELAY seconds before next check"
            sleep "$RESTART_DELAY"
        else
            log "Worker GPU $gpu_num: Running properly, resetting restart counter"
            # Worker is running, reset restart counter
            if [ -f "${work_dir}/restart_count" ]; then
                rm -f "${work_dir}/restart_count"
            fi
        fi
    done
}

# Restart a worker
# Updated: 2025-04-07T16:56:00-04:00 - Simplified for Docker environment
# Updated: 2025-04-07T16:56:30-04:00 - Fixed worker script path
# Updated: 2025-04-07T16:58:00-04:00 - Using wgpu command
restart_worker() {
    local gpu_num=$1
    local work_dir=$2
    
    log "Worker GPU $gpu_num: Attempting restart with wgpu command"
    
    # Make sure restart flag exists before restarting
    touch "${work_dir}/restart_enabled"
    
    # Execute the wgpu command to start the worker
    log "Executing: wgpu start $gpu_num"
    wgpu start $gpu_num
    local start_result=$?
    
    # Log the start result
    log "Worker start command returned: $start_result"
    
    # Check if restart was successful
    sleep 2  # Give the worker a moment to start
    if check_worker $gpu_num; then
        log "Worker GPU $gpu_num: Successfully restarted"
        return 0
    else
        log "Worker GPU $gpu_num: Failed to restart"
        return 1
    fi
}

# Main loop
log "Starting worker monitoring loop"
while true; do
    check_workers
    sleep "$CHECK_INTERVAL"
done
