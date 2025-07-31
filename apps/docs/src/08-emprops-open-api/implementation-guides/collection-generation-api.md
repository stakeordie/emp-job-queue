# Collection Creation API Implementation Guide

This guide provides a complete implementation plan for the Collection Creation API, which allows third parties to create collections programmatically without using the EmProps frontend interface.

## API Specification

### Endpoint: `POST /api/collections/create`

#### Authentication
- **Required**: JWT middleware authentication or API key
- **Authorization**: User must have valid account and permissions
- **Rate Limiting**: Standard rate limits apply (100 requests/hour per API key)

#### Request Schema
```typescript
interface CollectionCreationRequest {
  // Core Required Fields
  title: string;                          // Collection title
  instruction_set: GenerationInput;       // Complete workflow definition
  
  // Optional Collection Metadata
  description?: string;                   // Collection description
  project_id?: string;                   // Target project (creates default if missing)
  
  // NFT Metadata
  editions?: number;                     // NFT edition count (default: 1)
  price?: number;                       // Price in ETH/USD
  blockchain?: "ETHEREUM" | "BASE" | "TEZOS";
  publish_date?: string;                // ISO date string for scheduled publishing
  cover_image_url?: string;             // Collection cover image URL
  
  // Minting Configuration
  batch_mint_enabled?: boolean;         // Enable batch minting (default: false)
  batch_max_tokens?: number;           // Max tokens per batch (default: 100)
  encryption_enabled?: boolean;        // Enable content encryption (default: false)
  
  // Collection Options
  auto_publish?: boolean;              // Auto-publish when ready (default: false)
  generate_preview?: boolean;          // Generate collection preview (default: true)
}

// Core workflow definition structure
interface GenerationInput {
  version: "v2";
  steps: WorkflowStep[];
  generations: {
    hashes: string[];                   // Pre-generated hashes for reproducibility
    generations: number;                // Number of variations
    use_custom_hashes: boolean;
  };
  variables: Variable[];                // Dynamic variables for the workflow
}
```

#### Response Schema
```typescript
interface CollectionCreationResponse {
  data: {
    collection_id: string;              // Created collection UUID
    project_id: string;                // Parent project UUID
    status: "draft" | "published";     // Collection status
    title: string;                     // Collection title
    description?: string;              // Collection description
    created_at: string;                // ISO timestamp
    updated_at: string;                // ISO timestamp
    
    // Collection metadata
    editions: number;                  // NFT edition count
    price?: number;                   // Price in ETH/USD
    blockchain?: string;              // Target blockchain
    
    // URLs for further interaction
    urls: {
      collection_url: string;         // Public collection URL
      api_url: string;               // API endpoint for this collection
      preview_url?: string;          // Preview URL if enabled
    };
    
    // Component information
    components: {
      total: number;                 // Total workflow steps/components
      component_ids: number[];       // Database IDs of created components
    };
  };
  error: null | string;
}
```

#### Error Responses
```typescript
// 400 Bad Request - Invalid collection data
{
  data: null,
  error: "Invalid collection data",
  details: [
    { field: "title", message: "Title is required and must be 1-100 characters" },
    { field: "instruction_set.steps", message: "At least one workflow step is required" }
  ]
}

// 400 Bad Request - Invalid instruction set
{
  data: null,
  error: "Invalid instruction set",
  details: {
    step_id: 1,
    node_name: "stable-diffusion-xl",
    issue: "Referenced workflow node does not exist or is not accessible"
  }
}

// 401 Unauthorized
{
  data: null,
  error: "Invalid API key or JWT token"
}

// 403 Forbidden
{
  data: null,
  error: "User does not have permission to create collections"
}
```

#### Example Request
```http
POST /api/collections/create
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "AI Art Collection",
  "description": "A curated collection of AI-generated artwork",
  "instruction_set": {
    "version": "v2",
    "steps": [
      {
        "id": 1,
        "nodeName": "stable-diffusion-xl",
        "nodePayload": {
          "prompt": "{{style}} artwork, high quality, detailed",
          "negative_prompt": "blurry, low quality, distorted",
          "steps": 30,
          "cfg_scale": 7.5,
          "width": 1024,
          "height": 1024,
          "seed": -1
        },
        "alias": "Main Generation"
      }
    ],
    "generations": {
      "hashes": ["abc123def456", "ghi789jkl012"],
      "generations": 2,
      "use_custom_hashes": true
    },
    "variables": [
      {
        "name": "style",
        "type": "pick",
        "value_type": "strings",
        "value": {
          "display_names": ["Abstract", "Realistic", "Surreal"],
          "values": ["abstract", "photorealistic", "surreal"],
          "weights": [1, 1, 1]
        },
        "lock_value": false,
        "test_value": "abstract"
      }
    ]
  },
  "editions": 100,
  "price": 0.05,
  "blockchain": "ETHEREUM",
  "batch_mint_enabled": true,
  "auto_publish": false,
  "generate_preview": true
}
```

