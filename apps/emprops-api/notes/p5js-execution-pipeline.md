# P5.js Script Execution Pipeline Documentation

## Overview
The EmProps platform executes P5.js scripts through a Puppeteer-based rendering service to generate static images and videos. This document provides a detailed breakdown of the complete pipeline for migrating to Playwright.

## Architecture Components

### 1. Node Types
The system supports three JavaScript execution nodes:
- **`P5JsNode`** - Executes P5.js code and captures static screenshots
- **`P5ToVid`** - Executes P5.js code and records videos  
- **`JsNode`** - Executes arbitrary HTML/CSS/JS and captures screenshots

### 2. Puppeteer Service Integration
All nodes communicate with an external Puppeteer API service via the `PuppeteerClient` class:

```typescript
// Three main API endpoints:
POST /api/screenshot    // For P5.js static images
POST /api/video        // For P5.js videos  
POST /api/v2/execute   // For general HTML/JS execution
```

## Detailed Execution Flow

### P5.js Static Image Generation (`P5JsNode`)

#### Step 1: Context Preparation
```typescript
// Extract variables from previous nodes
const variablesNode = ctx.outputs.find((o) => o.nodeName === "variables");
const variables: Record<string, string | number> = 
  variablesNode?.nodeResponse?.data || {};
```

#### Step 2: Script Injection & Runtime Environment Setup
The system builds a complete JavaScript runtime environment:

```javascript
const script = `
  // Runtime constants
  const hash = "${ctx.hash}";                    // Generation hash for deterministic randomness
  const variables = ${JSON.stringify(variables)}; // User-defined variables
  
  // Helper functions available to P5.js code
  function getVariable(name) {
    return variables[name];
  }
  
  // Component output access
  const components = ${JSON.stringify(ctx.outputs)};
  function getComponentOutput(name) {
    const result = components.find((component) => component.nodeAlias === name);
    if (!result) return;
    return result.nodeResponse.src;  // Returns URL to previous component outputs
  }
  
  // User's actual P5.js code injected here
  ${payload.code}
`;
```

#### Step 3: Puppeteer Execution
```typescript
// Send to Puppeteer service
const image = await this.client.takeScreenshot(script);
// Returns: Base64-encoded PNG image data
```

#### Step 4: Storage & URL Generation
```typescript
// Generate deterministic storage path
const path = `generations/${ctx.userId}/${ctx.uid}/${ctx.gid}/${ctx.sid}/p5.png`;

// Store base64 image to cloud storage (Azure/GCP/S3)
await this.storeBase64({
  path,
  base64: image,
  mimeType: "image/png",
});

// Generate CDN URL
const src = `${process.env.CLOUDFRONT_URL}/${path}`;

// Verify file availability with retry logic
await fetchWithRetry(src, { method: "HEAD" });
```

#### Step 5: Return Result
```typescript
return {
  src,              // Public CDN URL to generated image
  mimeType: "image/png",
};
```

### P5.js Video Generation (`P5ToVid`)

The video generation follows an identical pattern with these key differences:

#### Video-Specific Parameters
```typescript
const image = await this.client.takeVideo(
  ctx.hash,                                    // Unique ID for video session
  script,                                      // Same script injection as images
  payload.duration ? payload.duration * 1000 : undefined  // Duration in milliseconds
);
```

#### Different Mime Type & Extension
```typescript
getMimeType(): string {
  return "video/mp4";
}
```

### HTML/JS Execution (`JsNode`)

This node supports more complex HTML/CSS/JS execution:

#### Step 1: HTML Template Construction
```typescript
const html = `${payload.body
  .replace("%style%", `<style>${payload.style}</style>`)
  .replace("%script%", `<script>${script}</script>`)}`.trim();
```

#### Step 2: Dual Output Generation
1. **HTML File**: Stores the complete HTML for web viewing
2. **PNG Screenshot**: Captures visual representation

```typescript
// Store HTML file
const htmlPath = this.getCustomPath(ctx, "html");
await this.storeTextFile({ path: htmlPath, text: html, mimeType: "text/html" });

// Generate screenshot
const image = await this.client.executeCode(htmlSrc, "image/png");
const imagePath = this.getCustomPath(ctx, "png");
await this.storeBase64({ path: imagePath, base64: image, mimeType: "image/png" });
```

#### Step 3: Conditional Output
```typescript
if (payload.outputMimetype === "text/html") {
  return {
    src: htmlSrc,         // Primary: HTML file
    mimeType: "text/html",
    altSrc: imageSrc,     // Alternative: PNG screenshot
    altMimeType: "image/png",
  };
} else {
  return {
    src: imageSrc,        // Primary: PNG screenshot
    mimeType: "image/png",
  };
}
```

## Puppeteer Service API Contract

### Screenshot Endpoint
```typescript
POST /api/screenshot
Content-Type: application/json

{
  "code": "// Complete P5.js script with injected runtime"
}

Response:
{
  "data": "base64-encoded-png-data"
}
```

### Video Endpoint  
```typescript
POST /api/video
Content-Type: application/json

{
  "id": "unique-session-id",
  "code": "// Complete P5.js script with injected runtime", 
  "duration": 5000  // Optional: milliseconds
}

Response:
{
  "data": "base64-encoded-mp4-data"
}
```

### HTML Execution Endpoint
```typescript
POST /api/v2/execute
Content-Type: application/json

{
  "file": "https://cdn-url-to-html-file",
  "width": 1920,   // Optional
  "height": 1080,  // Optional  
  "output": "image/png"
}

Response:
{
  "data": "base64-encoded-image-data"
}
```

## Storage & CDN Pipeline

### Path Generation Strategy
All files use deterministic paths for caching and organization:
```
generations/{userId}/{generationId}/{outputId}/{stepId}/{nodeType}.{extension}
```

### Multi-Cloud Storage
- Files stored simultaneously to Azure, GCP, and S3
- CDN URLs served via CloudFront
- Retry logic ensures availability before returning URLs

## Error Handling & Edge Cases

### Network Retries
- `fetchWithRetry()` verifies file availability after upload
- Multiple attempts with backoff for CDN propagation

### Script Injection Security
- User code is sandboxed within Puppeteer browser context
- No direct server-side execution of user code
- Runtime environment provides controlled access to component outputs

### Resource Management
- Each generation gets isolated browser context
- Cleanup handled by Puppeteer service lifecycle

## Migration Considerations for Playwright

### API Compatibility
Current Puppeteer service expects:
1. **Screenshot**: Raw JavaScript code execution in browser
2. **Video**: Recording capability with duration control  
3. **HTML Execution**: URL-based HTML file loading and screenshot

### Required Playwright Features
1. **Page.evaluate()** for JavaScript execution
2. **Page.screenshot()** for image capture
3. **Video recording** for animation capture
4. **HTML loading** from remote URLs
5. **Base64 encoding** of output media

### Performance Considerations
- Current system handles concurrent generations
- Browser context isolation required per generation
- Memory management for long-running video captures

This pipeline is well-architected for migration to Playwright, as both tools provide similar browser automation capabilities. The main implementation differences will be in the service API layer rather than the core EmProps integration logic.