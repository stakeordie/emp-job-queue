# DirectJobNode Recovery Documentation

## Problem
Lost work on DirectJobNode implementation that was previously working. The DirectJobNode was not creating flat_file and component_flat_file database records, preventing proper asset saving and UI rendering.

## Root Cause Analysis
The issue was that DirectJobNode was trying to extract image URLs from job results (like `result.data.image_url`), but many workers (like ComfyUI) don't return image URLs in their results. Instead, ComfyUI works by:
1. Sending `prefix` and `filename` to the worker
2. Worker saves the file at that known location
3. Node constructs the URL from the known path
4. Returns `{ src, mimeType }` regardless of job result content

## Solution Overview
Made DirectJobNode work exactly like ComfyWorkflowNode:
- Send context (prefix/filename) to workers in payload
- Construct src URL from known prefix/filename after job completion
- Return consistent `{ src, mimeType }` format for asset saving

## Files Recovered/Created

### 1. BaseWorkflowNode (`src/modules/art-gen/nodes-v2/nodes/base-workflow-node.ts`)
**Purpose**: Shared base class for workflow-based nodes

**Key Methods**:
- `initializeWorkflow()` - Loads workflow data from database
- `preprocessPrompts()` - Handles rich text editor prompts and variables
- `getApiKey()` / `decryptApiKey()` - API key management
- `calculateCost()` - Credits calculation using VM
- `mapInputs()` - Maps form inputs to job structure using paths
- `getPrefix()` - Constructs storage path: `generations/{userId}/{uid}/{gid}/{sid}`
- `getFilename()` - Constructs filename: `{workflowName}.{extension}`
- `setValueByPath()` / `getValueByPath()` - Path manipulation utilities

### 2. DirectJobNode (`src/modules/art-gen/nodes-v2/nodes/direct-job.ts`)
**Purpose**: Handles direct_job workflow type via Redis job queue

**Key Features**:
- Extends BaseWorkflowNode for shared functionality
- Adds context to payload: `jobRequest.payload.ctx = { prefix, filename, workflow_name, user_id, generation_context }`
- Constructs src URL like ComfyUI: `${CLOUDFRONT_URL}/${prefix}/${filename}`
- Handles both image/file outputs and text content
- Returns consistent `{ src, mimeType }` format

**Critical Change**: 
```javascript
// OLD: Try to extract URL from job result
const src = result.data.image_url; // Often fails

// NEW: Construct URL from known path (like ComfyUI)
const path = `${prefix}/${filename}`;
const src = `${process.env.CLOUDFRONT_URL}/${path}`;
```

### 3. GeneratorV2 Integration (`src/modules/art-gen/nodes-v2/index.ts`)
**Changes Made**:
- Added DirectJobNode import: `import { DirectJobNode } from "./nodes/direct-job"`
- Added `direct_job` to workflow type filter: `["comfy_workflow", "fetch_api", "direct_job"]`
- Added DirectJobNode registration case:
  ```javascript
  case "direct_job":
    this.nodes.push(
      new DirectJobNode(
        workflow.name,
        workflow.output_mime_type,
        this.prisma,
        this.storageClient,
        this.eventEmitter,
      ),
    );
    break;
  ```
- Added `direct_job` to generation limits check

## Technical Flow

### Before (Broken)
1. DirectJobNode submits job to Redis
2. Worker processes job, saves file at expected location
3. Worker returns metadata (no image URL)
4. DirectJobNode tries to extract URL from result → **FAILS**
5. Returns object without `src` field
6. GeneratorV2 condition `'src' in output` → **FAILS**
7. No flat_file records created → **UI can't render**

### After (Working)
1. DirectJobNode adds `ctx: { prefix, filename }` to job payload
2. DirectJobNode submits job to Redis
3. Worker processes job, saves file at expected location using ctx info
4. Worker returns success status (content doesn't matter)
5. DirectJobNode constructs URL: `${CLOUDFRONT_URL}/${prefix}/${filename}`
6. Returns `{ src, mimeType }` (like ComfyUI does)
7. GeneratorV2 condition `'src' in output` → **PASSES**
8. flat_file and component_flat_file records created → **UI renders**

## Key Insights

### 1. ComfyUI Pattern
ComfyUI doesn't rely on job results for image URLs. It trusts that the worker saved the file at the expected location and constructs the URL deterministically.

### 2. Asset Saving Logic
GeneratorV2 only saves assets when:
- `collectionId` exists
- `source !== "preview"`
- `step.id !== variableComponentId`  
- `'src' in output` ← **This was failing**

### 3. Worker Communication
Workers need context (prefix/filename) in the payload to know where to save files:
```javascript
payload: {
  // ... job parameters
  ctx: {
    prefix: "generations/user123/uid456/0/14",
    filename: "openai_image.png",
    workflow_name: "openai_image",
    user_id: "user123",
    generation_context: { uid, gid, sid }
  }
}
```

## Verification Checklist
- ✅ BaseWorkflowNode file exists and exports properly
- ✅ DirectJobNode file exists and extends BaseWorkflowNode
- ✅ DirectJobNode imported in GeneratorV2
- ✅ `direct_job` included in workflow type queries
- ✅ DirectJobNode registration case added to switch statement
- ✅ `direct_job` included in generation limits check
- ✅ Exports present in nodes/index.ts

## Testing
To verify the fix works:
1. Submit a direct_job workflow (like openai_image) 
2. Check logs for: "DirectJobNode: Added prefix: ... filename: ... to payload.ctx"
3. Verify job completes successfully
4. Check database for new flat_file record
5. Check database for new component_flat_file record
6. Verify UI renders the generated image

## Future Considerations
- All workers should follow the same pattern: use `ctx.prefix` and `ctx.filename` from payload
- Worker responses can be standardized but aren't critical for functionality
- The pattern can be extended to other workflow types beyond direct_job

## Related Files
- `src/modules/art-gen/nodes-v2/nodes/workflow.ts` - ComfyUI reference implementation
- `src/clients/redis-server-client.ts` - Job submission mechanism
- `src/modules/art-gen/nodes-v2/index.ts` - GeneratorV2 main class