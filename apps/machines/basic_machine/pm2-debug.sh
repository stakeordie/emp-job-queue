#!/bin/bash
# Quick PM2 debugging commands

echo "=== PM2 Status Check ==="
echo ""

# Check if PM2 is running
echo "1. PM2 Daemon Status:"
pm2 ping && echo "✅ PM2 daemon is running" || echo "❌ PM2 daemon not running"
echo ""

# List all processes
echo "2. PM2 Process List:"
pm2 list
echo ""

# Check for errored processes
echo "3. Error Summary:"
pm2 list | grep -E "errored|stopped" || echo "✅ No errored processes"
echo ""

# Show recent logs
echo "4. Recent Logs (last 20 lines):"
echo "------------------------"
pm2 logs --nostream --lines 20
echo ""

# Service-specific checks
echo "5. Service Details:"
for service in orchestrator shared-setup redis-worker-gpu0 redis-worker-gpu1; do
  if pm2 describe $service >/dev/null 2>&1; then
    echo -n "  $service: "
    pm2 describe $service | grep -E "status|restart|memory|cpu" | head -4 | tr '\n' ' '
    echo ""
  fi
done

echo ""
echo "=== Useful PM2 Commands ==="
echo "  pm2 logs                    # Stream all logs"
echo "  pm2 logs redis-worker-gpu0  # Stream specific service logs"
echo "  pm2 restart all             # Restart all services"
echo "  pm2 stop all                # Stop all services"
echo "  pm2 delete all              # Remove all services"
echo "  pm2 monit                   # Interactive monitoring"
echo "  pm2 save                    # Save current process list"
echo "  pm2 resurrect               # Restore saved process list"