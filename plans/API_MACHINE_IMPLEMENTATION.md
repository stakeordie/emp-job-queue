# API Machine Implementation Plan

## Overview
This plan implements a unified machine system with a base machine class, then adds API machine support as a specialized implementation. This provides a foundation for both GPU machines (ComfyUI) and API machines (Replicate, RunPod, OpenAI) within a single application.

## Phase 0: Unified Machine System Foundation

### Problem Statement
Currently there's no machine abstraction - we have ComfyUI-specific code and need to add API machines. Instead of creating standalone implementations, we need a unified system where:
- All machines inherit from a base class
- Single environment/application manages all machine types  
- Resource-based selection works across GPU and API machines
- Clean abstraction allows easy addition of new machine types

### Base Architecture

#### 1. Base Machine Class
```typescript
// src/machines/base-machine.ts
export abstract class BaseMachine {
  protected id: string;
  protected name: string;
  protected type: MachineType;
  protected capabilities: MachineCapabilities;
  protected status: MachineStatus;
  protected config: MachineConfig;
  
  constructor(config: MachineConfig) {
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.capabilities = config.capabilities || {};
    this.status = 'idle';
  }
  
  // Core methods all machines must implement
  abstract async initialize(): Promise<void>;
  abstract async executeJob(job: Job): Promise<JobResult>;
  abstract async getStatus(): Promise<MachineStatus>;
  abstract async shutdown(): Promise<void>;
  
  // Common functionality
  async canExecuteJob(job: Job): Promise<boolean> {
    return this.matchesRequirements(job.requirements);
  }
  
  protected matchesRequirements(requirements: JobRequirements): boolean {
    // Check VRAM, models, API keys, etc.
    if (requirements.minVram && this.capabilities.vram) {
      if (this.capabilities.vram < requirements.minVram) return false;
    }
    
    if (requirements.requiredModels) {
      // Check model availability
    }
    
    if (requirements.requiredApis) {
      // Check API access
    }
    
    return true;
  }
}
```

#### 2. Machine Types & Interfaces
```typescript
// src/machines/types.ts
export enum MachineType {
  GPU_COMFY = 'gpu_comfy',      // Existing ComfyUI
  GPU_A1111 = 'gpu_a1111',     // Future Auto1111
  API_REPLICATE = 'api_replicate',
  API_RUNPOD = 'api_runpod', 
  API_OPENAI = 'api_openai',
  LOCAL = 'local'               // Testing
}

export interface MachineCapabilities {
  vram?: number;
  models?: string[];
  apis?: string[];
  maxConcurrentJobs?: number;
  supportedFormats?: string[];
  costPerMinute?: number;       // For API machines
  estimatedSpeed?: number;      // Jobs per hour
}

export interface JobRequirements {
  minVram?: number;
  requiredModels?: string[];
  requiredApis?: string[];
  outputFormat?: string;
  maxCostPerJob?: number;       // Cost constraint
  priority?: number;
}
```

#### 3. Machine Manager
```typescript
// src/machines/machine-manager.ts
export class MachineManager {
  private machines: Map<string, BaseMachine> = new Map();
  
  async selectMachineForJob(job: Job): Promise<BaseMachine | null> {
    const eligible = [];
    
    for (const machine of this.machines.values()) {
      if (await machine.canExecuteJob(job)) {
        eligible.push(machine);
      }
    }
    
    if (eligible.length === 0) return null;
    
    // Select optimal machine based on:
    // - Current load
    // - Cost (for API machines)
    // - Speed/capabilities
    // - Priority
    return this.selectOptimalMachine(eligible, job);
  }
}
```

#### 4. Database Schema
```prisma
model Machine {
  id           String   @id @default(cuid())
  name         String   @unique
  type         String   // gpu_comfy, api_replicate, etc.
  url          String?
  authToken    String?  // Encrypted
  capabilities Json?    // MachineCapabilities
  priority     Int      @default(0)
  enabled      Boolean  @default(true)
  metadata     Json?    // Machine-specific config
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  jobs         Job[]
  
  @@map("machines")
}

model Job {
  // ... existing fields ...
  machineId    String?  @map("machine_id")
  machine      Machine? @relation(fields: [machineId], references: [id])
  requirements Json?    // JobRequirements
}
```

## Phase 1: GPU Machine Implementation

