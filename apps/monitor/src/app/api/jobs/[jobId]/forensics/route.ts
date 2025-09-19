import { NextRequest, NextResponse } from 'next/server';
import { JobForensicsService } from '@/services/jobForensics';

const REDIS_URL = process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL || process.env.HUB_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

// Helper to convert BigInt to string for JSON serialization
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId) {
    return NextResponse.json(
      { error: 'Job ID is required' },
      { status: 400 }
    );
  }

  const forensicsService = new JobForensicsService(REDIS_URL);

  try {
    const forensicsData = await forensicsService.getJobForensics(jobId, {
      includeHistory: true,
      includeCrossSystemRefs: true,
      includeRecoverySuggestions: true,
      maxSimilarFailures: 10
    });

    if (!forensicsData) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    const serializedData = serializeBigInt({
      success: true,
      ...forensicsData,
      timestamp: new Date().toISOString()
    });

    return NextResponse.json(serializedData);

  } catch (error) {
    console.error(`Error getting job forensics for ${jobId}:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false
      },
      { status: 500 }
    );
  } finally {
    await forensicsService.disconnect();
  }
}