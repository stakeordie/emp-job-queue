# Railway Redis Setup for JavaScript Functions

This guide helps you deploy Redis with JavaScript Functions support to Railway for testing the orchestration system.

## Prerequisites

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway**:
   ```bash
   railway login
   ```

## Option 1: Automated Deployment

Use our automated script:

```bash
pnpm redis:deploy:railway
```

## Option 2: Manual Deployment

1. **Create new Railway project**:
   ```bash
   railway new redis-functions
   ```

2. **Deploy the Redis service**:
   ```bash
   railway up --dockerfile Dockerfile.redis
   ```

3. **Get connection details**:
   ```bash
   railway variables
   ```

## Configuration

1. **Copy the Redis URL** from Railway dashboard or CLI output

2. **Update environment variables**:
   ```bash
   export REDIS_URL="redis://default:password@host:port"
   ```

3. **Test the connection**:
   ```bash
   pnpm redis:functions:install
   ```

## Running Tests

With Railway Redis configured:

```bash
# Install functions
pnpm redis:functions:install

# Run integration tests
pnpm test redis-functions

# Test function manually
pnpm redis:functions:test
```

## Expected Output

✅ Functions should install successfully:
```
🔍 Checking Redis functions...
⚙️ Installing/updating Redis functions...
✅ Redis functions installed successfully
Functions installed: ["findMatchingJob"]
```

## Troubleshooting

### JavaScript Engine Not Found
- Ensure you're using `redis/redis-stack` image
- Check Railway logs for deployment issues

### Connection Issues
- Verify Redis URL format: `redis://username:password@host:port`
- Check Railway service is running
- Test connection: `redis-cli -u $REDIS_URL ping`

### Function Installation Fails
- Check Redis version is 7.0+
- Verify JavaScript engine support: `redis-cli function list`
- Check logs for specific error messages

## Production Considerations

For production use:

1. **Security**: Enable authentication and TLS
2. **Persistence**: Configure appropriate save policies
3. **Memory**: Set proper maxmemory policies
4. **Monitoring**: Enable logging and metrics
5. **Backup**: Set up regular backups

## Testing the Complete System

Once Redis is deployed:

1. **Start API server** with Railway Redis URL
2. **Run workers** pointing to Railway Redis
3. **Submit jobs** and verify orchestration works
4. **Check function logs** in Railway dashboard

This setup gives you a production-like environment for testing the complete Redis Function-based orchestration system.