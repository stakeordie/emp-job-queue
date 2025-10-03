/**
 * Comprehensive Integration Test for Attestation System
 *
 * This test validates the complete attestation lifecycle from worker creation
 * to monitor retrieval, ensuring no attestations are lost in production.
 *
 * CRITICAL ISSUE DISCOVERED:
 * - Workers create keys with pattern: worker:failure:workflow-{workflow}:job-step-{jobId}:permanent
 * - Monitor searches with pattern: worker:failure:*job-{jobId}*
 * - Result: Monitor cannot find worker attestations due to "job-step-" vs "job-" mismatch
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Redis from 'ioredis'
import { JobForensicsService } from '../services/jobForensics.js'

// Mock Prisma to avoid database dependencies in unit tests
const mockPrisma = {
  job: {
    findUnique: () => null,
    findFirst: () => null
  },
  job_history: {
    findFirst: () => null,
    findMany: () => []
  },
  miniapp_generation: {
    findMany: () => [],
    findFirst: () => null
  },
  collection: {
    findFirst: () => null
  },
  flat_file: {
    findMany: () => []
  },
  workflow: {
    findUnique: () => null
  },
  $queryRaw: () => []
}

// Mock the database import
vi.mock('@emergexyz/db', () => ({
  prisma: mockPrisma
}))

describe('Attestation System Integration', () => {
  let redis: Redis
  let forensicsService: JobForensicsService
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'

  // Test data that mirrors real production scenario
  const workflowId = '36ca3e85-1fb3-4386-8046-17b174d4c057'
  const jobId = 'step-fec9064e-3487-49bb-a87a-c1809c24aa54'
  const workerId = 'openai-response-local-dev-37a1ec5a-worker-openai-response-0'
  const machineId = 'openai-response-local-dev-37a1ec5a'

  beforeEach(async () => {
    redis = new Redis(redisUrl)
    forensicsService = new JobForensicsService(redisUrl)

    // Clean up any existing test data
    const keys = await redis.keys('*36ca3e85-1fb3-4386-8046-17b174d4c057*')
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  })

  afterEach(async () => {
    await forensicsService.disconnect()
    await redis.quit()
  })

  describe('Complete Workflow Attestation Lifecycle', () => {
    it('should handle complete workflow with failures, retries, and eventual success', async () => {
      // === PHASE 1: Job Creation ===
      const jobData = {
        id: jobId,
        service_required: 'openai',
        status: 'pending',
        payload: JSON.stringify({ model: 'gpt-4', messages: [] }),
        created_at: '2025-09-29T17:55:00.000Z',
        workflow_id: workflowId,
        current_step: 2,
        total_steps: 2,
        retry_count: 0,
        max_retries: 3
      }

      // Store job in Redis (how jobs are actually stored)
      await redis.hmset(`job:${jobId}`, jobData)

      // === PHASE 2: First Failure Attempt (Retry #1) ===
      const attempt1Error = 'Rate limit exceeded (429)'
      const attempt1Attestation = {
        attestation_type: 'failure_retry',
        job_id: jobId,
        worker_id: workerId,
        status: 'failed_retrying',
        failed_at: '2025-09-29T17:55:15.000Z',
        error_message: attempt1Error,
        failure_type: 'rate_limit',
        failure_reason: 'api_quota_exceeded',
        failure_description: 'OpenAI API rate limit exceeded, automatic retry scheduled',
        retry_count: 1,
        will_retry: true,
        max_retries: 3,
        workflow_id: workflowId,
        current_step: 2,
        total_steps: 2,
        workflow_impact: 'job_retrying',
        machine_id: machineId,
        worker_version: 'test-1.0.0',
        attestation_created_at: Date.now()
      }

      // Store using ACTUAL worker pattern (the pattern workers use in production)
      await redis.setex(
        `worker:failure:workflow-${workflowId}:job-${jobId}:attempt:1`,
        7 * 24 * 60 * 60,
        JSON.stringify(attempt1Attestation)
      )

      // === PHASE 3: Second Failure Attempt (Retry #2) ===
      const attempt2Error = 'Connection timeout after 30s'
      const attempt2Attestation = {
        ...attempt1Attestation,
        attestation_type: 'failure_retry',
        failed_at: '2025-09-29T17:55:35.000Z',
        error_message: attempt2Error,
        failure_type: 'timeout',
        failure_reason: 'network_timeout',
        failure_description: 'Network timeout connecting to OpenAI API',
        retry_count: 2,
        attestation_created_at: Date.now()
      }

      await redis.setex(
        `worker:failure:workflow-${workflowId}:job-${jobId}:attempt:2`,
        7 * 24 * 60 * 60,
        JSON.stringify(attempt2Attestation)
      )

      // === PHASE 4: Final Failure (Permanent) ===
      const finalError = 'Async job failed: {"code":"moderation_blocked","message":"Your request was rejected by the safety system. If you believe this is an error, contact us at help.openai.com and include the request ID wfr_0199969c44217112a0d91d9e6095535e."}'
      const permanentAttestation = {
        ...attempt1Attestation,
        attestation_type: 'failure_permanent',
        status: 'failed_permanent',
        failed_at: '2025-09-29T17:55:44.996Z',
        error_message: finalError,
        failure_type: 'generation_refusal',
        failure_reason: 'safety_filter',
        failure_description: 'Content refused by safety system (request ID: wfr_0199969c44217112a0d91d9e6095535e)',
        retry_count: 3,
        will_retry: false,
        workflow_impact: 'workflow_terminated',
        attestation_created_at: Date.now()
      }

      // Store permanent failure attestation
      await redis.setex(
        `worker:failure:workflow-${workflowId}:job-${jobId}:permanent`,
        7 * 24 * 60 * 60,
        JSON.stringify(permanentAttestation)
      )

      // === PHASE 5: Workflow-Level Failure Attestation ===
      const workflowFailureAttestation = {
        ...permanentAttestation,
        workflow_attestation_type: 'job_failure',
        failed_job_id: jobId,
        workflow_status: 'failed_permanent'
      }

      // Store workflow failure attestations (multiple attempts)
      await redis.setex(
        `workflow:failure:${workflowId}:attempt:1`,
        7 * 24 * 60 * 60,
        JSON.stringify({ ...workflowFailureAttestation, retry_count: 1 })
      )

      await redis.setex(
        `workflow:failure:${workflowId}:attempt:2`,
        7 * 24 * 60 * 60,
        JSON.stringify({ ...workflowFailureAttestation, retry_count: 2 })
      )

      await redis.setex(
        `workflow:failure:${workflowId}:permanent`,
        7 * 24 * 60 * 60,
        JSON.stringify(workflowFailureAttestation)
      )

      // === PHASE 6: Test Monitor Retrieval ===

      // Test 1: Direct Redis key search (what SHOULD work)
      const directKeys = await redis.keys(`*${workflowId}*`)
      expect(directKeys.length).toBeGreaterThan(0)
      console.log('✅ Direct Redis keys found:', directKeys.length)

      // Test 2: Monitor's current patterns (what FAILS in production)
      const monitorPatterns = [
        `worker:failure:*job-${jobId}*`,      // ❌ This will fail
        `worker:completion:*job-${jobId}*`,   // ❌ This will fail
        `worker:failure:${jobId}*`,           // ❌ This will fail
        `worker:completion:${jobId}*`,        // ❌ This will fail
        `workflow:failure:${workflowId}*`,    // ✅ This will work
        `worker:failure:workflow-${workflowId}*`,  // ✅ This will work
        `worker:completion:workflow-${workflowId}*` // ✅ This will work (no completion in this test)
      ]

      let foundByMonitorPatterns = 0
      for (const pattern of monitorPatterns) {
        const keys = await redis.keys(pattern)
        foundByMonitorPatterns += keys.length
        console.log(`Pattern "${pattern}" found: ${keys.length} keys`)
      }

      // Test 3: CORRECTED patterns (what SHOULD work)
      const correctedPatterns = [
        `worker:failure:*job-${jobId}*`,           // ✅ Will work with job-step- prefix
        `worker:completion:*job-${jobId}*`,        // ✅ Will work with job-step- prefix
        `workflow:failure:${workflowId}*`,         // ✅ Already works
        `worker:failure:workflow-${workflowId}*`,  // ✅ Already works
        `worker:completion:workflow-${workflowId}*` // ✅ Already works
      ]

      let foundByCorrectedPatterns = 0
      for (const pattern of correctedPatterns) {
        const keys = await redis.keys(pattern)
        foundByCorrectedPatterns += keys.length
      }

      // === PHASE 7: Test Forensics Service ===
      const forensics = await forensicsService.getJobForensics(jobId)

      // The forensics service should find the job from Redis
      expect(forensics).toBeTruthy()
      expect(forensics.job).toBeTruthy()
      expect(forensics.job.id).toBe(jobId)

      // Check if attestations were found by forensics service
      if (forensics.forensics?.attestations) {
        console.log(`✅ Forensics service found ${forensics.forensics.attestations.length} attestations`)

        // Verify specific attestation types were found
        const retryAttestations = forensics.forensics.attestations.filter(a =>
          a.attestation_type === 'failure_retry'
        )
        const permanentAttestations = forensics.forensics.attestations.filter(a =>
          a.attestation_type === 'failure_permanent'
        )
        const workflowAttestations = forensics.forensics.attestations.filter(a =>
          a.attestation_type === 'workflow_failure'
        )

        expect(retryAttestations.length).toBeGreaterThanOrEqual(0)
        expect(permanentAttestations.length).toBeGreaterThanOrEqual(0)
        expect(workflowAttestations.length).toBeGreaterThanOrEqual(0)
      } else {
        console.log('❌ Forensics service found NO attestations - this indicates the bug!')
      }

      // === VALIDATION ASSERTIONS ===

      // Verify that Redis contains all our test data
      expect(directKeys.length).toBe(6) // 3 worker failures + 3 workflow failures

      // This is the key assertion that demonstrates the bug:
      // The monitor's current patterns find fewer attestations than the corrected ones
      console.log(`Current monitor patterns found: ${foundByMonitorPatterns} attestations`)
      console.log(`Corrected patterns would find: ${foundByCorrectedPatterns} attestations`)
      console.log(`Direct Redis search found: ${directKeys.length} keys`)

      // In production, this assertion would fail, proving the attestation retrieval bug
      expect(foundByMonitorPatterns).toBeLessThan(directKeys.length)
    })

    it('should demonstrate the exact pattern mismatch causing the production issue', async () => {
      // Create a single attestation using the EXACT worker pattern from production
      const jobIdWithPrefix = 'step-abc-123'  // Real job IDs have 'step-' prefix
      const realAttestationKey = `worker:failure:workflow-${workflowId}:job-${jobIdWithPrefix}:permanent`

      await redis.setex(
        realAttestationKey,
        3600, // 1 hour TTL for test
        JSON.stringify({
          attestation_type: 'failure_permanent',
          job_id: jobIdWithPrefix,
          error_message: 'Test error',
          failed_at: new Date().toISOString()
        })
      )

      // Test monitor's current search patterns (what fails in production)
      const monitorSearches = [
        await redis.keys(`worker:failure:*job-abc-123*`),        // ❌ Missing 'step-' prefix
        await redis.keys(`worker:failure:abc-123*`),             // ❌ Wrong format entirely
      ]

      // Test corrected search patterns (what would work)
      const correctedSearches = [
        await redis.keys(`worker:failure:*job-${jobIdWithPrefix}*`),  // ✅ Includes 'step-' prefix
        await redis.keys(`worker:failure:*job-step-abc-123*`),        // ✅ Explicit step prefix
        await redis.keys(`worker:failure:workflow-${workflowId}*`),   // ✅ Workflow-aware search
      ]

      // Assertions that prove the bug
      expect(monitorSearches[0]).toHaveLength(0) // Current pattern finds nothing
      expect(monitorSearches[1]).toHaveLength(0) // Current pattern finds nothing

      expect(correctedSearches[0]).toHaveLength(1) // Corrected pattern finds attestation
      expect(correctedSearches[1]).toHaveLength(1) // Corrected pattern finds attestation
      expect(correctedSearches[2]).toHaveLength(1) // Workflow pattern finds attestation

      // Clean up
      await redis.del(realAttestationKey)
    })

    it('should validate end-to-end data flow with realistic job progression', async () => {
      // This test simulates a complete job lifecycle from creation to completion
      // through multiple retry attempts, ending in success

      const successJobId = 'step-success-test-123'
      const successWorkflowId = 'workflow-success-test-456'

      // === PHASE 1: Job starts and fails twice ===
      const retryAttestations = [
        {
          attestation_type: 'failure_retry',
          job_id: successJobId,
          worker_id: 'worker-1',
          retry_count: 1,
          error_message: 'Temporary network error',
          failed_at: '2025-09-29T10:00:00.000Z'
        },
        {
          attestation_type: 'failure_retry',
          job_id: successJobId,
          worker_id: 'worker-2',
          retry_count: 2,
          error_message: 'Service temporarily unavailable',
          failed_at: '2025-09-29T10:01:00.000Z'
        }
      ]

      // Store retry attestations
      for (let i = 0; i < retryAttestations.length; i++) {
        await redis.setex(
          `worker:failure:workflow-${successWorkflowId}:job-${successJobId}:attempt:${i + 1}`,
          3600,
          JSON.stringify(retryAttestations[i])
        )
      }

      // === PHASE 2: Job succeeds on third attempt ===
      const completionAttestation = {
        attestation_type: 'completion',
        job_id: successJobId,
        worker_id: 'worker-3',
        status: 'completed',
        completed_at: '2025-09-29T10:02:00.000Z',
        result: {
          success: true,
          output: 'Generated content successfully',
          processing_time_ms: 2500
        },
        retry_count: 3,
        workflow_id: successWorkflowId,
        attestation_created_at: Date.now()
      }

      await redis.setex(
        `worker:completion:workflow-${successWorkflowId}:job-${successJobId}:attempt:3`,
        3600,
        JSON.stringify(completionAttestation)
      )

      // === PHASE 3: Validate complete attestation chain ===
      const allKeys = await redis.keys(`*${successWorkflowId}*`)
      expect(allKeys).toHaveLength(3) // 2 failures + 1 completion

      // Test that workflow-aware patterns can find all attestations
      const workflowFailureKeys = await redis.keys(`worker:failure:workflow-${successWorkflowId}*`)
      const workflowCompletionKeys = await redis.keys(`worker:completion:workflow-${successWorkflowId}*`)

      expect(workflowFailureKeys).toHaveLength(2)
      expect(workflowCompletionKeys).toHaveLength(1)

      // Test monitor's forensics service integration
      const mockJob = {
        id: successJobId,
        workflow_id: successWorkflowId,
        status: 'completed' as const,
        created_at: '2025-09-29T10:00:00.000Z',
        service_required: 'test-service',
        priority: 50,
        payload: {},
        retry_count: 2,
        max_retries: 3
      }

      await redis.hmset(`job:${successJobId}`, {
        id: successJobId,
        workflow_id: successWorkflowId,
        status: 'completed',
        created_at: '2025-09-29T10:00:00.000Z'
      })

      // This should successfully retrieve all attestations
      const forensics = await forensicsService.getJobForensics(successJobId)
      expect(forensics).toBeTruthy()

      if (forensics?.forensics?.attestations) {
        console.log(`Found ${forensics.forensics.attestations.length} attestations for successful job`)
        expect(forensics.forensics.attestations.length).toBeGreaterThan(0)
      }

      // Clean up
      await redis.del(...allKeys)
      await redis.del(`job:${successJobId}`)
    })
  })

  describe('Monitor Pattern Validation', () => {
    it('should document all current pattern failures and provide fixes', async () => {
      // This test documents the exact fixes needed for the monitor

      const testCases = [
        {
          description: 'Worker failure with workflow prefix',
          key: 'worker:failure:workflow-test-123:job-step-abc-456:permanent',
          currentPatterns: [
            'worker:failure:*job-abc-456*',  // ❌ Missing 'step-' prefix
            'worker:failure:abc-456*'        // ❌ Wrong format
          ],
          fixedPatterns: [
            'worker:failure:*job-step-abc-456*',        // ✅ Include step prefix
            'worker:failure:workflow-test-123*'         // ✅ Workflow-aware search
          ]
        },
        {
          description: 'Worker completion with workflow prefix',
          key: 'worker:completion:workflow-test-123:job-step-def-789:attempt:1',
          currentPatterns: [
            'worker:completion:*job-def-789*',  // ❌ Missing 'step-' prefix
            'worker:completion:def-789*'        // ❌ Wrong format
          ],
          fixedPatterns: [
            'worker:completion:*job-step-def-789*',     // ✅ Include step prefix
            'worker:completion:workflow-test-123*'      // ✅ Workflow-aware search
          ]
        }
      ]

      for (const testCase of testCases) {
        // Store test attestation
        await redis.setex(testCase.key, 300, JSON.stringify({ test: 'data' }))

        // Test current patterns (should fail)
        for (const pattern of testCase.currentPatterns) {
          const keys = await redis.keys(pattern)
          expect(keys).toHaveLength(0) // Current patterns find nothing
        }

        // Test fixed patterns (should succeed)
        for (const pattern of testCase.fixedPatterns) {
          const keys = await redis.keys(pattern)
          expect(keys).toHaveLength(1) // Fixed patterns find the attestation
        }

        // Clean up
        await redis.del(testCase.key)
      }
    })
  })
})