#### Example Response
```json
{
  "data": {
    "collection_id": "550e8400-e29b-41d4-a716-446655440000",
    "project_id": "123e4567-e89b-12d3-a456-426614174000", 
    "status": "draft",
    "title": "AI Art Collection",
    "description": "A curated collection of AI-generated artwork",
    "created_at": "2024-07-31T14:30:00Z",
    "updated_at": "2024-07-31T14:30:00Z",
    "editions": 100,
    "price": 0.05,
    "blockchain": "ETHEREUM",
    "urls": {
      "collection_url": "https://app.emprops.com/collections/550e8400-e29b-41d4-a716-446655440000",
      "api_url": "https://api.emprops.com/collections/550e8400-e29b-41d4-a716-446655440000/public",
      "preview_url": "https://api.emprops.com/collections/550e8400-e29b-41d4-a716-446655440000/preview"
    },
    "components": {
      "total": 1,
      "component_ids": [12345]
    }
  },
  "error": null
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

### Phase 1: Request Validation

Create comprehensive validation schema:

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

### Phase 2: Core Service Implementation

Create the main generation service:

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
    const workflow = await this.validateWorkflow(request.workflow_id);
    await this.validateUserCredits(userId, workflow);
    
    // 2. Create or find target project
    const project = await this.getOrCreateProject(request.project_id, userId);
    
    // 3. Transform workflow to GenerationInput
    const generationInput = await this.workflowToGenerationInput(
      workflow,
      request.variables,
      request.generations
    );
    
    // 4. Create collection with workflow-based data
    const collection = await this.createCollectionFromWorkflow(
      workflow,
      request,
      project.id,
      generationInput
    );
    
    // 5. Start generation job
    const job = await this.startGenerationJob(collection, request, userId);
    
    return {
      collection,
      job,
      estimatedDuration: this.estimateGenerationDuration(workflow, request.generations)
    };
  }

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
}
```

### Phase 3: Enhanced Collections Service

Extend the existing CollectionsService:

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
      const tempCollectionId = uuid(); // Temporary ID for generateNewIds
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
      
      return { 
        collection, 
        job, 
        estimatedDuration: this.estimateDuration(workflow) 
      };
    });
  }

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
}
```

### Phase 4: Route Implementation

Create the main route handler:

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

### Phase 5: Error Handling & Validation

Implement comprehensive error handling:

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

## Route Registration

Add the new route to the main Express app:

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

## Testing Strategy

### Unit Tests
```typescript
// File: __tests__/routes/collections/generate.test.ts
describe("Collection Generation API", () => {
  describe("POST /api/collections/generate", () => {
    it("should create collection and start generation", async () => {
      const response = await request(app)
        .post("/api/collections/generate")
        .send({
          title: "Test Collection",
          workflow_id: "valid-uuid",
          variables: { style: "cyberpunk" }
        })
        .expect(201);

      expect(response.body.data.collection_id).toBeDefined();
      expect(response.body.data.job_id).toBeDefined();
    });

    it("should validate workflow exists", async () => {
      await request(app)
        .post("/api/collections/generate")
        .send({
          title: "Test Collection", 
          workflow_id: "invalid-uuid"
        })
        .expect(404);
    });

    it("should check user credits", async () => {
      // Mock insufficient credits
      mockCreditsService.hasEnoughCredits.mockResolvedValue(false);
      
      await request(app)
        .post("/api/collections/generate")
        .send({
          title: "Test Collection",
          workflow_id: "valid-uuid"
        })
        .expect(402);
    });
  });
});
```

### Integration Tests
```typescript
// File: __tests__/integration/collection-generation.test.ts
describe("Collection Generation Integration", () => {
  it("should complete full generation workflow", async () => {
    const response = await request(app)
      .post("/api/collections/generate")
      .send({
        title: "Integration Test Collection",
        workflow_id: testWorkflowId,
        generations: 1
      });

    const { collection_id, job_id } = response.body.data;

    // Wait for job completion
    await waitForJobCompletion(job_id);

    // Verify collection was created with generated assets
    const collection = await prisma.collection.findUnique({
      where: { id: collection_id },
      include: { collection_node: { include: { component_flat_files: true } } }
    });

    expect(collection).toBeDefined();
    expect(collection.collection_node[0].component_flat_files).toHaveLength(1);
  });
});
```

## Deployment Checklist

### Pre-deployment
- [ ] All unit tests passing
- [ ] Integration tests completed
- [ ] Performance testing with various workflow types
- [ ] Security review completed
- [ ] Documentation updated

### Deployment Steps
1. **Stage Environment**: Deploy to staging for final testing
2. **Feature Flag**: Deploy with feature flag for gradual rollout
3. **Monitoring**: Set up alerts for error rates and performance
4. **Production**: Enable for all users after validation

### Post-deployment
- [ ] Monitor error rates and response times
- [ ] Collect user feedback on API usability
- [ ] Performance optimization based on real usage
- [ ] Plan next iteration features

## Monitoring & Metrics

### Key Performance Indicators
- **Success Rate**: Percentage of successful collection generations
- **Response Time**: API response time distribution
- **Generation Duration**: Time from request to completion
- **Error Distribution**: Breakdown of error types and causes
- **Resource Usage**: CPU, memory, and storage utilization

### Alerting Thresholds
- Error rate > 5% over 5 minutes
- Average response time > 2 seconds
- Generation failure rate > 10%
- Credit validation errors > 1% 

This implementation provides a robust, scalable Collection Generation API that integrates seamlessly with the existing EmProps platform while maintaining high performance and reliability standards.