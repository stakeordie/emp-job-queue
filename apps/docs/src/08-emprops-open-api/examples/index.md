# Examples

Practical examples and code snippets for integrating with the EmProps Open API.

## Quick Start Example

Create your first collection with AI generation:

```typescript
const response = await fetch('https://api.emprops.com/api/collections/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    title: 'Cyberpunk Avatars',
    workflow_id: 'comfy-portrait-generator',
    variables: {
      style: 'cyberpunk',
      background: 'neon city'
    },
    generations: 3,
    metadata: {
      editions: 100,
      price: 0.05,
      blockchain: 'ETHEREUM'
    }
  })
});

const { data } = await response.json();
console.log('Collection created:', data.collection_id);
console.log('Job started:', data.job_id);
```

## Examples by Use Case

### [Basic Collection Creation](/08-emprops-open-api/examples/basic-collection)
Simple collection creation with minimal parameters
- Single generation workflow
- Basic metadata setup
- Progress monitoring

### [Advanced Workflow Integration](/08-emprops-open-api/examples/advanced-workflows)
Complex workflows with multiple parameters
- Variable substitution
- Multi-step workflows
- Custom generation parameters

### [Batch Operations](/08-emprops-open-api/examples/batch-operations) 📝
Creating multiple collections efficiently
- Batch model validation
- Parallel generation processing
- Resource optimization

### [Real-time Progress Tracking](/08-emprops-open-api/examples/progress-tracking) 📝
Monitor generation progress in real-time
- Server-Sent Events integration
- Progress bar implementation
- Error handling and retries

### [Blockchain Integration](/08-emprops-open-api/examples/blockchain-integration) 📝
Publishing collections to multiple blockchains
- Multi-chain deployment
- Metadata preparation
- Transaction monitoring

## Code Templates

### React Hook for Collection Generation
```typescript
import { useState, useCallback } from 'react';

interface UseCollectionGenerationResult {
  generateCollection: (request: CollectionGenerationRequest) => Promise<void>;
  loading: boolean;
  error: string | null;
  collection: Collection | null;
  progress: number;
}

export function useCollectionGeneration(): UseCollectionGenerationResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [progress, setProgress] = useState(0);

  const generateCollection = useCallback(async (request: CollectionGenerationRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      // Create collection and start generation
      const response = await fetch('/api/collections/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error('Failed to create collection');
      }

      const { data } = await response.json();
      setCollection(data);

      // Start listening for progress updates
      const eventSource = new EventSource(data.urls.job_events_url);
      
      eventSource.onmessage = (event) => {
        const update = JSON.parse(event.data);
        if (update.progress) {
          setProgress(update.progress);
        }
        if (update.status === 'completed') {
          eventSource.close();
          setLoading(false);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setError('Connection lost');
        setLoading(false);
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }, []);

  return { generateCollection, loading, error, collection, progress };
}
```

### Python Client Example
```python
import requests
import json
from typing import Dict, Any, Optional

class EmPropsClient:
    def __init__(self, api_token: str, base_url: str = "https://api.emprops.com"):
        self.api_token = api_token
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_token}',
            'Content-Type': 'application/json'
        })

    def generate_collection(
        self,
        title: str,
        workflow_id: str,
        variables: Optional[Dict[str, Any]] = None,
        generations: int = 1,
        **kwargs
    ) -> Dict[str, Any]:
        """Create a new collection with AI generation."""
        
        payload = {
            'title': title,
            'workflow_id': workflow_id,
            'variables': variables or {},
            'generations': generations,
            **kwargs
        }
        
        response = self.session.post(
            f'{self.base_url}/api/collections/generate',
            json=payload
        )
        
        response.raise_for_status()
        return response.json()

    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get the current status of a generation job."""
        
        response = self.session.get(f'{self.base_url}/jobs/{job_id}')
        response.raise_for_status()
        return response.json()

# Usage
client = EmPropsClient('your-api-token')

collection = client.generate_collection(
    title='AI Art Collection',
    workflow_id='stable-diffusion-xl',
    variables={
        'prompt': 'A futuristic cityscape at sunset',
        'style': 'digital art'
    },
    generations=5,
    metadata={
        'price': 0.1,
        'blockchain': 'ETHEREUM'
    }
)

print(f"Collection created: {collection['data']['collection_id']}")
```

