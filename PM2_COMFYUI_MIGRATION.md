# PM2 ComfyUI Migration Guide

## Overview
This guide covers replacing the `/etc/init.d/comfyui` service management with PM2 for better process management, monitoring, and logging.

## Benefits of PM2 Migration

### 1. Enhanced Process Management
- **Auto-restart**: Automatic restart on crashes
- **Memory monitoring**: Restart on memory thresholds
- **Cluster mode**: Easy scaling across CPU cores
- **Zero-downtime restarts**: Graceful process reloading

### 2. Better Logging
- **Structured logging**: JSON format with timestamps
- **Log rotation**: Automatic log file rotation
- **Real-time monitoring**: Live log streaming
- **Centralized logs**: All instances in one view

### 3. Monitoring & Diagnostics
- **Real-time metrics**: CPU, memory, uptime
- **Web interface**: PM2 monitoring dashboard
- **Health checks**: HTTP endpoint monitoring
- **Process tree**: Parent-child relationship tracking

## Migration Components

### 1. PM2 Ecosystem Configuration (`pm2-comfyui-config.js`)
Dynamically generates PM2 app configurations for each GPU instance:

```javascript
{
  name: "comfyui-gpu0",
  script: "python",
  args: ["main.py", "--listen", "127.0.0.1", "--port", "8188", ...],
  cwd: "/workspace/comfyui_gpu0",
  env: {
    CUDA_VISIBLE_DEVICES: "0",
    GPU_NUM: "0",
    PYTHONUNBUFFERED: "1"
  },
  out_file: "/workspace/comfyui_gpu0/logs/output.log",
  error_file: "/workspace/comfyui_gpu0/logs/error.log",
  instances: 1,
  autorestart: true,
  max_memory_restart: "2G"
}
```

**Key Features:**
- Per-GPU configuration generation
- Environment variable injection
- Automatic port calculation
- Mock GPU mode support
- Health check endpoints

### 2. PM2 Service Wrapper (`pm2-comfyui`)
Direct replacement for `/etc/init.d/comfyui` with same interface:

```bash
# Same commands as before
./pm2-comfyui start 0
./pm2-comfyui stop all  
./pm2-comfyui status 1
./pm2-comfyui restart all

# New PM2-specific commands
./pm2-comfyui list      # List all PM2 processes
./pm2-comfyui logs 0    # Show logs for GPU 0
./pm2-comfyui monit     # Open PM2 monitoring
```

**Enhanced Features:**
- JSON status parsing
- Better error handling
- PM2-specific logging
- Health check integration

### 3. Enhanced mgpu Script (`mgpu-pm2`)
Updated mgpu wrapper with PM2 support:

```bash
# Same interface, PM2 backend
mgpu-pm2 comfyui start all
mgpu-pm2 comfyui logs 0 --lines 50
mgpu-pm2 comfyui monit
mgpu-pm2 comfyui setup all  # Setup all instances
```

**New Capabilities:**
- Colored output for better readability
- Enhanced logging with timestamps
- PM2 monitoring integration
- Automated instance setup

## Installation Steps

### 1. Dockerfile Changes
Add PM2 installation after pip setup:

```dockerfile
# Install Node.js and PM2
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g pm2 && \
    pm2 install pm2-logrotate && \
    pm2 set pm2-logrotate:max_size 10M && \
    pm2 set pm2-logrotate:retain 7 && \
    pm2 set pm2-logrotate:compress true

# Copy PM2 scripts
COPY scripts/pm2-comfyui-config.js ${ROOT}/scripts/
COPY scripts/pm2-comfyui ${ROOT}/scripts/
COPY scripts/mgpu-pm2 ${ROOT}/scripts/
RUN chmod +x ${ROOT}/scripts/pm2-comfyui ${ROOT}/scripts/mgpu-pm2

# Update mgpu symlink
RUN ln -sf ${ROOT}/scripts/mgpu-pm2 /usr/local/bin/mgpu
```

### 2. Start.sh Updates
Replace all `mgpu comfyui` calls with `mgpu-pm2 comfyui`:

```bash
# OLD
if ! mgpu comfyui start all; then

# NEW  
if ! mgpu-pm2 comfyui start all; then
```

**Files affected:**
- Line 1328: ComfyUI startup
- Line 1336: Status verification
- Line 1736: Service restart
- Line 1863: Health checks
- Line 1985: Status reporting

