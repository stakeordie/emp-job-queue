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
            const workerKey = `worker:completion:${parsed.job_completion_data.job_id}`;
            const workerData = await redis.get(workerKey);
            if (workerData) {
              const exists = workerAttestations.find(w => w.job_id === parsed.job_completion_data.job_id);
              if (!exists) {
                workerAttestations.push({
                  ...JSON.parse(workerData),
                  key: workerKey
                });
              }
            }
          }
        } catch (e) {
          console.error(`Failed to parse API attestation ${key}:`, e);
        }
      }
    }

    // Also search for any worker attestations that have this workflow_id
    // This handles multi-step workflows
    const allWorkerKeys = await redis.keys('worker:completion:step-*');

    // Check each worker attestation for matching workflow_id
    for (const key of allWorkerKeys) {
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
                key
              });
            }
          }
        } catch (e) {
          console.error(`Failed to parse attestation ${key}:`, e);
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