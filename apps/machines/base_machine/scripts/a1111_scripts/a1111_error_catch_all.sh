#!/bin/bash
# Added: 2025-04-14T18:50:00-04:00 - Error catch script for Automatic1111

while true; do
  if grep -q "RuntimeError" ~/.pm2/logs/webui-error.log; then
    echo "Runtime error detected, restarting webui"
    pm2 restart webui
  fi
  sleep 10
done
