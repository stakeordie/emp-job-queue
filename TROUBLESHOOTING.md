# Troubleshooting Guide

## Common Issue: OpenAI SDK Streaming Fragility

### Problem
OpenAI connectors sometimes fail with errors like:
```json
{
  "success": false,
  "error": "No partial images received from OpenAI streaming response",
  "processing_time_ms": 4097
}
```

### Root Cause
The OpenAI SDK has inconsistent behavior with streaming responses:
1. **API Changes**: OpenAI frequently updates their streaming response format
2. **Network Issues**: Streaming connections can timeout or drop
3. **Model Variations**: Different models may not support streaming consistently
4. **Rate Limiting**: Can cause partial streaming failures

### Solution Implemented
The connectors now use a **three-tier fallback pattern** with job tracking:

1. **Primary**: Background + Streaming (trackable OpenAI job IDs + real-time progress)
2. **Secondary**: Traditional streaming (Responses API with partial images)
3. **Fallback**: Non-streaming DALL-E API  
4. **Error Handling**: Comprehensive error logging with OpenAI job IDs for debugging

### How It Works
```typescript
// Primary: Background + streaming for best reliability
try {
  return await this.processWithBackgroundStreaming(jobData, progressCallback);
} catch (backgroundError) {
  // Secondary: Traditional streaming
  try {
    return await this.processWithStreaming(jobData, progressCallback);
  } catch (streamingError) {
    // Fallback: Non-streaming
    return await this.processWithoutStreaming(jobData, progressCallback);
  }
}
```

### Key Benefits of Background Approach
- **Job IDs**: Every request gets an OpenAI job ID for tracking failures
- **Sequence Numbers**: Cursor-based progress tracking for recovery
- **Reliability**: Can reconnect to jobs if streaming drops
- **Real-time**: Still provides partial image previews as they generate

### Prevention Tips
- Monitor connector logs for fallback frequency
- Consider disabling streaming if fallbacks are too common
- Keep OpenAI SDK updated but test thoroughly after updates

---

## Common Issue: Image Input Format Errors

### Problem
OpenAI img2img connector fails with errors like:
```json
{
  "success": false,
  "error": "Image conversion failed: Failed to parse URL from {{image}}",
  "processing_time_ms": 1324
}
```

### Root Cause
The connector receives template variables (like `{{image}}`) instead of actual image data. This happens when:
1. **Template variables**: Job payload contains `{{image}}` instead of resolved data
2. **Wrong format**: Images passed as raw base64 without proper detection
3. **Invalid URLs**: Malformed or inaccessible image URLs

### Solution Implemented
The image conversion method now handles multiple input formats:

```typescript
// Supports all these input formats:
- "data:image/png;base64,iVBORw0KGgo..." // Data URLs ✅
- "iVBORw0KGgoAAAANSUhEUgAAA..."      // Raw base64 ✅  
- "https://example.com/image.png"        // Valid URLs ✅
- "{{image}}" // Template variables ❌ (clear error)
```

### Input Format Detection
1. **Data URLs**: Detected by `data:` prefix → returned as-is
2. **Base64 strings**: Detected by length + pattern → converted to data URL
3. **Template variables**: Detected by `{{}}` → clear error message
4. **URLs**: Fetched and converted to base64

### Prevention Tips
- Ensure template variables are resolved before sending to connector
- Pass images as base64 strings or data URLs when possible
- Validate image URLs are accessible before job submission

---

## Common Issue: "No connector available for service: [service_name]"

### Problem
When a worker tries to process a job, you may see an error like:
```
Error: No connector available for service: openai_img2img
```

### Root Cause
This error occurs when:
1. A connector class exists but isn't exported in the barrel file
2. The service mapping doesn't match the connector registration
3. The connector failed to initialize during startup

### Solution Steps

#### 1. Check Barrel File Export
Ensure the connector is exported in `/apps/worker/src/connectors/index.ts`:

```typescript
// Make sure your connector is exported
export * from './openai-img2img-connector.js';
```

#### 2. Verify Service Mapping
Check `/apps/machine/src/config/service-mapping.json` has the correct mapping:

```json
{
  "workers": {
    "openai": {
      "service": [
        {
          "capability": "openai_img2img",
          "connector": "OpenAIImg2ImgConnector",
          "type": "external"
        }
      ]
    }
  }
}
```

#### 3. Check Connector Registration
The connector manager looks for connectors in this order:
1. Service mapping file lookup (preferred)
2. Direct service type matching (fallback)

#### 4. Verify Environment Variables
Ensure required environment variables are set:
- `OPENAI_API_KEY`
- Any connector-specific configuration

### Prevention
- Always update the barrel file when adding new connectors
- Test connector registration in local development
- Use descriptive error logging in connector initialization

### Quick Fix Checklist
- [ ] Connector file exists in `/src/connectors/`
- [ ] Connector is exported in `index.ts` barrel file
- [ ] Service mapping includes the connector
- [ ] Required environment variables are set
- [ ] Worker has been rebuilt/restarted after changes