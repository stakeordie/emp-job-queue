# Collection Creation API Implementation Guide  

This guide documents the **Template-Based Collection Creation API**, which allows third parties to create collections by forking and editing existing templates rather than building complex workflow definitions from scratch.

## Overview

Instead of requiring third parties to construct complex `instruction_set` objects (which would be as complex as building the EmProps UI), this API uses a simple **fork-and-edit** workflow:

1. **Browse Templates** - Discover available collection templates via feed
2. **Fork Template** - Create your own editable copy of an existing collection
3. **Edit Collection** - Modify prompts, resolution, variables, title, output count, etc.
4. **Save Changes** - Persist your customized collection  
5. **(Optional) Generate** - Execute your customized collection when ready

This approach allows full customization without the complexity of building workflows from scratch.

## API Specification

### 1. Browse Templates: `GET /feed`

#### Authentication
- **Optional**: No authentication required for browsing public templates
- **Rate Limiting**: Standard rate limits apply (1000 requests/hour per IP)

#### Query Parameters
```typescript
interface FeedQuery {
  page?: number;        // Page number (default: 1)
  size?: number;        // Results per page (default: 10, 0 for all)
  afterDate?: string;   // ISO date string to filter recent templates
}
```

#### Response Schema
```typescript
interface TemplateResponse {
  data: {
    collections: Array<{
      id: string;                    // Collection ID for forking
      title: string;                 // Template name
      description?: string;          // Template description
      preview_enabled: boolean;      // Always true for discoverable templates
      is_remixable: boolean;        // Can be forked by others
      sample_images: Array<{        // Example outputs
        url: string;
        alt_text: string;
      }>;
      project: {
        name: string;               // Creator's project name
        user_id: string;           // Creator ID
      };
      variables: Array<{            // Customizable parameters
        name: string;               // Variable name (e.g., "style", "prompt")
        type: "pick" | "text" | "number";
        description?: string;       // What this variable controls
        options?: string[];         // Available choices for "pick" type
      }>;
      created_at: string;           // ISO timestamp
      updated_at: string;           // ISO timestamp
    }>;
    total_pages: number;
    current_page: number;
    total_collections: number;
  };
  error: null | string;
}
```

#### Example Request
```http
GET /feed?page=1&size=5&afterDate=2024-07-01T00:00:00Z
Content-Type: application/json
```

#### Example Response
```json
{
  "data": {
    "collections": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "AI Portrait Generator",
        "description": "Create professional AI portraits with customizable styles",
        "preview_enabled": true,
        "is_remixable": true,
        "sample_images": [
          {
            "url": "https://storage.emprops.com/samples/portrait-1.jpg",
            "alt_text": "Cyberpunk style portrait"
          }
        ],
        "project": {
          "name": "EmProps Templates",
          "user_id": "template-creator-123"
        },
        "variables": [
          {
            "name": "style",
            "type": "pick",
            "description": "Art style for the portrait",
            "options": ["cyberpunk", "realistic", "fantasy", "minimalist"]
          },
          {
            "name": "prompt",
            "type": "text", 
            "description": "Custom description of the subject"
          }
        ],
        "created_at": "2024-07-31T10:00:00Z",
        "updated_at": "2024-07-31T14:30:00Z"
      }
    ],
    "total_pages": 12,
    "current_page": 1,
    "total_collections": 58
  },
  "error": null
}
```

### 2. Fork Template: `POST /collections/:collectionId/remix`

#### Authentication
- **Required**: JWT middleware authentication
- **Authorization**: User must have valid account
- **Rate Limiting**: Standard rate limits apply (100 requests/hour per user)

#### Request Schema
```typescript
interface ForkRequest {
  project_id?: string;    // Target project ID (creates default if missing)
}
```

#### Response Schema
```typescript
interface ForkResponse {
  data: {
    id: string;              // New forked collection ID
    title: string;           // "Fork of [Original Title]"
    project_id: string;      // Parent project ID
    created_at: string;      // ISO timestamp
    updated_at: string;      // ISO timestamp
  };
  error: null | string;
}
```

#### Example Request
```http
POST /collections/550e8400-e29b-41d4-a716-446655440000/remix
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "project_id": "123e4567-e89b-12d3-a456-426614174000"
}
```