### Migrate Existing ComfyUI System
```typescript
// src/machines/gpu-comfy-machine.ts
export class GpuComfyMachine extends BaseMachine {
  private redisClient: RedisServerClient;
  
  async initialize(): Promise<void> {
    // Use existing singleton RedisServerClient
    this.redisClient = RedisServerClient.getInstance(
      this.config.url,
      this.config.authToken
    );
    
    // Load capabilities from server
    this.capabilities.models = await this.loadAvailableModels();
    this.capabilities.vram = this.config.metadata?.vram || 24;
  }
  
  async executeJob(job: Job): Promise<JobResult> {
    // Use existing ComfyWorkflowRunner logic
    const workflow = this.convertToComfyWorkflow(job);
    
    return await this.redisClient.submitJob({
      job_type: 'comfyui',
      message_id: job.id,
      payload: workflow,
      priority: job.priority || 5,
      workflow_id: job.workflowId
    });
  }
}
```

## Phase 2: API Machine Implementation

### API Machine Base Class
```typescript
// src/machines/api-machine.ts
export class ApiMachine extends BaseMachine {
  protected apiClient: AxiosInstance;
  protected rateLimiter: RateLimiter;
  
  async initialize(): Promise<void> {
    this.setupApiClient();
    this.setupRateLimiting();
    await this.loadCapabilities();
  }
  
  async executeJob(job: Job): Promise<JobResult> {
    // Common API job flow:
    // 1. Convert job to API format
    // 2. Submit to API
    // 3. Poll/webhook for completion
    // 4. Process results
    
    const apiRequest = await this.convertJobToApiRequest(job);
    const response = await this.submitToApi(apiRequest);
    return await this.waitForCompletion(response);
  }
  
  protected abstract convertJobToApiRequest(job: Job): Promise<any>;
  protected abstract submitToApi(request: any): Promise<any>;
  protected abstract waitForCompletion(response: any): Promise<JobResult>;
}
```

### Specific API Implementations

#### 1. Replicate Machine
```typescript
// src/machines/api-replicate-machine.ts
export class ReplicateMachine extends ApiMachine {
  protected async convertJobToApiRequest(job: Job): Promise<any> {
    return {
      version: this.getModelVersion(job.modelName),
      input: {
        prompt: job.parameters.prompt,
        width: job.parameters.width || 1024,
        height: job.parameters.height || 1024,
        num_inference_steps: job.parameters.steps || 20,
        guidance_scale: job.parameters.cfg || 7.5
      }
    };
  }
  
  protected async submitToApi(request: any): Promise<any> {
    const response = await this.apiClient.post('/predictions', request);
    return response.data;
  }
  
  protected async waitForCompletion(prediction: any): Promise<JobResult> {
    // Poll until completion
    while (prediction.status === 'starting' || prediction.status === 'processing') {
      await this.delay(1000);
      const response = await this.apiClient.get(`/predictions/${prediction.id}`);
      prediction = response.data;
    }
    
    if (prediction.status === 'succeeded') {
      return {
        success: true,
        outputs: prediction.output,
        metadata: {
          cost: this.calculateCost(prediction),
          duration: prediction.metrics?.predict_time
        }
      };
    } else {
      throw new Error(`Prediction failed: ${prediction.error}`);
    }
  }
  
  private calculateCost(prediction: any): number {
    // Calculate based on Replicate pricing
    const duration = prediction.metrics?.predict_time || 0;
    const costPerSecond = this.capabilities.costPerMinute! / 60;
    return duration * costPerSecond;
  }
}
```

#### 2. RunPod Machine
```typescript
// src/machines/api-runpod-machine.ts
export class RunPodMachine extends ApiMachine {
  protected async convertJobToApiRequest(job: Job): Promise<any> {
    return {
      input: {
        workflow: job.workflowData,
        models: job.requiredModels
      }
    };
  }
  
  protected async submitToApi(request: any): Promise<any> {
    const response = await this.apiClient.post('/run', request);
    return response.data;
  }
  
  protected async waitForCompletion(runpodJob: any): Promise<JobResult> {
    // RunPod uses webhooks or polling
    return await this.pollRunPodJob(runpodJob.id);
  }
}
```

#### 3. OpenAI Machine
```typescript
// src/machines/api-openai-machine.ts
export class OpenAIMachine extends ApiMachine {
  protected async convertJobToApiRequest(job: Job): Promise<any> {
    if (job.type === 'text-generation') {
      return {
        model: job.modelName || 'gpt-4',
        messages: job.parameters.messages,
        max_tokens: job.parameters.maxTokens || 150
      };
    } else if (job.type === 'image-generation') {
      return {
        model: 'dall-e-3',
        prompt: job.parameters.prompt,
        size: `${job.parameters.width}x${job.parameters.height}`,
        quality: job.parameters.quality || 'standard'
      };
    }
  }
  
  protected async submitToApi(request: any): Promise<any> {
    const endpoint = request.model.startsWith('dall-e') ? '/images/generations' : '/chat/completions';
    const response = await this.apiClient.post(endpoint, request);
    return response.data;
  }
  
  protected async waitForCompletion(response: any): Promise<JobResult> {
    // OpenAI is synchronous, so response is already complete
    return {
      success: true,
      outputs: response.choices || response.data,
      metadata: {
        cost: this.calculateTokenCost(response.usage),
        model: response.model
      }
    };
  }
}
```

