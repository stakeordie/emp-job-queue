# Work Context - Job Queue Redis Bloat and Bug Fixes

## Current Status - September 20, 2025

### ✅ Completed Tasks

#### 1. Redis Bloat Prevention & Database Cleanup
- **Fixed base64 storage in worker attestations** - Updated smartTruncateObject to remove base64 data
- **Fixed base64 storage in jobs:completed** - Added sanitization to completion handler
- **Fixed base64 storage in API workflow attestations** - Added sanitization before Redis storage
- **Cleaned Postgres job table** - Removed 269MB→3.6MB (98.7% reduction) using targeted base64 removal
- **Fixed Prisma connection pool** - Increased from 20→500 connections, timeout 10s→60s

#### 2. Job Evaluation System Foundation
- **Added evaluation fields to Prisma schema** (both emprops-open-api and monitor):
  - `is_cleanup_evaluated: Boolean @default(false)`
  - `status_category: String?` // 'filed', 'complete', 'incomplete'
  - `problem_type: String?` // 'missing_output', 'notification_failed', etc.
  - `problem_details: Json?` // Detailed problem analysis
  - `evaluated_at: DateTime?`

#### 3. Webhook Integration & Security
- **Created miniapp-gen-mock endpoint** at `/miniapp-gen-mock` with HMAC-SHA256 signature verification
- **Created workflow completion webhook** at `/api/webhook/workflow-completed`
- **Created user notification endpoint** at `/api/user_notified`
- **Bypassed auth middleware** for webhook endpoints using publicPaths
- **Verified webhook signature format** using `sha256=${hash}` with body as input string

#### 4. Critical Bug Fixes (Discovered During Testing)
- **🔧 Fixed retry job data corruption**: Preserve original job data structure instead of overwriting with execution results
  - **Root cause**: Retry mechanism was losing `collectionId` and other original data
  - **Fix**: Preserve `originalJobData` structure while adding execution results

- **🔧 Fixed missing attestations from retries**: Include retry attempt number in Redis keys
  - **Root cause**: All retry attempts used same Redis key, overwriting previous attestations
  - **Fix**: Use `api:workflow:completion:${workflowId}:attempt-${retryAttempt}` format

- **🔧 Fixed .bin extension issue**: Detect actual content type after job completion
  - **Root cause**: Using configured `outputMimeType` instead of actual generated content type
  - **Fix**: Implemented `detectActualContentType()` method checking file extensions and HTTP headers

### 🚧 Pending Tasks

#### 1. Job Evaluator Service (Next Priority)
- **Build job evaluator service** - 10-minute cron job to categorize jobs
- **Create evaluation cron job** - Implementation of the evaluation logic
- **Add problem categorization logic** - Define rules for 'filed', 'complete', 'incomplete'
- **Categories to implement**:
  - `complete`: Job finished successfully, user notified
  - `incomplete`: Job failed or timed out
  - `filed`: Job completed but user notification failed

#### 2. Production Cleanup
- **Clean remaining production Redis data** - Remove any remaining base64 bloat from production Redis

#### 3. Testing & Verification
- **Debug webhook signature verification issues** - May already be resolved but needs final verification
- **Test full evaluation workflow** - End-to-end testing of job evaluation system

### 🔑 Key Technical Decisions Made

#### Base64 Sanitization Strategy
```typescript
// Utility: packages/core/src/utils/base64-sanitizer.ts
export function sanitizeBase64Data(obj: any): any {
  // Removes base64 data while preserving structure
  // Applied to: worker attestations, jobs:completed, API attestations
}
```

#### Retry Data Preservation
```typescript
// In emprops-open-api/src/routes/jobs/index.ts
const preservedJobData = {
  ...originalJobData, // Keep original collectionId, variables, etc.
  outputs: result, // Add new execution results
  retry_execution_data: result, // Store full execution result separately
  last_retry_attempt: currentRetryAttempt,
  retry_completed_at: new Date().toISOString()
};
```

#### Attestation Key Management
```typescript
// In apps/api/src/lightweight-api-server.ts
const attestationKey = retryAttempt
  ? `api:workflow:completion:${workflowId}:attempt-${retryAttempt}`
  : `api:workflow:completion:${workflowId}`;
```

#### Content Type Detection
```typescript
// In emprops-open-api/src/modules/art-gen/nodes-v2/nodes/dynamic-json.ts
private async detectActualContentType(url: string): Promise<string> {
  // 1. Check file extension mapping
  // 2. Fetch HTTP headers if needed
  // 3. Fallback to configured mimeType
}
```

### 📁 Key Files Modified

**Core Infrastructure:**
- `packages/core/src/utils/base64-sanitizer.ts` - Base64 removal utility
- `packages/core/src/utils/smart-truncate.ts` - Enhanced truncation with base64 detection

**Database & Schema:**
- `emprops-open-api/prisma/schema.prisma` - Added evaluation fields
- `apps/monitor/prisma/schema.prisma` - Synced evaluation fields
- `emprops-open-api/src/db/prisma-client.ts` - Increased connection pool to 500

**API & Workers:**
- `apps/api/src/lightweight-api-server.ts` - Fixed attestation keys for retries
- `emprops-open-api/src/routes/jobs/index.ts` - Fixed retry data preservation
- `emprops-open-api/src/modules/art-gen/nodes-v2/nodes/dynamic-json.ts` - Fixed content type detection

**Webhook System:**
- `apps/monitor/src/app/miniapp-gen-mock/route.ts` - Main webhook simulation endpoint
- `apps/monitor/src/app/api/user_notified/route.ts` - User notification handler
- `apps/monitor/src/app/api/webhook/workflow-completed/route.ts` - Workflow completion webhook
- `apps/monitor/src/middleware.ts` - Bypassed auth for webhook endpoints

**Monitoring:**
- `apps/monitor/src/app/api/workflows/[workflowId]/all-attestations/route.ts` - Enhanced to show retry attempts
- `apps/monitor/src/services/jobForensics.ts` - Added retry tracking
- `apps/monitor/src/types/forensics.ts` - Extended types for retry support

### 🎯 Next Session Focus

1. **Implement Job Evaluator Service** - The core 10-minute evaluation cron job
2. **Define Problem Categorization Rules** - Logic for determining job status categories
3. **Test Complete Workflow** - End-to-end testing of the evaluation system
4. **Production Redis Cleanup** - Final cleanup of remaining base64 data

### 🔧 Environment Setup Commands

```bash
# Start local development with logging
cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue
pnpm dev:local-redis &
tail -f apps/api/logs/dev.log

# Test webhook endpoints
curl -X POST http://localhost:3333/miniapp-gen-mock \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: sha256=HASH" \
  -d '{"workflow_id":"test-123","user_id":"user-456"}'

# Database connection (if needed)
# Connection string in /Users/the_dusky/code/emprops/components/database.env
```

### 💾 Git Status
- **Last commit**: `b5bbfa5` - "fix(worker): resolve critical retry issues and webhook integration"
- **Branch**: `master` (ahead of origin by 2 commits)
- **Clean working directory** after commit

This context file captures our current state and can be used to continue work from any machine.