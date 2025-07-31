"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, Trash2, CheckCircle2, XCircle, Play, Copy, ExternalLink, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConnectionHeader } from "@/components/ConnectionHeader";
import { JobSubmissionPanel } from "@/components/JobSubmissionPanel";

// Webhook event types available in the system
type WebhookEventType =
  | 'job.submitted'
  | 'job.assigned'
  | 'job.progress'
  | 'job.completed'
  | 'job.failed'
  | 'job.cancelled'
  | 'job.timeout'
  | 'job.status_changed'
  | 'machine.startup'
  | 'machine.shutdown'
  | 'worker.connected'
  | 'worker.disconnected';

interface WebhookEndpoint {
  id: string;
  url: string;
  secret?: string;
  events: WebhookEventType[];
  filters?: {
    job_types?: string[];
    priorities?: string[];
    machine_ids?: string[];
    worker_ids?: string[];
  };
  retry_config?: {
    max_attempts: number;
    initial_delay_ms: number;
    backoff_multiplier: number;
    max_delay_ms: number;
  };
  active: boolean;
  created_at: number;
  updated_at: number;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_id: string;
  event_type: WebhookEventType;
  timestamp: number;
  success: boolean;
  response_status?: number;
  response_time_ms?: number;
  error_message?: string;
  url: string;
  attempt_number: number;
  payload: unknown;
}

interface WebhookStats {
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
  avg_response_time_ms: number;
  success_rate: number;
}

interface WebhookTestReceiver {
  id: string;
  url: string;
  view_url: string;
  created_at: number;
  expires_at: number;
  expires_in_hours: number;
}

interface WebhookTestRequest {
  id: string;
  timestamp: number;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  query: Record<string, string>;
  user_agent?: string;
  ip?: string;
}

const WEBHOOK_SERVICE_URL = 'http://localhost:3332';

const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  'job.submitted': 'Job Submitted',
  'job.assigned': 'Job Assigned', 
  'job.progress': 'Job Progress',
  'job.completed': 'Job Completed',
  'job.failed': 'Job Failed',
  'job.cancelled': 'Job Cancelled',
  'job.timeout': 'Job Timeout',
  'job.status_changed': 'Job Status Changed',
  'machine.startup': 'Machine Startup',
  'machine.shutdown': 'Machine Shutdown',
  'worker.connected': 'Worker Connected',
  'worker.disconnected': 'Worker Disconnected',
};