### 3. Add PM2 Environment Setup
New function in start.sh:

```bash
setup_pm2_environment() {
    log "Setting up PM2 environment..."
    
    if ! command -v pm2 >/dev/null 2>&1; then
        log "ERROR: PM2 is not installed"
        return 1
    fi
    
    export PM2_HOME="${ROOT}/.pm2"
    mkdir -p "$PM2_HOME"
    
    # Configure PM2 startup for systemd
    if command -v systemctl >/dev/null 2>&1; then
        pm2 startup systemd -u root --hp /root 2>/dev/null || true
    fi
    
    log "PM2 environment setup complete"
}
```

## Configuration Options

### Environment Variables
- `PM2_HOME`: PM2 configuration directory
- `NUM_GPUS`: Number of GPU instances to manage
- `WORKER_BASE_COMFYUI_PORT`: Base port for ComfyUI services
- `MOCK_GPU`: Enable CPU-only mode
- `COMFY_ARGS`: Additional ComfyUI arguments

### PM2 Log Rotation
Automatic log management:
- **Max size**: 10MB per log file
- **Retention**: 7 days
- **Compression**: Gzipped old logs
- **Location**: `/workspace/comfyui_gpu{N}/logs/`

### Health Monitoring
Built-in health checks:
- **Endpoint**: `http://127.0.0.1:{port}/system_stats`
- **Grace period**: 30 seconds
- **Auto-restart**: On health check failure
- **Memory limit**: 2GB restart threshold

## Usage Examples

### Basic Operations
```bash
# Start all ComfyUI instances
mgpu-pm2 comfyui start all

# Check status of GPU 0
mgpu-pm2 comfyui status 0

# View logs with live tail
mgpu-pm2 comfyui logs 0

# Restart specific instance
mgpu-pm2 comfyui restart 1
```

### Advanced Monitoring
```bash
# List all PM2 processes
mgpu-pm2 comfyui list

# Open PM2 monitoring dashboard
mgpu-pm2 comfyui monit

# View last 100 log lines
mgpu-pm2 comfyui logs 0 --lines 100

# Setup new instances
mgpu-pm2 comfyui setup all
```

### Mock GPU Testing
```bash
# Start in CPU mode
MOCK_GPU=1 mgpu-pm2 comfyui start all

# Check mock instance status
mgpu-pm2 comfyui status 0
```

## Troubleshooting

### Common Issues

1. **PM2 not found**
   ```bash
   # Check installation
   which pm2
   npm list -g pm2
   ```

2. **Permission errors**
   ```bash
   # Fix PM2 home permissions
   chmod 755 /workspace/.pm2
   chown -R root:root /workspace/.pm2
   ```

3. **Port conflicts**
   ```bash
   # Check port usage
   netstat -tulpn | grep 8188
   lsof -i :8188
   ```

4. **Log rotation issues**
   ```bash
   # Reinstall log rotation module
   pm2 install pm2-logrotate
   ```

### PM2 Commands Reference
```bash
# Process management
pm2 start ecosystem.config.js
pm2 stop all
pm2 restart all
pm2 delete all

# Monitoring
pm2 list
pm2 monit
pm2 logs
pm2 describe comfyui-gpu0

# Configuration
pm2 startup
pm2 save
pm2 resurrect
```

## Migration Checklist

- [ ] Install PM2 in Dockerfile
- [ ] Copy PM2 scripts to container
- [ ] Update start.sh mgpu calls
- [ ] Add PM2 environment setup
- [ ] Test single GPU instance
- [ ] Test multi-GPU setup
- [ ] Verify log rotation
- [ ] Test health monitoring
- [ ] Validate mock GPU mode
- [ ] Update documentation

## Benefits Verification

After migration, verify these improvements:

1. **Auto-restart**: Kill a ComfyUI process, verify auto-restart
2. **Memory monitoring**: Check restart on memory threshold
3. **Log rotation**: Verify logs rotate at size limit
4. **Health checks**: Test HTTP endpoint monitoring
5. **Zero-downtime**: Test graceful restarts
6. **Monitoring**: Access PM2 web interface

The PM2 migration provides a robust, production-ready process management solution that significantly improves reliability and observability compared to traditional init.d services.