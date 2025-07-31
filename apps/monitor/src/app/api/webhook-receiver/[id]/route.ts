import { NextRequest, NextResponse } from "next/server";
import {
  webhookReceivers,
  WEBHOOK_RECEIVER_CONFIG,
  type WebhookReceiverRequest,
} from "@/lib/webhook-receiver-storage";

// Helper to clean headers
function cleanHeaders(headers: Headers): Record<string, string> {
  const cleaned: Record<string, string> = {};
  
  headers.forEach((value, key) => {
    cleaned[key] = value;
  });
  
  return cleaned;
}

// Helper to generate request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

// Catch-all webhook receiver - handles any HTTP method
async function handleWebhookRequest(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  
  try {
    // Check if receiver exists
    const receiver = webhookReceivers.get(id);
    if (!receiver) {
      return NextResponse.json(
        {
          success: false,
          error: "Webhook receiver not found",
          message: "This webhook URL may have expired or been deleted",
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
          message: "This webhook URL has expired",
        },
        { status: 410 }
      );
    }

    // Parse request body
    let body: unknown = null;
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        body = await request.text();
      }
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const formObject: Record<string, unknown> = {};
      formData.forEach((value, key) => {
        formObject[key] = value;
      });
      body = formObject;
    } else {
      body = await request.text();
    }

    // Extract query parameters
    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Create webhook request record
    const webhookRequest: WebhookReceiverRequest = {
      id: generateRequestId(),
      timestamp: Date.now(),
      method: request.method,
      headers: cleanHeaders(request.headers),
      body: body,
      query: query,
      user_agent: request.headers.get('user-agent') || undefined,
      ip: getClientIP(request),
    };

    // Store the request (keep only the last N requests per receiver)
    receiver.requests.unshift(webhookRequest);
    if (receiver.requests.length > WEBHOOK_RECEIVER_CONFIG.MAX_REQUESTS_PER_RECEIVER) {
      receiver.requests = receiver.requests.slice(0, WEBHOOK_RECEIVER_CONFIG.MAX_REQUESTS_PER_RECEIVER);
    }

    console.log(`[WebhookReceiver] ${id} received ${request.method} request`, {
      request_id: webhookRequest.id,
      method: request.method,
      content_type: contentType,
      body_size: typeof body === 'string' ? body.length : JSON.stringify(body).length,
      query_params: Object.keys(query).length,
    });

    // Return success response (this is what the webhook sender will see)
    return NextResponse.json({
      success: true,
      message: "Webhook received successfully",
      receiver_id: id,
      request_id: webhookRequest.id,
      timestamp: webhookRequest.timestamp,
    });
  } catch (error) {
    console.error(`[WebhookReceiver] Error processing request for ${id}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process webhook request",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Export all HTTP methods
export async function GET(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function HEAD(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: { id: string } }) {
  return handleWebhookRequest(request, context);
}

