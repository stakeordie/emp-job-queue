# Phase 1: Semantic Terminology Analysis

**Generated:** 2025-09-29 21:10:07

## Semantic Model

### Current → Target Terminology

| Current | Target | Description |
|---------|--------|-------------|
| Job | Step | What workers process (individual processing unit) |
| Workflow | Job | What users request (collection of processing steps) |
| workflow_id | job_id | UUID of user's request |
| job_id | step_id | UUID of individual processing unit |
| step-{uuid} | {uuid} | Clean UUIDs without prefixes |

## Executive Summary

- **Total files scanned:** 353
- **Files with issues:** 98
- **Total issues found:** 448

### Issues by Category

- Parameter: **188** occurrences
- Property access: **107** occurrences
- Variable: **97** occurrences
- Redis key prefix: **38** occurrences
- Interface: **15** occurrences
- Function parameter: **3** occurrences

## Files Requiring Attention

### `apps/api/src/lightweight-api-server.ts`

**Issues found:** 25

**Line 900:**
```typescript
const jobId = await this.submitJob(jobData);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 955:**
```typescript
logger.error(`Failed to get job status for ${req.params.jobId}:`, error);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 1019:**
```typescript
const workflowId = workflow_id || job_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 1826:**
```typescript
const jobId = await this.submitJob(message.data as Record<string, unknown>, messageId);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 1848:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 2048:**
```typescript
const jobId = await this.submitJob(jobData, messageId);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 2082:**
```typescript
const jobId = message.job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 2127:**
```typescript
const jobId = message.job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 2673:**
```typescript
const jobId = match[1];
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 3054:**
```typescript
private async handleJobStatusChange(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 3258:**
```typescript
const workflowId = jobData.workflow_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 3409:**
```typescript
const workflowId = jobData.workflow_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 3466:**
```typescript
const workflowId = jobData.workflow_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 3538:**
```typescript
const jobId = providedJobId || uuidv4();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 3539:**
```typescript
logger.info(`🔍 [SUBMIT_JOB_DEBUG] Using jobId: ${jobId}`);
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 3554:**
```typescript
const workflowId = jobData.workflow_id as string;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 3947:**
```typescript
private async getJobStatus(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 4010:**
```typescript
private async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 4098:**
```typescript
const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 4438:**
```typescript
const [newCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 4602:**
```typescript
const jobId = workerData.current_job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 4825:**
```typescript
private async createWorkflowCompletionAttestation(workflowId: string, jobCompletion?: any, workflowOutputs?: any[], retryAttempt?: number): Promise<void> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 5081:**
```typescript
private async publishWorkflowCompletion(workflowId: string, workflowData: any): Promise<void> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 5181:**
```typescript
private async attemptWorkflowRecovery(workflowId: string, jobCompletion?: any): Promise<boolean> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 5402:**
```typescript
private async verifyWorkflowWithEmprops(workflowId: string, originalJobCompletion?: any): Promise<void> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

### `packages/core/src/redis-functions/__tests__/integration.test.ts`

**Issues found:** 22

**Line 52:**
```typescript
const jobId = 'test-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 83:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 98:**
```typescript
const jobId = 'test-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 136:**
```typescript
const jobId = 'gpu-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 167:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 171:**
```typescript
const jobId = 'gpu-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 208:**
```typescript
const jobId = 'multi-hw-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 248:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 254:**
```typescript
const jobId = 'model-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 287:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 291:**
```typescript
const jobId = 'model-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 328:**
```typescript
const jobId = 'isolation-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 389:**
```typescript
const jobId = 'allowlist-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 455:**
```typescript
await redis.hmset('job:low-priority', lowPriorityJob);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 458:**
```typescript
await redis.hmset('job:high-priority', highPriorityJob);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 473:**
```typescript
expect(parsed.jobId).toBe('high-priority'); // Should get high priority job
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 479:**
```typescript
const jobId = 'custom-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 522:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 526:**
```typescript
const jobId = 'custom-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 562:**
```typescript
const jobId = 'concurrent-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 620:**
```typescript
const jobId = 'malformed-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 652:**
```typescript
const jobId = `scan-test-${i}`;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/redis-functions/__tests__/integration.test.ts`

**Issues found:** 22

**Line 52:**
```typescript
const jobId = 'test-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 83:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 98:**
```typescript
const jobId = 'test-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 136:**
```typescript
const jobId = 'gpu-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 167:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 171:**
```typescript
const jobId = 'gpu-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 208:**
```typescript
const jobId = 'multi-hw-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 248:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 254:**
```typescript
const jobId = 'model-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 287:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 291:**
```typescript
const jobId = 'model-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 328:**
```typescript
const jobId = 'isolation-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 389:**
```typescript
const jobId = 'allowlist-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 455:**
```typescript
await redis.hmset('job:low-priority', lowPriorityJob);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 458:**
```typescript
await redis.hmset('job:high-priority', highPriorityJob);
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 473:**
```typescript
expect(parsed.jobId).toBe('high-priority'); // Should get high priority job
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 479:**
```typescript
const jobId = 'custom-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 522:**
```typescript
expect(parsed.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 526:**
```typescript
const jobId = 'custom-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 562:**
```typescript
const jobId = 'concurrent-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 620:**
```typescript
const jobId = 'malformed-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 652:**
```typescript
const jobId = `scan-test-${i}`;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/worker/src/connectors/protocol/websocket-connector.ts`

**Issues found:** 21

**Line 490:**
```typescript
extracted_job_id: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 582:**
```typescript
if (!message.jobId) return;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 584:**
```typescript
const activeJob = this.activeJobs.get(message.jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 589:**
```typescript
job_id: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 592:**
```typescript
message: `Processing job ${message.jobId}`,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 604:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 605:**
```typescript
hasActiveJob: !!message.jobId && this.activeJobs.has(message.jobId),
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 610:**
```typescript
if (!message.jobId) {
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 615:**
```typescript
const activeJob = this.activeJobs.get(message.jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 618:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 626:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 629:**
```typescript
this.completeJob(message.jobId, result);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 632:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 635:**
```typescript
this.failJob(message.jobId, error as Error);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 639:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 649:**
```typescript
if (!message.jobId) return;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 651:**
```typescript
const activeJob = this.activeJobs.get(message.jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 654:**
```typescript
this.failJob(message.jobId, error);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 723:**
```typescript
private completeJob(jobId: string, result: JobResult): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 757:**
```typescript
private failJob(jobId: string, error: Error): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 913:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/asset-saver-retry-suffix.test.ts`

**Issues found:** 14

**Line 40:**
```typescript
const jobId = 'test-job-123';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 63:**
```typescript
const jobId = 'retry-job-456';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 84:**
```typescript
const jobId = 'retry-job-789';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 105:**
```typescript
const jobId = 'high-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 128:**
```typescript
const jobId = 'fallback-job-1';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 147:**
```typescript
const jobId = 'fallback-job-2';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 166:**
```typescript
const jobId = 'no-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 188:**
```typescript
const jobId = 'precedence-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 211:**
```typescript
const jobId = 'zero-precedence-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 237:**
```typescript
const jobId = 'string-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 258:**
```typescript
const jobId = 'null-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 282:**
```typescript
const jobId = 'undefined-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 314:**
```typescript
const jobId = `format-test-${extension}`;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 335:**
```typescript
const jobId = 'video-retry-test';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/monitor/src/services/jobForensics.ts`

**Issues found:** 13

**Line 33:**
```typescript
async getJobForensics(jobId: string, options: ForensicsOptions = {}): Promise<any> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 89:**
```typescript
private async getRedisJob(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 127:**
```typescript
private async getEmpropsJob(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 244:**
```typescript
private async getJobFlatFiles(jobId: string, collectionId?: string) {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 314:**
```typescript
private async getMiniAppUserData(jobId: string, collectionId?: string) {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 316:**
```typescript
console.log(`🚀 [DEBUG] getMiniAppUserData called for jobId: ${jobId}`);
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 461:**
```typescript
private async getJobAttestations(jobId: string, workflowId?: string): Promise<any[]> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 526:**
```typescript
if (key.includes('workflow:failure')) return 'workflow_failure';
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 531:**
```typescript
if (key.includes('workflow:completion')) return 'workflow_completion';
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 775:**
```typescript
private async getWorkflowName(workflowId: string): Promise<string | undefined> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 790:**
```typescript
private async getUserIdFromMiniApp(workflowId: string): Promise<string | undefined> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 1014:**
```typescript
const keys = await this.redis.keys('job:*');
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 1147:**
```typescript
const keys = await this.redis.keys('job:*');
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/worker/src/redis-direct-worker-client.ts`

**Issues found:** 11

**Line 438:**
```typescript
private convertRedisJobData(jobId: string, redisData: RedisJobData): Job {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 532:**
```typescript
if (!parsedResult.jobId || !parsedResult.job) {
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 557:**
```typescript
logger.debug(`Worker ${this.workerId} - claimed job ID: ${matchResult.jobId}`);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 567:**
```typescript
const job = this.convertRedisJobData(matchResult.jobId, matchResult.job);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 622:**
```typescript
const jobId = jobIds[0];
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 657:**
```typescript
private async claimJob(jobId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 703:**
```typescript
private async getJob(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 739:**
```typescript
async sendJobProgress(jobId: string, progress: JobProgress): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 782:**
```typescript
async startJobProcessing(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 817:**
```typescript
async completeJob(jobId: string, result: unknown): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1037:**
```typescript
async failJob(jobId: string, error: string, canRetry = true, context?: { httpStatus?: number; serviceType?: string; timeout?: boolean }): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/workflow-aware-attestations.test.ts`

**Issues found:** 11

**Line 77:**
```typescript
if (key === 'job:workflow-job-123') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 89:**
```typescript
if (key === 'job:standalone-job-789') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 104:**
```typescript
if (key === 'job:workflow-job-123') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 116:**
```typescript
if (key === 'job:standalone-job-789') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 130:**
```typescript
(client as any).getJob = vi.fn().mockImplementation((jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 177:**
```typescript
'workflow:failure:wf-456:attempt:2',
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 195:**
```typescript
'workflow:failure:wf-456:permanent',
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 227:**
```typescript
(call: any) => call[0].includes('workflow:failure')
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 248:**
```typescript
'job:workflow-job-123',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 270:**
```typescript
'job:workflow-job-123',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 376:**
```typescript
(call: any) => call[0].includes('workflow:failure')
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

### `packages/core/src/redis-service.ts`

**Issues found:** 10

**Line 108:**
```typescript
const jobId = uuidv4();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 197:**
```typescript
async getJob(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 234:**
```typescript
async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 271:**
```typescript
async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 294:**
```typescript
async completeJob(jobId: string, result: JobResult): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 372:**
```typescript
async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 468:**
```typescript
async cancelJob(jobId: string, reason: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 494:**
```typescript
async claimJob(jobId: string, workerId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 537:**
```typescript
async releaseJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 693:**
```typescript
async getJobQueuePosition(jobId: string): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/redis-service.ts`

**Issues found:** 10

**Line 108:**
```typescript
const jobId = uuidv4();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 197:**
```typescript
async getJob(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 234:**
```typescript
async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 271:**
```typescript
async updateJobProgress(jobId: string, progress: JobProgress): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 294:**
```typescript
async completeJob(jobId: string, result: JobResult): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 372:**
```typescript
async failJob(jobId: string, error: string, canRetry = true): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 468:**
```typescript
async cancelJob(jobId: string, reason: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 494:**
```typescript
async claimJob(jobId: string, workerId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 537:**
```typescript
async releaseJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 693:**
```typescript
async getJobQueuePosition(jobId: string): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/job-broker.ts`

**Issues found:** 9

**Line 26:**
```typescript
const jobId = uuidv4();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 31:**
```typescript
const workflowId = request.workflow_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 146:**
```typescript
const jobId = jobIds[0];
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 173:**
```typescript
async requeueUnworkableJob(jobId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 202:**
```typescript
async claimJob(jobId: string, workerId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 209:**
```typescript
async releaseJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 269:**
```typescript
async getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 298:**
```typescript
async getQueuePosition(jobId: string): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 492:**
```typescript
private parseJobData(jobId: string, jobData: Record<string, unknown>, status: string): unknown {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/interfaces/redis-service.ts`

**Issues found:** 9

**Line 23:**
```typescript
getJob(jobId: string): Promise<Job | null>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 24:**
```typescript
updateJobStatus(jobId: string, status: JobStatus): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 25:**
```typescript
updateJobProgress(jobId: string, progress: JobProgress): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 26:**
```typescript
completeJob(jobId: string, result: JobResult): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 27:**
```typescript
failJob(jobId: string, error: string, canRetry?: boolean): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 28:**
```typescript
cancelJob(jobId: string, reason: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 29:**
```typescript
claimJob(jobId: string, workerId: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 30:**
```typescript
releaseJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 34:**
```typescript
getJobQueuePosition(jobId: string): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/src/hybrid-client.ts`

**Issues found:** 9

**Line 266:**
```typescript
async getJobStatus(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 274:**
```typescript
private async getJobStatusHTTP(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 292:**
```typescript
private async getJobStatusWebSocket(jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 332:**
```typescript
subscribeToProgress(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 340:**
```typescript
private subscribeToProgressWebSocket(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 354:**
```typescript
private subscribeToProgressSSE(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 388:**
```typescript
unsubscribeFromProgress(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 396:**
```typescript
private unsubscribeFromProgressWebSocket(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 410:**
```typescript
private unsubscribeFromProgressSSE(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/job-broker.ts`

**Issues found:** 9

**Line 26:**
```typescript
const jobId = uuidv4();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 31:**
```typescript
const workflowId = request.workflow_id;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 146:**
```typescript
const jobId = jobIds[0];
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 173:**
```typescript
async requeueUnworkableJob(jobId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 202:**
```typescript
async claimJob(jobId: string, workerId: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 209:**
```typescript
async releaseJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 269:**
```typescript
async getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 298:**
```typescript
async getQueuePosition(jobId: string): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 492:**
```typescript
private parseJobData(jobId: string, jobData: Record<string, unknown>, status: string): unknown {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/redis-service.ts`

**Issues found:** 9

**Line 23:**
```typescript
getJob(jobId: string): Promise<Job | null>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 24:**
```typescript
updateJobStatus(jobId: string, status: JobStatus): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 25:**
```typescript
updateJobProgress(jobId: string, progress: JobProgress): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 26:**
```typescript
completeJob(jobId: string, result: JobResult): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 27:**
```typescript
failJob(jobId: string, error: string, canRetry?: boolean): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 28:**
```typescript
cancelJob(jobId: string, reason: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 29:**
```typescript
claimJob(jobId: string, workerId: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 30:**
```typescript
releaseJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 34:**
```typescript
getJobQueuePosition(jobId: string): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/telemetry-collector/src/__tests__/workflow-span-validation.test.ts`

**Issues found:** 8

**Line 124:**
```typescript
'redis.key': 'job:123'
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 272:**
```typescript
'emp.workflow.id': workflowContext.workflowId,
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 292:**
```typescript
'emp.workflow.id': workflowContext.workflowId,
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 293:**
```typescript
'emp.job.id': workflowContext.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 310:**
```typescript
'emp.workflow.id': workflowContext.workflowId,
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 311:**
```typescript
'emp.job.id': workflowContext.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 328:**
```typescript
'emp.workflow.id': workflowContext.workflowId,
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 329:**
```typescript
'emp.job.id': workflowContext.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/core/src/telemetry/connector-logger.ts`

**Issues found:** 7

**Line 101:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 112:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 122:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 132:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 143:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 169:**
```typescript
withJobContext(jobId: string, sessionId?: string): ConnectorLogger {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 177:**
```typescript
job_id: this.context.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/core/src/telemetry/message-bus.ts`

**Issues found:** 7

**Line 84:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 95:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 105:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 115:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 126:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 528:**
```typescript
withJobContext(jobId: string, sessionId?: string): MessageBus {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 536:**
```typescript
job_id: this.context.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/core/src/services/event-broadcaster.ts`

**Issues found:** 7

**Line 171:**
```typescript
subscribeClientToJob(clientId: string, jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 181:**
```typescript
unsubscribeClientFromJob(clientId: string, jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 278:**
```typescript
const jobId = this.getJobIdFromEvent(event);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 676:**
```typescript
broadcastJobSubmitted(jobId: string, jobData: Record<string, unknown>): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 698:**
```typescript
broadcastJobAssigned(jobId: string, workerId: string, assignedAt: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 728:**
```typescript
broadcastJobProgress(jobId: string, workerId: string, progress: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 756:**
```typescript
broadcastJobFailed(jobId: string, error: string, workerId?: string, failedAt?: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/monitor-api-compatibility.test.ts`

**Issues found:** 7

**Line 16:**
```typescript
async findWorkerAttestation(jobId: string) {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 73:**
```typescript
async findWorkflowAttestations(workflowId: string) {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 169:**
```typescript
'workflow:failure:wf-456:*': [
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 170:**
```typescript
'workflow:failure:wf-456:permanent'
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 212:**
```typescript
'workflow:failure:wf-456:permanent': JSON.stringify({
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 330:**
```typescript
expect(mockRedis.keys).toHaveBeenCalledWith('workflow:failure:wf-456:*');
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 407:**
```typescript
expect(mockRedis.keys).toHaveBeenCalledWith('workflow:failure:wf-456:*');
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

### `apps/api/.workspace-packages/core/src/telemetry/connector-logger.ts`

**Issues found:** 7

**Line 101:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 112:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 122:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 132:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 143:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 169:**
```typescript
withJobContext(jobId: string, sessionId?: string): ConnectorLogger {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 177:**
```typescript
job_id: this.context.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/telemetry/message-bus.ts`

**Issues found:** 7

**Line 84:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 95:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 105:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 115:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 126:**
```typescript
job_id: jobData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 528:**
```typescript
withJobContext(jobId: string, sessionId?: string): MessageBus {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 536:**
```typescript
job_id: this.context.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/services/event-broadcaster.ts`

**Issues found:** 7

**Line 171:**
```typescript
subscribeClientToJob(clientId: string, jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 181:**
```typescript
unsubscribeClientFromJob(clientId: string, jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 278:**
```typescript
const jobId = this.getJobIdFromEvent(event);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 676:**
```typescript
broadcastJobSubmitted(jobId: string, jobData: Record<string, unknown>): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 698:**
```typescript
broadcastJobAssigned(jobId: string, workerId: string, assignedAt: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 728:**
```typescript
broadcastJobProgress(jobId: string, workerId: string, progress: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 756:**
```typescript
broadcastJobFailed(jobId: string, error: string, workerId?: string, failedAt?: number): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/monitor/src/store/index.ts`

**Issues found:** 7

**Line 117:**
```typescript
updateJob: (jobId: string, updates: Partial<Job>) => void;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 118:**
```typescript
removeJob: (jobId: string) => void;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 139:**
```typescript
cancelJob: (jobId: string) => void;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 157:**
```typescript
submitNextSimulationStep: (workflowId: string) => void;
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 158:**
```typescript
removeSimulationWorkflow: (workflowId: string) => void;
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 2100:**
```typescript
cancelJob: (jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 2240:**
```typescript
(jobId: string, updates: Partial<Job>) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/services/webhook-notification-service.ts`

**Issues found:** 6

**Line 453:**
```typescript
const jobId = (event as any).job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 498:**
```typescript
const workflowId = jobEvent.workflow_id as string;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 499:**
```typescript
const jobId = jobEvent.job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 719:**
```typescript
private async fetchWorkflowDetails(workflowId: string): Promise<any> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 863:**
```typescript
private async fetchWorkflowOutputsFromEmprops(workflowId: string): Promise<any[] | null> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 1071:**
```typescript
private shouldThrottleProgressWebhook(jobId: string): boolean {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/services/webhook-notification-service.ts`

**Issues found:** 6

**Line 453:**
```typescript
const jobId = (event as any).job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 498:**
```typescript
const workflowId = jobEvent.workflow_id as string;
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 499:**
```typescript
const jobId = jobEvent.job_id as string;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 719:**
```typescript
private async fetchWorkflowDetails(workflowId: string): Promise<any> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 863:**
```typescript
private async fetchWorkflowOutputsFromEmprops(workflowId: string): Promise<any[] | null> {
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 1071:**
```typescript
private shouldThrottleProgressWebhook(jobId: string): boolean {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/monitor/src/app/webhook-monitor/[webhookId]/page.tsx`

**Issues found:** 6

**Line 203:**
```typescript
if ('workflowId' in body) return body.workflowId as string;
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 205:**
```typescript
if ('jobId' in body) return body.jobId as string;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 212:**
```typescript
if ('workflowId' in data) return data.workflowId as string;
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 214:**
```typescript
if ('jobId' in data) return data.jobId as string;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 481:**
```typescript
const workflowId = extractWorkflowId(request);
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 522:**
```typescript
const workflowId = extractWorkflowId(request);
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

### `apps/worker/src/redis-direct-base-worker.ts`

**Issues found:** 5

**Line 1013:**
```typescript
private async completeJob(jobId: string, result: unknown): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1064:**
```typescript
private async failJob(jobId: string, error: string, canRetry = true, context?: { httpStatus?: number; timeout?: boolean }): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1150:**
```typescript
private async finishJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1201:**
```typescript
private handleJobTimeout(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1570:**
```typescript
public updateJobWebSocketActivity(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/mocks/error-case-cli.ts`

**Issues found:** 5

**Line 70:**
```typescript
parsed.jobId = value;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 96:**
```typescript
if (!args.service || !args.jobId || !args.error) {
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 107:**
```typescript
jobId: args.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 116:**
```typescript
console.log(`   Job ID: ${errorCase.jobId}`);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 145:**
```typescript
console.log(`   Job: ${errorCase.jobId}`);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/worker/src/connectors/simulation-websocket-connector.ts`

**Issues found:** 5

**Line 159:**
```typescript
return messageData.job_id || messageData.jobId || messageData.id;
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 237:**
```typescript
jobId: message.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 244:**
```typescript
'message.job_id': message.jobId || 'none',
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 359:**
```typescript
async queryJobStatus(jobId: string): Promise<ServiceJobStatus> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 416:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/telemetry-collector/src/__tests__/event-client-redis.integration.test.ts`

**Issues found:** 5

**Line 96:**
```typescript
expect(eventData.data.jobId).toBe('test-job-123');
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 98:**
```typescript
expect(eventData.jobId).toBe('test-job-123'); // Also at top level
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 173:**
```typescript
const jobId = 'test-job-12345';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 190:**
```typescript
expect(eventData.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 191:**
```typescript
expect(eventData.data.jobId).toBe(jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/monitor/src/components/JobForensics.tsx`

**Issues found:** 5

**Line 22:**
```typescript
function AttestationRecords({ jobId, workflowId }: { jobId: string; workflowId?: string }) {
```

- ⚠️  Function parameter 'jobId' → Check if should be 'stepId'
- ⚠️  Function parameter 'workflowId' → Check if should be 'jobId'
- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 733:**
```typescript
const retryJob = async (jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 780:**
```typescript
const resetJob = async (jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/workflow-telemetry.ts`

**Issues found:** 4

**Line 62:**
```typescript
workflowId: attributes.workflowId || this.generateTraceId(), // Use provided or generate
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 63:**
```typescript
jobId: attributes.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 106:**
```typescript
span.attributes['emp.workflow.id'] = context.workflowId;        // Overall workflow identifier
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 107:**
```typescript
if (context.jobId) span.attributes['emp.job.id'] = context.jobId;          // Individual step within workflow
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/core/src/connection-manager.ts`

**Issues found:** 4

**Line 324:**
```typescript
async notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 341:**
```typescript
async sendJobAssignment(workerId: string, jobId: string, jobData: unknown): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 354:**
```typescript
async sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 366:**
```typescript
async forwardJobCompletion(jobId: string, result: unknown): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/interfaces/connection-manager.ts`

**Issues found:** 4

**Line 51:**
```typescript
notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 52:**
```typescript
sendJobAssignment(workerId: string, jobId: string, jobData): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 53:**
```typescript
sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 54:**
```typescript
forwardJobCompletion(jobId: string, result): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/interfaces/job-broker.ts`

**Issues found:** 4

**Line 15:**
```typescript
getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null>;
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 22:**
```typescript
claimJob(jobId: string, workerId: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 23:**
```typescript
releaseJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 26:**
```typescript
getQueuePosition(jobId: string): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/job-health-monitor.ts`

**Issues found:** 4

**Line 60:**
```typescript
updateWebSocketActivity(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 71:**
```typescript
stopMonitoring(jobId: string): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 81:**
```typescript
callback: (jobId: string, job: Job, result: HealthCheckResult) => Promise<void>
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 178:**
```typescript
connector as { healthCheckJob: (jobId: string) => Promise<HealthCheckResult> }
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/mocks/base-progressive-mock.ts`

**Issues found:** 4

**Line 47:**
```typescript
const jobId = this.generateJobId();
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 73:**
```typescript
const jobId = this.extractJobIdFromUrl(uri);
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 187:**
```typescript
console.log(`   Job ID: ${errorCase.jobId}`);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 209:**
```typescript
public async recordNewErrorCase(jobId: string, endpoint: string, errorResponse: any, notes?: string) {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/failure-attestation.test.ts`

**Issues found:** 4

**Line 27:**
```typescript
if (key.startsWith('job:')) {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 183:**
```typescript
'job:perm-fail-job',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 204:**
```typescript
'job:retry-job',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 268:**
```typescript
'job:events',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/workflow-telemetry.ts`

**Issues found:** 4

**Line 62:**
```typescript
workflowId: attributes.workflowId || this.generateTraceId(), // Use provided or generate
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 63:**
```typescript
jobId: attributes.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 106:**
```typescript
span.attributes['emp.workflow.id'] = context.workflowId;        // Overall workflow identifier
```

- ⚠️  Property access '.workflowId' → Check if should be '.jobId'

**Line 107:**
```typescript
if (context.jobId) span.attributes['emp.job.id'] = context.jobId;          // Individual step within workflow
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/connection-manager.ts`

**Issues found:** 4

**Line 324:**
```typescript
async notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?): Promise<number> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 341:**
```typescript
async sendJobAssignment(workerId: string, jobId: string, jobData: unknown): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 354:**
```typescript
async sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 366:**
```typescript
async forwardJobCompletion(jobId: string, result: unknown): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/connection-manager.ts`

**Issues found:** 4

**Line 51:**
```typescript
notifyIdleWorkersOfJob(jobId: string, jobType: string, requirements?): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 52:**
```typescript
sendJobAssignment(workerId: string, jobId: string, jobData): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 53:**
```typescript
sendJobCancellation(workerId: string, jobId: string, reason: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 54:**
```typescript
forwardJobCompletion(jobId: string, result): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/interfaces/job-broker.ts`

**Issues found:** 4

**Line 15:**
```typescript
getWorkflowMetadata(workflowId: string): Promise<WorkflowMetadata | null>;
```

- ⚠️  Parameter 'workflowId:' → Check if should be 'jobId:'

**Line 22:**
```typescript
claimJob(jobId: string, workerId: string): Promise<boolean>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 23:**
```typescript
releaseJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 26:**
```typescript
getQueuePosition(jobId: string): Promise<number>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/enhanced-message-handler.ts`

**Issues found:** 3

**Line 220:**
```typescript
const jobId = await this.redisService.submitJob({
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 335:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 361:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `packages/core/src/message-handler.ts`

**Issues found:** 3

**Line 154:**
```typescript
const jobId = await this.redisService.submitJob({
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 321:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 593:**
```typescript
const jobId = message.job_id as string | undefined;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `packages/core/src/types/connector.ts`

**Issues found:** 3

**Line 34:**
```typescript
cancelJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 107:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

**Line 135:**
```typescript
export interface JobProgress {
```

- ⚠️  Interface 'JobProgress' → Should be 'StepProgress'

### `packages/core/src/types/job.ts`

**Issues found:** 3

**Line 5:**
```typescript
export interface Job {
```

- ⚠️  Interface 'Job' → Should be 'Step' - worker processing unit

**Line 76:**
```typescript
export interface JobProgress {
```

- ⚠️  Interface 'JobProgress' → Should be 'StepProgress'

**Line 88:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

### `apps/worker/src/connectors/base-connector.ts`

**Issues found:** 3

**Line 515:**
```typescript
jobLogger.jobStarted({ jobId: jobData.id || 'unknown' });
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 599:**
```typescript
const jobId = jobData.id || 'unknown';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 765:**
```typescript
abstract cancelJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/failure-classification.test.ts`

**Issues found:** 3

**Line 23:**
```typescript
if (key === 'job:test-job-123') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 198:**
```typescript
(call: any) => call[0].includes('workflow:failure:wf-456:permanent')
```

- ⚠️  Redis key prefix 'workflow:' → Check if should be 'job:' for user requests

**Line 229:**
```typescript
if (key === 'job:test-job-123') {
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/enhanced-message-handler.ts`

**Issues found:** 3

**Line 220:**
```typescript
const jobId = await this.redisService.submitJob({
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 335:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 361:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/message-handler.ts`

**Issues found:** 3

**Line 154:**
```typescript
const jobId = await this.redisService.submitJob({
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 321:**
```typescript
const jobId = message.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 593:**
```typescript
const jobId = message.job_id as string | undefined;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/api/.workspace-packages/core/src/types/connector.ts`

**Issues found:** 3

**Line 34:**
```typescript
cancelJob(jobId: string): Promise<void>;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 107:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

**Line 135:**
```typescript
export interface JobProgress {
```

- ⚠️  Interface 'JobProgress' → Should be 'StepProgress'

### `apps/api/.workspace-packages/core/src/types/job.ts`

**Issues found:** 3

**Line 5:**
```typescript
export interface Job {
```

- ⚠️  Interface 'Job' → Should be 'Step' - worker processing unit

**Line 76:**
```typescript
export interface JobProgress {
```

- ⚠️  Interface 'JobProgress' → Should be 'StepProgress'

**Line 88:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

### `packages/core/src/types/messages.ts`

**Issues found:** 2

**Line 88:**
```typescript
export interface Job {
```

- ⚠️  Interface 'Job' → Should be 'Step' - worker processing unit

**Line 767:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

### `packages/core/src/telemetry/event-client.ts`

**Issues found:** 2

**Line 83:**
```typescript
jobId: data.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 105:**
```typescript
async jobEvent(jobId: string, type: string, data: Record<string, any> = {}): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-base-connector.ts`

**Issues found:** 2

**Line 301:**
```typescript
protected initializeIntelligentLogging(jobId: string, progressCallback: ProgressCallback): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 1024:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/rest-async-connector.ts`

**Issues found:** 2

**Line 199:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 234:**
```typescript
response.jobId ||
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/worker/src/connectors/comfyui-websocket-connector.ts`

**Issues found:** 2

**Line 432:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 507:**
```typescript
private handleJobFailure(jobId: string, error: Error): void {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/__tests__/comprehensive-failure-attestation.test.ts`

**Issues found:** 2

**Line 83:**
```typescript
const jobId = 'multi-retry-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

**Line 198:**
```typescript
const jobId = 'audit-trail-job';
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/worker/src/__tests__/unit-retry-suffix.test.ts`

**Issues found:** 2

**Line 17:**
```typescript
function generateFilename(jobId: string, timestamp: number, hash: string, suffix: string, extension: string): string {
```

- ⚠️  Function parameter 'jobId' → Check if should be 'stepId'
- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/protocol/http-connector.ts`

**Issues found:** 2

**Line 416:**
```typescript
protected buildStatusUrl(jobId: string): string {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 713:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/telemetry-collector/src/event-processor.ts`

**Issues found:** 2

**Line 180:**
```typescript
if (event.jobId) context.push(`job:${event.jobId.slice(0, 8)}`);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 285:**
```typescript
...(event.jobId && { 'emp.job.id': event.jobId }),
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/telemetry-collector/src/redis-to-otlp-bridge.ts`

**Issues found:** 2

**Line 364:**
```typescript
if (data.jobId) attributes.push({ key: 'emp.job.id', value: { stringValue: data.jobId } });
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 381:**
```typescript
if (event.jobId) attributes.push({ key: 'emp.job.id', value: { stringValue: event.jobId } });
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/telemetry-collector/src/dash0-forwarder.ts`

**Issues found:** 2

**Line 178:**
```typescript
if (event.jobId) {
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 181:**
```typescript
value: { stringValue: event.jobId }
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/telemetry-collector/src/__tests__/format-conversion.test.ts`

**Issues found:** 2

**Line 240:**
```typescript
expect(logLine).toContain('job:job-shor'); // Truncated job ID
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 286:**
```typescript
expect(logLine).toContain('job:job-span'); // Truncated job ID
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/types/messages.ts`

**Issues found:** 2

**Line 88:**
```typescript
export interface Job {
```

- ⚠️  Interface 'Job' → Should be 'Step' - worker processing unit

**Line 767:**
```typescript
export interface JobResult {
```

- ⚠️  Interface 'JobResult' → Should be 'StepResult'

### `apps/api/.workspace-packages/core/src/telemetry/event-client.ts`

**Issues found:** 2

**Line 83:**
```typescript
jobId: data.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

**Line 105:**
```typescript
async jobEvent(jobId: string, type: string, data: Record<string, any> = {}): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/monitor/src/__tests__/attestation-system-integration.test.ts`

**Issues found:** 2

**Line 54:**
```typescript
const workflowId = '36ca3e85-1fb3-4386-8046-17b174d4c057'
```

- ⚠️  Variable 'workflowId' assignment → Check if should be 'jobId'

**Line 55:**
```typescript
const jobId = 'step-fec9064e-3487-49bb-a87a-c1809c24aa54'
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/monitor/src/app/api/workflow-debug/[workflowId]/route.ts`

**Issues found:** 2

**Line 83:**
```typescript
query: `KEYS "job:*"\nThen for each key: HGETALL <key>\nFilter where workflow_id = '${workflowId}'`,
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

**Line 87:**
```typescript
const keys = await redis.keys('job:*');
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/monitor/src/app/api/jobs/[jobId]/retry/route.ts`

**Issues found:** 2

**Line 8:**
```typescript
const jobId = params.jobId;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'
- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/monitor/src/app/page.tsx`

**Issues found:** 2

**Line 63:**
```typescript
const handleSyncJob = (jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

**Line 67:**
```typescript
const handleCancelJob = (jobId: string) => {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/redis-functions/installer.ts`

**Issues found:** 1

**Line 258:**
```typescript
logger.info(' Function test passed - matched job:', parsed.jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/core/src/utils/redis-operations.ts`

**Issues found:** 1

**Line 122:**
```typescript
static async getJob(redis: Redis, jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `packages/core/src/log-interpretation/enhanced-progress-callback.ts`

**Issues found:** 1

**Line 239:**
```typescript
job_id: this.context.jobId!,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `packages/database/src/operations.ts`

**Issues found:** 1

**Line 65:**
```typescript
static async findByJobId(jobId: string) {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/mocks/error-case-recorder.ts`

**Issues found:** 1

**Line 115:**
```typescript
jobId: logData.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/worker/src/connectors/simulation-http-connector.ts`

**Issues found:** 1

**Line 322:**
```typescript
async queryJobStatus(jobId: string): Promise<ServiceJobStatus> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/mock-connector.ts`

**Issues found:** 1

**Line 146:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/rest-sync-connector.ts`

**Issues found:** 1

**Line 264:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/comfyui-health-example.ts`

**Issues found:** 1

**Line 228:**
```typescript
async cancelJob(jobId: string): Promise<void> {}
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/simulation-connector.ts`

**Issues found:** 1

**Line 198:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/streaming-mixin.ts`

**Issues found:** 1

**Line 271:**
```typescript
job_id: state.jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/worker/src/connectors/limited-service-example.ts`

**Issues found:** 1

**Line 135:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-responses-connector.ts`

**Issues found:** 1

**Line 467:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/asset-saver.ts`

**Issues found:** 1

**Line 28:**
```typescript
'asset.jobId': jobId,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/worker/src/connectors/openai-connector.ts`

**Issues found:** 1

**Line 271:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/openai-text-connector.ts`

**Issues found:** 1

**Line 332:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/connectors/a1111-websocket-connector.ts`

**Issues found:** 1

**Line 285:**
```typescript
async cancelJob(jobId: string): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/examples/logging-integration-example.ts`

**Issues found:** 1

**Line 20:**
```typescript
async processJob(jobId: string, jobData: any): Promise<void> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/worker/src/telemetry/worker-tracer.ts`

**Issues found:** 1

**Line 113:**
```typescript
async traceJobProcessing<T>(jobId: string, jobType: string, operation: () => Promise<T>): Promise<T> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/src/test-workflow-telemetry.ts`

**Issues found:** 1

**Line 82:**
```typescript
'redis.key': 'job:job-test-12345',
```

- ⚠️  Redis key prefix 'job:' → Check if should be 'step:' for worker processing units

### `apps/api/.workspace-packages/core/src/redis-functions/installer.ts`

**Issues found:** 1

**Line 258:**
```typescript
logger.info(' Function test passed - matched job:', parsed.jobId);
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/api/.workspace-packages/core/src/utils/redis-operations.ts`

**Issues found:** 1

**Line 122:**
```typescript
static async getJob(redis: Redis, jobId: string): Promise<Job | null> {
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/api/.workspace-packages/core/src/log-interpretation/enhanced-progress-callback.ts`

**Issues found:** 1

**Line 239:**
```typescript
job_id: this.context.jobId!,
```

- ⚠️  Property access '.jobId' → Check if should be '.stepId'

### `apps/monitor/src/types/forensics.ts`

**Issues found:** 1

**Line 297:**
```typescript
onJobChange?: (jobId: string) => void;
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

### `apps/monitor/src/types/job.ts`

**Issues found:** 1

**Line 23:**
```typescript
export interface Job {
```

- ⚠️  Interface 'Job' → Should be 'Step' - worker processing unit

### `apps/monitor/src/app/api/workflows/[workflowId]/all-attestations/route.ts`

**Issues found:** 1

**Line 47:**
```typescript
const jobId = parsed.job_completion_data.job_id;
```

- ⚠️  Variable 'jobId' assignment → Check if should be 'stepId'

### `apps/monitor/src/components/SimpleWorkerCard.tsx`

**Issues found:** 1

**Line 189:**
```typescript
{worker.current_jobs.map((jobId: string) => (
```

- ⚠️  Parameter 'jobId:' → Check if should be 'stepId:'