export default function WebhookManagementPage() {
  const [isJobPanelOpen, setIsJobPanelOpen] = useState(false);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const { toast } = useToast();

  // Create webhook form state
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEventType[]>(['job.completed', 'job.failed']);
  const [formActive, setFormActive] = useState(true);

  // Test receiver state
  const [testReceiver, setTestReceiver] = useState<WebhookTestReceiver | null>(null);
  const [testRequests, setTestRequests] = useState<WebhookTestRequest[]>([]);
  const [selectedTestRequest, setSelectedTestRequest] = useState<WebhookTestRequest | null>(null);

  // API Functions
  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks`);
      const data = await response.json();
      if (data.success) {
        setWebhooks(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      toast({
        title: "Error",
        description: "Failed to connect to webhook service. Is it running on port 3332?",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentDeliveries = async () => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/deliveries/recent?limit=50`);
      const data = await response.json();
      if (data.success) {
        setDeliveries(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch deliveries:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/stats/summary`);
      const data = await response.json();
      if (data.success) {
        setStats(data.data.delivery_stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const createWebhook = async () => {
    if (!formUrl || formEvents.length === 0) {
      toast({
        title: "Error",
        description: "URL and at least one event type are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: formUrl,
          events: formEvents,
          active: formActive,
          secret: formSecret || undefined,
          retry_config: {
            max_attempts: 3,
            initial_delay_ms: 1000,
            backoff_multiplier: 2,
            max_delay_ms: 30000,
          },
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Success",
          description: "Webhook registered successfully",
        });
        setShowCreateForm(false);
        setFormUrl("");
        setFormSecret("");
        setFormEvents(['job.completed', 'job.failed']);
        setFormActive(true);
        fetchWebhooks();
      } else {
        throw new Error(data.error || 'Failed to create webhook');
      }
    } catch (error) {
      console.error('Failed to create webhook:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create webhook",
        variant: "destructive",
      });
    }
  };

  const deleteWebhook = async (id: string) => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Success",
          description: "Webhook deleted successfully",
        });
        fetchWebhooks();
      } else {
        throw new Error(data.error || 'Failed to delete webhook');
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete webhook",
        variant: "destructive",
      });
    }
  };

  const testWebhook = async (id: string) => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks/${id}/test`, {
        method: 'POST',
      });

      const data = await response.json();
      if (data.success) {
        toast({
          title: "Success",
          description: "Test webhook sent successfully",
        });
        // Refresh deliveries to show the test
        setTimeout(() => {
          fetchRecentDeliveries();
        }, 1000);
      } else {
        throw new Error(data.error || 'Failed to send test webhook');
      }
    } catch (error) {
      console.error('Failed to test webhook:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send test webhook",
        variant: "destructive",
      });
    }
  };

  const toggleWebhookEvent = (eventType: WebhookEventType) => {
    if (formEvents.includes(eventType)) {
      setFormEvents(formEvents.filter(e => e !== eventType));
    } else {
      setFormEvents([...formEvents, eventType]);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatResponseTime = (ms?: number) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Test Receiver API Functions
  const createTestReceiver = async () => {
    try {
      const response = await fetch('/api/webhook-receiver/create', {
        method: 'POST',
      });

      const data = await response.json();
      if (data.success) {
        setTestReceiver(data.data);
        setTestRequests([]);
        toast({
          title: "Success",
          description: "Test webhook receiver created",
        });
      } else {
        throw new Error(data.error || 'Failed to create test receiver');
      }
    } catch (error) {
      console.error('Failed to create test receiver:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create test receiver",
        variant: "destructive", 
      });
    }
  };

  const fetchTestRequests = async () => {
    if (!testReceiver) return;

    try {
      const response = await fetch(`/api/webhook-receiver/${testReceiver.id}/requests`);
      const data = await response.json();
      if (data.success) {
        setTestRequests(data.data.requests);
      }
    } catch (error) {
      console.error('Failed to fetch test requests:', error);
    }
  };

  const clearTestRequests = async () => {
    if (!testReceiver) return;

    try {
      const response = await fetch(`/api/webhook-receiver/${testReceiver.id}/requests`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setTestRequests([]);
        setSelectedTestRequest(null);
        toast({
          title: "Success",
          description: `Cleared ${data.cleared_count} test requests`,
        });
      }
    } catch (error) {
      console.error('Failed to clear test requests:', error);
      toast({
        title: "Error",
        description: "Failed to clear test requests",
        variant: "destructive",
      });
    }
  };

  const copyTestUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "Copied",
      description: "URL copied to clipboard",
    });
  };

  const registerTestReceiver = async () => {
    if (!testReceiver) return;

    // Auto-fill the webhook registration form with the test receiver URL
    setFormUrl(testReceiver.url);
    setFormEvents(['job.completed', 'job.failed']);
    setFormActive(true);
    setShowCreateForm(true);
    
    toast({
      title: "Form Pre-filled",
      description: "Test receiver URL added to webhook registration form",
    });
  };

  // Auto-refresh data
  useEffect(() => {
    fetchWebhooks();
    fetchRecentDeliveries();
    fetchStats();
    
    const interval = setInterval(() => {
      fetchRecentDeliveries();
      fetchStats();
      fetchTestRequests();
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <ConnectionHeader />
      
      <div className="flex flex-1">
        <JobSubmissionPanel
          isOpen={isJobPanelOpen}
          onToggle={() => setIsJobPanelOpen(!isJobPanelOpen)}
        />
        
        <div className={`flex-1 p-6 ${isJobPanelOpen ? 'ml-0' : ''}`}>
          <div className="mb-6">
            <h1 className="text-xl font-semibold">Webhook Management</h1>
            <p className="text-sm text-muted-foreground">
              Register webhook endpoints to receive notifications when events occur in the job queue system
            </p>
          </div>

          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{stats.total_deliveries}</div>
                  <div className="text-sm text-muted-foreground">Total Deliveries</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.successful_deliveries}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">{stats.failed_deliveries}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{stats.success_rate}%</div>
                  <div className="text-sm text-muted-foreground">Success Rate</div>
                </CardContent>
              </Card>
            </div>
          )}

          <Tabs defaultValue="webhooks" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="webhooks">Registered Webhooks</TabsTrigger>
              <TabsTrigger value="deliveries">Recent Deliveries</TabsTrigger>
              <TabsTrigger value="test-receiver">Test Receiver</TabsTrigger>
            </TabsList>

            {/* Registered Webhooks Tab */}
            <TabsContent value="webhooks" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Webhooks ({webhooks.length})</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchWebhooks}
                        disabled={loading}
                      >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShowCreateForm(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Webhook
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {webhooks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No webhooks registered yet</p>
                      <p className="text-sm mt-2">Add a webhook to start receiving notifications</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {webhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className="p-4 border rounded-lg"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <Badge variant={webhook.active ? "default" : "secondary"}>
                                {webhook.active ? "Active" : "Inactive"}
                              </Badge>
                              <span className="font-mono text-sm">{webhook.url}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => testWebhook(webhook.id)}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Test
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => deleteWebhook(webhook.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 text-xs">
                            {webhook.events.map((event) => (
                              <Badge key={event} variant="outline" className="text-xs">
                                {EVENT_TYPE_LABELS[event]}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Created: {formatTimestamp(webhook.created_at)}
                            {webhook.secret && " • Has Secret"}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Create Webhook Form */}
              {showCreateForm && (
                <Card>
                  <CardHeader>
                    <CardTitle>Register New Webhook</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="webhook-url">Webhook URL</Label>
                      <Input
                        id="webhook-url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https://your-app.com/webhooks"
                        className="font-mono"
                      />
                    </div>

                    <div>
                      <Label htmlFor="webhook-secret">Secret (Optional)</Label>
                      <Input
                        id="webhook-secret"
                        type="password"
                        value={formSecret}
                        onChange={(e) => setFormSecret(e.target.value)}
                        placeholder="Used for webhook signature verification"
                      />
                    </div>

                    <div>
                      <Label>Event Types</Label>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {Object.entries(EVENT_TYPE_LABELS).map(([eventType, label]) => (
                          <div key={eventType} className="flex items-center space-x-2">
                            <Checkbox
                              id={eventType}
                              checked={formEvents.includes(eventType as WebhookEventType)}
                              onCheckedChange={() => toggleWebhookEvent(eventType as WebhookEventType)}
                            />
                            <Label htmlFor={eventType} className="text-sm">
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="webhook-active"
                        checked={formActive}
                        onCheckedChange={(checked) => setFormActive(checked as boolean)}
                      />
                      <Label htmlFor="webhook-active">Active</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={createWebhook}>
                        Create Webhook
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowCreateForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Recent Deliveries Tab */}
            <TabsContent value="deliveries" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Recent Webhook Deliveries</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={fetchRecentDeliveries}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {deliveries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No webhook deliveries yet</p>
                      <p className="text-sm mt-2">Deliveries will appear here when events occur</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {deliveries.map((delivery) => (
                        <div
                          key={delivery.id}
                          className="p-3 border rounded flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            {delivery.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <div>
                              <div className="font-medium text-sm">
                                {EVENT_TYPE_LABELS[delivery.event_type]}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {delivery.url} • {formatTimestamp(delivery.timestamp)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {delivery.success ? (
                              <div className="text-green-600">
                                {delivery.response_status} • {formatResponseTime(delivery.response_time_ms)}
                              </div>
                            ) : (
                              <div className="text-red-600">
                                {delivery.error_message || 'Failed'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Test Receiver Tab */}
            <TabsContent value="test-receiver" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Webhook Test Receiver</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Generate unique test URLs to receive and inspect webhook payloads (like webhook.site)
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!testReceiver ? (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground mb-4">
                        Create a test webhook receiver to get a unique URL that you can register as a webhook endpoint
                      </p>
                      <Button onClick={createTestReceiver} size="lg">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Test Receiver
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Test Receiver Info */}
                      <div className="p-4 border rounded-lg bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium">Test Receiver Active</h3>
                          <Badge variant="outline">
                            <Clock className="h-3 w-3 mr-1" />
                            Expires in {Math.round((testReceiver.expires_at - Date.now()) / (1000 * 60 * 60))}h
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                value={testReceiver.url}
                                readOnly
                                className="font-mono text-sm"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => copyTestUrl(testReceiver.url)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={registerTestReceiver}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Register as Webhook
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(testReceiver.url, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Test URL
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={clearTestRequests}
                              disabled={testRequests.length === 0}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Clear ({testRequests.length})
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Received Requests */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-medium">Received Requests ({testRequests.length})</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchTestRequests}
                          >
                            <RefreshCw className="h-4 w-4" />
                            Refresh
                          </Button>
                        </div>

                        {testRequests.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground border rounded-lg">
                            <p>No webhook requests received yet</p>
                            <p className="text-sm mt-2">
                              Send a webhook to <code className="bg-muted px-1 rounded">{testReceiver.url}</code> to see it here
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {testRequests.map((req) => (
                              <div
                                key={req.id}
                                className={`p-3 border rounded cursor-pointer transition-colors ${
                                  selectedTestRequest?.id === req.id
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'hover:bg-muted/50'
                                }`}
                                onClick={() => setSelectedTestRequest(req)}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Badge variant={req.method === 'POST' ? 'default' : 'outline'}>
                                      {req.method}
                                    </Badge>
                                    <span className="text-sm text-muted-foreground">
                                      {formatTimestamp(req.timestamp)}
                                    </span>
                                    {req.user_agent && (
                                      <span className="text-xs text-muted-foreground">
                                        {req.user_agent.split(' ')[0]}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {req.ip}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Request Details */}
                        {selectedTestRequest && (
                          <Card className="mt-4">
                            <CardHeader>
                              <CardTitle className="text-sm">
                                Request Details - {selectedTestRequest.method} at {formatTimestamp(selectedTestRequest.timestamp)}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              {/* Headers */}
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
                                <div className="mt-1 p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
                                  {Object.entries(selectedTestRequest.headers).length === 0 ? (
                                    <span className="text-muted-foreground">No headers</span>
                                  ) : (
                                    <pre>{JSON.stringify(selectedTestRequest.headers, null, 2)}</pre>
                                  )}
                                </div>
                              </div>

                              {/* Query Parameters */}
                              {Object.keys(selectedTestRequest.query).length > 0 && (
                                <div>
                                  <Label className="text-xs font-medium text-muted-foreground">Query Parameters</Label>
                                  <div className="mt-1 p-3 bg-muted rounded text-xs font-mono overflow-x-auto">
                                    <pre>{JSON.stringify(selectedTestRequest.query, null, 2)}</pre>
                                  </div>
                                </div>
                              )}

                              {/* Body */}
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">Body</Label>
                                <div className="mt-1 p-3 bg-muted rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                  {selectedTestRequest.body === null || selectedTestRequest.body === '' ? (
                                    <span className="text-muted-foreground">No body content</span>
                                  ) : (
                                    <pre>
                                      {typeof selectedTestRequest.body === 'string'
                                        ? selectedTestRequest.body
                                        : JSON.stringify(selectedTestRequest.body, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              </div>

                              {/* Metadata */}
                              <div>
                                <Label className="text-xs font-medium text-muted-foreground">Request Metadata</Label>
                                <div className="mt-1 p-3 bg-muted rounded text-xs">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="font-medium">Request ID:</span> {selectedTestRequest.id}
                                    </div>
                                    <div>
                                      <span className="font-medium">IP Address:</span> {selectedTestRequest.ip}
                                    </div>
                                    {selectedTestRequest.user_agent && (
                                      <div className="col-span-2">
                                        <span className="font-medium">User Agent:</span> {selectedTestRequest.user_agent}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}