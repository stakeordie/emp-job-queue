# Collection Generation API - Implementation Plan

## Overview

This document outlines the complete implementation plan for the Collection Generation API, which will provide a unified endpoint to create collections and initiate generation in a single API call.

## API Specification

### Endpoint: `POST /api/collections/generate`

#### Authentication
- **Required**: JWT middleware authentication
- **Authorization**: User must have sufficient credits for generation
- **Rate Limiting**: Consider implementing rate limits for resource-intensive operations

#### Request Schema
```typescript
interface CollectionGenerationRequest {
  // Core Required Fields
  title: string;                          // Collection title
  workflow_id: string;                    // UUID of workflow to execute
  
  // Optional Generation Parameters
  description?: string;                   // Collection description
  variables?: Record<string, any>;        // Variable overrides for workflow
  generations?: number;                   // Number of outputs to generate (default: 1, max: 10)
  project_id?: string;                   // Target project (creates default if missing)
  
  // Optional Collection Metadata
  metadata?: {
    editions?: number;                    // NFT edition count
    price?: number;                      // Price in ETH/USD
    blockchain?: "ETHEREUM" | "BASE" | "TEZOS";
    publish_date?: string;               // ISO date string
    cover_image_url?: string;           // Collection cover image
    batch_mint_enabled?: boolean;       // Enable batch minting
    batch_max_tokens?: number;          // Max tokens per batch
    encryption_enabled?: boolean;       // Enable content encryption
  };
  
  // Advanced Options
  options?: {
    workflow_priority?: number;         // Job priority (1-100, default: 50)
    auto_publish?: boolean;            // Auto-publish collection when complete
    generate_preview?: boolean;        // Generate collection preview (default: true)
    save_intermediate_outputs?: boolean; // Save outputs from intermediate nodes
  };
}
```

#### Response Schema
```typescript
interface CollectionGenerationResponse {
  data: {
    collection_id: string;              // Created collection UUID
    job_id: string;                    // Generation job UUID
    project_id: string;               // Parent project UUID
    status: "pending" | "processing" | "completed" | "failed";
    estimated_duration?: number;      // Estimated completion time in seconds
    cost_breakdown: {
      total_credits: number;
      per_generation: number;
      workflow_base_cost: number;
    };
    urls: {
      collection_url: string;         // API endpoint for collection
      job_status_url: string;        // Job status endpoint
      job_events_url: string;        // SSE events endpoint
    };
  };
  error: null | string;
}
```

#### Error Responses
```typescript
// 400 Bad Request
{
  data: null,
  error: "Invalid request body",
  details: [
    { field: "workflow_id", message: "Required field missing" },
    { field: "generations", message: "Must be between 1 and 10" }
  ]
}

// 404 Not Found
{
  data: null,
  error: "Workflow not found or not executable"
}

// 402 Payment Required
{
  data: null,
  error: "Insufficient credits",
  details: {
    required: 150,
    available: 75,
    cost_breakdown: { /* ... */ }
  }
}

// 429 Too Many Requests
{
  data: null,
  error: "Rate limit exceeded. Try again in 60 seconds."
}
```

## Implementation Architecture

### File Structure
```
src/
├── routes/
│   └── collections/
│       ├── generate.ts              # New: Main endpoint handler
│       └── generate-utils.ts        # New: Utility functions
├── lib/
│   └── collections.ts               # Extend: Add generateCollection method
├── services/
│   └── collection-generator.ts      # New: Core generation service
└── index.ts                        # Update: Add new route
```

## Implementation Phases

### Phase 1: Core Infrastructure

#### 1.1 Request Validation
```typescript
// File: src/routes/collections/generate.ts
import { z } from "zod";

const generateCollectionSchema = z.object({
  title: z.string().min(1).max(100),
  workflow_id: z.string().uuid(),
  description: z.string().max(500).optional(),
  variables: z.record(z.string(), z.any()).optional(),
  generations: z.number().int().min(1).max(10).default(1),
  project_id: z.string().uuid().optional(),
  metadata: z.object({
    editions: z.number().int().min(1).max(10000).optional(),
    price: z.number().min(0).optional(),
    blockchain: z.enum(["ETHEREUM", "BASE", "TEZOS"]).optional(),
    publish_date: z.string().datetime().optional(),
    cover_image_url: z.string().url().optional(),
    batch_mint_enabled: z.boolean().optional(),
    batch_max_tokens: z.number().int().min(1).max(1000).optional(),
    encryption_enabled: z.boolean().optional(),
  }).optional(),
  options: z.object({
    workflow_priority: z.number().int().min(1).max(100).default(50),
    auto_publish: z.boolean().default(false),
    generate_preview: z.boolean().default(true),
    save_intermediate_outputs: z.boolean().default(false),
  }).optional(),
});
```

