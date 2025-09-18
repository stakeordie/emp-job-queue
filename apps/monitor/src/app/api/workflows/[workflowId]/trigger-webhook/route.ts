import { NextRequest, NextResponse } from 'next/server';
import Redis from 'ioredis';

export async function POST(
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

    // Get EmProps API URL
    const empropsApiUrl = process.env.EMPROPS_API_URL;
    if (!empropsApiUrl) {
      return NextResponse.json(
        { success: false, error: 'EmProps API URL not configured' },
        { status: 500 }
      );
    }

    const redis = new Redis(redisUrl);

    // First, verify the workflow exists and is completed in EmProps
    const workflowResponse = await fetch(`${empropsApiUrl}/api/jobs/${workflowId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!workflowResponse.ok) {
      await redis.disconnect();
      return NextResponse.json({
        success: false,
        error: `Failed to fetch workflow from EmProps: ${workflowResponse.status}`
      }, { status: 400 });
    }

    const workflowData = await workflowResponse.json();

    if (workflowData.data?.status !== 'completed') {
      await redis.disconnect();
      return NextResponse.json({
        success: false,
        error: `Workflow is not completed in EmProps. Current status: ${workflowData.data?.status || 'unknown'}`
      }, { status: 400 });
    }

    // Check if we have attestations (proof of completion)
    const apiAttestationExists = await redis.exists(`api:workflow:completion:${workflowId}`);
    const hasWorkerAttestations = await redis.keys(`worker:completion:step-*`).then(async (keys) => {
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.workflow_id === workflowId) {
              return true;
            }
          } catch (e) {
            // Continue checking other keys
          }
        }
      }
      return false;
    });

    // Manually trigger the workflow completion webhook
    const webhookPayload = {
      workflow_id: workflowId,
      status: 'completed',
      completed_at: workflowData.data.completed_at,
      timestamp: Date.now(),
      verified: true,
      message: 'Workflow completion webhook manually triggered',
      manual_trigger: true,
      trigger_source: 'monitor-ui',
      attestations_available: {
        api_attestation: apiAttestationExists > 0,
        worker_attestations: hasWorkerAttestations
      },
      // Include basic workflow metadata only
      workflow_details: {
        id: workflowData.data.id,
        name: workflowData.data.name,
        job_type: workflowData.data.job_type,
        status: workflowData.data.status,
        progress: workflowData.data.progress,
        created_at: workflowData.data.created_at,
        completed_at: workflowData.data.completed_at
      },
      // 🚨 CRITICAL: NO outputs included - webhook service should query EmProps API directly
      outputs_available: !!(workflowData.data?.data?.outputs?.length),
      outputs_count: workflowData.data?.data?.outputs?.length || 0
    };

    // Publish to the same Redis channel the API server uses
    await redis.publish('workflow_completed', JSON.stringify(webhookPayload));

    await redis.disconnect();

    return NextResponse.json({
      success: true,
      message: `Workflow completion webhook triggered for ${workflowId}`,
      workflow_status: workflowData.data.status,
      outputs_count: workflowData.data?.data?.outputs?.length || 0,
      attestations: {
        api_attestation: apiAttestationExists > 0,
        worker_attestations: hasWorkerAttestations
      },
      triggered_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error triggering workflow webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to trigger workflow webhook' },
      { status: 500 }
    );
  }
}