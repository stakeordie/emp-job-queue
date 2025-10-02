import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;

  try {
    // Connect to Redis
    const redisUrl = process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL;
    if (!redisUrl) {
      return NextResponse.json(
        { success: false, error: 'Redis URL not configured' },
        { status: 500 }
      );
    }

    const redis = new Redis(redisUrl);

    // Get API workflow attestations (including retry attempts)
    const apiAttestationPattern = `api:workflow:completion:${workflowId}*`;
    const apiAttestationKeys = await redis.keys(apiAttestationPattern);

    let apiAttestations = [];
    let workerAttestations = [];

    // Parse all API attestations (base + retry attempts)
    for (const key of apiAttestationKeys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          const attemptMatch = key.match(/:attempt-(\d+)$/);
          const attemptNumber = attemptMatch ? parseInt(attemptMatch[1]) : 0;

          apiAttestations.push({
            ...parsed,
            key,
            attempt_number: attemptNumber,
            is_retry: attemptNumber > 0
          });

          // Extract job IDs from API attestation to find worker attestations
          if (parsed.job_completion_data?.job_id) {
            // Single job workflow
            const jobId = parsed.job_completion_data.job_id;
            const workerKey = `worker:completion:${jobId}`;
            let workerData = await redis.get(workerKey);
            let foundKey = workerKey;

            // If no basic completion attestation, search for completion attempts
            if (!workerData) {
              const completionKeys = await redis.keys(`worker:completion:${jobId}:attempt:*`);
              if (completionKeys.length > 0) {
                // Sort by attempt number descending (latest first)
                completionKeys.sort((a, b) => {
                  const attemptA = parseInt(a.split(':').pop() || '0');
                  const attemptB = parseInt(b.split(':').pop() || '0');
                  return attemptB - attemptA;
                });
                foundKey = completionKeys[0];
                workerData = await redis.get(foundKey);
              }
            }

            // If no completion attestation, look for failure attestations
            if (!workerData) {
              const failureKeys = await redis.keys(`worker:failure:${jobId}:*`);
              if (failureKeys.length > 0) {
                // Sort to prioritize permanent failures over attempts, then by attempt number
                failureKeys.sort((a, b) => {
                  // Check if either is permanent
                  if (a.endsWith(':permanent')) return -1;
                  if (b.endsWith(':permanent')) return 1;

                  // Both are attempts, sort by attempt number descending
                  const attemptA = parseInt(a.split(':').pop() || '0');
                  const attemptB = parseInt(b.split(':').pop() || '0');
                  return attemptB - attemptA; // Descending order (latest first)
                });
                foundKey = failureKeys[0];
                workerData = await redis.get(foundKey);
              }
            }

            if (workerData) {
              const exists = workerAttestations.find(w => w.job_id === jobId);
              if (!exists) {
                workerAttestations.push({
                  ...JSON.parse(workerData),
                  key: foundKey,
                  attestation_type: foundKey.includes('failure') ? 'failure' : 'completion'
                });
              }
            }
          }
        } catch (e) {
          console.error(`Failed to parse API attestation ${key}:`, e);
        }
      }
    }

    // 🚀 EFFICIENT: Search directly for workflow-specific attestations using new key structure
    const workflowCompletionKeys = await redis.keys(`worker:completion:workflow-${workflowId}:*`);
    const workflowFailureKeys = await redis.keys(`worker:failure:workflow-${workflowId}:*`);

    // 🚨 Also search for workflow-level failure attestations (created by API server)
    const workflowLevelFailureKeys = await redis.keys(`workflow:attestation:failure:${workflowId}*`);

    // Combine all workflow-specific keys - NO MORE FILTERING NEEDED!
    const allWorkflowKeys = [...workflowCompletionKeys, ...workflowFailureKeys];

    // Process each workflow-specific attestation (all are guaranteed to match this workflow)
    for (const key of allWorkflowKeys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          // Check if we already have this one
          const exists = workerAttestations.find(w => w.job_id === parsed.job_id);
          if (!exists) {
            workerAttestations.push({
              ...parsed,
              key,
              attestation_type: key.includes('failure') ? 'failure' : 'completion'
            });
          }
        } catch (e) {
          console.error(`Failed to parse workflow attestation ${key}:`, e);
        }
      }
    }

    // 🔄 BACKWARDS COMPATIBILITY: Still search old patterns for existing data
    const allWorkerCompletionKeys = await redis.keys('worker:completion:step-*');
    const allWorkerFailureKeys = await redis.keys('worker:failure:step-*');
    const allOldWorkerKeys = [...allWorkerCompletionKeys, ...allWorkerFailureKeys];

    // Check each old-pattern attestation for matching workflow_id (less efficient but needed for backwards compatibility)
    for (const key of allOldWorkerKeys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.workflow_id === workflowId) {
            // Check if we already have this one
            const exists = workerAttestations.find(w => w.job_id === parsed.job_id);
            if (!exists) {
              workerAttestations.push({
                ...parsed,
                key,
                attestation_type: key.includes('failure') ? 'failure' : 'completion'
              });
            }
          }
        } catch (e) {
          console.error(`Failed to parse old attestation ${key}:`, e);
        }
      }
    }

    // 🚨 NEW: Process workflow-level failure attestations
    for (const key of workflowLevelFailureKeys) {
      const data = await redis.get(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          // Check if we already have this job in worker attestations
          const exists = workerAttestations.find(w => w.job_id === parsed.job_id);
          if (!exists) {
            workerAttestations.push({
              ...parsed,
              key,
              attestation_type: 'workflow_failure'
            });
          }
        } catch (e) {
          console.error(`Failed to parse workflow failure attestation ${key}:`, e);
        }
      }
    }

    // Sort worker attestations by step number if available
    workerAttestations.sort((a, b) => {
      const stepA = parseInt(a.current_step || '0');
      const stepB = parseInt(b.current_step || '0');
      return stepA - stepB;
    });

    // Sort API attestations by attempt number
    apiAttestations.sort((a, b) => a.attempt_number - b.attempt_number);

    await redis.disconnect();

    return NextResponse.json({
      success: true,
      workflow_id: workflowId,
      api_attestations: apiAttestations,
      api_attestation_count: apiAttestations.length,
      worker_attestations: workerAttestations,
      worker_count: workerAttestations.length,
      retry_attempts: apiAttestations.filter(a => a.is_retry).length,
      retrieved_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching attestations:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch attestations' },
      { status: 500 }
    );
  }
}