#!/bin/bash

# Simple script to automatically sync the workflows directory with Git
# Created: 2025-06-08

# Configuration
REPO_DIR="${ROOT:-/workspace}/shared"
WORKFLOWS_DIR="$REPO_DIR/workflows"
LOG_FILE="/workspace/workflow_sync.log"
SYNC_INTERVAL=60  # seconds

# Simple logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Initialize log file
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting workflow sync service" > "$LOG_FILE"
log "Repository: $REPO_DIR"
log "Workflows directory: $WORKFLOWS_DIR"
log "Sync interval: $SYNC_INTERVAL seconds"

# Check if directories exist
if [ ! -d "$REPO_DIR" ]; then
    log "ERROR: Repository directory not found at $REPO_DIR"
    exit 1
fi

if [ ! -d "$WORKFLOWS_DIR" ]; then
    log "ERROR: Workflows directory not found at $WORKFLOWS_DIR"
    exit 1
fi

# Initialize Git config
git config --global user.name "EmProps User"
git config --global user.email "user@emprops.ai"

# Start SSH agent
eval "$(ssh-agent)" > /dev/null
ssh-add ~/.ssh/id_rsa 2>/dev/null || log "No default SSH key found"

# Initial sync with remote
cd "$REPO_DIR" || exit 1
log "Initial fetch from remote"
git fetch origin

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)
log "Current branch: $BRANCH"

# Reset to match remote
log "Resetting to match remote"
git reset --hard "origin/$BRANCH"

# Main loop
log "Starting sync loop - checking every $SYNC_INTERVAL seconds"
while true; do
    # Log each check cycle
    log "Checking for changes"
    
    # Change to repo directory
    cd "$REPO_DIR" || {
        log "ERROR: Could not change to repository directory"
        sleep $SYNC_INTERVAL
        continue
    }
    
    # Check for changes
    git status "$WORKFLOWS_DIR" --porcelain > /tmp/workflow_changes
    
    # If changes exist
    if [ -s /tmp/workflow_changes ]; then
        log "Changes detected:"
        cat /tmp/workflow_changes | tee -a "$LOG_FILE"
        
        # Add and commit changes
        log "Adding changes"
        git add "$WORKFLOWS_DIR"
        
        log "Committing changes"
        if git commit -m "Auto-sync workflows $(date '+%Y-%m-%d %H:%M:%S')"; then
            log "Committed successfully"
            
            # Push changes
            log "Pushing changes"
            if git push origin "$BRANCH:$BRANCH"; then
                log "Push successful"
            else
                log "Push failed - resetting to remote state"
                git fetch origin
                git reset --hard "origin/$BRANCH"
                
                # Re-add any new files
                log "Re-adding any new files"
                git add "$WORKFLOWS_DIR"
                
                # Check if there are still changes to commit
                if ! git diff --staged --quiet; then
                    log "Committing new changes after reset"
                    git commit -m "Auto-sync workflows after reset $(date '+%Y-%m-%d %H:%M:%S')"
                    
                    log "Pushing new commit"
                    git push origin "$BRANCH:$BRANCH" || log "Push failed again"
                fi
            fi
        else
            log "Commit failed"
        fi
    else
        log "No changes detected"
    fi
    
    # Wait for next check
    log "Waiting $SYNC_INTERVAL seconds before next check"
    sleep $SYNC_INTERVAL
done
