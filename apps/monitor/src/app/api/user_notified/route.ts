import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@emergexyz/db';

const EXPECTED_AUTH_TOKEN = '3u8sdj5389fj3kljsf90u';

// Endpoint to mark a user as notified for a workflow
export async function POST(request: NextRequest) {
  try {
    // Check authorization
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== EXPECTED_AUTH_TOKEN) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { workflow_id, miniapp_user_id } = body;

    if (!workflow_id || !miniapp_user_id) {
      return NextResponse.json(
        { error: 'workflow_id and miniapp_user_id are required' },
        { status: 400 }
      );
    }

    console.log('📧 User notification received:', { workflow_id, miniapp_user_id });

    // Find the job
    const job = await prisma.job.findFirst({
      where: {
        OR: [
          { id: workflow_id },
          { workflow_output: { path: ['workflow_id'], equals: workflow_id } }
        ]
      }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Verify the miniapp user exists
    const miniappUser = await prisma.miniapp_user.findUnique({
      where: { id: miniapp_user_id }
    });

    if (!miniappUser) {
      return NextResponse.json(
        { error: 'Miniapp user not found' },
        { status: 404 }
      );
    }

    // Find the generation record to update
    const generation = await prisma.miniapp_generation.findFirst({
      where: {
        user_id: miniapp_user_id,
        job_id: job.id
      }
    });

    if (generation) {
      // Update generation with notification timestamp
      await prisma.miniapp_generation.update({
        where: { id: generation.id },
        data: {
          output_data: {
            ...(generation.output_data as any || {}),
            user_notified_at: new Date().toISOString(),
            notification_status: 'sent'
          }
        }
      });
      console.log('🔔 Updated generation with notification timestamp');
    }

    // Update job evaluation status to complete since user has been notified
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status_category: 'complete',
        problem_type: null,
        problem_details: null,
        is_cleanup_evaluated: true,
        evaluated_at: new Date()
      }
    });

    console.log('✅ Marked job as complete (user notified):', job.id);

    return NextResponse.json({
      success: true,
      message: 'User notification recorded successfully',
      data: {
        job_id: job.id,
        miniapp_user_id: miniapp_user_id,
        status_category: 'complete',
        notified_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ User notification error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}