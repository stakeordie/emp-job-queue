# EmProps Open API

Welcome to the EmProps Open API documentation. This section covers the main API server that powers the EmProps NFT generation platform.

## Overview

The EmProps Open API is a comprehensive REST API built with Express.js and TypeScript that handles:

- **Collection Management**: Creating and managing NFT collections
- **Workflow Execution**: Running AI generation workflows  
- **Asset Generation**: Processing and storing generated content
- **User Management**: Authentication, credits, and permissions
- **Blockchain Integration**: Multi-chain NFT deployment

## Quick Start

```bash
# Get all public collections
GET /collections

# Create a new collection (third-party API)
POST /api/collections/create
{
  "title": "My Collection",
  "instruction_set": { /* complete workflow definition */ }
}

# Execute existing collection (generation)
POST /collections/{id}/generations
{
  "variables": { "style": "cyberpunk" }
}

# Check generation progress  
GET /jobs/{job_id}/events  # Server-Sent Events stream
```

## Documentation Sections

### [Architecture](/08-emprops-open-api/architecture/)
System design, database schema, and integration patterns

### [API Reference](/08-emprops-open-api/api-reference/) 
Complete endpoint documentation with examples

### [Implementation Guides](/08-emprops-open-api/implementation-guides/)
Step-by-step guides for implementing new features

### [Examples](/08-emprops-open-api/examples/)
Code examples and integration patterns

## Integration with Job Queue

The EmProps Open API integrates closely with the [EmProps Job Queue](/01-understanding-the-system/) system:

- **DirectJobNode**: Submits jobs to the distributed worker system
- **Generation Tracking**: Uses job system for progress monitoring  
- **Resource Scaling**: Leverages dynamic worker pools for AI workloads

## Tech Stack

- **Runtime**: Node.js with TypeScript  
- **Framework**: Express.js with Zod validation
- **Database**: PostgreSQL with Prisma ORM
- **Storage**: Multi-cloud (Azure, GCP, AWS S3)
- **Queue**: Redis for job processing
- **Real-time**: Socket.IO and Server-Sent Events
- **Auth**: JWT with Dynamic integration