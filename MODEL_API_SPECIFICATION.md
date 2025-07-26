# Model API Specification for emprops_open_api

## Overview

This document specifies the API endpoints needed in `emprops_open_api` to support machine-level model management in the emp-job-queue system. These endpoints will allow GPU machines to retrieve model download information from the central PostgreSQL database.

## Background

**Current State**: ComfyUI workflows contain model download nodes that cause 5+ minute first-user wait times.

**New Architecture**: Machines download required models during startup based on ENV configuration, before ComfyUI starts.

**Integration Point**: GPU machines need to query emprops_open_api for model download URLs, file sizes, authentication requirements, and save paths.

## Required API Endpoints

### 1. Single Model Lookup

**Endpoint**: `GET /api/models/{modelId}`

**Purpose**: Get download information for a specific model

**Parameters**:
- `modelId` (path): Unique identifier for the model (e.g., "flux-dev", "sdxl-base")

**Response Format**:
```json
{
  "id": "flux-dev",
  "name": "flux1-dev.safetensors",
  "download_url": "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors",
  "file_size_gb": 23.8,
  "hash": "7fac5935ad7b22c0e9147b26ae3f890b",
  "auth_required": true,
  "auth_provider": "huggingface",
  "save_path": "checkpoints/flux1-dev.safetensors",
  "dependencies": [],
  "description": "FLUX.1-dev - Professional AI image generation model"
}
```

**Error Cases**:
- `404`: Model not found
- `500`: Database error

### 2. Batch Model Lookup

**Endpoint**: `POST /api/models/batch`

**Purpose**: Get download information for multiple models in a single request

**Request Body**:
```json
{
  "model_ids": ["flux-dev", "sdxl-base", "controlnet-canny"]
}
```

**Response Format**:
```json
{
  "models": [
    {
      "id": "flux-dev",
      "name": "flux1-dev.safetensors",
      "download_url": "https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev.safetensors",
      "file_size_gb": 23.8,
      "hash": "7fac5935ad7b22c0e9147b26ae3f890b",
      "auth_required": true,
      "auth_provider": "huggingface",
      "save_path": "checkpoints/flux1-dev.safetensors",
      "dependencies": [],
      "description": "FLUX.1-dev - Professional AI image generation model"
    },
    {
      "id": "sdxl-base",
      "name": "sd_xl_base_1.0_0.9vae.safetensors",
      "download_url": "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0_0.9vae.safetensors",
      "file_size_gb": 6.94,
      "hash": "e6bb9ea85bbf7bf6478a7c6d18b71246f22e95d41bcdd80ed40aa212c33cfeff",
      "auth_required": false,
      "auth_provider": null,
      "save_path": "checkpoints/sd_xl_base_1.0_0.9vae.safetensors",
      "dependencies": [],
      "description": "Stable Diffusion XL base model"
    }
  ],
  "not_found": ["controlnet-canny"]
}
```

**Error Cases**:
- `400`: Invalid request format
- `500`: Database error

## Database Integration

### Expected PostgreSQL Schema

The API should read from an existing models table with fields like:

```sql
-- Expected table structure (adapt to your existing schema)
SELECT 
  id,                    -- Model identifier (flux-dev, sdxl-base, etc.)
  name,                  -- Filename (flux1-dev.safetensors)
  download_url,          -- Full download URL
  file_size_gb,          -- File size in GB (can be calculated from bytes)
  hash,                  -- File hash for verification
  auth_required,         -- Boolean: requires authentication
  auth_provider,         -- 'huggingface', 'civitai', null
  save_path,             -- Relative path where file should be saved
  dependencies,          -- JSON array of dependent model IDs
  description            -- Human-readable description
FROM models 
WHERE id = $1;
```

### Sample Implementation (Express.js)

```javascript
// GET /api/models/:modelId
router.get('/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    
    const result = await db.query(`
      SELECT 
        id,
        name,
        download_url,
        file_size_gb,
        hash,
        auth_required,
        auth_provider,
        save_path,
        dependencies,
        description
      FROM models 
      WHERE id = $1
    `, [modelId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Model not found',
        model_id: modelId 
      });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/models/batch
router.post('/models/batch', async (req, res) => {
  try {
    const { model_ids } = req.body;
    
    if (!Array.isArray(model_ids)) {
      return res.status(400).json({ error: 'model_ids must be an array' });
    }
    
    const placeholders = model_ids.map((_, i) => `$${i + 1}`).join(',');
    const result = await db.query(`
      SELECT 
        id,
        name,
        download_url,
        file_size_gb,
        hash,
        auth_required,
        auth_provider,
        save_path,
        dependencies,
        description
      FROM models 
      WHERE id IN (${placeholders})
    `, model_ids);
    
    const found = result.rows;
    const foundIds = found.map(row => row.id);
    const notFound = model_ids.filter(id => !foundIds.includes(id));
    
    res.json({
      models: found,
      not_found: notFound
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

## Authentication & Security

- **No authentication required** for these endpoints (internal service-to-service communication)
- **Rate limiting**: Consider implementing if needed for production
- **Input validation**: Sanitize model IDs to prevent SQL injection
- **CORS**: Configure appropriately for cross-origin requests if needed

## Usage Pattern

**Typical machine startup flow**:
1. Machine starts with `MACHINE_MODELS_NEEDED=flux-dev,sdxl-base`
2. Machine calls `POST /api/models/batch` with `{"model_ids": ["flux-dev", "sdxl-base"]}`
3. Machine receives download URLs and metadata
4. Machine downloads models using provided URLs and authentication
5. Machine starts ComfyUI with all models present

## Testing

**Sample test cases**:

```bash
# Test single model lookup
curl http://localhost:3000/api/models/flux-dev

# Test batch lookup
curl -X POST http://localhost:3000/api/models/batch \
  -H "Content-Type: application/json" \
  -d '{"model_ids": ["flux-dev", "sdxl-base", "nonexistent"]}'

# Test error cases
curl http://localhost:3000/api/models/nonexistent-model
```

## Implementation Priority

1. **High Priority**: `POST /api/models/batch` endpoint (most commonly used)
2. **Medium Priority**: `GET /api/models/{modelId}` endpoint (for debugging/individual lookups)
3. **Low Priority**: Additional metadata fields or caching optimizations

## Questions for Implementation

1. **Database Schema**: Does the existing models table have all required fields? Any field name differences?
2. **File Size Storage**: Is file size stored in bytes, MB, or GB in the database?
3. **Dependencies Field**: Should this be a JSON array, or separate table with relationships?
4. **Authentication Providers**: What values are used for auth_provider? ('huggingface', 'civitai', 'openai', etc.)
5. **Error Handling**: Any specific error response format preferred?

## Success Criteria

- GPU machines can retrieve model metadata for all models in `MACHINE_MODELS_NEEDED`
- Batch endpoint handles 10+ models efficiently
- Response time < 100ms for typical requests
- Handles missing models gracefully without breaking machine startup