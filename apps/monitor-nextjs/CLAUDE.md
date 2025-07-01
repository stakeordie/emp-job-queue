## Task Management Workflow

When given a task, analyze and respond with:
1. "Here's the prompt I would execute:"
2. [Complete optimized prompt]
3. "This will use: [MCP servers/tools needed]"
4. "Should I proceed? (y/n)"

**MCP Server Usage:**
- Playwright MCP for UI changes and testing

## UI Testing with Playwright MCP

### Starting Local Development with Logging
To properly monitor development and debug issues:

```bash
# 1. Create logs directory
mkdir -p logs

# 2. Start dev server with logging
pnpm dev > logs/dev.log 2>&1 &

# 3. Monitor logs in real-time (optional)
tail -f logs/dev.log
```

### Using Playwright for Testing
With the dev server running, use Playwright MCP to:

1. **Navigate to local server**: `http://localhost:xxxx`
2. **Inspect page elements**: Take snapshots and check UI components
3. **Monitor console errors**: Check for JavaScript errors
4. **Cross-reference logs**: Check `logs/dev.log` for server-side issues

### Benefits of This Approach
- **Real-time monitoring**: See errors immediately
- **Live testing**: Test changes as they sync from file edits
- **Comprehensive debugging**: View both client-side (Playwright) and server-side (logs) issues
- **Development efficiency**: No need to constantly restart servers

### Example Workflow
```bash
# Start logged development
pnpm dev > logs/dev.log 2>&1 &

# Make code changes (auto-sync)
# Use Playwright to test changes
# Check logs for any issues
cat logs/dev.log

# Stop server when done
pkill -f "pnpm dev"
```

## Rules

- **Package Management**: Use `pnpm` only, never `npm`