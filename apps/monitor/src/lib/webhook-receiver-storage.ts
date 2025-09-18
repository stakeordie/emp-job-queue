export interface WebhookReceiver {
  id: string;
  created_at: number;
  expires_at: number;
  url: string;
  requests: WebhookReceiverRequest[];
}

export interface WebhookReceiverRequest {
  id: string;
  timestamp: number;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  user_agent?: string;
  ip?: string;
}

// Global in-memory storage for webhook receivers
// In production, this would be Redis or a database
export const webhookReceivers: Map<string, WebhookReceiver> = new Map();

export const WEBHOOK_RECEIVER_CONFIG = {
  MAX_RECEIVERS: 100,
  RECEIVER_EXPIRY_HOURS: 24,
  MAX_REQUESTS_PER_RECEIVER: 100,
};

// Cleanup expired receivers
export const cleanupExpiredReceivers = () => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [id, receiver] of webhookReceivers.entries()) {
    if (receiver.expires_at < now) {
      webhookReceivers.delete(id);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`[WebhookReceiver] Cleaned up ${cleanedCount} expired receivers`);
  }

  return cleanedCount;
};
