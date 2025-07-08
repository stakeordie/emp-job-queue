# Basic Machine Logging and Monitoring Guide

## 📍 Log Locations

### **Development Mode (Console)**
```bash
# Start with debug logging to see everything
LOG_LEVEL=debug node src/index.js

# Or use the dev script
LOG_LEVEL=debug npm run dev
```

### **Production Mode (Files)**
```bash
# Logs are written to these locations:
/workspace/logs/basic-machine-2025-07-08.log  # All logs
/workspace/logs/error-2025-07-08.log          # Error logs only

# For Docker/testing:
./data/logs/basic-machine-2025-07-08.log      # Mounted volume
```

### **Service-Specific Logs**
```bash
# ComfyUI service logs
/workspace/comfyui_gpu0/logs/output.log       # ComfyUI process output
/workspace/comfyui_gpu1/logs/output.log       # GPU 1, etc.

# Redis Worker logs  
/tmp/worker_gpu0/logs/                        # Worker process logs
```

### **Real-time Log Following**
```bash
# Follow all logs
tail -f /workspace/logs/basic-machine-*.log

# Follow specific service
tail -f /workspace/comfyui_gpu0/logs/output.log

# Docker logs
docker logs -f basic-machine
```

## 🚀 Complete Startup Sequence

```mermaid
flowchart TD
    A[🚀 Container Start] --> B[📋 Load Environment Config]
    B --> C{🔧 Config Valid?}
    C -->|❌ No| Z1[💥 Exit with Error]
    C -->|✅ Yes| D[🎯 Create ServiceOrchestrator]
    
    D --> E[📊 Log Startup Info]
    E --> F[⚡ Start Orchestrator.start()]
    
    F --> G[📁 Phase 0: Shared Setup]
    G --> H[🔧 SharedSetupService.start()]
    H --> I{📂 Directories OK?}
    I -->|❌ No| Z2[💥 Setup Failed]
    I -->|✅ Yes| J[📋 Phase 1: Core Infrastructure]
    
    J --> K{🌐 NGINX Enabled?}
    K -->|✅ Yes| L[🌐 Start NGINX Service]
    K -->|❌ No| M[⏭️ Skip NGINX]
    L --> M
    
    M --> N[🎮 Phase 2: AI Services - Multi-GPU]
    N --> O[🔢 Read GPU Count from Config]
    O --> P[🔄 For Each GPU (0 to count-1)]
    
    P --> Q{🎨 ComfyUI Enabled?}
    Q -->|✅ Yes| R[🎨 Start ComfyUI Service]
    Q -->|❌ No| S[⏭️ Skip ComfyUI]
    
    R --> R1[📁 Setup ComfyUI Directories]
    R1 --> R2[📝 Create Log Files]
    R2 --> R3[🔍 Validate Working Directory]
    R3 --> R4[🚀 Start Python Process]
    R4 --> R5[⏳ Wait for HTTP Ready]
    R5 --> R6{🏥 Health Check Pass?}
    R6 -->|❌ No| Z3[💥 ComfyUI Failed]
    R6 -->|✅ Yes| S
    
    S --> T{🤖 A1111 Enabled?}
    T -->|✅ Yes| U[🤖 Start A1111 Service]
    T -->|❌ No| V[⏭️ Skip A1111]
    U --> V
    
    V --> W{📡 Redis Worker Enabled?}
    W -->|✅ Yes| X[📡 Start Redis Worker]
    W -->|❌ No| Y[⏭️ Skip Worker]
    
    X --> X1[📦 Download Worker Package]
    X1 --> X2[🔧 Extract & Setup]
    X2 --> X3[⚙️ Create Environment File]
    X3 --> X4[🚀 Start Worker Process]
    X4 --> Y
    
    Y --> AA{🔄 More GPUs?}
    AA -->|✅ Yes| P
    AA -->|❌ No| BB[🎯 Phase 3: Supporting Services]
    
    BB --> CC{🧠 Ollama Enabled?}
    CC -->|✅ Yes| DD[🧠 Start Ollama Service]
    CC -->|❌ No| EE[⏭️ Skip Ollama]
    DD --> EE
    
    EE --> FF[✅ All Services Started]
    FF --> GG[📊 Calculate Startup Time]
    GG --> HH[🎉 Emit 'ready' Event]
    HH --> II[🏥 Start Health Server (Port 9090)]
    II --> JJ[🎯 Process Ready - Main Loop]
    
    JJ --> KK[🔄 Health Monitoring Loop]
    KK --> LL[📊 Service Status Checks]
    LL --> MM[🌐 HTTP Health Endpoints]
    MM --> KK
    
    %% Error Handlers
    Z1 --> ZZ[🛑 Process Exit 1]
    Z2 --> ZZ
    Z3 --> ZZ
    
    %% Health Check Details
    R5 --> R5A[🌐 HTTP Request to localhost:port]
    R5A --> R5B{📊 Status 200?}
    R5B -->|✅ Yes| R6
    R5B -->|❌ No| R5C[⏱️ Wait 1 Second]
    R5C --> R5D{⏰ Timeout?}
    R5D -->|❌ No| R5A
    R5D -->|✅ Yes| Z3
```

