import { NextRequest, NextResponse } from "next/server";
import { webhookReceivers } from "@/lib/webhook-receiver-storage";

// GET /api/webhook-receiver/[id]/requests - Get all requests for a receiver
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    // Check if receiver exists
    const receiver = webhookReceivers.get(id);
    if (!receiver) {
      return NextResponse.json(
        {
          success: false,
          error: "Webhook receiver not found",
        },
        { status: 404 }
      );
    }

    // Check if receiver has expired
    if (receiver.expires_at < Date.now()) {
      webhookReceivers.delete(id);
      return NextResponse.json(
        {
          success: false,
          error: "Webhook receiver expired",
        },
        { status: 410 }
      );
    }

    // Get limit from query params
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    // Return requests (most recent first)
    const requests = receiver.requests.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: {
        receiver_id: receiver.id,
        receiver_url: receiver.url,
        created_at: receiver.created_at,
        expires_at: receiver.expires_at,
        requests: requests,
        total_requests: receiver.requests.length,
        returned_count: requests.length,
      },
    });
  } catch (error) {
    console.error(`[WebhookReceiver] Error fetching requests for ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch webhook requests",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// DELETE /api/webhook-receiver/[id]/requests - Clear all requests for a receiver
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  try {
    // Check if receiver exists
    const receiver = webhookReceivers.get(id);
    if (!receiver) {
      return NextResponse.json(
        {
          success: false,
          error: "Webhook receiver not found",
        },
        { status: 404 }
      );
    }

    const clearedCount = receiver.requests.length;
    receiver.requests = [];

    console.log(`[WebhookReceiver] Cleared ${clearedCount} requests for ${id}`);

    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedCount} webhook requests`,
      cleared_count: clearedCount,
    });
  } catch (error) {
    console.error(`[WebhookReceiver] Error clearing requests for ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to clear webhook requests",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}