# Architecture Notes

**Status:** Planning & Design Documents  
**Purpose:** Track architectural planning, refactoring proposals, and system design decisions

## About This Section

This section contains planning documents, architectural proposals, and design decisions for major system changes. Unlike development notes which track day-to-day progress, these documents focus on strategic architecture and planning.

## Current Planning Documents

- **[2025-08-20] - [API Service Refactor Plan](./2025-08-20-api-service-refactor-plan.md)** - Domain separation plan to extract JobService and WorkflowService from monolithic API, consolidate duplicate workflow tracking, and integrate with message bus architecture

## Planned Documents

- **Message Bus Architecture Specification** - Detailed design for event-driven communication
- **Workflow Service API Specification** - Complete API for workflow management
- **Service Boundaries & Domain Model** - Clear definition of service responsibilities

## Document Types

### Planning Documents
Strategic planning for major architectural changes, refactoring efforts, and system evolution.

### Architecture Specifications  
Detailed technical specifications for new services, APIs, and system components.

### Design Decisions
Records of significant architectural decisions, trade-offs considered, and rationale for chosen approaches.

---

*For day-to-day development notes and debugging sessions, see [Development Notes](../10-development-notes/)*