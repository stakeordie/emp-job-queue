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

    // Get API workflow completion attestation
    const attestationKey = `api:workflow:completion:${workflowId}`;
    const attestationData = await redis.get(attestationKey);

    await redis.disconnect();

    if (!attestationData) {
      return NextResponse.json({
        success: false,
        message: 'No API workflow attestation found for this workflow'
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
    console.error('Error fetching API workflow attestation:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch API workflow attestation' },
      { status: 500 }
    );
  }
}