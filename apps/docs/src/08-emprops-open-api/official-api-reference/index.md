# API Reference

Complete reference documentation for the EmProps Open API endpoints.

## Base URL
```
Production: https://api.emprops.com
Staging: https://staging-api.emprops.com
```

## Authentication

All API requests require authentication via JWT token:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://api.emprops.com/collections
```

## Response Format

All API responses follow a consistent format:

```typescript
interface APIResponse<T> {
  data: T | null;
  error: string | null;
}
```

### Success Response
```json
{
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "title": "My Collection"
  },
  "error": null
}
```

### Error Response
```json
{
  "data": null,
  "error": "Invalid request parameters"
}
```

## API Endpoints

### [Collections](/08-emprops-open-api/api-reference/collections)
Manage NFT collections and their metadata
- `GET /collections` - List public collections
- `POST /projects/collections` - Create new collection
- `POST /api/collections/generate` - Create collection with generation ✨
- `PUT /collections/:id` - Update collection
- `POST /collections/:id/publish` - Publish collection

### [Workflows](/08-emprops-open-api/api-reference/workflows) 
Manage AI generation workflows
- `GET /workflows` - List available workflows
- `GET /workflows/:id` - Get workflow details
- `GET /workflows/:id/models` - Get required models
- `POST /workflows/:id/test` - Test workflow execution

### [Models](/08-emprops-open-api/api-reference/models)
Manage AI models and their availability
- `GET /models` - List available models
- `POST /models/batch` - Batch model lookup
- `GET /models/validate-auth` - Validate model authentication
- `POST /models` - Create new model
- `PUT /models/:id` - Update model

### [Generation](/08-emprops-open-api/api-reference/generation)
Execute generations and track progress
- `POST /collections/:id/generations` - Generate from existing collection
- `GET /jobs/:id` - Get job status
- `GET /jobs/:id/events` - Stream job progress (SSE)
- `GET /jobs/:id/history` - Get job history

### Projects 📝
Project management and organization

### Assets 📝 
File and asset management

### Users 📝
User management and credits

## Rate Limiting

API requests are rate limited per user:

- **Standard endpoints**: 100 requests/minute
- **Generation endpoints**: 10 requests/minute  
- **File upload endpoints**: 5 requests/minute

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Codes

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request  
- `401` - Unauthorized
- `402` - Payment Required (insufficient credits)
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

### Custom Error Codes
- `WORKFLOW_NOT_FOUND` - Specified workflow doesn't exist
- `WORKFLOW_NOT_EXECUTABLE` - Workflow type not supported
- `INSUFFICIENT_CREDITS` - User lacks required credits
- `MODEL_UNAVAILABLE` - Required model not available
- `GENERATION_FAILED` - Generation process failed

## SDKs and Libraries

### JavaScript/TypeScript
```bash
npm install @emprops/api-client
```

```typescript
import { EmPropsAPI } from '@emprops/api-client';

const api = new EmPropsAPI('your-jwt-token');
const collection = await api.collections.generate({
  title: 'My Collection',
  workflow_id: 'workflow-uuid'
});
```

### Python
```bash
pip install emprops-api
```

```python
from emprops_api import EmPropsAPI

api = EmPropsAPI('your-jwt-token')
collection = api.collections.generate(
    title='My Collection',
    workflow_id='workflow-uuid'
)
```

## Webhooks 📝

Configure webhooks to receive real-time notifications about generation completion, payment events, and other important updates.

## OpenAPI Specification

Download the complete OpenAPI specification:
- [OpenAPI 3.0 JSON](https://api.emprops.com/openapi.json)
- [OpenAPI 3.0 YAML](https://api.emprops.com/openapi.yaml)

## Need Help?

- [Examples](/08-emprops-open-api/examples/) - Code examples and tutorials
- [Implementation Guides](/08-emprops-open-api/implementation-guides/) - Step-by-step guides
- [Architecture](/08-emprops-open-api/architecture/) - System design documentation

## Legend

- ✅ **Complete** - Fully documented and stable
- ✨ **New** - Recently added feature
- 📝 **Coming Soon** - Planned documentation