#### 1.2 Workflow Validation Service
```typescript
// File: src/services/workflow-validator.ts
export class WorkflowValidator {
  async validateWorkflow(workflowId: string): Promise<{
    workflow: Workflow;
    isExecutable: boolean;
    requiredModels: Model[];
    estimatedCost: number;
  }>;
  
  async validateUserCredits(userId: string, estimatedCost: number): Promise<boolean>;
  async validateWorkflowModels(workflowId: string): Promise<boolean>;
}
```

### Phase 2: Collection Generation Service

#### 2.1 Core Service Implementation
```typescript
// File: src/services/collection-generator.ts
export class CollectionGeneratorService {
  constructor(
    private prisma: PrismaClient,
    private storageClient: StorageClient,
    private creditsService: CreditsService,
    private generatorV2: GeneratorV2
  ) {}

  async generateCollection(request: CollectionGenerationRequest, userId: string): Promise<{
    collection: Collection;
    job: Job;
    estimatedDuration: number;
  }> {
    // 1. Validate workflow and user permissions
    // 2. Create or find target project
    // 3. Transform workflow to GenerationInput
    // 4. Create collection with workflow-based data
    // 5. Start generation job
    // 6. Return collection and job details
  }

  private async workflowToGenerationInput(
    workflow: Workflow,
    variables: Record<string, any> = {},
    generations: number = 1
  ): Promise<GenerationInput>;

  private async createCollectionFromWorkflow(
    workflow: Workflow,
    request: CollectionGenerationRequest,
    projectId: string,
    generationInput: GenerationInput
  ): Promise<Collection>;
}
```

#### 2.2 Workflow to GenerationInput Transformation
```typescript
// Core transformation logic
private async workflowToGenerationInput(
  workflow: Workflow,
  variables: Record<string, any> = {},
  generations: number = 1
): Promise<GenerationInput> {
  const workflowData = workflow.data as any;
  
  // Create single step for the workflow
  const workflowStep: NodeStepInput = {
    id: 1, // Will be replaced with actual component ID
    nodeName: workflow.name,
    nodePayload: this.mapVariablesToPayload(workflowData.form?.fields || [], variables),
    alias: workflow.label || workflow.name,
  };

  // Generate random hashes for the requested number of generations
  const hashes = Array.from({ length: generations }, () => generateHash(51));

  return {
    version: "v2",
    steps: [workflowStep],
    generations: {
      hashes,
      generations,
      use_custom_hashes: false,
    },
    variables: this.extractVariables(workflowData.form?.fields || [], variables),
  };
}
```

### Phase 3: Database Integration

#### 3.1 Enhanced Collections Service
```typescript
// File: src/lib/collections.ts (extend existing)
export class CollectionsService {
  // ... existing methods ...

  async generateCollection(
    request: CollectionGenerationRequest,
    userId: string
  ): Promise<{
    collection: Collection;
    job: Job;
    estimatedDuration: number;
  }> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Validate workflow
      const workflow = await this.validateWorkflow(request.workflow_id, tx);
      
      // 2. Get or create project
      const project = await this.getOrCreateProject(request.project_id, userId, tx);
      
      // 3. Transform workflow to GenerationInput
      const generationInput = await this.workflowToGenerationInput(
        workflow,
        request.variables,
        request.generations
      );
      
      // 4. Create collection with generated component IDs
      const collectionData = await generateNewIds(tx, tempCollectionId, generationInput);
      const collection = await tx.collection.create({
        data: {
          title: request.title,
          description: request.description,
          project_id: project.id,
          data: collectionData,
          ...request.metadata,
        },
      });
      
      // 5. Create and start generation job
      const job = await this.createGenerationJob(collection, request, userId, tx);
      
      return { collection, job, estimatedDuration: this.estimateDuration(workflow) };
    });
  }
}
```

