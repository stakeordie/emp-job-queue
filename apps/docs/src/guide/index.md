# EmProps Job Queue Guide

Welcome to the comprehensive guide for the EmProps Job Queue system. This guide covers all aspects of the system from architecture to deployment.

## What is EmProps Job Queue?

EmProps Job Queue is a modern, TypeScript-based distributed job processing system designed specifically for AI workloads. It provides a robust, scalable architecture for managing and processing jobs across multiple workers with sophisticated capability matching.

## Key Features

### 🎯 Pull-Based Architecture
Workers actively request jobs they can handle, ensuring optimal resource utilization and load distribution.

### 🔧 Multi-Service Support
Support for multiple AI services including ComfyUI, A1111, and custom connectors with dynamic capability matching.

### 🚀 EmProps Integration
Advanced component and workflow filtering for specialized worker deployment and job routing.

### 📊 Production Ready
Built with TypeScript, Redis-backed storage, Docker deployment, and comprehensive real-time monitoring.

### 🔄 Real-Time Communication
WebSocket-based communication between clients, workers, and monitoring systems with structured message types.

### 📈 Intelligent Matching
Multi-dimensional job-worker matching based on capabilities, hardware requirements, customer isolation, and performance characteristics.

## System Architecture

The EmProps Job Queue system consists of three main components:

### 1. Hub Service (Central Orchestrator)
- **Job Submission API**: REST endpoints for submitting and managing jobs
- **WebSocket Manager**: Real-time communication with workers and clients
- **Job Queue**: Redis-based priority queue with FIFO ordering within priorities
- **Worker Registry**: Maintains active worker capabilities and status
- **Monitoring Dashboard**: Real-time system monitoring and administration

### 2. Worker System (Distributed Processors)
- **Base Worker**: Core job processing logic and lifecycle management
- **Connector Manager**: Dynamic loading and management of service connectors
- **Service Connectors**: ComfyUI, A1111, and custom service integrations
- **Capability Matching**: Dynamic capability advertisement and job filtering
- **Worker Client**: WebSocket communication with the hub

### 3. Core Services (Shared Infrastructure)
- **Redis Service**: Job storage, worker registry, and message routing
- **Message Handler**: Structured message processing and routing
- **Connection Manager**: WebSocket connection management
- **Job Broker**: Intelligent job-worker matching algorithms

## Quick Start

### Prerequisites
- Node.js 18+ or Docker
- Redis 6.0+
- Optional: GPU for AI workloads

### Basic Setup

1. **Start the Hub**:
```bash
npm start:hub
# or
docker run -p 3001:3001 -p 3002:3002 emp-job-queue:hub
```

2. **Start a Worker**:
```bash
npm start:worker
# or
docker run emp-job-queue:worker
```

3. **Submit a Job**:
```bash
curl -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text_to_image",
    "priority": 50,
    "payload": {
      "prompt": "a beautiful landscape",
      "steps": 20
    },
    "requirements": {
      "service_type": "comfyui"
    }
  }'
```

## Guide Sections

This guide is organized into the following sections:

- **[Architecture](./architecture)** - Detailed system architecture and component interactions
- **[Job Lifecycle](./job-lifecycle)** - Complete job flow from submission to completion
- **[Worker Selection](./worker-selection)** - How workers are matched to jobs
- **[Notifications](./notifications)** - Client and monitor notification systems
- **[WebSocket API](./websocket-api)** - Message types and communication protocols
- **[Redis Data](./redis-data)** - Data structures and storage patterns
- **[Configuration](./configuration)** - Environment variables and deployment options
- **[Deployment](./deployment)** - Production deployment guides
- **[Monitoring](./monitoring)** - System monitoring and troubleshooting

## Next Steps

- Read the [Architecture](./architecture) section to understand the system design
- Follow the [Job Lifecycle](./job-lifecycle) to see how jobs flow through the system
- Check out [Worker Selection](./worker-selection) to understand capability matching
- Explore [Notifications](./notifications) for real-time updates
- Review [Configuration](./configuration) for deployment options

## Getting Help

- Check the [Examples](/examples/) section for code samples
- Review the [API Reference](./websocket-api) for message formats
- See [Troubleshooting](./monitoring#troubleshooting) for common issues
- Visit the [GitHub repository](https://github.com/emprops/emp-job-queue) for source code and issues