#### Example Response
```json
{
  "data": {
    "id": "789e0123-e45b-67c8-a901-234567890abc",
    "title": "Fork of AI Portrait Generator",
    "project_id": "123e4567-e89b-12d3-a456-426614174000",
    "created_at": "2024-07-31T15:30:00Z",
    "updated_at": "2024-07-31T15:30:00Z"
  },
  "error": null
}
```

### 3. Edit Collection: `PUT /collections/:id`

#### Authentication
- **Required**: JWT middleware authentication
- **Authorization**: User must own the collection
- **Rate Limiting**: Standard rate limits apply (100 edits/hour per user)

#### Request Schema
```typescript
interface CollectionEditRequest {
  // Basic Collection Info
  title?: string;                    // Collection name
  description?: string;              // Collection description
  
  // Generation Settings
  data?: {
    version: "v2";
    steps: Array<{
      id: number;
      nodeName: string;              // e.g., "stable-diffusion-xl" 
      nodePayload: {
        prompt?: string;             // Main generation prompt
        negative_prompt?: string;    // What to avoid
        width?: number;              // Image width (512, 1024, etc.)
        height?: number;             // Image height
        steps?: number;              // Generation steps (20-50)
        cfg_scale?: number;          // Prompt adherence (1-20)
        seed?: number;               // Random seed (-1 for random)
      };
      alias?: string;                // Human-readable step name
    }>;
    generations: {
      generations: number;           // Number of outputs to create
      hashes?: string[];             // Custom random seeds
      use_custom_hashes?: boolean;
    };
    variables?: Array<{
      name: string;                  // Variable name (e.g., "style")
      type: "pick" | "text" | "number";
      value?: any;                   // Default value
      lock_value?: boolean;          // Prevent changes during generation
      test_value?: any;              // Value for testing
    }>;
  };
}
```

#### Response Schema
```typescript
interface CollectionEditResponse {
  data: {
    id: string;                      // Collection ID
    title: string;                   // Updated title
    description?: string;            // Updated description
    updated_at: string;              // ISO timestamp
    data: GenerationInput;           // Updated workflow definition
  };
  error: null | string;
}
```

#### Example Request (Edit the forked collection)
```http
PUT /collections/789e0123-e45b-67c8-a901-234567890abc
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "title": "My Custom AI Portraits",
  "description": "Personalized portrait generator with my preferred settings",
  "data": {
    "version": "v2",
    "steps": [
      {
        "id": 1,
        "nodeName": "stable-diffusion-xl",
        "nodePayload": {
          "prompt": "professional headshot of {{subject}}, {{style}} style, studio lighting",
          "negative_prompt": "blurry, low quality, cartoon, anime",
          "width": 1024,
          "height": 1024,
          "steps": 35,
          "cfg_scale": 8.0,
          "seed": -1
        },
        "alias": "Portrait Generation"
      }
    ],
    "generations": {
      "generations": 4,
      "use_custom_hashes": false
    },
    "variables": [
      {
        "name": "subject",
        "type": "text",
        "value": "person",
        "lock_value": false,
        "test_value": "professional businessperson"
      },
      {
        "name": "style", 
        "type": "pick",
        "value": {
          "display_names": ["Corporate", "Artistic", "Casual"],
          "values": ["corporate headshot", "artistic portrait", "casual photo"],
          "weights": [1, 1, 1]
        },
        "lock_value": false,
        "test_value": "corporate headshot"
      }
    ]
  }
}
```

#### Example Response
```json
{
  "data": {
    "id": "789e0123-e45b-67c8-a901-234567890abc",
    "title": "My Custom AI Portraits",
    "description": "Personalized portrait generator with my preferred settings", 
    "updated_at": "2024-07-31T16:45:00Z",
    "data": {
      "version": "v2",
      "steps": [...],
      "generations": {...},
      "variables": [...]
    }
  },
  "error": null
}
```

### 4. Generate from Custom Collection: `POST /collections/:id/generations`

Once you've customized your collection, use the existing generation endpoint:

