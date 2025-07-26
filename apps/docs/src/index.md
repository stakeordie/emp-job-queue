---
layout: home

hero:
  name: "EmProps Job Queue"
  tagline: "Internal documentation for our distributed AI workload processing system"
  actions:
    - theme: brand
      text: Start Here →
      link: /01-understanding-the-system/
    - theme: alt
      text: How It Works
      link: /02-how-it-works/

features:
  - title: 1. Understanding the System
    details: What we built, why we built it, and the strategic vision driving our architecture
    link: /01-understanding-the-system/
  - title: 2. How It Works
    details: The technical mechanisms - job lifecycle, worker selection, and scaling
    link: /02-how-it-works/
  - title: 3. Implementation Details
    details: Deep technical dive into unified architecture, APIs, and system internals
    link: /03-implementation-details/
  - title: 4. Running in Production
    details: Operating the system - failure handling, monitoring, and optimization
    link: /04-running-in-production/
  - title: 5. Development
    details: How our team builds and maintains the system, plus historical context
    link: /05-development/
  - title: 6. Future Vision
    details: North Star architecture and the evolution toward specialized machine pools
    link: /06-future-vision/
---

## Welcome to EmProps Job Queue Documentation

This is the internal technical documentation for our distributed AI workload processing system. It tells the story of how we built a system to handle unpredictable AI workloads across ephemeral infrastructure while optimizing for cost and performance.

### Documentation Structure

The documentation follows a narrative flow:

1. **Understanding** → What the system is and why it exists
2. **How It Works** → Technical mechanisms and data flow
3. **Implementation** → Deep dive into code and architecture
4. **Production** → Operating and troubleshooting
5. **Development** → How we build and evolve
6. **Future** → Where we're heading

### Legend

Throughout the documentation, you'll see these indicators:

- 📝 **To be written** - Planned documentation not yet created
- 🚧 **From plans** - Content that exists in planning documents (North Star, etc.)
- ✅ **Complete** - Fully documented sections

### Quick Links

**For Engineers:**
- [System Architecture](/01-understanding-the-system/system-overview)
- [Job Lifecycle](/02-how-it-works/job-lifecycle)
- [WebSocket API](/03-implementation-details/websocket-api)

**For Operations:**
- [Failure Handling](/04-running-in-production/failure-handling)
- [Machine Logs Analysis](/04-running-in-production/machine-logs-analysis)
- [Monitoring & Alerting](/04-running-in-production/monitoring-alerting) 📝

**For Leadership:**
- [North Star Vision](/06-future-vision/) 🚧
- [Business Context](/01-understanding-the-system/business-context) 📝
- [Technical Roadmap](/06-future-vision/technical-roadmap) 📝