#### 3.2 Job Management Integration
```typescript
private async createGenerationJob(
  collection: Collection,
  request: CollectionGenerationRequest,
  userId: string,
  tx: PrismaTransactionClient
): Promise<Job> {
  const jobId = uuid();
  
  const job = await tx.job.create({
    data: {
      id: jobId,
      name: `Generate Collection: ${collection.title}`,
      description: `Auto-generation for collection ${collection.id}`,
      status: "pending",
      data: {
        collection_id: collection.id,
        variables: request.variables,
        options: request.options,
      },
      user_id: userId,
      job_type: "collection_auto_generation",
      priority: request.options?.workflow_priority || 50,
    },
  });

  // Start generation asynchronously
  setImmediate(() => {
    this.startGeneration(collection, job, request);
  });

  return job;
}
```

### Phase 4: Route Implementation

#### 4.1 Main Route Handler
```typescript
// File: src/routes/collections/generate.ts
export function generateCollection(
  storageClient: StorageClient,
  prisma: PrismaClient,
  creditsService: CreditsService,
  openAiApi: OpenAIApi,
  kms: AWS.KMS
) {
  return async (req: Request, res: Response) => {
    try {
      // 1. Validate request
      const validationResult = generateCollectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request body",
          details: validationResult.error.issues,
        });
      }

      const userId = req.headers["user_id"] as string;
      const request = validationResult.data;

      // 2. Initialize services
      const collectionsService = new CollectionsService(prisma);
      const generator = new CollectionGeneratorService(
        prisma,
        storageClient,
        creditsService,
        new GeneratorV2(storageClient, prisma, creditsService, openAiApi, kms)
      );

      // 3. Generate collection
      const result = await generator.generateCollection(request, userId);

      // 4. Return response
      res.status(201).json({
        data: {
          collection_id: result.collection.id,
          job_id: result.job.id,
          project_id: result.collection.project_id,
          status: result.job.status,
          estimated_duration: result.estimatedDuration,
          cost_breakdown: await this.calculateCostBreakdown(request),
          urls: {
            collection_url: `/collections/${result.collection.id}/public`,
            job_status_url: `/jobs/${result.job.id}`,
            job_events_url: `/jobs/${result.job.id}/events`,
          },
        },
        error: null,
      });

    } catch (error) {
      this.handleError(error, res);
    }
  };
}
```

#### 4.2 Route Registration
```typescript
// File: src/index.ts (add to existing routes)
import { generateCollection } from "./routes/collections/generate";

// Add after existing collection routes
app.post(
  "/api/collections/generate",
  jwtAuthMiddleware,
  generateCollection(storageClient, prisma, creditsService, openAiApi, kms)
);
```

### Phase 5: Error Handling & Validation

#### 5.1 Comprehensive Error Handling
```typescript
// File: src/routes/collections/generate-utils.ts
export class CollectionGenerationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = "CollectionGenerationError";
  }
}

export function handleGenerationError(error: any, res: Response) {
  if (error instanceof CollectionGenerationError) {
    return res.status(error.statusCode).json({
      data: null,
      error: error.message,
      code: error.code,
      details: error.details,
    });
  }

  // Handle specific Prisma errors
  if (error.code === "P2025") {
    return res.status(404).json({
      data: null,
      error: "Resource not found",
    });
  }

  // Generic error
  logger.error("Collection generation error:", error);
  return res.status(500).json({
    data: null,
    error: "Internal server error",
  });
}
```

#### 5.2 Pre-flight Validation
```typescript
export async function validateGenerationRequest(
  request: CollectionGenerationRequest,
  userId: string,
  prisma: PrismaClient
): Promise<{
  workflow: Workflow;
  project: Project;
  costBreakdown: CostBreakdown;
  estimatedDuration: number;
}> {
  // Workflow validation
  const workflow = await prisma.workflow.findUnique({
    where: { id: request.workflow_id },
    include: { workflow_models: { include: { model: true } } },
  });

  if (!workflow) {
    throw new CollectionGenerationError(
      "Workflow not found",
      "WORKFLOW_NOT_FOUND",
      404
    );
  }

  if (!["comfy_workflow", "fetch_api", "direct_job"].includes(workflow.type)) {
    throw new CollectionGenerationError(
      "Workflow type not supported for generation",
      "WORKFLOW_NOT_EXECUTABLE",
      400
    );
  }

  // Model availability validation
  await validateRequiredModels(workflow.workflow_models);

  // Credits validation
  const costBreakdown = await calculateCostBreakdown(workflow, request.generations);
  const hasCredits = await validateUserCredits(userId, costBreakdown.total_credits);
  
  if (!hasCredits) {
    throw new CollectionGenerationError(
      "Insufficient credits",
      "INSUFFICIENT_CREDITS",
      402,
      costBreakdown
    );
  }

  return {
    workflow,
    project: await getOrCreateProject(request.project_id, userId, prisma),
    costBreakdown,
    estimatedDuration: estimateGenerationDuration(workflow, request.generations),
  };
}
```

