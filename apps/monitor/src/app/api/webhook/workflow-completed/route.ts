import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@emergexyz/db';

// Webhook endpoint to simulate workflow completion and notification flow
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflow_id, job_id } = body;

    if (!workflow_id && !job_id) {
      return NextResponse.json(
        { error: 'workflow_id or job_id is required' },
        { status: 400 }
      );
    }

    console.log('🔔 Workflow completion webhook received:', { workflow_id, job_id });

    // Find the job by workflow_id or job_id
    const job = await prisma.job.findFirst({
      where: job_id
        ? { id: job_id }
        : { workflow_output: { path: ['workflow_id'], equals: workflow_id } }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    console.log('📋 Found job:', job.id, 'Status:', job.status);

    // Mock miniapp user creation
    const mockMiniappUser = await prisma.miniapp_user.upsert({
      where: { farcaster_id: `mock-user-${job.user_id}` },
      update: {},
      create: {
        farcaster_id: `mock-user-${job.user_id}`,
        farcaster_username: `mockuser${job.user_id.slice(-4)}`,
        farcaster_pfp: `https://api.dicebear.com/7.x/avataaars/svg?seed=${job.user_id}`,
        wallet_address: `0x${Math.random().toString(16).substring(2, 42)}`,
      }
    });

    console.log('👤 Created/found mock miniapp user:', mockMiniappUser.id);

    // Mock payment record
    const mockPayment = await prisma.miniapp_payment.create({
      data: {
        user_id: mockMiniappUser.id,
        collection_id: (job.data as any)?.collectionId || 'mock-collection-id',
        amount: 0.75,
        payment_status: 'completed',
        generations_allowed: 3,
        generations_used: 1,
        transaction_hash: `0x${Math.random().toString(16).substring(2, 66)}`,
      }
    });

    console.log('💳 Created mock payment:', mockPayment.id);

    // Mock miniapp generation record
    const mockGeneration = await prisma.miniapp_generation.create({
      data: {
        user_id: mockMiniappUser.id,
        collection_id: (job.data as any)?.collectionId || 'mock-collection-id',
        payment_id: mockPayment.id,
        job_id: job.id,
        input_data: { prompt: 'Mock generation from webhook' },
        output_url: `https://mock-cdn.example.com/generation-${job.id}.png`,
        output_data: {
          generated_at: new Date().toISOString(),
          mock: true
        },
        generated_image: `https://mock-cdn.example.com/generation-${job.id}.png`,
        status: 'completed',
      }
    });

    console.log('🎨 Created mock generation:', mockGeneration.id);

    // Send notification request
    const notificationPayload = {
      workflow_id: workflow_id || job.id,
      miniapp_user_id: mockMiniappUser.id
    };

    console.log('📤 Sending notification request:', notificationPayload);

    const notificationResponse = await fetch('http://localhost:3333/api/user_notified', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 3u8sdj5389fj3kljsf90u'
      },
      body: JSON.stringify(notificationPayload)
    });

    const notificationResult = await notificationResponse.text();
    console.log('📧 Notification response:', notificationResponse.status, notificationResult);

    return NextResponse.json({
      success: true,
      message: 'Workflow completion simulation completed',
      data: {
        job_id: job.id,
        miniapp_user_id: mockMiniappUser.id,
        payment_id: mockPayment.id,
        generation_id: mockGeneration.id,
        notification_status: notificationResponse.status,
        notification_response: notificationResult
      }
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}