## 🔄 Service Lifecycle Detail

```mermaid
flowchart TD
    A[🚀 Service.start()] --> B[📊 Status: STARTING]
    B --> C[🔧 onStart() Implementation]
    
    C --> D[📁 Setup Directories]
    D --> E[📝 Setup Logs]
    E --> F[🔍 Validate Prerequisites]
    F --> G[🚀 Start Process]
    G --> H[💾 Save PID File]
    H --> I[⏳ Wait for Ready]
    
    I --> J{🏥 Health Check}
    J -->|✅ Pass| K[📊 Status: RUNNING]
    J -->|❌ Fail| L[⏱️ Retry]
    L --> M{⏰ Timeout?}
    M -->|❌ No| J
    M -->|✅ Yes| N[💥 Status: ERROR]
    
    K --> O[🎉 Emit 'started' Event]
    O --> P[🔄 Running State]
    
    %% Shutdown Flow
    P --> Q[🛑 Service.stop()]
    Q --> R[📊 Status: STOPPING]
    R --> S[🔧 onStop() Implementation]
    S --> T[🔍 Find Process by Port]
    T --> U[💀 Kill Process (SIGTERM)]
    U --> V[⏱️ Wait 2 Seconds]
    V --> W{🔍 Still Running?}
    W -->|✅ Yes| X[💀 Force Kill (SIGKILL)]
    W -->|❌ No| Y[🧹 Cleanup Files]
    X --> Y
    Y --> Z[📊 Status: STOPPED]
    Z --> AA[🎉 Emit 'stopped' Event]
```

## 📊 Log Output Timeline

### **1. Initial Startup (0-1s)**
```
11:23:59.845 [info] [config] Configuration loaded successfully
11:23:59.846 [info] [main] Starting Basic Machine...
11:23:59.846 [info] [orchestrator] Starting Basic Machine orchestrator...
```

### **2. Phase 0: Shared Setup (1-2s)**
```
11:23:59.847 [info] [orchestrator] Phase 0: Setting up shared directories
11:23:59.847 [info] [shared-setup] Starting service...
11:23:59.848 [info] [shared-setup] Service started successfully
```

### **3. Phase 1: Core Infrastructure (2s)**
```
11:23:59.849 [info] [orchestrator] Phase 1: Starting core infrastructure services
11:23:59.849 [info] [orchestrator] NGINX disabled, skipping
```

### **4. Phase 2: AI Services (2-4s)**
```
11:23:59.850 [info] [orchestrator] Phase 2: Starting AI services for 1 GPUs
11:23:59.850 [info] [orchestrator] Starting services for GPU 0
11:23:59.850 [info] [orchestrator]   - ComfyUI for GPU 0
11:23:59.851 [info] [comfyui] [GPU0] Starting service...
11:23:59.851 [info] [comfyui] [GPU0] Starting ComfyUI service for GPU 0
11:23:59.855 [info] [comfyui] [GPU0] Starting ComfyUI with command: python main.py...
11:24:00.916 [info] [comfyui] [GPU0] Service is ready on port 8188
11:24:00.916 [info] [comfyui] [GPU0] Service started successfully
```

