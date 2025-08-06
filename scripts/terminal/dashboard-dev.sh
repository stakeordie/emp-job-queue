#!/bin/bash

pnpm shutdown


nohup pnpm dev:docs &

#!/bin/bash

PROFILE=${1:-dev}
PROJECT_ROOT="$HOME/code/emprops/ai_infra/emp-job-queue"
ENV_FILE="$PROJECT_ROOT/.env.$PROFILE"

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

osascript << 'EOF'
tell application "iTerm"
    create window with default profile
    
    -- Set window size (columns, rows)
    set bounds of front window to {100, 100, 2000, 1200}

    delay 1.5
    tell current session of current window
        write text "zellij --layout $HOME/code/emprops/ai_infra/emp-job-queue/scripts/terminal/dashboard-dev.kdl"
    end tell
end tell
EOF