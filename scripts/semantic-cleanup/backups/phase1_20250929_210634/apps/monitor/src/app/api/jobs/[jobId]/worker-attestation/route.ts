import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

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

    // Get worker attestations - search both old and new key patterns
    // Try new workflow-aware patterns first, then fall back to old patterns

    let attestationData = null;
    let foundKey = '';

    // Search patterns to try (new workflow-aware first, then old patterns)
    const searchPatterns = [
      // New workflow-aware patterns
      `worker:completion:workflow-*:job-${jobId}`,
      `worker:completion:workflow-*:job-${jobId}:attempt:*`,
      `worker:completion:job-${jobId}`,
      `worker:completion:job-${jobId}:attempt:*`,
      `worker:failure:workflow-*:job-${jobId}:*`,
      `worker:failure:job-${jobId}:*`,
      // Old patterns for backwards compatibility
      `worker:completion:${jobId}`,
      `worker:completion:${jobId}:attempt:*`,
      `worker:failure:${jobId}:*`
    ];

    for (const pattern of searchPatterns) {
      if (attestationData) break; // Found one, stop searching

      if (pattern.includes('*')) {
        // Pattern search
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          // Sort to get the most relevant key
          keys.sort((a, b) => {
            // Prioritize permanent failures over attempts
            if (a.endsWith(':permanent') && !b.endsWith(':permanent')) return -1;
            if (b.endsWith(':permanent') && !a.endsWith(':permanent')) return 1;

            // Then sort by attempt number descending
            const attemptA = parseInt(a.split(':').pop() || '0');
            const attemptB = parseInt(b.split(':').pop() || '0');
            return attemptB - attemptA;
          });

          foundKey = keys[0];
          attestationData = await redis.get(foundKey);
        }
      } else {
        // Direct key lookup
        attestationData = await redis.get(pattern);
        if (attestationData) {
          foundKey = pattern;
        }
      }
    }

    await redis.disconnect();

    if (!attestationData) {
      return NextResponse.json({
        success: false,
        message: 'No worker attestation found for this job (checked both completion and failure patterns)'
      });
    }

    const attestation = JSON.parse(attestationData);

    return NextResponse.json({
      success: true,
      attestation: attestation,
      found_at: foundKey,
      attestation_type: foundKey.includes('failure') ? 'failure' : 'completion',
      retrieved_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching worker attestation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch worker attestation' },
      { status: 500 }
    );
  }
}