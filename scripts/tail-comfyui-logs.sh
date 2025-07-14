#!/bin/bash

# Wrapper script to tail ComfyUI logs from the root directory
# Executes the actual script in the basic_machine directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BASIC_MACHINE_SCRIPT="$ROOT_DIR/apps/machines/basic_machine/scripts/tail-comfyui-logs.sh"

if [[ -f "$BASIC_MACHINE_SCRIPT" ]]; then
    exec "$BASIC_MACHINE_SCRIPT" "$@"
else
    echo "❌ ComfyUI log tailer script not found at: $BASIC_MACHINE_SCRIPT"
    exit 1
fi