### Node.js Express Integration
```typescript
import express from 'express';
import { EmPropsAPI } from '@emprops/api-client';

const app = express();
const emprops = new EmPropsAPI(process.env.EMPROPS_API_TOKEN);

app.post('/create-collection', async (req, res) => {
  try {
    const { title, workflow_id, variables } = req.body;
    
    // Validate user permissions
    if (!req.user.hasCredits(100)) {
      return res.status(402).json({
        error: 'Insufficient credits'
      });
    }

    // Create collection with generation
    const collection = await emprops.collections.generate({
      title,
      workflow_id,
      variables,
      generations: 1,
      options: {
        auto_publish: false,
        generate_preview: true
      }
    });

    // Store collection reference in user's account
    await req.user.addCollection(collection.data.collection_id);

    res.json({
      success: true,
      collection_id: collection.data.collection_id,
      job_id: collection.data.job_id,
      status_url: `/collections/${collection.data.collection_id}/status`
    });

  } catch (error) {
    console.error('Collection creation failed:', error);
    res.status(500).json({
      error: 'Failed to create collection'
    });
  }
});

app.get('/collections/:id/status', async (req, res) => {
  try {
    const collection = await emprops.collections.get(req.params.id);
    const job = await emprops.jobs.get(collection.data.job_id);

    res.json({
      collection_status: collection.data.status,
      generation_status: job.data.status,
      progress: job.data.progress,
      assets: collection.data.assets
    });

  } catch (error) {
    res.status(500).json({ error: 'Failed to get status' });
  }
});
```

## Testing Examples

### Unit Test Example
```typescript
import { describe, it, expect, vi } from 'vitest';
import { CollectionGeneratorService } from '../src/services/collection-generator';

describe('CollectionGeneratorService', () => {
  it('should create collection with proper workflow transformation', async () => {
    const mockPrisma = {
      workflow: { findUnique: vi.fn() },
      collection: { create: vi.fn() },
      job: { create: vi.fn() }
    };

    const service = new CollectionGeneratorService(
      mockPrisma as any,
      mockStorageClient,
      mockCreditsService,
      mockGeneratorV2
    );

    const request = {
      title: 'Test Collection',
      workflow_id: 'test-workflow',
      variables: { style: 'abstract' },
      generations: 2
    };

    mockPrisma.workflow.findUnique.mockResolvedValue({
      id: 'test-workflow',
      name: 'Test Workflow',
      type: 'comfy_workflow',
      data: { form: { fields: [] } }
    });

    const result = await service.generateCollection(request, 'user-123');

    expect(result.collection).toBeDefined();
    expect(result.job).toBeDefined();
    expect(mockPrisma.collection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Test Collection'
      })
    });
  });
});
```

### Integration Test Example
```typescript
import request from 'supertest';
import { app } from '../src/app';

describe('Collection Generation API Integration', () => {
  it('should complete full generation workflow', async () => {
    const response = await request(app)
      .post('/api/collections/generate')
      .set('Authorization', 'Bearer test-token')
      .send({
        title: 'Integration Test Collection',
        workflow_id: 'test-workflow-id',
        generations: 1
      })
      .expect(201);

    const { collection_id, job_id } = response.body.data;

    // Poll job status until completion
    let jobStatus = 'pending';
    let attempts = 0;
    
    while (jobStatus !== 'completed' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await request(app)
        .get(`/jobs/${job_id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);
      
      jobStatus = statusResponse.body.data.status;
      attempts++;
    }

    expect(jobStatus).toBe('completed');

    // Verify collection has generated assets
    const collectionResponse = await request(app)
      .get(`/collections/${collection_id}/public`)
      .expect(200);

    expect(collectionResponse.body.data.assets).toHaveLength(1);
  });
});
```

## Best Practices

### Error Handling
Always implement proper error handling for API calls:

```typescript
async function createCollectionSafely(request: CollectionGenerationRequest) {
  try {
    const response = await fetch('/api/collections/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.json();
      
      // Handle specific error types
      switch (response.status) {
        case 402:
          throw new InsufficientCreditsError(error.details);
        case 404:
          throw new WorkflowNotFoundError(error.error);
        case 429:
          throw new RateLimitError('Too many requests');
        default:
          throw new APIError(error.error);
      }
    }

    return response.json();
    
  } catch (error) {
    if (error instanceof TypeError) {
      throw new NetworkError('Network connection failed');
    }
    throw error;
  }
}
```

### Progress Tracking
Implement robust progress tracking with error recovery:

```typescript
function trackGenerationProgress(jobId: string): Promise<Collection> {
  return new Promise((resolve, reject) => {
    const eventSource = new EventSource(`/jobs/${jobId}/events`);
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'job_update':
          updateProgress(data.progress);
          if (data.status === 'completed') {
            eventSource.close();
            resolve(data.result);
          } else if (data.status === 'failed') {
            eventSource.close();
            reject(new Error(data.error_message));
          }
          break;
        case 'job_history':
          logProgress(data.message);
          break;
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        setTimeout(() => {
          // Retry with exponential backoff
          trackGenerationProgress(jobId);
        }, Math.pow(2, reconnectAttempts) * 1000);
      } else {
        reject(new Error('Connection failed after multiple attempts'));
      }
    };
  });
}
```

## Community Examples

Share your integration examples with the community:
- [GitHub Repository](https://github.com/emprops/api-examples)
- [Discord Community](https://discord.gg/emprops)
- [Developer Forum](https://forum.emprops.com)

## Legend

- ✅ **Complete** - Ready to use examples
- 📝 **Coming Soon** - Planned examples
- 🔧 **Community** - Community contributed examples