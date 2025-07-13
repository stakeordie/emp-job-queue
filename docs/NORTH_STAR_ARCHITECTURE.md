⏺ NORTH STAR ARCHITECTURE: EMP-JOB-QUEUE PRODUCTION SYSTEM

  Overview

  This document defines the target architecture for the emp-job-queue system,
  designed to handle distributed AI workloads across ephemeral machines (SALAD,
  vast.ai) with intelligent model management and heterogeneous job performance
  requirements.

  Core Problems Being Solved

  1. Distributed Infrastructure: No shared storage across geographically
  distributed machines
  2. Model Management: Large models (2-15GB each) vs. limited machine storage vs.
  download latency
  3. User Experience: Eliminating first-user wait times and model thrashing
  4. Performance Heterogeneity: Job duration variance (1s to 10+ minutes) causing
  resource contention

  Architectural Strategy: Specialized Machine Pools + Predictive Model Placement

  Instead of uniform machines competing for resources, create specialized pools
  optimized for different workload patterns with intelligent model pre-placement.

  Machine Pool Architecture

  Fast Lane Pool (Jobs: <30 seconds)

  Purpose: Ollama text processing, simple image operations, quick transformations
  Specifications:
  - Storage: 20-40GB for models
  - Compute: CPU-optimized, minimal GPU requirements
  - Model Strategy: Small, frequently-used models only
  - Scaling: High machine count, low-cost instances
  - Examples: Small language models, basic LoRAs, simple filters

  Container Strategy:
  FROM base-comfyui:latest
  RUN install-fast-lane-nodes.sh
  COPY fast-lane-models/ /workspace/models/
  # Pre-baked with: Text models, basic LoRAs, common utilities

  Standard Pool (Jobs: 30s-3min)

  Purpose: Standard image generation, most ComfyUI workflows, typical AI art
  generation
  Specifications:
  - Storage: 80-120GB for models
  - Compute: Balanced CPU/GPU, mid-tier GPUs
  - Model Strategy: Popular model sets, specialized by category
  - Scaling: Moderate machine count, balanced cost/performance
  - Specialization Sub-pools:
    - Photography models (portraits, landscapes, photorealistic)
    - Art models (anime, artistic styles, illustrations)
    - Product models (commercial, e-commerce, marketing)

  Container Strategy:
  FROM base-comfyui:latest
  RUN install-standard-nodes.sh
  COPY standard-models-${SPECIALTY}/ /workspace/models/
  # Specialty variants: photography, art, product

  Heavy Pool (Jobs: 3min+)

  Purpose: Video generation, complex multi-step workflows, batch processing,
  research tasks
  Specifications:
  - Storage: 150-300GB for models
  - Compute: High-end GPUs, significant VRAM
  - Model Strategy: Large models, video-specific, experimental
  - Scaling: Lower machine count, high-spec instances
  - Examples: AnimateDiff, video upscalers, large diffusion models, multi-modal
  models

  Container Strategy:
  FROM base-comfyui:latest
  RUN install-heavy-nodes.sh
  COPY heavy-models/ /workspace/models/
  # Pre-baked with: Video models, large diffusion models, experimental

  Specialty Pools (Domain-Specific)

  Research Pool: Latest experimental models, research workflows
  Enterprise Pool: Customer-specific model sets, compliance requirements
  Regional Pools: Geographic/regulatory compliance (EU, healthcare, finance)

  Model Intelligence System

  Predictive Model Management Service

  interface ModelIntelligenceService {
    // Analyze historical job patterns to predict model demand
    analyzeJobPatterns(timeWindow: Duration): ModelDemandForecast

    // Optimize which models should be on which machines
    optimizeMachineAssignments(): MachineModelPlacement[]

    // Predict which models will be needed in upcoming time window
    predictModelNeeds(timeWindow: Duration): ModelPrediction[]

    // Analyze collection patterns to group compatible models
    analyzeCollectionPatterns(): ModelAffinityMap
  }

  interface ModelDemandForecast {
    modelId: string
    predictedUsage: number
    confidenceScore: number
    recommendedPlacement: PoolType[]
    timePattern: UsagePattern
  }

  Model Placement Strategy

  Pattern Analysis:
  - Learn which models are frequently used together in collections
  - Identify temporal usage patterns (peak hours, seasonal trends)
  - Track model popularity and lifecycle (trending → stable → deprecated)

  Proactive Management:
  - Pre-warm predicted models during low-traffic periods
  - Migrate models between machines based on demand forecasting
  - Maintain frequently-used models on multiple machines across pools

  Collection Optimization:
  - Group compatible models on same machines to minimize downloads
  - Optimize for common workflow patterns
  - Balance storage across machines within pools

  Pre-warming System

  Background Downloads:
  - Download predicted models during machine idle time
  - Use bandwidth-aware scheduling to avoid impacting active jobs
  - Prioritize downloads based on prediction confidence and user tier

  Model Migration:
  - Move models between machines based on changing demand patterns
  - Implement efficient transfer protocols (rsync, torrent-like)
  - Coordinate migrations to avoid service disruption

  Cache Warming:
  - Keep frequently-used models on multiple machines
  - Implement intelligent replication based on demand geography
  - Balance storage costs vs. availability requirements

  Intelligent Job Routing System

  Multi-Dimensional Job Router

  interface JobRoutingDecision {
    // Job requirements
    requiredModels: string[]
    requiredCustomNodes: string[]
    estimatedDuration: number
    priority: number
    userTier: 'free' | 'premium' | 'enterprise'

    // Routing factors
    machineHasModels: boolean
    machineLoadSuitability: number
    estimatedWaitTime: number
    poolType: PoolType
    modelDownloadCost: number
  }

  interface RoutingStrategy {
    // Primary routing logic
    routeJob(job: Job): RoutingDecision

    // Fallback strategies
    handleNoOptimalMachine(job: Job): FallbackStrategy

    // Load balancing
    balancePoolLoad(pools: Pool[]): LoadBalancingDecision
  }

  Routing Decision Logic

  1. Duration-Based Pool Selection:
    - <30s → Fast Lane Pool
    - 30s-3min → Standard Pool (with specialty routing)
    3min → Heavy Pool
  2. Model Affinity Routing:
    - Prefer machines that already have required models
    - Calculate download time vs. queue wait time trade-offs
    - Consider model size and machine available storage
  3. Load Balancing:
    - Consider current queue depth and estimated completion times
    - Account for job priority and user tier
    - Balance across geographical regions if applicable
  4. Fallback Strategies:
    - If no machine has required models: route to least-loaded machine in
  appropriate pool
    - If all machines in pool are busy: consider cross-pool routing with penalties
    - If critical models missing: trigger emergency model deployment

  Specialty Pool Routing

  Photography Jobs → Photography-specialized Standard Pool machines
  Art Generation → Art-specialized Standard Pool machines
  Video Processing → Heavy Pool with video model optimization
  Research/Experimental → Research Pool with latest models

  Container Strategy & Model Management

  Base Container Architecture

  # Multi-stage build for optimal layer caching
  FROM nvidia/cuda:11.8-devel-ubuntu22.04 as base
  # Install Python, Node.js, system dependencies

  FROM base as comfyui-base
  # Install ComfyUI core + common custom nodes
  RUN git clone https://github.com/stakeordie/ComfyUI.git /workspace/ComfyUI
  RUN cd /workspace/ComfyUI && pip install -r requirements.txt
  # Install universal custom nodes (64 nodes)

  FROM comfyui-base as fast-lane
  # Install fast-lane specific nodes and small models
  COPY fast-lane-models/ /workspace/models/
  RUN install-fast-lane-optimizations.sh

  FROM comfyui-base as standard-photography
  # Install photography-specific models and nodes
  COPY photography-models/ /workspace/models/
  RUN install-photography-nodes.sh

  FROM comfyui-base as heavy-video
  # Install video processing models and nodes
  COPY video-models/ /workspace/models/
  RUN install-video-nodes.sh

  Runtime Model Management (Improved)

  Replace Python-based asset downloader with TypeScript service:

  interface ModelManagerService {
    // Intelligent downloading with pool awareness
    downloadModel(modelUrl: string, priority: Priority): Promise<ModelInfo>

    // Smart caching based on pool type and predictions
    optimizeStorage(): Promise<StorageOptimization>

    // Predictive management instead of reactive
    preloadPredictedModels(): Promise<PreloadResult[]>

    // Pool-aware eviction policies
    evictModels(requiredSpace: number): Promise<EvictionResult>
  }

  Key Improvements:
  - Predictive Downloads: Download models before they're needed based on
  predictions
  - Pool-Aware Caching: Different eviction policies for different pool types
  - Intelligent Storage: Consider model usage patterns, not just LRU
  - Background Operations: Download and evict during idle periods
  - Atomic Operations: Ensure model consistency during downloads/evictions

  Implementation Roadmap

  Phase 1: Pool Separation & Basic Routing (Months 1-2)

  Goals: Eliminate performance heterogeneity issues, establish foundation
  Deliverables:
  - Deploy Fast Lane, Standard, and Heavy Pool machine types
  - Implement duration-based job routing
  - Create pool-specific container images
  - Establish basic monitoring and metrics

  Success Metrics:
  - 90% of quick jobs complete in <30 seconds
  - Long jobs don't block short jobs
  - Clear performance separation between pools

  Phase 2: Model Intelligence & Predictive Placement (Months 3-4)

  Goals: Eliminate first-user wait times, reduce model thrashing
  Deliverables:
  - Build model usage analytics and prediction system
  - Implement predictive model pre-warming
  - Create model migration and placement optimization
  - Deploy improved TypeScript model manager

  Success Metrics:
  - 80% reduction in model download wait times
  - 50% reduction in redundant model downloads
  - Predictive accuracy >70% for model demand

  Phase 3: Advanced Optimization & Specialization (Months 5-6)

  Goals: Optimize resource utilization, implement advanced features
  Deliverables:
  - Implement specialty pool routing (photography, art, etc.)
  - Deploy machine learning-based demand prediction
  - Create dynamic pool sizing based on demand
  - Implement advanced model management features

  Success Metrics:
  - 95% of jobs route to optimal machines
  - Storage utilization >80% across all pools
  - User wait times <10 seconds for 95% of jobs

  Phase 4: Production Hardening & Scale (Months 7-8)

  Goals: Production readiness, enterprise features
  Deliverables:
  - Enterprise pools with customer-specific models
  - Regional deployment capabilities
  - Advanced monitoring, alerting, and debugging
  - Performance optimization and cost analysis

  Success Metrics:
  - Support for 1000+ concurrent jobs
  - 99.9% uptime and reliability
  - Cost optimization vs. current architecture

  Key Metrics & Monitoring

  Performance Metrics

  - Job Completion Time: P50, P95, P99 by pool and job type
  - Model Download Time: Frequency, duration, success rate
  - Queue Wait Time: Time from job submission to execution start
  - Machine Utilization: CPU, GPU, storage, network by pool

  Business Metrics

  - User Experience: First-time vs. repeat model usage wait times
  - Cost Efficiency: Compute cost per job, storage cost per model
  - Revenue Impact: Job throughput, customer satisfaction scores
  - Resource Optimization: Model cache hit rates, storage utilization

  Operational Metrics

  - Prediction Accuracy: Model demand forecasting success rate
  - System Health: Machine availability, service uptime
  - Model Management: Download success rate, eviction efficiency
  - Scaling Metrics: Pool sizing effectiveness, demand vs. capacity

  Migration Strategy

  Backward Compatibility

  - Maintain existing job submission API
  - Support current job types during transition
  - Gradual migration of model management logic

  Risk Mitigation

  - Canary deployments for new pool types
  - Fallback to uniform machines if routing fails
  - Progressive rollout of predictive features

  Testing Strategy

  - Load testing with realistic job distributions
  - Model demand prediction validation with historical data
  - Performance benchmarking vs. current architecture

  Success Criteria

  This architecture succeeds when:

  ✅ No Shared Storage: Each pool optimized for distributed deployment
  ✅ Model Management: Predictive placement eliminates download delays
  ✅ User Experience: <10 second wait times for 95% of jobs
  ✅ Performance: Job routing eliminates resource contention
  ✅ Scalability: Supports 10x current job volume efficiently
  ✅ Cost Efficiency: Optimal resource utilization across machine types
  ✅ Reliability: 99.9% job completion rate with graceful degradation