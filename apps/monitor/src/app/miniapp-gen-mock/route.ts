import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import crypto from 'crypto';

const WEBHOOK_SECRET = 'mini-secret';

// Add CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-event, x-webhook-signature, x-webhook-id, x-event-id',
};

// Handle preflight OPTIONS request
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

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
          { status: 401, headers: corsHeaders }
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
          { status: 401, headers: corsHeaders }
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
        { status: 400, headers: corsHeaders }
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
    const searchId = workflow_id || job_id;
    console.log('🔍 Searching for job with ID:', searchId);

    // Check if this is a test ID (not a valid UUID)
    const isTestId = searchId.startsWith('test_');

    let job = null;
    if (!isTestId) {
      try {
        job = await prisma.job.findFirst({
          where: {
            id: searchId
          }
        });
      } catch (error) {
        console.log('❌ Database error searching for job:', error);
        // Continue with mock data for invalid UUIDs
      }
    }

    if (!job && !isTestId) {
      console.log('❌ Job not found in database for ID:', searchId);
      return NextResponse.json(
        { error: 'Job not found', searchedId: searchId },
        { status: 404, headers: corsHeaders }
      );
    }

    // For test IDs or missing jobs, create mock job data
    if (!job) {
      console.log('🎭 Creating mock job data for test ID:', searchId);
      job = {
        id: searchId,
        name: `Mock Job for ${searchId}`,
        status: 'completed',
        job_type: 'miniapp',
        user_id: '00000000-0000-0000-0000-000000000001', // Mock UUID
        created_at: new Date(),
        data: {
          collectionId: '00000000-0000-0000-0000-000000000002',
          variables: { mock: true }
        }
      };
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
        updated_at: new Date()
      }
    });

    console.log('👤 Created/found mock miniapp user:', {
      id: mockMiniappUser.id,
      farcaster_id: mockMiniappUser.farcaster_id,
      username: mockMiniappUser.farcaster_username
    });

    // Check if payment exists for this user and collection
    let mockPayment = await prisma.miniapp_payment.findFirst({
      where: {
        user_id: mockMiniappUser.id,
        collection_id: (job.data as any)?.collectionId || 'mock-collection-id'
      }
    });

    if (!mockPayment) {
      // Create payment if missing
      mockPayment = await prisma.miniapp_payment.create({
        data: {
          user_id: mockMiniappUser.id,
          collection_id: (job.data as any)?.collectionId || 'mock-collection-id',
          amount: 0.75,
          payment_status: 'completed',
          generations_allowed: 3,
          generations_used: 1,
          transaction_hash: `0x${Math.random().toString(16).substring(2, 66)}`,
          updated_at: new Date()
        }
      });
      console.log('💳 Created new payment:', mockPayment.id);
    } else {
      // Update generations_used for existing payment
      mockPayment = await prisma.miniapp_payment.update({
        where: { id: mockPayment.id },
        data: {
          generations_used: mockPayment.generations_used + 1,
          updated_at: new Date()
        }
      });
      console.log('💳 Updated existing payment:', mockPayment.id);
    }

    // 🚨 CRITICAL TIMING CHECK: Ensure workflow_output is populated before proceeding
    // This prevents notifications from being sent when workflow_output is still null
    if (!job.workflow_output) {
      console.log('❌ Cannot proceed with miniapp generation: job.workflow_output is null');
      console.log('❌ Job status:', job.status, 'Job ID:', job.id);
      return NextResponse.json(
        {
          error: 'Job workflow_output not yet populated',
          job_id: job.id,
          job_status: job.status,
          message: 'Webhook received before workflow_output field was populated. This indicates a timing issue.'
        },
        { status: 400, headers: corsHeaders }
      );
    }

    console.log('✅ Job workflow_output is populated, proceeding with notification');

    // Extract real data from job for generation record
    const jobData = job.data as any;
    const workflowOutput = job.workflow_output as any;

    // Get real output URL and data from job
    // Handle both production (JSON object) and development (string) formats
    let realOutputUrl;
    if (typeof workflowOutput === 'string') {
      // Development: workflow_output is a direct URL string
      realOutputUrl = workflowOutput;
    } else if (workflowOutput?.outputs?.[0]?.steps) {
      // Production: workflow_output is a JSON object
      realOutputUrl = workflowOutput.outputs[0].steps.find((step: any) => step.nodeResponse?.src)?.nodeResponse?.src;
    }

    const realGeneratedImage = realOutputUrl || `https://mock-cdn.example.com/generation-${job.id}.png`;

    // Use real input data from job
    const realInputData = {
      prompt: jobData?.variables?.prompt || jobData?.prompt || 'Generated from job workflow',
      collection_id: jobData?.collectionId,
      workflow_name: jobData?.workflow?.name || 'Unknown Workflow',
      ...jobData?.variables
    };

    // Check if a generation record already exists for this job (retry case)
    const existingGeneration = await prisma.miniapp_generation.findFirst({
      where: { job_id: job.id }
    });

    let mockGeneration;
    if (existingGeneration) {
      // Update existing record for retry
      console.log('🔄 Updating existing generation for retry:', existingGeneration.id);
      mockGeneration = await prisma.miniapp_generation.update({
        where: { id: existingGeneration.id },
        data: {
          output_url: realGeneratedImage,
          output_data: {
            generated_at: job.completed_at?.toISOString() || new Date().toISOString(),
            mock: true,
            real_job_data: true,
            workflow_output: workflowOutput,
            processing_time_ms: job.completed_at && job.started_at
              ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
              : null,
            retry_count: job.retry_count,
            updated_from_retry: true
          },
          generated_image: realGeneratedImage,
          status: job.status === 'completed' ? 'completed' : 'failed',
          updated_at: new Date()
        }
      });
    } else {
      // Create new record for first attempt
      console.log('✨ Creating new generation record');
      mockGeneration = await prisma.miniapp_generation.create({
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
          updated_at: new Date()
        }
      });
    }

    console.log(existingGeneration ? '🔄 Updated generation:' : '🎨 Created mock generation:', mockGeneration.id);

    // Send notification request to user_notified endpoint
    const notificationPayload = {
      workflow_id: workflow_id || job.id,
      miniapp_user_id: mockMiniappUser.id
    };

    console.log('📤 Sending notification request:', notificationPayload);

    const notificationResponse = await fetch('http://0.0.0.0:3331/api/user_notified', {
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
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Miniapp mock error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: corsHeaders }
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
  }, { headers: corsHeaders });
}