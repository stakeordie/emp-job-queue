import { NextRequest, NextResponse } from "next/server";

interface WebhookRequest {
  id: string;
  timestamp: number;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  event_type?: string;
  webhook_id?: string;
  job_id?: string;
}

// In-memory storage for webhook requests (in production, you might want to use Redis or a database)
let webhookRequests: WebhookRequest[] = [];
const MAX_REQUESTS = 50; // Keep only the last 50 requests

function generateId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function extractEventMetadata(body: unknown): {
  event_type?: string;
  webhook_id?: string;
  job_id?: string;
} {
  if (!body || typeof body !== 'object') {
    return {};
  }

  const typedBody = body as Record<string, unknown>;
  const data = typedBody.data as Record<string, unknown> | undefined;
  
  return {
    event_type: typeof typedBody.event_type === 'string' ? typedBody.event_type : undefined,
    webhook_id: typeof typedBody.webhook_id === 'string' ? typedBody.webhook_id : undefined,
    job_id: (typeof data?.job_id === 'string' ? data.job_id : 
             typeof typedBody.job_id === 'string' ? typedBody.job_id : undefined),
  };
}

function cleanHeaders(headers: Headers): Record<string, string> {
  const cleaned: Record<string, string> = {};
  
  headers.forEach((value, key) => {
    // Include all headers but clean up the formatting
    cleaned[key] = value;
  });
  
  return cleaned;
}

// Handle GET requests - return stored webhook requests
export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      requests: webhookRequests,
      total: webhookRequests.length,
    });
  } catch (error) {
    console.error("Error retrieving webhook requests:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve requests" },
      { status: 500 }
    );
  }
}

// Handle POST requests - store webhook data
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let body: unknown = null;
    const contentType = request.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      try {
        body = await request.json();
      } catch {
        // If JSON parsing fails, try to get the raw text
        body = await request.text();
      }
    } else {
      body = await request.text();
    }

    // Extract query parameters
    const url = new URL(request.url);
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Extract event metadata from body
    const eventMetadata = extractEventMetadata(body);

    // Create webhook request record
    const webhookRequest: WebhookRequest = {
      id: generateId(),
      timestamp: Date.now(),
      method: request.method,
      headers: cleanHeaders(request.headers),
      body: body,
      query: query,
      ...eventMetadata,
    };

    // Store the request (keep only the last MAX_REQUESTS)
    webhookRequests.unshift(webhookRequest);
    if (webhookRequests.length > MAX_REQUESTS) {
      webhookRequests = webhookRequests.slice(0, MAX_REQUESTS);
    }

    console.log(`[WebhookTest] Received ${request.method} request:`, {
      id: webhookRequest.id,
      event_type: eventMetadata.event_type,
      job_id: eventMetadata.job_id,
      webhook_id: eventMetadata.webhook_id,
      timestamp: webhookRequest.timestamp,
      headers: Object.keys(webhookRequest.headers),
      bodySize: typeof body === 'string' ? body.length : JSON.stringify(body).length,
    });

    // Return success response (this is what the webhook sender will see)
    return NextResponse.json({
      success: true,
      message: "Webhook received successfully",
      request_id: webhookRequest.id,
      timestamp: webhookRequest.timestamp,
    });
  } catch (error) {
    console.error("Error processing webhook request:", error);
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

// Handle DELETE requests - clear all stored requests
export async function DELETE() {
  try {
    const clearedCount = webhookRequests.length;
    webhookRequests = [];
    
    console.log(`[WebhookTest] Cleared ${clearedCount} webhook requests`);
    
    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedCount} webhook requests`,
      cleared_count: clearedCount,
    });
  } catch (error) {
    console.error("Error clearing webhook requests:", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear requests" },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods for testing
export async function PUT(request: NextRequest) {
  return POST(request); // Treat PUT same as POST for testing
}

export async function PATCH(request: NextRequest) {
  return POST(request); // Treat PATCH same as POST for testing
}