#### Example Request
```http
POST /collections/789e0123-e45b-67c8-a901-234567890abc/generations
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "variables": {
    "subject": "tech entrepreneur",
    "style": "corporate headshot"
  }
}
```

## Error Responses

### Template Browsing Errors
```json
// 429 Too Many Requests
{
  "data": null,
  "error": "Rate limit exceeded"
}
```

### Fork Template Errors
```json
// 404 Not Found - Template doesn't exist
{
  "data": null,
  "error": "Collection not found"
}

// 400 Bad Request - Template not forkable
{
  "data": null,
  "error": "Collection is not remixable"
}

// 400 Bad Request - Preview not enabled
{
  "data": null,
  "error": "Collection preview is not enabled"
}

// 401 Unauthorized
{
  "data": null,
  "error": "Invalid JWT token"
}
```

### Generation Errors
```json
// 403 Forbidden - Not collection owner
{
  "data": null,
  "error": "User does not own this collection"
}

// 400 Bad Request - Invalid variables
{
  "data": null,
  "error": "Invalid variables",
  "details": {
    "style": "Must be one of: cyberpunk, realistic, fantasy, minimalist",
    "prompt": "Required field cannot be empty"
  }
}
## Complete Workflow Example

Here's a complete example showing how to use the template-based API:

### Step 1: Browse Templates
```bash
curl -X GET "https://api.emprops.com/feed?size=3" \
  -H "Content-Type: application/json"
```

### Step 2: Fork a Template
```bash
curl -X POST "https://api.emprops.com/collections/550e8400-e29b-41d4-a716-446655440000/remix" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### Step 3: Generate with Custom Variables
```bash
curl -X POST "https://api.emprops.com/collections/789e0123-e45b-67c8-a901-234567890abc/generations" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "style": "cyberpunk",
      "prompt": "a mysterious figure in a neon-lit city"
    }
  }'
```

### Step 4: Monitor Progress
```bash
# Check job status
curl -X GET "https://api.emprops.com/jobs/job-456def78-9012-3456-7890-abcdef123456" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Or stream real-time events
curl -N -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "https://api.emprops.com/jobs/job-456def78-9012-3456-7890-abcdef123456/events"
```

## Implementation Architecture

The template-based API leverages existing, battle-tested infrastructure:

### Existing Components Used
```
src/
├── routes/
│   ├── feed/index.ts               # ✅ Template browsing
│   ├── remix/index.ts              # ✅ Collection forking  
│   └── generator/v2.ts             # ✅ Generation execution
├── lib/
│   └── collections.ts              # ✅ ID generation, reference updates
└── index.ts                        # ✅ Route registration
```

### Key Infrastructure
- **Feed System**: Discovers collections with `collection_preview.enabled = true`
- **Remix/Fork System**: Creates collection copies with new component IDs  
- **Generation System**: Executes collections with custom variables
- **Job Queue**: Handles background processing and progress tracking
- **Real-time Events**: Server-sent events for progress monitoring

## Best Practices

### Template Discovery
- **Pagination**: Use reasonable page sizes (10-50) to avoid overwhelming users
- **Filtering**: Filter by date or category to find relevant templates  
- **Preview Images**: Always show sample outputs to help users choose templates
- **Variable Documentation**: Display what each template variable controls

### Forking Strategy  
- **Project Organization**: Create dedicated projects for different use cases
- **Naming Convention**: Consider prefixing forked collections for easy identification
- **Version Control**: Fork specific preview versions, not the latest draft

### Generation Optimization
- **Variable Validation**: Validate variables against template constraints before generating
- **Batch Processing**: For multiple variations, consider forking once and generating multiple times
- **Progress Monitoring**: Always monitor job progress via server-sent events
- **Error Handling**: Implement retry logic for failed generations

### Authentication & Authorization

