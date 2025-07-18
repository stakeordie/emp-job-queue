#!/bin/bash

# Function to start the workflow auto-sync service
start_workflow_sync() {
    log "Starting workflow auto-sync service..."
    
    # Check if the script exists
    if [ ! -f "/scripts/auto_sync_workflows.sh" ]; then
        log "WARNING: Workflow auto-sync script not found at /scripts/auto_sync_workflows.sh"
        return 1
    fi
    
    # Start the service in the background
    nohup bash /scripts/auto_sync_workflows.sh > /var/log/workflow_sync_stdout.log 2> /var/log/workflow_sync_stderr.log &
    
    # Check if the service started successfully
    if [ $? -eq 0 ]; then
        log "Workflow auto-sync service started with PID $!"
        return 0
    else
        log "ERROR: Failed to start workflow auto-sync service"
        return 1
    fi
}
