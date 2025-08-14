# EmProps Dependencies API Integration Guide

This guide covers the dependencies API endpoints for analyzing model and custom node requirements for collections and workflows.

## Base URL
```
https://api.emprops.ai  # Production
http://localhost:3000   # Development
```

## Authentication
**Dependencies endpoints require NO authentication** - they are public endpoints for dependency analysis.

## Dependencies Endpoints

### 1. Collection Dependencies

#### Analyze Collection Dependencies (Bulk)
```http
POST /collections/dependencies
Content-Type: application/json

{
  "collection_ids": ["uuid1", "uuid2", "uuid3"]
}
```

**Response:**
```json
{
  "data": [
    {
      "collection_id": "uuid1",
      "models": [
        {
          "id": "model-uuid",
          "name": "stable-diffusion-v1-5",
          "type": "text-to-image",
          "description": "Stable Diffusion v1.5 model",
          "huggingface_id": "runwayml/stable-diffusion-v1-5",
          "status": "active"
        }
      ],
      "custom_nodes": [
        {
          "id": "node-uuid", 
          "name": "comfy-ui-manager",
          "repositoryUrl": "https://github.com/user/repo",
          "description": "ComfyUI Manager",
          "branch": "main",
          "commit": null,
          "recursive": false,
          "requirements": true,
          "env": {
            "PYTHON_VERSION": "3.8"
          },
          "version": "1.0.0"
        }
      ]
    }
  ],
  "error": null
}
```

### 2. Workflow Dependencies

#### Analyze Workflow Dependencies (Bulk)
```http
POST /workflows/dependencies
Content-Type: application/json

{
  "workflow_ids": ["uuid1", "uuid2"],
  "workflow_names": ["txt2img-flux", "img2img-sd15"]
}
```

**You can send:**
- `workflow_ids` only
- `workflow_names` only
- Both together (uses OR logic to find workflows)

**Response:**
```json
{
  "data": [
    {
      "workflow_id": "uuid1",
      "workflow_name": "txt2img-flux",
      "models": [
        {
          "id": "model-uuid",
          "name": "flux1-dev-fp8.safetensors",
          "type": "diffusion",
          "description": "Flux development model",
          "huggingface_id": "lllyasviel/flux1_dev",
          "status": "active"
        }
      ],
      "custom_nodes": [
        {
          "id": "node-uuid",
          "name": "flux-custom-nodes",
          "repositoryUrl": "https://github.com/flux/custom-nodes",
          "description": "Custom nodes for Flux",
          "branch": "main",
          "commit": null,
          "recursive": false,
          "requirements": true,
          "env": {
            "CUDA_VERSION": "11.8"
          },
          "version": "2.0.0"
        }
      ]
    }
  ],
  "error": null
}
```

## Usage Examples

### Single Collection Dependencies
```javascript
const response = await fetch('/collections/dependencies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    collection_ids: ['19e53d4a-899a-4cc9-b268-bf3823160367']
  })
});

const { data } = await response.json();
console.log('Models needed:', data[0].models.map(m => m.name));
console.log('Custom nodes needed:', data[0].custom_nodes.map(n => n.name));
```

### Multiple Workflows by Name
```javascript
const response = await fetch('/workflows/dependencies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflow_names: ['txt2img-flux', 'img2img-stable-diffusion']
  })
});

const { data } = await response.json();
data.forEach(workflow => {
  console.log(`Workflow: ${workflow.workflow_name}`);
  console.log('Models:', workflow.models.map(m => m.name));
  console.log('Custom Nodes:', workflow.custom_nodes.map(n => n.name));
});
```

### Mixed ID and Name Lookup
```javascript
const response = await fetch('/workflows/dependencies', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    workflow_ids: ['uuid1', 'uuid2'],
    workflow_names: ['txt2img-flux']
  })
});
```

## Integration Patterns

### 1. Environment Setup for Custom Nodes
```javascript
// Get workflow dependencies
const deps = await fetch('/workflows/dependencies', {
  method: 'POST',
  body: JSON.stringify({ workflow_names: ['my-workflow'] })
}).then(r => r.json());

// Generate .env file for each custom node
deps.data[0].custom_nodes.forEach(node => {
  if (node.env) {
    const envFile = Object.entries(node.env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    console.log(`Environment for ${node.name}:`);
    console.log(envFile);
  }
});
```

### 2. Installation Script Generation
```javascript
// Get dependencies for multiple collections
const deps = await fetch('/collections/dependencies', {
  method: 'POST',
  body: JSON.stringify({ 
    collection_ids: ['collection1', 'collection2'] 
  })
}).then(r => r.json());

// Generate installation commands
deps.data.forEach(collection => {
  collection.custom_nodes.forEach(node => {
    const settings = node;
    console.log(`# Install ${node.name}`);
    console.log(`git clone ${node.repositoryUrl}`);
    if (settings.branch && settings.branch !== 'main') {
      console.log(`cd ${node.name} && git checkout ${settings.branch}`);
    }
    if (settings.requirements) {
      console.log(`pip install -r ${node.name}/requirements.txt`);
    }
  });
});
```

### 3. Dependency Validation
```javascript
async function validateDependencies(workflowNames) {
  const response = await fetch('/workflows/dependencies', {
    method: 'POST',
    body: JSON.stringify({ workflow_names: workflowNames })
  });
  
  const { data } = await response.json();
  
  const allModels = new Set();
  const allNodes = new Set();
  
  data.forEach(workflow => {
    workflow.models.forEach(model => allModels.add(model.name));
    workflow.custom_nodes.forEach(node => allNodes.add(node.name));
  });
  
  return {
    models: Array.from(allModels),
    custom_nodes: Array.from(allNodes),
    totalWorkflows: data.length
  };
}
```

## Error Handling

All endpoints return errors in this format:
```json
{
  "data": null,
  "error": "Error message here"
}
```

Common scenarios:
- **400 Bad Request**: Invalid request body or missing required fields
- **404 Not Found**: Collection/workflow IDs not found
- **500 Internal Server Error**: Database or server issues

## Best Practices

1. **Use bulk endpoints**: Always prefer `/dependencies` endpoints over individual lookups
2. **Mix IDs and names**: Use names for user-friendly references, IDs for exact matches
3. **Cache results**: Dependencies don't change frequently, cache for performance
4. **Validate inputs**: Check that collection_ids or workflow identifiers exist
5. **Handle missing data**: Some workflows might have no custom nodes or models

## Comparison: Collections vs Workflows

| Feature | Collections | Workflows |
|---------|------------|-----------|
| **Input** | `collection_ids` only | `workflow_ids` OR `workflow_names` |
| **Use Case** | Complete project analysis | Individual workflow analysis |
| **Models** | Embedded in workflow data | Direct model relationships |
| **Custom Nodes** | Embedded in workflow data | Direct custom node relationships |
| **Performance** | Slower (complex data parsing) | Faster (direct relationships) |

**Recommendation:** Use `/workflows/dependencies` when possible for better performance and cleaner data structure.