## Testing Strategy

### Unit Tests
```typescript
// File: __tests__/routes/collections/generate.test.ts
describe("Collection Generation API", () => {
  describe("POST /api/collections/generate", () => {
    it("should create collection and start generation", async () => {
      // Test implementation
    });

    it("should validate workflow exists", async () => {
      // Test workflow validation
    });

    it("should check user credits", async () => {
      // Test credits validation
    });

    it("should handle invalid requests", async () => {
      // Test error cases
    });
  });

  describe("CollectionGeneratorService", () => {
    it("should transform workflow to GenerationInput", async () => {
      // Test workflow transformation
    });

    it("should create collection with proper component IDs", async () => {
      // Test collection creation
    });
  });
});
```

### Integration Tests
```typescript
// File: __tests__/integration/collection-generation.test.ts
describe("Collection Generation Integration", () => {
  it("should complete full generation workflow", async () => {
    // End-to-end test with real workflow
  });

  it("should handle generation failures gracefully", async () => {
    // Test error recovery
  });

  it("should stream progress updates via SSE", async () => {
    // Test real-time updates
  });
});
```

## Performance Considerations

### 1. Database Optimization
- **Connection Pooling**: Ensure proper database connection management
- **Transaction Optimization**: Minimize transaction scope and duration
- **Index Usage**: Ensure proper indexing on workflow and user lookups

### 2. Caching Strategy
- **Workflow Metadata**: Cache workflow configurations for frequently used workflows
- **User Credits**: Cache user credit balances with short TTL
- **Model Availability**: Cache model status to avoid repeated validation

### 3. Async Processing
- **Job Queue**: Use existing job system for generation processing
- **Background Tasks**: Move heavy operations to background workers
- **Rate Limiting**: Implement user-based rate limiting for resource protection

## Security Considerations

### 1. Input Validation
- **Strict Schema Validation**: Use Zod for comprehensive input validation
- **Sanitization**: Sanitize all user inputs, especially variables
- **Size Limits**: Enforce reasonable limits on generation counts and variable data

### 2. Authorization
- **Workflow Permissions**: Ensure users can only access permitted workflows
- **Project Ownership**: Validate user ownership of target projects
- **Credits Verification**: Prevent credit bypass attacks

### 3. Resource Protection
- **Generation Limits**: Enforce per-user generation limits
- **Timeout Protection**: Set reasonable timeouts for generation processes
- **Storage Quotas**: Monitor and enforce storage usage limits

## Deployment Plan

### Phase 1: Development (Week 1-2)
- Implement core service and route handler
- Add comprehensive validation and error handling
- Create unit tests for all components

### Phase 2: Testing (Week 3)
- Integration testing with existing systems
- Performance testing with various workflow types
- Security testing and validation

### Phase 3: Staging Deployment (Week 4)
- Deploy to staging environment
- End-to-end testing with real workflows
- Documentation and API specification finalization

### Phase 4: Production Deployment (Week 5)
- Production deployment with feature flags
- Monitoring and alerting setup
- User feedback collection and iteration

## Monitoring & Observability

### Key Metrics
- **Generation Success Rate**: Percentage of successful generations
- **Average Generation Time**: Time from request to completion
- **Error Rates**: Breakdown of error types and frequencies
- **Resource Usage**: CPU, memory, and storage utilization
- **User Adoption**: API usage patterns and growth

### Alerting
- **High Error Rates**: Alert on error rate spikes
- **Long Generation Times**: Alert on performance degradation
- **Credit Issues**: Alert on widespread credit problems
- **Resource Exhaustion**: Alert on resource limit approaches

## Future Enhancements

### Short-term (Next 3 months)
- **Batch Generation**: Support multiple collections in single request
- **Template System**: Pre-defined collection templates
- **Scheduled Generation**: Delayed or recurring generations

### Medium-term (Next 6 months)
- **Workflow Marketplace**: Public workflow sharing
- **Advanced Variables**: Complex variable types and validation
- **Generation Analytics**: Detailed usage and performance analytics

### Long-term (Next year)
- **AI-Powered Optimization**: Automatic workflow optimization
- **Multi-step Workflows**: Complex multi-workflow pipelines
- **Collaborative Collections**: Multi-user collection creation

This implementation plan provides a comprehensive roadmap for building a robust, scalable Collection Generation API that integrates seamlessly with the existing EmProps platform architecture.