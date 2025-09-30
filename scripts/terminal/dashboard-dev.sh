#!/bin/bash

# Dashboard setup
PROFILE=${1:-local-dev}
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"

# Change to project root
cd "$PROJECT_ROOT"

# Shutdown any existing services
pnpm -w shutdown

# Start docs in background
nohup pnpm -w dev:docs &
ENV_FILE="$PROJECT_ROOT/.env.$PROFILE"
KDL_TEMPLATE="$PROJECT_ROOT/scripts/terminal/dashboard-$PROFILE.kdl.template"
KDL_FILE="$PROJECT_ROOT/scripts/terminal/dashboard-$PROFILE.kdl"

if [[ -f "$ENV_FILE" ]]; then
    echo "Loading profile: $PROFILE"
    source "$ENV_FILE"
else
    echo "Profile file $ENV_FILE not found, using defaults"
    # Don't override PROJECT_ROOT - keep the calculated value
    export FRONTEND_DELAY=5
    export FRONTEND_CMD="dev"
    export API_DELAY=10
    export API_CMD="start:dev"
    export DB_SERVICE="postgres"
fi

echo "Starting dashboard with profile: $PROFILE"

# Check if template file exists
if [[ ! -f "$KDL_TEMPLATE" ]]; then
    echo "Error: KDL template file $KDL_TEMPLATE not found"
    echo "Available template files:"
    ls -la "$PROJECT_ROOT/scripts/terminal/"*.kdl.template 2>/dev/null || echo "No template files found"
    exit 1
fi

# Generate KDL file from template with PROJECT_ROOT substituted
echo "Generating layout from template: $KDL_TEMPLATE"
sed "s|\${PROJECT_ROOT}|$PROJECT_ROOT|g" "$KDL_TEMPLATE" > "$KDL_FILE"
echo "Generated layout: $KDL_FILE"

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