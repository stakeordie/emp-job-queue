"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, Trash2, CheckCircle2, XCircle, Play, Copy, ExternalLink, Clock, AlertCircle, Info, Edit, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ConnectionHeader } from "@/components/ConnectionHeader";
import { JobSubmissionPanel } from "@/components/JobSubmissionPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Webhook event types ACTUALLY available in the system
type WebhookEventType =
  | 'job_submitted'        // Job submitted to queue (published by API)
  | 'update_job_progress'  // Job progress updates (published by workers)
  | 'complete_job'         // Job completion (SUCCESS)
  | 'job_failed'           // Job failure (FAILURE) 
  | 'cancel_job'           // Job cancellation
  | 'worker_status'        // Worker status changes
  | 'machine_status'       // Machine status changes
  | 'workflow_completed'   // Workflow completed (all steps finished)
  | 'workflow_submitted'   // First job in workflow submitted
  | 'workflow_failed';     // Workflow failed (partial or complete failure)

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
  event_type?: string;
}

const WEBHOOK_SERVICE_URL = process.env.NEXT_PUBLIC_WEBHOOK_SERVICE_URL;

const EVENT_TYPE_LABELS: Record<WebhookEventType, string> = {
  'job_submitted': 'Job Submitted (NEW)',
  'update_job_progress': 'Job Progress Updates',
  'complete_job': 'Job Completed (SUCCESS)',
  'job_failed': 'Job Failed (FAILURE)',
  'cancel_job': 'Job Cancelled',
  'worker_status': 'Worker Status Changes',
  'machine_status': 'Machine Status Changes',
  'workflow_completed': 'Workflow Completed',
  'workflow_submitted': 'Workflow Submitted',
  'workflow_failed': 'Workflow Failed',
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
  const [formEvents, setFormEvents] = useState<WebhookEventType[]>(['job_submitted', 'complete_job', 'job_failed']);
  const [formActive, setFormActive] = useState(true);

  // Edit webhook state
  const [editingWebhook, setEditingWebhook] = useState<WebhookEndpoint | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);

  // Test receiver state
  const [testReceiver, setTestReceiver] = useState<WebhookTestReceiver | null>(null);
  const [testRequests, setTestRequests] = useState<WebhookTestRequest[]>([]);
  const [selectedTestRequest, setSelectedTestRequest] = useState<WebhookTestRequest | null>(null);
  const [newRequestIds, setNewRequestIds] = useState<Set<string>>(new Set());
  
  // Delivery details modal state
  const [selectedDelivery, setSelectedDelivery] = useState<WebhookDelivery | null>(null);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

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
        description: `Failed to connect to webhook service. Is it running on port ${WEBHOOK_SERVICE_URL}?`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentDeliveries = async () => {
    try {
      const [deliveriesResponse, webhooksResponse] = await Promise.all([
        fetch(`${WEBHOOK_SERVICE_URL}/deliveries/recent?limit=50`),
        fetch(`${WEBHOOK_SERVICE_URL}/webhooks`)
      ]);
      
      const deliveriesData = await deliveriesResponse.json();
      const webhooksData = await webhooksResponse.json();
      
      if (deliveriesData.success && webhooksData.success) {
        // Create a map of webhook IDs to webhook details
        const webhookMap = new Map();
        webhooksData.data.forEach((webhook: WebhookEndpoint) => {
          webhookMap.set(webhook.id, webhook);
        });
        
        // Enhance delivery data with webhook information
        const enhancedDeliveries = deliveriesData.data.map((delivery: Record<string, unknown>) => {
          const webhook = webhookMap.get(delivery.webhook_id);
          
          // Debug: Log the raw delivery data to see what fields are available
          console.log('Raw delivery data:', delivery);
          console.log('delivery.event_type:', delivery.event_type);
          
          return {
            ...delivery,
            id: `${delivery.webhook_id}_${delivery.event_id}_${delivery.attempt_number}`,
            url: webhook?.url || 'URL not available',
            event_type: delivery.event_type || inferEventType(String(delivery.event_id || '')),
            error_message: delivery.response_status !== 200 && delivery.response_status !== 201 && delivery.response_status !== 204 
              ? `HTTP ${delivery.response_status}: ${getStatusText(Number(delivery.response_status)) || 'Request failed'}` 
              : undefined,
            payload: delivery.payload || { event_id: delivery.event_id, webhook_id: delivery.webhook_id }
          };
        });
        
        setDeliveries(enhancedDeliveries);
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
        setFormEvents(['job_submitted', 'complete_job', 'job_failed']);
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

  const startEditingWebhook = (webhook: WebhookEndpoint) => {
    setEditingWebhook(webhook);
    setFormUrl(webhook.url);
    setFormSecret(webhook.secret || "");
    setFormEvents(webhook.events);
    setFormActive(webhook.active);
    setShowEditForm(true);
    setShowCreateForm(false);
  };

  const updateWebhook = async () => {
    if (!editingWebhook || !formUrl || formEvents.length === 0) {
      toast({
        title: "Error",
        description: "URL and at least one event type are required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/webhooks/${editingWebhook.id}`, {
        method: 'PUT',
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
          description: "Webhook updated successfully",
        });
        setShowEditForm(false);
        setEditingWebhook(null);
        setFormUrl("");
        setFormSecret("");
        setFormEvents(['job_submitted', 'complete_job', 'job_failed']);
        setFormActive(true);
        fetchWebhooks();
      } else {
        throw new Error(data.error || 'Failed to update webhook');
      }
    } catch (error) {
      console.error('Failed to update webhook:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update webhook",
        variant: "destructive",
      });
    }
  };

  const cancelEdit = () => {
    setShowEditForm(false);
    setEditingWebhook(null);
    setFormUrl("");
    setFormSecret("");
    setFormEvents(['complete_job', 'job_failed']);
    setFormActive(true);
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

  const getStatusText = (status?: number) => {
    if (!status) return '';
    const statusTexts: Record<number, string> = {
      200: 'OK',
      201: 'Created',
      202: 'Accepted',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      405: 'Method Not Allowed',
      408: 'Request Timeout',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return statusTexts[status] || '';
  };

  const inferEventType = (eventId: string): WebhookEventType => {
    // Try to infer event type from event ID patterns
    if (eventId.includes('test_wh')) return 'complete_job'; // Test webhooks
    if (eventId.includes('job_')) return 'complete_job';
    if (eventId.includes('worker_')) return 'worker_status';
    if (eventId.includes('machine_')) return 'machine_status';
    return 'complete_job'; // Default fallback
  };

  // Extract event type from webhook request body
  const extractEventTypeFromRequest = (request: WebhookTestRequest): string => {
    try {
      // First check if event_type is already set
      if (request.event_type) {
        return request.event_type;
      }

      // Try to parse the request body to find event_type
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      if (body && typeof body === 'object' && 'event_type' in body) {
        return body.event_type as string;
      }

      // Fallback: try to infer from headers or other clues
      const webhookEvent = request.headers['x-webhook-event'] || request.headers['X-Webhook-Event'];
      if (webhookEvent) {
        return webhookEvent;
      }

      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  // Get color scheme for event type
  const getEventTypeColors = (eventType: string) => {
    const type = eventType.toLowerCase();
    
    if (type.includes('fail') || type.includes('cancel') || type.includes('error')) {
      return {
        border: 'border-red-200',
        bg: 'bg-red-50',
        newBg: 'bg-red-100',
        badge: 'bg-red-100 text-red-700 border-red-200',
        text: 'text-red-700'
      };
    }
    
    if (type.includes('submit') || type.includes('assign') || type.includes('accept') || type.includes('start')) {
      return {
        border: 'border-yellow-200',
        bg: 'bg-yellow-50',
        newBg: 'bg-yellow-100',
        badge: 'bg-yellow-100 text-yellow-700 border-yellow-200',
        text: 'text-yellow-700'
      };
    }
    
    if (type.includes('progress') || type.includes('update') || type.includes('status')) {
      return {
        border: 'border-blue-200',
        bg: 'bg-blue-50',
        newBg: 'bg-blue-100',
        badge: 'bg-blue-100 text-blue-700 border-blue-200',
        text: 'text-blue-700'
      };
    }
    
    if (type.includes('complete') || type.includes('success') || type.includes('finish')) {
      return {
        border: 'border-green-200',
        bg: 'bg-green-50',
        newBg: 'bg-green-100',
        badge: 'bg-green-100 text-green-700 border-green-200',
        text: 'text-green-700'
      };
    }

    // Default/unknown
    return {
      border: 'border-gray-200',
      bg: 'bg-gray-50',
      newBg: 'bg-gray-100',
      badge: 'bg-gray-100 text-gray-700 border-gray-200',
      text: 'text-gray-700'
    };
  };

  // Test Receiver API Functions
  const createTestReceiver = async () => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/test-receivers`, {
        method: 'POST',
      });

      const data = await response.json();
      if (data.success) {
        // Update URL to use webhook service endpoint
        const receiverData = {
          ...data.data,
          url: `${WEBHOOK_SERVICE_URL}/test-receivers/${data.data.id}/webhook`,
        };
        setTestReceiver(receiverData);
        setTestRequests([]);
        setNewRequestIds(new Set());
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

  const fetchTestRequests = useCallback(async () => {
    if (!testReceiver) return;

    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/test-receivers/${testReceiver.id}/requests`);
      const data = await response.json();
      if (data.success) {
        const newRequests = data.data.requests;
        
        // Identify new requests by comparing with existing ones
        const existingIds = new Set(testRequests.map((req: WebhookTestRequest) => req.id));
        const newRequestIds = newRequests
          .filter((req: WebhookTestRequest) => !existingIds.has(req.id))
          .map((req: WebhookTestRequest) => req.id);
        
        // Mark new requests for highlighting
        if (newRequestIds.length > 0 && testRequests.length > 0) {
          setNewRequestIds(new Set(newRequestIds));
          
          // Show toast for new requests
          toast({
            title: "New Request Received",
            description: `${newRequestIds.length} new webhook request${newRequestIds.length === 1 ? '' : 's'} received`,
          });

          // Clear new request highlighting after 3 seconds
          setTimeout(() => {
            setNewRequestIds(prev => {
              const updated = new Set(prev);
              newRequestIds.forEach((id: string) => updated.delete(id));
              return updated;
            });
          }, 3000);
        }
        
        setTestRequests(newRequests);
      } else {
        console.error('Failed to fetch test requests:', data.error);
        if (data.error === 'Test receiver not found') {
          // Receiver expired or deleted, clear local state and localStorage
          setTestReceiver(null);
          setTestRequests([]);
          setSelectedTestRequest(null);
            setNewRequestIds(new Set());
          localStorage.removeItem('webhookTestReceiver');
          toast({
            title: "Receiver Expired",
            description: "The test receiver has expired or been deleted. Create a new one.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch test requests:', error);
    }
  }, [testReceiver, testRequests, toast]);

  const clearTestRequests = async () => {
    if (!testReceiver) return;

    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/test-receivers/${testReceiver.id}/requests`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (data.success) {
        setTestRequests([]);
        setSelectedTestRequest(null);
        setNewRequestIds(new Set());
        toast({
          title: "Success",
          description: `Cleared ${data.cleared_count} test requests`,
        });
      } else {
        console.error('Failed to clear test requests:', data.error);
        if (data.error === 'Test receiver not found') {
          // Receiver expired or deleted, clear local state and localStorage
          setTestReceiver(null);
          setTestRequests([]);
          setSelectedTestRequest(null);
            setNewRequestIds(new Set());
          localStorage.removeItem('webhookTestReceiver');
          toast({
            title: "Receiver Not Found",
            description: "The test receiver no longer exists. Create a new one.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to clear test requests",
            variant: "destructive",
          });
        }
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
    setFormEvents(['complete_job', 'job_failed']);
    setFormActive(true);
    setShowCreateForm(true);
    
    toast({
      title: "Form Pre-filled",
      description: "Test receiver URL added to webhook registration form",
    });
  };

  // Auto-refresh data
  // Validate if a receiver still exists on the server
  const validateTestReceiver = async (receiver: WebhookTestReceiver) => {
    try {
      const response = await fetch(`${WEBHOOK_SERVICE_URL}/test-receivers/${receiver.id}/requests`);
      if (response.ok) {
        return true;
      } else {
        // Receiver doesn't exist on server, remove from localStorage
        localStorage.removeItem('webhookTestReceiver');
        return false;
      }
    } catch (error) {
      console.error('Failed to validate test receiver:', error);
      return false;
    }
  };

  // Load test receiver from localStorage on mount
  useEffect(() => {
    const savedReceiver = localStorage.getItem('webhookTestReceiver');
    if (savedReceiver) {
      try {
        const receiver = JSON.parse(savedReceiver);
        // Check if receiver is still valid (not expired)
        if (receiver.expires_at > Date.now()) {
          // Validate with server and only set if it still exists
          validateTestReceiver(receiver).then(isValid => {
            if (isValid) {
              setTestReceiver(receiver);
            }
          });
        } else {
          // Receiver expired, remove from localStorage
          localStorage.removeItem('webhookTestReceiver');
        }
      } catch (error) {
        console.error('Failed to parse saved test receiver:', error);
        localStorage.removeItem('webhookTestReceiver');
      }
    }
  }, []);

  // Save test receiver to localStorage when it changes
  useEffect(() => {
    if (testReceiver) {
      localStorage.setItem('webhookTestReceiver', JSON.stringify(testReceiver));
    } else {
      localStorage.removeItem('webhookTestReceiver');
    }
  }, [testReceiver]);

  useEffect(() => {
    fetchWebhooks();
    fetchRecentDeliveries();
    fetchStats();
    
    const interval = setInterval(() => {
      fetchRecentDeliveries();
      fetchStats();
      // Only poll for test requests if we have an active test receiver
      if (testReceiver) {
        fetchTestRequests();
      }
    }, 5000);
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testReceiver]);

  // Separate effect for more frequent polling of test requests when receiver is active
  useEffect(() => {
    if (!testReceiver) return;

    // Poll test requests more frequently when receiver is active
    const testRequestsInterval = setInterval(() => {
      fetchTestRequests();
    }, 2000); // Poll every 2 seconds for faster updates

    return () => clearInterval(testRequestsInterval);
  }, [testReceiver, fetchTestRequests]);

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
                        onClick={() => {
                          setShowCreateForm(true);
                          setShowEditForm(false);
                          setEditingWebhook(null);
                        }}
                        disabled={showEditForm}
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
                                onClick={() => startEditingWebhook(webhook)}
                              >
                                <Edit className="h-3 w-3" />
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

              {/* Edit Webhook Form */}
              {showEditForm && editingWebhook && (
                <Card>
                  <CardHeader>
                    <CardTitle>Edit Webhook</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="edit-webhook-url">Webhook URL</Label>
                      <Input
                        id="edit-webhook-url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https://your-app.com/webhooks"
                        className="font-mono"
                      />
                    </div>

                    <div>
                      <Label htmlFor="edit-webhook-secret">Secret (Optional)</Label>
                      <Input
                        id="edit-webhook-secret"
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
                              id={`edit-${eventType}`}
                              checked={formEvents.includes(eventType as WebhookEventType)}
                              onCheckedChange={() => toggleWebhookEvent(eventType as WebhookEventType)}
                            />
                            <Label htmlFor={`edit-${eventType}`} className="text-sm">
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="edit-webhook-active"
                        checked={formActive}
                        onCheckedChange={(checked) => setFormActive(checked as boolean)}
                      />
                      <Label htmlFor="edit-webhook-active">Active</Label>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button onClick={updateWebhook}>
                        Update Webhook
                      </Button>
                      <Button
                        variant="outline"
                        onClick={cancelEdit}
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
                    <div>
                      <CardTitle>Recent Webhook Deliveries</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Click on any delivery to view detailed information
                      </p>
                    </div>
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
                          className="p-3 border rounded flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => {
                            setSelectedDelivery(delivery);
                            setShowDeliveryModal(true);
                          }}
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
                          <div className="flex items-center gap-2">
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
                            <Info className="h-3 w-3 text-muted-foreground" />
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={createTestReceiver}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              New Receiver
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Received Requests */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">Received Requests ({testRequests.length})</h3>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                              Auto-updating every 2s
                            </div>
                          </div>
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
                            {testRequests.map((req) => {
                              const eventType = extractEventTypeFromRequest(req);
                              const colors = getEventTypeColors(eventType);
                              const isNew = newRequestIds.has(req.id);
                              
                              return (
                                <div key={req.id} className={`border rounded overflow-hidden transition-all duration-1000 ${
                                  isNew ? `${colors.border} ${colors.newBg} shadow-md` : `border-gray-200 ${colors.bg}`
                                }`}>
                                  <div
                                    className={`p-3 cursor-pointer transition-colors ${
                                      selectedTestRequest?.id === req.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'hover:bg-muted/50'
                                    }`}
                                    onClick={() => setSelectedTestRequest(selectedTestRequest?.id === req.id ? null : req)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3">
                                        <Badge variant={req.method === 'POST' ? 'default' : 'outline'}>
                                          {req.method}
                                        </Badge>
                                        {eventType !== 'unknown' && (
                                          <Badge variant="outline" className={`text-xs ${colors.badge} border`}>
                                            {eventType.replace('_', ' ').toUpperCase()}
                                          </Badge>
                                        )}
                                        <span className="text-sm text-muted-foreground">
                                          {formatTimestamp(req.timestamp)}
                                        </span>
                                        {req.user_agent && (
                                          <span className="text-xs text-muted-foreground">
                                            {req.user_agent.split(' ')[0]}
                                          </span>
                                        )}
                                        {isNew && (
                                          <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-200 animate-pulse">
                                            NEW
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">
                                          {req.ip}
                                        </span>
                                        {selectedTestRequest?.id === req.id ? (
                                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                
                                {/* Expandable Details */}
                                {selectedTestRequest?.id === req.id && (
                                  <div className="border-t bg-muted/30 p-4">
                                    <div className="space-y-4">
                                      {/* Headers */}
                                      <div>
                                        <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
                                        <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto border">
                                          {Object.entries(req.headers).length === 0 ? (
                                            <span className="text-muted-foreground">No headers</span>
                                          ) : (
                                            <pre>{JSON.stringify(req.headers, null, 2)}</pre>
                                          )}
                                        </div>
                                      </div>

                                      {/* Query Parameters */}
                                      {Object.keys(req.query).length > 0 && (
                                        <div>
                                          <Label className="text-xs font-medium text-muted-foreground">Query Parameters</Label>
                                          <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto border">
                                            <pre>{JSON.stringify(req.query, null, 2)}</pre>
                                          </div>
                                        </div>
                                      )}

                                      {/* Body */}
                                      <div>
                                        <Label className="text-xs font-medium text-muted-foreground">Request Body</Label>
                                        <div className="mt-1 p-3 bg-background rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto border">
                                          {req.body === null || req.body === '' ? (
                                            <span className="text-muted-foreground">No body content</span>
                                          ) : (
                                            <pre>
                                              {typeof req.body === 'string'
                                                ? req.body
                                                : JSON.stringify(req.body, null, 2)}
                                            </pre>
                                          )}
                                        </div>
                                      </div>

                                      {/* Metadata */}
                                      <div>
                                        <Label className="text-xs font-medium text-muted-foreground">Request Metadata</Label>
                                        <div className="mt-1 p-3 bg-background rounded text-xs border">
                                          <div className="grid grid-cols-2 gap-2">
                                            <div>
                                              <span className="font-medium">Request ID:</span> {req.id}
                                            </div>
                                            <div>
                                              <span className="font-medium">IP Address:</span> {req.ip}
                                            </div>
                                            {req.user_agent && (
                                              <div className="col-span-2">
                                                <span className="font-medium">User Agent:</span> {req.user_agent}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                </div>
                              );
                            })}
                          </div>
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
      
      {/* Webhook Delivery Details Modal */}
      <Dialog open={showDeliveryModal} onOpenChange={setShowDeliveryModal}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedDelivery?.success ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              Webhook Delivery Details
            </DialogTitle>
            <DialogDescription>
              {selectedDelivery?.success ? 'Webhook delivered successfully' : 'Webhook delivery failed'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedDelivery && (
            <div className="space-y-4">
              {/* Delivery Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Event Type</Label>
                  <div className="text-sm font-medium mt-1">
                    {selectedDelivery.event_type ? EVENT_TYPE_LABELS[selectedDelivery.event_type] || selectedDelivery.event_type : 'Unknown'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Timestamp</Label>
                  <div className="text-sm font-medium mt-1">
                    {selectedDelivery.timestamp ? formatTimestamp(selectedDelivery.timestamp) : 'Unknown'}
                  </div>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground">Destination URL</Label>
                  <div className="text-sm font-mono mt-1 break-all bg-muted p-2 rounded">
                    {selectedDelivery.url && selectedDelivery.url !== 'URL not available' ? (
                      <span>{selectedDelivery.url}</span>
                    ) : (
                      <span className="text-muted-foreground italic">URL not available from webhook service</span>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Attempt Number</Label>
                  <div className="text-sm font-medium mt-1">
                    {selectedDelivery.attempt_number || 1} / 3
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <div className="text-sm font-medium mt-1">
                    {selectedDelivery.success ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Success
                      </span>
                    ) : (
                      <span className="text-red-600 flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Failed
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Response Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {selectedDelivery.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    Response Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedDelivery.success ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">HTTP Status</Label>
                          <div className="text-sm font-medium mt-1 text-green-600">
                            {selectedDelivery.response_status} {getStatusText(selectedDelivery.response_status)}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-muted-foreground">Response Time</Label>
                          <div className="text-sm font-medium mt-1">
                            {formatResponseTime(selectedDelivery.response_time_ms)}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs font-medium text-muted-foreground">Error Details</Label>
                        <div className="mt-1 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                          <div className="font-medium mb-1">
                            {selectedDelivery.error_message || 'Unknown error occurred'}
                          </div>
                          {selectedDelivery.response_status && (
                            <div className="text-xs opacity-75">
                              HTTP Status: {selectedDelivery.response_status}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Common error troubleshooting */}
                      <div className="bg-blue-50 border border-blue-200 rounded p-3">
                        <Label className="text-xs font-medium text-blue-800">Common Causes:</Label>
                        <ul className="text-xs text-blue-700 mt-1 space-y-1">
                          <li>• Destination URL is unreachable or down</li>
                          <li>• Firewall blocking incoming webhooks</li>
                          <li>• SSL/TLS certificate issues</li>
                          <li>• Webhook endpoint returning non-2xx status code</li>
                          <li>• Request timeout (endpoint too slow to respond)</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Request Payload */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Request Payload</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted rounded p-3 overflow-x-auto">
                    <pre className="text-xs font-mono">
                      {JSON.stringify(selectedDelivery.payload, null, 2)}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Additional Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Additional Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex justify-between items-center py-1 border-b border-border">
                      <span className="text-muted-foreground">Delivery ID:</span>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {selectedDelivery.id || 'Not available'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border">
                      <span className="text-muted-foreground">Webhook ID:</span>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {selectedDelivery.webhook_id || 'Not available'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-1 border-b border-border">
                      <span className="text-muted-foreground">Event ID:</span>
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                        {selectedDelivery.event_id || 'Not available'}
                      </span>
                    </div>
                    
                    {/* Retry Information */}
                    <div className="mt-3 p-3 bg-muted/50 rounded">
                      <Label className="text-xs font-medium text-muted-foreground">Retry Information</Label>
                      <div className="mt-2 space-y-1 text-xs">
                        <div>Attempt: {selectedDelivery.attempt_number || 1} of 3</div>
                        {selectedDelivery.attempt_number && selectedDelivery.attempt_number > 1 && (
                          <div className="text-orange-600">
                            This delivery has been retried {selectedDelivery.attempt_number - 1} time(s)
                          </div>
                        )}
                        {!selectedDelivery.success && selectedDelivery.attempt_number < 3 && (
                          <div className="text-blue-600">
                            Automatic retry scheduled
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Debugging Tips */}
                    {!selectedDelivery.success && (
                      <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                        <Label className="text-xs font-medium text-yellow-800">Debugging Tips:</Label>
                        {selectedDelivery.response_status === 404 ? (
                          <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                            <li>• <strong>404 Not Found:</strong> The webhook URL doesn&apos;t exist</li>
                            <li>• Check if your webhook receiver is still active</li>
                            <li>• Verify the webhook URL is correct and accessible</li>
                            <li>• Test receiver URLs may have expired (24-hour limit)</li>
                          </ul>
                        ) : (
                          <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                            <li>• Check if your webhook endpoint is publicly accessible</li>
                            <li>• Verify the URL is correct and responds to POST requests</li>
                            <li>• Test with tools like ngrok for local development</li>
                            <li>• Check server logs for incoming requests</li>
                            <li>• Ensure your endpoint returns 2xx status codes</li>
                          </ul>
                        )}
                      </div>
                    )}
                    
                    {/* Raw Data Debug Info (only in development) */}
                    {process.env.NODE_ENV === 'development' && (
                      <details className="mt-3">
                        <summary className="text-xs font-medium text-muted-foreground cursor-pointer">
                          Debug: Raw Delivery Data
                        </summary>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                          {JSON.stringify(selectedDelivery, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}