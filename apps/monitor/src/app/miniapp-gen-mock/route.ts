import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import crypto from 'crypto';

const WEBHOOK_SECRET = 'mini-secret';

// Mock miniapp generation flow endpoint
export async function POST(request: NextRequest) {
  try {
    // Get webhook headers
    const webhookEvent = request.headers.get('x-webhook-event');
    const webhookSignature = request.headers.get('x-webhook-signature');
    const webhookId = request.headers.get('x-webhook-id');
    const eventId = request.headers.get('x-event-id');

    console.log('🔔 Webhook received:', {
      event: webhookEvent,
      signature: webhookSignature,
      webhookId,
      eventId,
      headers: Object.fromEntries(request.headers.entries())
    });

    const body = await request.json();

    console.log('📦 Full webhook body:', JSON.stringify(body, null, 2));

    // Verify webhook signature
    if (webhookSignature) {
      const bodyString = JSON.stringify(body);
      console.log('🔐 Signature verification:', {
        receivedSignature: webhookSignature,
        bodyString: bodyString.substring(0, 200) + '...',
        bodyLength: bodyString.length
      });

      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(bodyString)
        .digest('hex')}`;

      console.log('🔐 Expected signature:', expectedSignature);
      console.log('🔐 Signature match:', webhookSignature === expectedSignature);

      if (webhookSignature !== expectedSignature) {
        console.log('❌ Signature verification failed');
        return NextResponse.json(
          { error: 'Unauthorized - invalid webhook signature' },
          { status: 401 }
        );
      }
      console.log('✅ Signature verified successfully');
    } else {
      console.log('⚠️ No webhook signature provided, checking for secret in body');
      // Fallback to simple secret verification for manual testing
      const { secret } = body;
      console.log('🔑 Secret provided:', secret ? 'Yes' : 'No');
      if (secret !== WEBHOOK_SECRET) {
        console.log('❌ Secret verification failed');
        return NextResponse.json(
          { error: 'Unauthorized - missing signature or invalid secret' },
          { status: 401 }
        );
      }
      console.log('✅ Secret verified successfully');
    }

    // Extract workflow/job ID from the webhook structure
    const workflow_id = body.data?.workflow_id || body.workflow_id;
    const job_id = body.data?.job_id || body.job_id;

    console.log('🔍 ID extraction:', {
      'body.data': body.data ? 'exists' : 'undefined',
      'body.data.workflow_id': body.data?.workflow_id,
      'body.workflow_id': body.workflow_id,
      'body.data.job_id': body.data?.job_id,
      'body.job_id': body.job_id,
      'final workflow_id': workflow_id,
      'final job_id': job_id
    });

    if (!workflow_id && !job_id) {
      console.log('❌ No workflow_id or job_id found in webhook payload');
      return NextResponse.json(
        { error: 'workflow_id or job_id is required' },
        { status: 400 }
      );
    }

    console.log('🔔 Miniapp generation mock triggered:', {
      workflow_id,
      job_id,
      webhookEvent,
      webhookId,
      eventId
    });

    // Find the job by workflow_id or job_id
    // The workflow_id from the webhook IS the job.id in the database
    console.log('🔍 Searching for job with ID:', workflow_id || job_id);

    const job = await prisma.job.findFirst({
      where: {
        id: workflow_id || job_id
      }
    });

    if (!job) {
      console.log('❌ Job not found in database for ID:', workflow_id || job_id);
      console.log('💡 This might mean the job ID does not exist or has a different format');
      return NextResponse.json(
        { error: 'Job not found', searchedId: workflow_id || job_id },
        { status: 404 }
      );
    }

    console.log('📋 Found job:', {
      id: job.id,
      status: job.status,
      name: job.name,
      job_type: job.job_type,
      created_at: job.created_at,
      user_id: job.user_id
    });

    // Mock miniapp user creation
    console.log('👤 Creating/finding miniapp user for job.user_id:', job.user_id);

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

    console.log('👤 Created/found mock miniapp user:', {
      id: mockMiniappUser.id,
      farcaster_id: mockMiniappUser.farcaster_id,
      username: mockMiniappUser.farcaster_username
    });

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

    // Extract real data from job for generation record
    const jobData = job.data as any;
    const workflowOutput = job.workflow_output as any;

    // Get real output URL and data from job
    const realOutputUrl = workflowOutput?.outputs?.[0]?.steps?.find((step: any) => step.nodeResponse?.src)?.nodeResponse?.src;
    const realGeneratedImage = realOutputUrl || `https://mock-cdn.example.com/generation-${job.id}.png`;

    // Use real input data from job
    const realInputData = {
      prompt: jobData?.variables?.prompt || jobData?.prompt || 'Generated from job workflow',
      collection_id: jobData?.collectionId,
      workflow_name: jobData?.workflow?.name || 'Unknown Workflow',
      ...jobData?.variables
    };

    // Mock miniapp generation record with real job data
    const mockGeneration = await prisma.miniapp_generation.create({
      data: {
        user_id: mockMiniappUser.id,
        collection_id: jobData?.collectionId || 'mock-collection-id',
        payment_id: mockPayment.id,
        job_id: job.id,
        input_data: realInputData,
        output_url: realGeneratedImage,
        output_data: {
          generated_at: job.completed_at?.toISOString() || new Date().toISOString(),
          mock: true,
          real_job_data: true,
          workflow_output: workflowOutput,
          processing_time_ms: job.completed_at && job.started_at
            ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
            : null
        },
        generated_image: realGeneratedImage,
        status: job.status === 'completed' ? 'completed' : 'failed',
      }
    });

    console.log('🎨 Created mock generation:', mockGeneration.id);

    // Send notification request to user_notified endpoint
    const notificationPayload = {
      workflow_id: workflow_id || job.id,
      miniapp_user_id: mockMiniappUser.id
    };

    console.log('📤 Sending notification request:', notificationPayload);

    const notificationResponse = await fetch('http://0.0.0.0:3333/api/user_notified', {
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
      message: 'Miniapp generation mock completed successfully',
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
    console.error('❌ Miniapp mock error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET endpoint to show usage
export async function GET() {
  return NextResponse.json({
    message: 'Miniapp Generation Mock Endpoint',
    usage: {
      method: 'POST',
      url: 'http://0.0.0.0:3333/miniapp-gen-mock',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        secret: 'mini-secret',
        workflow_id: 'workflow_id',
        // OR
        job_id: 'job_id'
      },
      description: 'Webhook endpoint that verifies secret and simulates the complete miniapp workflow'
    },
    flow: [
      '1. Find job by workflow_id or job_id',
      '2. Create mock miniapp user',
      '3. Create mock payment record',
      '4. Create mock generation record',
      '5. Call /api/user_notified endpoint',
      '6. Mark job as complete'
    ]
  });
}