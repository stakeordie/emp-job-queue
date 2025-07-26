# Understanding the System

This section provides the foundational understanding of what the EmProps Job Queue system is, why it exists, and what problems it solves.

## The Story

We built a distributed AI workload processing system because we needed to:
- Handle unpredictable AI workload demands
- Support multiple AI frameworks (ComfyUI, OpenAI, Replicate, etc.)
- Scale elastically across ephemeral infrastructure (SALAD, vast.ai)
- Minimize costs while maximizing throughput

## In This Section

- [System Overview](./system-overview.md) - What the system is and how it's architected
- [North Star Vision](./north-star-vision.md) - Where we're heading strategically *(from plans)*
- [Business Context](./business-context.md) - Why this approach makes business sense *(to be written)*
- [Capabilities & Limitations](./capabilities-limitations.md) - What we can and cannot do *(to be written)*

## Key Concepts to Understand

1. **Distributed Job Queue** - Jobs are submitted to Redis and processed by distributed workers
2. **Machine Types** - GPU machines (ComfyUI), API machines (OpenAI/Replicate), Hybrid machines
3. **Elastic Scaling** - Machines spin up/down based on demand
4. **No Shared Storage** - Each machine is isolated, no persistent shared state

## Next Steps

Once you understand what the system is, proceed to [How It Works](../02-how-it-works/) to dive into the technical details.