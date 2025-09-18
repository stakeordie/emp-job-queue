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

    // Get worker completion attestation
    const attestationKey = `worker:completion:${jobId}`;
    const attestationData = await redis.get(attestationKey);

    await redis.disconnect();

    if (!attestationData) {
      return NextResponse.json({
        success: false,
        message: 'No worker attestation found for this job'
      });
    }

    const attestation = JSON.parse(attestationData);

    return NextResponse.json({
      success: true,
      attestation: attestation,
      found_at: attestationKey,
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