import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  try {
    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Reset the job status directly in the database
    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        started_at: null,
        completed_at: null,
        error_message: null,
        progress: 0
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Job has been reset to pending state and can now be retried.',
      data: updatedJob
    });

  } catch (error) {
    console.error('Error resetting job:', error);

    // Check if it's a Prisma "record not found" error
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error while resetting job' },
      { status: 500 }
    );
  }
}