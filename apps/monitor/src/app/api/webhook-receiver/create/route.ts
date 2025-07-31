import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  webhookReceivers,
  cleanupExpiredReceivers,
  WEBHOOK_RECEIVER_CONFIG,
  type WebhookReceiver,
} from "@/lib/webhook-receiver-storage";

// POST /api/webhook-receiver/create - Create a new webhook test receiver
export async function POST() {
  try {
    // Cleanup expired receivers first
    cleanupExpiredReceivers();

    // Check if we're at the limit
    if (webhookReceivers.size >= WEBHOOK_RECEIVER_CONFIG.MAX_RECEIVERS) {
      return NextResponse.json(
        {
          success: false,
          error: "Maximum number of webhook receivers reached. Try again later.",
        },
        { status: 429 }
      );
    }

    // Generate unique ID (like webhook.site format)
    const receiverId = nanoid(12); // Generates something like: fasd-DF-8233-DAE
    const now = Date.now();
    const expiresAt = now + (WEBHOOK_RECEIVER_CONFIG.RECEIVER_EXPIRY_HOURS * 60 * 60 * 1000);

    const receiver: WebhookReceiver = {
      id: receiverId,
      created_at: now,
      expires_at: expiresAt,
      url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3333'}/api/webhook-receiver/${receiverId}`,
      requests: [],
    };

    webhookReceivers.set(receiverId, receiver);

    console.log(`[WebhookReceiver] Created new receiver: ${receiverId}`);

    return NextResponse.json({
      success: true,
      data: {
        id: receiver.id,
        url: receiver.url,
        view_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3333'}/webhook-test?receiver=${receiverId}`,
        created_at: receiver.created_at,
        expires_at: receiver.expires_at,
        expires_in_hours: WEBHOOK_RECEIVER_CONFIG.RECEIVER_EXPIRY_HOURS,
      },
    });
  } catch (error) {
    console.error("Error creating webhook receiver:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create webhook receiver",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET /api/webhook-receiver/create - Get all active receivers (for debugging)
export async function GET() {
  try {
    cleanupExpiredReceivers();
    
    const receivers = Array.from(webhookReceivers.values()).map(receiver => ({
      id: receiver.id,
      url: receiver.url,
      created_at: receiver.created_at,
      expires_at: receiver.expires_at,
      request_count: receiver.requests.length,
    }));

    return NextResponse.json({
      success: true,
      data: receivers,
      total: receivers.length,
      max_receivers: WEBHOOK_RECEIVER_CONFIG.MAX_RECEIVERS,
    });
  } catch (error) {
    console.error("Error fetching webhook receivers:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch webhook receivers",
      },
      { status: 500 }
    );
  }
}