## Phase 3: Integration & Job Routing

### Update Workflow System
```typescript
// src/routes/workflows/index.ts - Updated createWorkflow
export const createWorkflow = async (req: Request, res: Response) => {
  try {
    const workflowData = req.body;
    
    // Create workflow in database
    const workflow = await prisma.workflow.create({
      data: {
        ...workflowData,
        // Remove server_id - now handled by machine manager
      }
    });
    
    // When job is submitted, machine manager will select appropriate machine
    res.json({ data: workflow, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: error.message });
  }
};
```

### Job Submission with Machine Selection
```typescript
// src/routes/generator/v2.ts - Updated to use machine manager
const machineManager = new MachineManager(prisma);

export const generateV2 = async (req: Request, res: Response) => {
  try {
    const job = await createJobFromRequest(req);
    
    // Select optimal machine
    const machine = await machineManager.selectMachineForJob(job);
    
    if (!machine) {
      return res.status(503).json({
        data: null,
        error: "No available machines can handle this job"
      });
    }
    
    // Execute on selected machine
    const result = await machine.executeJob(job);
    
    res.json({ data: result, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: error.message });
  }
};
```

## Phase 4: Configuration & Environment

### Unified Environment Setup
```env
# Machine Manager
MACHINE_MANAGER_ENABLED=true
MACHINE_SELECTION_STRATEGY=optimal

# GPU Machines (existing)
GPU_COMFY_MACHINES=gpu1,gpu2
GPU1_URL=ws://gpu1.internal:8188
GPU1_VRAM=24
GPU1_PRIORITY=10

# API Machines (new)
API_MACHINES=replicate,runpod,openai

# Replicate
REPLICATE_URL=https://api.replicate.com
REPLICATE_AUTH_TOKEN=r8_xxx
REPLICATE_COST_PER_MINUTE=0.23
REPLICATE_PRIORITY=5

# RunPod  
RUNPOD_URL=https://api.runpod.ai
RUNPOD_AUTH_TOKEN=xxx
RUNPOD_COST_PER_MINUTE=0.15
RUNPOD_PRIORITY=8

# OpenAI
OPENAI_URL=https://api.openai.com
OPENAI_AUTH_TOKEN=sk-xxx
OPENAI_COST_PER_TOKEN=0.00002
OPENAI_PRIORITY=3
```

### Machine Configuration API
```typescript
// src/routes/machines/index.ts
export const getMachines = async (req: Request, res: Response) => {
  const machines = await prisma.machine.findMany({
    where: { enabled: true },
    include: { _count: { select: { jobs: true } } }
  });
  
  res.json({ data: machines, error: null });
};

export const createMachine = async (req: Request, res: Response) => {
  const machine = await prisma.machine.create({
    data: req.body
  });
  
  // Initialize the machine
  await machineManager.addMachine(machine);
  
  res.json({ data: machine, error: null });
};
```

## Implementation Timeline

### Week 1: Foundation
- [ ] Create base machine class and interfaces
- [ ] Implement machine manager
- [ ] Add database schema
- [ ] Create configuration system

### Week 2: GPU Migration  
- [ ] Implement GpuComfyMachine
- [ ] Migrate existing ComfyUI code
- [ ] Test GPU machine selection
- [ ] Ensure backward compatibility

### Week 3: API Machines
- [ ] Implement ApiMachine base class
- [ ] Add Replicate integration
- [ ] Add RunPod integration
- [ ] Add OpenAI integration

### Week 4: Integration
- [ ] Update job submission to use machine manager
- [ ] Add cost tracking for API machines
- [ ] Implement rate limiting
- [ ] Add failover logic

### Week 5: Testing & Polish
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Error handling
- [ ] Documentation

## Benefits

1. **Single Application**: All machine types in one codebase
2. **Intelligent Selection**: Optimal machine selection based on job requirements, cost, and load
3. **Cost Optimization**: API machines selected based on cost constraints
4. **Scalability**: Easy to add new machine types
5. **Reliability**: Automatic failover between machines
6. **Resource Efficiency**: Better utilization of both GPU and API resources

## Success Criteria

- [ ] All existing ComfyUI workflows continue working
- [ ] At least 3 API providers integrated (Replicate, RunPod, OpenAI)
- [ ] Machine selection reduces average job cost by 20%
- [ ] System handles failover automatically
- [ ] Single environment configuration for all machines

This plan provides the unified foundation you requested, with API machines as specialized implementations rather than standalone systems.