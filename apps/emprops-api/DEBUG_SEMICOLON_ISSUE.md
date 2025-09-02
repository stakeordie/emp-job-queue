# Production Semicolon Issue in OpenAI DirectJob

## Problem
In production, when submitting an OpenAI direct job, the API is sending malformed JSON with semicolons after each URL in the images array:

```json
"images": [
  "https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/54763df9-41c0-4296-94d1-3c6c40dc2e00/original";,
  "https://cdn.emprops.ai/generations/e26b8192-11a4-46d1-8bf1-c5058eadfb2a/d60dc976-6e38-410e-bc63-cfab7ba4fbb1/0/9240/txt2img-flux.png";,
  "https://cdn.emprops.ai/generations/e26b8192-11a4-46d1-8bf1-c5058eadfb2a/ac3832d9-0200-437f-9126-b9e63d5efae8/0/9467/openai_img2img.png";
]
```

## Key Facts
- This ONLY happens in production, not locally
- The semicolons appear INSIDE the string values, not between array elements
- This suggests the URLs are being modified before JSON serialization

## Potential Causes

### 1. Reverse Proxy / API Gateway
Check if production has a reverse proxy (nginx, Apache, CloudFlare, AWS API Gateway) that might be:
- Modifying request bodies
- Adding semicolons as delimiters
- Has different configuration than development

### 2. Environment-Specific Code
Check for:
- Different Node.js versions between dev and production
- Environment variables that affect string/array handling
- Production-specific middleware or interceptors

### 3. Logging/Monitoring Tools
Some APM tools (DataDog, New Relic, etc.) can modify payloads. Check if production has:
- Request/response interceptors
- Custom JSON serializers
- Payload modification for logging

## Debugging Steps

### 1. Add Logging Before JSON.stringify
In `src/clients/redis-server-client.ts`, before line where it sends the request:
```typescript
console.log("BEFORE STRINGIFY - request.payload.images:", request.payload.images);
console.log("AFTER STRINGIFY:", JSON.stringify(request));
ws.send(JSON.stringify(request));
```

### 2. Check Environment Variables
Look for any env vars that might affect:
- JSON serialization
- String formatting
- Array handling
- Proxy configuration

### 3. Check Production Infrastructure
- Is there a reverse proxy? Check its configuration
- Are there any API gateway rules?
- Are there request transformation rules?

### 4. Test with Minimal Payload
Try sending a minimal job with just one image URL to isolate the issue:
```json
{
  "images": ["https://example.com/test.jpg"]
}
```

### 5. Check for String Replacement
Search production logs or configuration for any patterns like:
- `.replace(/"/g, '";')`
- String manipulation on URLs
- Array-to-string conversions

## Temporary Workaround
If needed, you could sanitize the payload in the DirectJob node before sending:
```typescript
// In DirectJobNode before submitJob
if (jobRequest.payload && jobRequest.payload.images && Array.isArray(jobRequest.payload.images)) {
  jobRequest.payload.images = jobRequest.payload.images.map(url => 
    typeof url === 'string' ? url.replace(/;+$/, '') : url
  );
}
```

## Root Cause Investigation
The semicolon pattern suggests either:
1. A CSV-like formatter is being applied to arrays
2. A security filter is escaping certain characters
3. A proxy is transforming the payload for logging/monitoring

Check the production deployment configuration and infrastructure setup to identify which component is adding these semicolons.