### **5. Phase 3: Supporting Services (4s)**
```
11:24:00.917 [info] [orchestrator] Phase 3: Starting supporting services
11:24:00.917 [info] [orchestrator] Ollama disabled, skipping
```

### **6. Startup Complete (4-5s)**
```
11:24:00.918 [info] [orchestrator] All services started successfully in 1068ms
11:24:00.918 [info] [orchestrator] Basic Machine is ready
11:24:00.919 [info] [main] Health check server listening on port 9090
```

## 🎯 Key Monitoring Points

### **Configuration**
- ✅ Environment variables loaded
- ✅ Service enablement flags processed
- ✅ GPU count detected/configured

### **Service Health**
- ✅ ComfyUI HTTP endpoint responding (port 8188)
- ✅ Redis Worker connected to hub
- ✅ Health monitoring active (port 9090)

### **Resource Status**
- ✅ Directories created and permissions set
- ✅ Log files created and writable
- ✅ Processes running with correct PIDs
- ✅ Ports listening and accessible

## 🔍 Debugging Commands

```bash
# Check service status
curl http://localhost:9090/status

# Check health
curl http://localhost:9090/health

# Check ComfyUI
curl http://localhost:8188/

# Check processes
ps aux | grep -E "(python|node)" | grep -v grep

# Check ports
netstat -tuln | grep -E "(8188|9090)"
```

## 🌐 Port Testing and Monitoring

### **Quick Port Tests (from root directory)**
```bash
# Check health status
pnpm machines:basic:status

# Check ComfyUI status
pnpm machines:basic:comfyui

# Check all port status
pnpm machines:basic:ports

# Follow logs
pnpm machines:basic:logs
```

### **Comprehensive Port Testing Script**
```bash
# Test all exposed ports and services
./apps/machines/basic_machine/scripts/test-ports.sh

# Expected output:
# 🌐 Basic Machine Port Status Check
# ==================================
# 
# 🔍 Testing Core Ports:
#   ✅ Port 9090 (Health Monitoring) - OPEN
#   ✅ Port 8188 (ComfyUI GPU0) - OPEN
# 
# 🌐 Testing HTTP Endpoints:
#   ✅ HTTP 9090/health (Health Check) - RESPONDING
#   ✅ HTTP 8188/ (ComfyUI Web UI) - RESPONDING
```

### **Exposed Ports Summary**
| Port | Service | Status | URL |
|------|---------|---------|-----|
| 22 | SSH | Always | `ssh://localhost:22` |
| 80 | HTTP (NGINX) | Optional | `http://localhost:80` |
| 443 | HTTPS (NGINX) | Optional | `https://localhost:443` |
| 8188 | ComfyUI GPU0 | Default | `http://localhost:8188` |
| 8189-8195 | ComfyUI GPU1-7 | Multi-GPU | `http://localhost:8189` |
| 9090 | Health Monitoring | Always | `http://localhost:9090/health` |
| 3001-3008 | Automatic1111 | Optional | `http://localhost:3001` |
| 11434 | Ollama | Optional | `http://localhost:11434` |

## 🛠️ Log Monitoring Script

Use the provided log monitoring script for easy log following:

```bash
# Follow all basic-machine logs
./scripts/watch-logs.sh all

# Follow ComfyUI service logs
./scripts/watch-logs.sh comfyui

# Follow Redis Worker logs
./scripts/watch-logs.sh worker

# Follow Docker container logs
./scripts/watch-logs.sh docker

# Start with debug logging
./scripts/watch-logs.sh debug
```

## 🚨 Common Issues and Solutions

### **Service Won't Start**
```bash
# Check configuration
LOG_LEVEL=debug npm run dev

# Check port conflicts
netstat -tuln | grep 8188

# Check directory permissions
ls -la /workspace/
```

### **Health Check Failing**
```bash
# Test health endpoint
curl -v http://localhost:9090/health

# Check service status
curl -v http://localhost:9090/status
```

### **ComfyUI Not Responding**
```bash
# Check ComfyUI logs
tail -f /workspace/comfyui_gpu0/logs/output.log

# Test ComfyUI directly
curl -v http://localhost:8188/

# Check process
ps aux | grep python | grep 8188
```

This comprehensive guide covers all aspects of monitoring and debugging the basic_machine startup process!