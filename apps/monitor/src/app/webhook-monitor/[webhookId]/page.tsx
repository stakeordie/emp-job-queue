"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Trash2, Copy, ChevronDown, ChevronUp, ArrowLeft, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConnectionHeader } from "@/components/ConnectionHeader";
import Link from "next/link";

const WEBHOOK_SERVICE_URL = process.env.NEXT_PUBLIC_WEBHOOK_SERVICE_URL;

interface WebhookRequest {
  id: string;
  timestamp: number;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  user_agent?: string;
  ip?: string;
  event_type?: string;
}

interface WebhookInfo {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  created_at: number;
}

export default function WebhookMonitorPage() {
  const params = useParams();
  const webhookId = params.webhookId as string;
  const { toast } = useToast();

  // Local state for received requests (clears on page refresh)
  const [requests, setRequests] = useState<WebhookRequest[]>([]);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<WebhookRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Extract session ID from webhook URL
  const extractSessionId = (webhookUrl: string): string | null => {
    const match = webhookUrl.match(/webhook-monitor\/([^\/]+)/);
    return match ? match[1] : null;
  };

  // Fetch webhook info
  useEffect(() => {
    const fetchWebhookInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks/${webhookId}`);

        if (!response.ok) {
          throw new Error(`Webhook not found (${response.status})`);
        }

        const data = await response.json();
        if (data.success) {
          setWebhookInfo(data.data);

          // Extract session ID from webhook URL
          const extractedSessionId = extractSessionId(data.data.url);
          if (extractedSessionId) {
            setSessionId(extractedSessionId);
            setIsListening(true); // Start listening automatically
          } else {
            throw new Error('Could not extract session ID from webhook URL');
          }

          setError(null);
        } else {
          throw new Error(data.error || 'Failed to fetch webhook info');
        }
      } catch (err) {
        console.error('Error fetching webhook info:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch webhook info');
      } finally {
        setLoading(false);
      }
    };

    if (webhookId) {
      fetchWebhookInfo();
    }
  }, [webhookId]);

  // Poll for captured webhook requests
  useEffect(() => {
    if (!isListening || !sessionId) return;

    const pollRequests = async () => {
      try {
        const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhook-monitor/${sessionId}/requests`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data && data.data.requests) {
            const newRequests = data.data.requests;

            // Check if we have new requests
            if (newRequests.length > requests.length) {
              // Show toast for new requests
              const newCount = newRequests.length - requests.length;
              toast({
                title: "New Webhook Request",
                description: `Received ${newCount} new request${newCount > 1 ? 's' : ''}`,
              });
            }

            setRequests(newRequests);
          }
        }
      } catch (error) {
        console.error('Failed to fetch webhook requests:', error);
      }
    };

    // Initial poll
    pollRequests();

    // Poll every 2 seconds
    const interval = setInterval(pollRequests, 2000);

    return () => clearInterval(interval);
  }, [isListening, sessionId, requests.length, toast]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Content copied to clipboard",
    });
  };

  const clearRequests = async () => {
    try {
      // Clear on server
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhook-monitor/${sessionId}/requests`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Clear local state
        setRequests([]);
        setSelectedRequest(null);
        toast({
          title: "Cleared",
          description: "All webhook requests cleared",
        });
      } else {
        throw new Error('Failed to clear requests on server');
      }
    } catch (error) {
      console.error('Error clearing requests:', error);
      // Still clear local state even if server fails
      setRequests([]);
      setSelectedRequest(null);
      toast({
        title: "Cleared Locally",
        description: "Requests cleared locally (server may still have them)",
        variant: "destructive"
      });
    }
  };

  const toggleListening = () => {
    setIsListening(!isListening);
    toast({
      title: isListening ? "Stopped Monitoring" : "Started Monitoring",
      description: isListening
        ? "No longer capturing webhook requests"
        : "Now capturing webhook requests in real-time",
    });
  };

  // Extract event type from request
  const extractEventType = (request: WebhookRequest): string => {
    if (request.event_type) return request.event_type;

    // Try headers
    const eventHeader = request.headers['x-webhook-event'] || request.headers['X-Webhook-Event'];
    if (eventHeader) return eventHeader;

    // Try body
    try {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      if (body && typeof body === 'object' && 'event_type' in body) {
        return body.event_type as string;
      }
    } catch {
      // Ignore parsing errors
    }

    return 'unknown';
  };

  const getEventTypeColor = (eventType: string) => {
    const type = eventType.toLowerCase();

    if (type.includes('fail') || type.includes('error')) {
      return 'bg-red-100 text-red-700 border-red-200';
    }
    if (type.includes('complete') || type.includes('success')) {
      return 'bg-green-100 text-green-700 border-green-200';
    }
    if (type.includes('submit') || type.includes('start')) {
      return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    }
    if (type.includes('progress') || type.includes('update')) {
      return 'bg-blue-100 text-blue-700 border-blue-200';
    }

    return 'bg-gray-100 text-gray-700 border-gray-200';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <ConnectionHeader />
        <div className="flex-1 p-6">
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading webhook information...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <ConnectionHeader />
        <div className="flex-1 p-6">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">{error}</p>
            <Link href="/webhook-test">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Webhooks
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ConnectionHeader />

      <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-4 mb-2">
            <Link href="/webhook-test">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Webhooks
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Webhook Monitor</h1>
              <p className="text-sm text-muted-foreground">
                Real-time monitoring for webhook: {webhookId}
              </p>
            </div>
          </div>
        </div>

        {/* Webhook Info */}
        {webhookInfo && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Webhook Details</span>
                <Badge variant={webhookInfo.active ? "default" : "secondary"}>
                  {webhookInfo.active ? "Active" : "Inactive"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Registered Webhook URL</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={webhookInfo.url}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(webhookInfo.url)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(webhookInfo.url, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Monitor URL (for testing)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={`${WEBHOOK_SERVICE_URL}/webhook-monitor/${sessionId}`}
                      readOnly
                      className="font-mono text-sm text-blue-600"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(`${WEBHOOK_SERVICE_URL}/webhook-monitor/${sessionId}`)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Send POST/GET requests to this URL to test webhook monitoring. This session will capture any requests made to this endpoint.
                  </p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Subscribed Events</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {webhookInfo.events.map((event) => (
                      <Badge key={event} variant="outline" className="text-xs">
                        {event.replace('_', ' ').toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 pt-2">
                  <Button
                    onClick={toggleListening}
                    variant={isListening ? "destructive" : "default"}
                  >
                    {isListening ? (
                      <>
                        <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
                        Stop Monitoring
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Start Monitoring
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={clearRequests}
                    disabled={requests.length === 0}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Requests ({requests.length})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monitoring Status */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-3 w-3 rounded-full ${
                  isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                }`}></div>
                <span className="text-sm font-medium">
                  {isListening ? 'Actively Monitoring' : 'Monitoring Stopped'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {requests.length} request{requests.length !== 1 ? 's' : ''} captured
                </span>
              </div>

              {isListening && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
                  Waiting for webhook requests...
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <Card>
          <CardHeader>
            <CardTitle>Captured Requests ({requests.length})</CardTitle>
            <p className="text-sm text-muted-foreground">
              {isListening
                ? "Requests will appear here in real-time. Data persists until page refresh."
                : "Start monitoring to capture webhook requests."}
            </p>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No webhook requests captured yet</p>
                <p className="text-sm mt-2">
                  {isListening
                    ? "Send a webhook to see it appear here instantly"
                    : "Click 'Start Monitoring' to begin capturing requests"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map((request) => {
                  const eventType = extractEventType(request);
                  const eventColorClass = getEventTypeColor(eventType);

                  return (
                    <div
                      key={request.id}
                      className="border rounded-lg overflow-hidden"
                    >
                      <div
                        className={`p-3 cursor-pointer transition-colors ${
                          selectedRequest?.id === request.id
                            ? 'bg-blue-50 border-blue-200'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedRequest(
                          selectedRequest?.id === request.id ? null : request
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant={request.method === 'POST' ? 'default' : 'outline'}>
                              {request.method}
                            </Badge>
                            {eventType !== 'unknown' && (
                              <Badge variant="outline" className={`text-xs ${eventColorClass}`}>
                                {eventType.replace('_', ' ').toUpperCase()}
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              {formatTimestamp(request.timestamp)}
                            </span>
                            {request.user_agent && (
                              <span className="text-xs text-muted-foreground">
                                {request.user_agent.split(' ')[0]}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                              {request.ip}
                            </span>
                            {selectedRequest?.id === request.id ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {selectedRequest?.id === request.id && (
                        <div className="border-t bg-muted/30 p-4">
                          <div className="space-y-4">
                            {/* Headers */}
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
                              <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto border">
                                <pre>{JSON.stringify(request.headers, null, 2)}</pre>
                              </div>
                            </div>

                            {/* Query Parameters */}
                            {Object.keys(request.query).length > 0 && (
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">Query Parameters</Label>
                                <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto border">
                                  <pre>{JSON.stringify(request.query, null, 2)}</pre>
                                </div>
                              </div>
                            )}

                            {/* Body */}
                            <div>
                              <Label className="text-xs font-medium text-muted-foreground">Request Body</Label>
                              <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto border">
                                {request.body === null || request.body === '' ? (
                                  <span className="text-muted-foreground">No body content</span>
                                ) : (
                                  <pre>
                                    {typeof request.body === 'string'
                                      ? request.body
                                      : JSON.stringify(request.body, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(request, null, 2))}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy Full Request
                              </Button>
                              {request.body && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(
                                    typeof request.body === 'string'
                                      ? request.body
                                      : JSON.stringify(request.body, null, 2)
                                  )}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy Body
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}