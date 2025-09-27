#!/bin/bash

# Shutdown any existing services
pnpm shutdown

# Start docs in background
nohup pnpm dev:docs &

# Dashboard setup
PROFILE=${1:-local-dev}
PROJECT_ROOT="$HOME/code/emprops/ai_infra/emp-job-queue"
ENV_FILE="$PROJECT_ROOT/.env.$PROFILE"
KDL_FILE="$PROJECT_ROOT/scripts/terminal/dashboard-$PROFILE.kdl"

if [[ -f "$ENV_FILE" ]]; then
    echo "Loading profile: $PROFILE"
    source "$ENV_FILE"
else
    echo "Profile file $ENV_FILE not found, using defaults"
    export PROJECT_ROOT="$HOME/code/emprops"
    export FRONTEND_DELAY=5
    export FRONTEND_CMD="dev"
    export API_DELAY=10
    export API_CMD="start:dev"
    export DB_SERVICE="postgres"
fi

echo "Starting dashboard with profile: $PROFILE"
echo "Using KDL file: $KDL_FILE"

# Check if KDL file exists
if [[ ! -f "$KDL_FILE" ]]; then
    echo "Warning: KDL file $KDL_FILE not found"
    echo "Available KDL files:"
    ls -la "$PROJECT_ROOT/scripts/terminal/"*.kdl 2>/dev/null || echo "No KDL files found"
fi

# Launch iTerm with Zellij layout
osascript << EOF
tell application "iTerm"
    repeat with theWindow in windows
        close theWindow
        exit repeat
    end repeat

    create window with default profile
    
    -- Set window size (columns, rows)
    set bounds of front window to {100, 100, 2000, 1200}

    delay 1.5
    tell current session of current window
        write text "zellij --layout '$KDL_FILE'"
    end tell
end tell
EOF

echo "Dashboard launched with profile: $PROFILE"