#### JWT Authentication
```javascript
const token = 'your-jwt-token';
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

#### API Key Authentication (Alternative)
```javascript
const headers = {
  'X-API-Key': 'your-api-key',
  'Content-Type': 'application/json'
};
```

### Rate Limiting
- **Template Browsing**: 1000 requests/hour per IP
- **Forking**: 100 forks/hour per user  
- **Generation**: 10 generations/hour per user
- **Job Status**: 500 requests/hour per user

### Integration Patterns

#### Simple Template Usage
```javascript
class TemplateClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.emprops.com';
  }

  async findTemplate(searchTerm) {
    const templates = await this.getTemplates();
    return templates.find(t => 
      t.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }

  async createFromTemplate(templateId, variables, projectId) {
    // Fork the template
    const fork = await this.forkTemplate(templateId, projectId);
    
    // Generate with custom variables
    const generation = await this.generate(fork.id, variables);
    
    return { collection: fork, job: generation };
  }
}
```

#### Batch Processing
```javascript
async function createMultipleVariations(templateId, variationsList) {
  // Fork once
  const fork = await forkTemplate(templateId);
  
  // Generate multiple variations
  const jobs = await Promise.all(
    variationsList.map(variables => 
      generate(fork.id, variables)
    )
  );
  
  return { forkId: fork.id, jobs };
}
```

## SDK and Libraries

### JavaScript/TypeScript SDK
```javascript
import { EmPropsAPI } from '@emprops/sdk';

const api = new EmPropsAPI({
  apiKey: process.env.EMPROPS_API_KEY,
  baseURL: 'https://api.emprops.com'
});

// Discover templates
const templates = await api.templates.browse({ size: 10 });

// Fork and generate
const collection = await api.collections.createFromTemplate({
  templateId: 'template-uuid',
  variables: { style: 'cyberpunk', prompt: 'futuristic city' },
  projectId: 'my-project-uuid'
});
```

### Python SDK
```python
from emprops import EmPropsAPI

api = EmPropsAPI(api_key=os.getenv('EMPROPS_API_KEY'))

# Browse templates
templates = api.templates.browse(size=10)

# Fork and generate
collection = api.collections.create_from_template(
    template_id='template-uuid',
    variables={'style': 'cyberpunk', 'prompt': 'futuristic city'},
    project_id='my-project-uuid'
)
```

## Production Considerations

### Monitoring and Logging
- Log all API interactions for debugging
- Monitor generation success rates and timing
- Set up alerts for high error rates
- Track usage against rate limits

### Error Handling Strategy
```javascript
async function robustGeneration(templateId, variables) {
  const maxRetries = 3;
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      const fork = await forkTemplate(templateId);
      const job = await generate(fork.id, variables);
      
      // Wait for completion with timeout
      const result = await waitForCompletion(job.job_id, 300000); // 5min timeout
      
      if (result.status === 'completed') {
        return result;
      }
      
      throw new Error(`Generation failed: ${result.error}`);
      
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) throw error;
      
      // Exponential backoff
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
}
```

### Caching Strategy
- Cache template metadata to reduce API calls
- Store successful variable combinations
- Cache job results for duplicate requests
- Implement proper cache invalidation

## Support and Resources

### API Documentation
- **OpenAPI Spec**: Available at `/docs/openapi.json`
- **Interactive Docs**: Available at `/docs/swagger`
- **Status Page**: https://status.emprops.com

### Community
- **Discord**: Join our developer community
- **GitHub**: Sample code and integrations
- **Support**: api-support@emprops.com

### Migration Guide
If migrating from other NFT generation APIs, see our [Migration Guide](/08-emprops-open-api/examples/migration-guide) for common patterns and best practices.

---

## Summary

The **Template-Based Collection Creation API** provides a much simpler alternative to building complex workflow definitions from scratch. By leveraging the existing fork-and-edit infrastructure, third-party developers can:

✅ **Browse Templates** - Discover pre-built, tested collection templates  
✅ **Fork & Customize** - Create personalized copies with minimal effort  
✅ **Generate Content** - Execute with custom variables via the proven generation system  
✅ **Monitor Progress** - Track jobs in real-time with server-sent events  

This approach reduces integration complexity by 90%+ compared to building complete workflow definitions, while maintaining the full power and flexibility of the EmProps generation platform.

**Next Steps:**
- Review the [API Reference](/08-emprops-open-api/api-reference/) for complete endpoint documentation
- Try the [Basic Collection Example](/08-emprops-open-api/examples/basic-collection) tutorial
- Join our [Discord community](https://discord.gg/emprops) for developer support