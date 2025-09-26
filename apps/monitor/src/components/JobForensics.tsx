'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Database, RefreshCw, Search, Info, Image as ImageIcon, Download, ExternalLink, User, Wallet, MessageCircle, RotateCcw, Play, CheckCircle, XCircle, Clock, ArrowRight, Zap, FileText, Webhook, Square, DollarSign } from 'lucide-react';
import SmartImage from './SmartImage';
import type {
  JobForensicsData,
  JobWithUserInfo,
  FailedJobsAnalysis,
  WorkflowStep,
  WorkflowOutput,
  FlatFile
} from './JobForensics.types';
import { get as _get, renderValue as _renderValue } from './JobForensics.types';

// Component to display worker and API attestation records for debugging
function AttestationRecords({ jobId, workflowId }: { jobId: string; workflowId?: string }) {
  const [workerAttestation, setWorkerAttestation] = useState<any>(null);
  const [apiAttestation, setApiAttestation] = useState<any>(null);
  const [notificationAttestations, setNotificationAttestations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [webhookTriggerLoading, setWebhookTriggerLoading] = useState(false);
  const [webhookTriggerResult, setWebhookTriggerResult] = useState<any>(null);
  const [retryJobLoading, setRetryJobLoading] = useState(false);
  const [retryJobResult, setRetryJobResult] = useState<any>(null);

  const loadAttestations = async () => {
    setLoading(true);
    setHasChecked(true);
    try {
      const targetId = workflowId || jobId;
      if (targetId) {
        // Use unified attestations endpoint from API server
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
        const response = await fetch(`${apiBaseUrl}/api/attestations?workflow_id=${targetId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Set API attestation
            setApiAttestation(data.api_attestation);

            // Set notification attestations
            setNotificationAttestations(data.notification_attestations || []);

            // Handle worker attestations (group by retry number)
            if (data.worker_attestations && data.worker_attestations.length > 0) {
              // Group attestations by retry_count
              const groupedByRetry = data.worker_attestations.reduce((acc: any, att: any) => {
                const retryCount = att.retry_count || 0;
                if (!acc[retryCount]) acc[retryCount] = [];
                acc[retryCount].push(att);
                return acc;
              }, {});

              // Sort by retry count and sort attestations within each group by step number
              const sortedRetryGroups = Object.keys(groupedByRetry)
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(retryCount => ({
                  retry_count: parseInt(retryCount),
                  attestations: groupedByRetry[retryCount].sort((a: any, b: any) => {
                    // Sort by current_step if available, otherwise by completed_at timestamp
                    const stepA = parseInt(a.current_step || '0');
                    const stepB = parseInt(b.current_step || '0');
                    if (stepA !== stepB) return stepA - stepB;
                    // Fallback to timestamp if steps are equal
                    return new Date(a.completed_at || 0).getTime() - new Date(b.completed_at || 0).getTime();
                  })
                }));

              if (sortedRetryGroups.length === 1 && sortedRetryGroups[0].attestations.length === 1) {
                // Single attestation, single retry
                setWorkerAttestation(sortedRetryGroups[0].attestations[0]);
              } else {
                // Multiple retries or multiple steps - create grouped view
                setWorkerAttestation({
                  ...data.worker_attestations[0],
                  _grouped_by_retry: true,
                  _retry_groups: sortedRetryGroups,
                  _all_attestations: data.worker_attestations
                });
              }
            } else {
              setWorkerAttestation(null);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load attestations:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasAttestations = workerAttestation || apiAttestation || notificationAttestations.length > 0;

  // Trigger workflow completion webhook manually
  const triggerWorkflowWebhook = async () => {
    if (!workflowId) return;

    setWebhookTriggerLoading(true);
    setWebhookTriggerResult(null);

    try {
      const response = await fetch(`/api/workflows/${workflowId}/trigger-webhook`, {
        method: 'POST'
      });
      const result = await response.json();
      setWebhookTriggerResult(result);
    } catch (error) {
      setWebhookTriggerResult({
        success: false,
        error: 'Failed to trigger webhook'
      });
    } finally {
      setWebhookTriggerLoading(false);
    }
  };

  // Retry job manually
  const retryJob = async () => {
    const targetId = workflowId || jobId;
    if (!targetId) return;

    setRetryJobLoading(true);
    setRetryJobResult(null);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
      const response = await fetch(`${apiBaseUrl}/api/jobs/${targetId}/retry`, {
        method: 'POST'
      });
      const result = await response.json();
      setRetryJobResult(result);
    } catch (error) {
      setRetryJobResult({
        success: false,
        error: 'Failed to retry job'
      });
    } finally {
      setRetryJobLoading(false);
    }
  };

  // Auto-load attestations when component mounts
  useEffect(() => {
    loadAttestations();
  }, [jobId, workflowId]);

  // Always show the component - don't hide it
  // if (!hasAttestations && !loading) {
  //   return null;
  // }

  return (
    <div>
      <div className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Completion Attestations
        <div className="ml-auto flex gap-2">
          {workflowId && (
            <Button
              size="sm"
              variant="outline"
              onClick={triggerWorkflowWebhook}
              disabled={webhookTriggerLoading}
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              {webhookTriggerLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Webhook className="h-3 w-3 mr-1" />}
              Trigger Webhook
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={retryJob}
            disabled={retryJobLoading}
            className="text-blue-600 border-blue-200 hover:bg-blue-50"
          >
            {retryJobLoading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
            Retry Job
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={loadAttestations}
            disabled={loading}
          >
            {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
            {hasAttestations ? 'Reload' : 'Load'} Attestations
          </Button>
        </div>
      </div>

      {/* Show webhook trigger result */}
      {webhookTriggerResult && (
        <div className={`text-sm p-3 border rounded mb-3 ${
          webhookTriggerResult.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {webhookTriggerResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {webhookTriggerResult.success ? 'Webhook Triggered Successfully' : 'Webhook Trigger Failed'}
          </div>
          <div className="text-xs mt-1">
            {webhookTriggerResult.message || webhookTriggerResult.error}
          </div>
          {webhookTriggerResult.success && webhookTriggerResult.outputs_count > 0 && (
            <div className="text-xs mt-1">
              Workflow has {webhookTriggerResult.outputs_count} outputs available
            </div>
          )}
        </div>
      )}

      {/* Show retry job result */}
      {retryJobResult && (
        <div className={`text-sm p-3 border rounded mb-3 ${
          retryJobResult.success
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {retryJobResult.success ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {retryJobResult.success ? 'Job Retry Initiated Successfully' : 'Job Retry Failed'}
          </div>
          <div className="text-xs mt-1">
            {retryJobResult.message || retryJobResult.error}
          </div>
          {retryJobResult.success && retryJobResult.new_job_id && (
            <div className="text-xs mt-1">
              New job ID: {retryJobResult.new_job_id}
            </div>
          )}
        </div>
      )}

      {/* Show status when checked but no attestations found */}
      {hasChecked && !loading && !hasAttestations && (
        <div className="text-sm text-muted-foreground p-3 bg-gray-50 border border-gray-200 rounded">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            No attestations found for this {workflowId ? 'workflow' : 'job'}
          </div>
          <div className="text-xs mt-1 text-gray-500">
            This may be an older job that predates the attestation system.
          </div>
        </div>
      )}

      {hasAttestations && (
        <div className="space-y-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
          {/* Worker Attestations - Grouped by retry number */}
          {workerAttestation && workerAttestation._grouped_by_retry && workerAttestation._retry_groups ? (
            // Multiple retries or steps - show grouped by retry
            <div className="space-y-6">
              {workerAttestation._retry_groups.map((retryGroup: any, groupIdx: number) => (
                <div key={groupIdx} className="border border-gray-200 rounded p-3">
                  <div className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Badge variant={retryGroup.retry_count === 0 ? 'default' : 'secondary'}>
                      {retryGroup.retry_count === 0 ? 'Initial Attempt' : `Retry ${retryGroup.retry_count}`}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      ({retryGroup.attestations.length} attestation{retryGroup.attestations.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="space-y-4">
                    {retryGroup.attestations.map((step: any, idx: number) => (
                <div key={idx}>
                  <div className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    Worker Completion Proof{step.current_step ? ` - Step ${step.current_step}` : ''}{step.total_steps ? ` of ${step.total_steps}` : ''}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <div className="font-medium text-muted-foreground">Job ID</div>
                      <code className="bg-white px-2 py-1 rounded border text-[10px]">{step.job_id}</code>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Worker ID</div>
                      <code className="bg-white px-2 py-1 rounded border text-[10px]">{step.worker_id}</code>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Completed At</div>
                      <div>{new Date(step.completed_at).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Status</div>
                      <Badge variant={step.status === 'completed' ? 'default' : 'destructive'}>
                        {step.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Retry Count</div>
                      <Badge variant={step.retry_count > 0 ? 'secondary' : 'outline'}>
                        {step.retry_count || 0}
                      </Badge>
                    </div>
                    <div>
                      <div className="font-medium text-muted-foreground">Machine ID</div>
                      <code className="bg-white px-2 py-1 rounded border text-[10px]">{step.machine_id || 'unknown'}</code>
                    </div>
                  </div>
                  {/* Asset locations for this step */}
                  {step.result && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-muted-foreground">Asset Locations</div>
                      {(() => {
                        try {
                          const result = typeof step.result === 'string'
                            ? JSON.parse(step.result)
                            : step.result;

                          const urls: string[] = [];

                          // Extract URLs from the result - remove duplicates
                          if (result?.data?.image_url) urls.push(result.data.image_url);
                          if (result?.data?.file_url && !urls.includes(result.data.file_url)) urls.push(result.data.file_url);
                          if (result?.data?.cdnUrl && !urls.includes(result.data.cdnUrl)) urls.push(result.data.cdnUrl);
                          if (result?.data?.saved_asset?.fileUrl && !urls.includes(result.data.saved_asset.fileUrl)) urls.push(result.data.saved_asset.fileUrl);
                          if (result?.data?.saved_asset?.cdnUrl && !urls.includes(result.data.saved_asset.cdnUrl)) urls.push(result.data.saved_asset.cdnUrl);

                          if (urls.length > 0) {
                            return (
                              <div className="space-y-1 mt-1">
                                {urls.map((url, urlIdx) => (
                                  <div key={urlIdx} className="flex items-center gap-2">
                                    <ExternalLink className="h-3 w-3 text-blue-600" />
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:underline break-all"
                                    >
                                      {url}
                                    </a>
                                  </div>
                                ))}
                              </div>
                            );
                          } else {
                            return (
                              <div className="text-xs text-gray-500 mt-1">
                                No asset URLs found in this step
                              </div>
                            );
                          }
                        } catch (e) {
                          return (
                            <div className="text-xs text-red-500 mt-1">
                              Error parsing asset locations
                            </div>
                          );
                        }
                      })()}
                    </div>
                  )}
                  {step.raw_service_output && (
                    <div className="mt-2">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Raw Service Output (Debugging)</div>
                      <details className="border rounded bg-gray-50">
                        <summary className="px-2 py-1 text-xs cursor-pointer hover:bg-gray-100">
                          Click to view raw service response for step {step.current_step || idx + 1}
                        </summary>
                        <pre className="p-2 text-xs overflow-auto max-h-40 text-gray-700">
                          {typeof step.raw_service_output === 'string'
                            ? step.raw_service_output
                            : JSON.stringify(step.raw_service_output, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : workerAttestation ? (
            // Single-step job - show single attestation
            <div>
              <div className="text-sm font-medium text-green-800 mb-2 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Worker Completion Proof
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-medium text-muted-foreground">Worker ID</div>
                  <code className="bg-white px-2 py-1 rounded border">{workerAttestation.worker_id}</code>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Completed At</div>
                  <div>{new Date(workerAttestation.completed_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Status</div>
                  <Badge variant={workerAttestation.status === 'completed' ? 'default' : 'destructive'}>
                    {workerAttestation.status}
                  </Badge>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Machine ID</div>
                  <code className="bg-white px-2 py-1 rounded border text-xs">{workerAttestation.machine_id}</code>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Retry Count</div>
                  <Badge variant={workerAttestation.retry_count > 0 ? 'secondary' : 'outline'}>
                    {workerAttestation.retry_count || 0}
                  </Badge>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Worker Version</div>
                  <code className="bg-white px-2 py-1 rounded border text-xs">{workerAttestation.worker_version || 'unknown'}</code>
                </div>
              </div>
              {workerAttestation.result && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground">Asset Locations</div>
                  {(() => {
                    try {
                      const result = typeof workerAttestation.result === 'string'
                        ? JSON.parse(workerAttestation.result)
                        : workerAttestation.result;

                      const urls: string[] = [];

                      // Extract URLs from the result - remove duplicates
                      if (result?.data?.image_url) urls.push(result.data.image_url);
                      if (result?.data?.file_url && !urls.includes(result.data.file_url)) urls.push(result.data.file_url);
                      if (result?.data?.cdnUrl && !urls.includes(result.data.cdnUrl)) urls.push(result.data.cdnUrl);
                      if (result?.data?.saved_asset?.fileUrl && !urls.includes(result.data.saved_asset.fileUrl)) urls.push(result.data.saved_asset.fileUrl);
                      if (result?.data?.saved_asset?.cdnUrl && !urls.includes(result.data.saved_asset.cdnUrl)) urls.push(result.data.saved_asset.cdnUrl);

                      if (urls.length > 0) {
                        return (
                          <div className="space-y-1 mt-1">
                            {urls.map((url, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <ExternalLink className="h-3 w-3 text-blue-600" />
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline break-all"
                                >
                                  {url}
                                </a>
                              </div>
                            ))}
                          </div>
                        );
                      } else {
                        return (
                          <div className="text-xs text-gray-500 mt-1">
                            No asset URLs found in attestation
                          </div>
                        );
                      }
                    } catch (e) {
                      return (
                        <div className="text-xs text-red-500 mt-1">
                          Error parsing asset locations
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
              {workerAttestation.raw_service_output && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Raw Service Output (Debugging)</div>
                  <details className="border rounded bg-gray-50">
                    <summary className="px-2 py-1 text-xs cursor-pointer hover:bg-gray-100">
                      Click to view raw service response
                    </summary>
                    <pre className="p-2 text-xs overflow-auto max-h-40 text-gray-700">
                      {typeof workerAttestation.raw_service_output === 'string'
                        ? workerAttestation.raw_service_output
                        : JSON.stringify(workerAttestation.raw_service_output, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          ) : null}

          {/* API Workflow Attestation */}
          {apiAttestation && (
            <div>
              <div className="text-sm font-medium text-blue-800 mb-2 flex items-center gap-1">
                <Zap className="h-4 w-4" />
                API Workflow Completion Proof
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="font-medium text-muted-foreground">Workflow ID</div>
                  <code className="bg-white px-2 py-1 rounded border">{apiAttestation.workflow_id}</code>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">API Determined Complete</div>
                  <div>{new Date(apiAttestation.api_determined_complete_at).toLocaleString()}</div>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">API Instance</div>
                  <code className="bg-white px-2 py-1 rounded border text-xs">{apiAttestation.api_instance}</code>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Asset Count</div>
                  <Badge variant="outline">{apiAttestation.asset_locations?.length || 0} assets</Badge>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">Retry Count</div>
                  <Badge variant={apiAttestation.retry_count > 0 ? 'secondary' : 'outline'}>
                    {apiAttestation.retry_count || 0}
                  </Badge>
                </div>
                <div>
                  <div className="font-medium text-muted-foreground">API Version</div>
                  <code className="bg-white px-2 py-1 rounded border text-xs">{apiAttestation.api_version || 'unknown'}</code>
                </div>
              </div>
              {apiAttestation.asset_locations && apiAttestation.asset_locations.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Saved Assets</div>
                  <div className="space-y-1">
                    {apiAttestation.asset_locations.map((url: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <ExternalLink className="h-3 w-3 text-blue-600" />
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline break-all"
                        >
                          {url}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notification Attestations */}
          {notificationAttestations.length > 0 && (
            <div>
              <div className="text-sm font-medium text-purple-800 mb-2 flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                User Notification Proof ({notificationAttestations.length})
              </div>
              <div className="space-y-3">
                {notificationAttestations.map((attestation: any, idx: number) => (
                  <div key={idx} className="bg-purple-50 border border-purple-200 rounded p-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="font-medium text-muted-foreground">User ID</div>
                        <code className="bg-white px-2 py-1 rounded border text-[10px]">{attestation.miniapp_user_id}</code>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Notification Method</div>
                        <Badge variant="outline" className="text-xs">{attestation.notification_method || 'unknown'}</Badge>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Sent At</div>
                        <div>{new Date(attestation.attested_at).toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Success</div>
                        <Badge variant={attestation.success ? 'default' : 'destructive'} className="text-xs">
                          {attestation.success ? 'Sent' : 'Failed'}
                        </Badge>
                      </div>
                      {attestation.notification_type && (
                        <div>
                          <div className="font-medium text-muted-foreground">Type</div>
                          <Badge variant="secondary" className="text-xs">{attestation.notification_type}</Badge>
                        </div>
                      )}
                      {attestation.attestation_id && (
                        <div>
                          <div className="font-medium text-muted-foreground">Attestation ID</div>
                          <code className="bg-white px-2 py-1 rounded border text-[10px]">{attestation.attestation_id}</code>
                        </div>
                      )}
                    </div>
                    {attestation.notification_content && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-muted-foreground">Content</div>
                        <div className="text-xs bg-white p-2 rounded border mt-1">{attestation.notification_content}</div>
                      </div>
                    )}
                    {attestation.error_message && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-red-600">Error</div>
                        <div className="text-xs text-red-600 bg-red-50 p-2 rounded border mt-1">{attestation.error_message}</div>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-purple-700 italic">
                      {attestation.attestation || 'Miniapp attests that it sent a notification to the user'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-yellow-700 bg-yellow-100 p-2 rounded border">
            <strong>💡 Attestations:</strong> These records prove the worker completed the job, API determined workflow completion,
            and notifications were sent to users, even if EmProps verification failed. Used for recovery of orphaned workflows.
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobForensics() {
  const [forensicsData, setForensicsData] = useState<JobForensicsData | null>(null);
  const [failedAnalysis, setFailedAnalysis] = useState<FailedJobsAnalysis | null>(null);
  const [allJobs, setAllJobs] = useState<JobWithUserInfo[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalJobs, setTotalJobs] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [retryingJobIds, setRetryingJobIds] = useState<Set<string>>(new Set());
  const [resettingJobIds, setResettingJobIds] = useState<Set<string>>(new Set());
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const jobsPerPage = 20;


  const loadFailedAnalysis = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/jobs/failed-analysis?limit=100');
      const data = await response.json();
      if (data.success) {
        setFailedAnalysis(data.analysis);
      }
    } catch {
      setError('Failed to load failed job analysis');
    } finally {
      setLoading(false);
    }
  };

  const loadJobs = async (page: number = 0, append: boolean = false, searchTerm: string = '') => {
    setJobsLoading(true);
    try {
      const offset = page * jobsPerPage;
      // Ensure searchTerm is always a string to prevent [object Object] issues
      const safSearchTerm = String(searchTerm || '').trim();
      const searchParam = safSearchTerm ? `&search=${encodeURIComponent(safSearchTerm)}` : '';
      const response = await fetch(`/api/jobs/all?limit=${jobsPerPage}&offset=${offset}${searchParam}`);
      const data = await response.json();
      if (data.success) {
        if (append) {
          setAllJobs(prev => [...prev, ...data.jobs]);
        } else {
          setAllJobs(data.jobs);
        }
        setTotalJobs(data.total);
        setHasMore(data.hasMore);
        setCurrentPage(page);
      }
    } catch {
      setError('Failed to load jobs list');
    } finally {
      setJobsLoading(false);
    }
  };

  const loadAllJobs = (searchTerm: string = '') => {
    setCurrentPage(0);
    loadJobs(0, false, searchTerm);
  };

  const loadMoreJobs = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    loadJobs(nextPage, true, searchQuery);
  };

  const retryJob = async (jobId: string) => {
    setRetryingJobIds(prev => new Set([...prev, jobId]));
    try {
      const job = allJobs.find(j => String(j.id) === jobId);
      if (!job) {
        alert('Job not found in current list');
        return;
      }

      // Call our server-side API route which will securely call EmProps API
      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Refresh the jobs list to show the new job
        await loadJobs(currentPage, false, searchQuery);
        alert(`Job retried successfully! ${data.message || 'Job has been resubmitted with preserved workflow context.'}`);
      } else {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 404) {
          alert(`Retry endpoint not found. Please ensure the EmProps API has implemented the retry endpoint at: POST /jobs/${jobId}/retry`);
        } else if (response.status === 400) {
          alert(`Bad request: ${errorData.error || 'Invalid job ID or job cannot be retried'}`);
        } else if (response.status === 500) {
          alert(`Server error: ${errorData.error || 'Internal server error during retry'}`);
        } else {
          alert(`Failed to retry job (${response.status}): ${errorData.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error retrying job:', error);
      alert('Failed to retry job. Please check your connection and try again.');
    } finally {
      setRetryingJobIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  const resetJob = async (jobId: string) => {
    setResettingJobIds(prev => new Set([...prev, jobId]));
    try {
      const job = allJobs.find(j => String(j.id) === jobId);
      if (!job) {
        alert('Job not found in current list');
        return;
      }

      // Call our reset API route which will reset job to pending state
      const response = await fetch(`/api/jobs/${jobId}/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // Refresh the jobs list to show the updated job status
        await loadJobs(currentPage, false, searchQuery);
        alert(`Job reset successfully! ${data.message || 'Job has been reset to pending state and can now be retried.'}`);
      } else {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 404) {
          alert('Job not found in EmProps API');
        } else if (response.status === 400) {
          alert(`Bad request: ${errorData.error || 'Invalid job ID or job cannot be reset'}`);
        } else if (response.status === 500) {
          alert(`Server error: ${errorData.error || 'Internal server error during reset'}`);
        } else {
          alert(`Failed to reset job (${response.status}): ${errorData.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error resetting job:', error);
      alert('Failed to reset job. Please check your connection and try again.');
    } finally {
      setResettingJobIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(jobId);
        return newSet;
      });
    }
  };

  // Auto-load workflows on component mount
  useEffect(() => {
    loadAllJobs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadAllJobs(searchQuery);
    }, 800); // 800ms debounce for database search

    return () => clearTimeout(timeoutId);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getErrorCategoryColor = (category: string) => {
    switch (category) {
      case 'timeout': return 'bg-orange-100 text-orange-800';
      case 'network': return 'bg-purple-100 text-purple-800';
      case 'validation': return 'bg-red-100 text-red-800';
      case 'resource': return 'bg-yellow-100 text-yellow-800';
      case 'external_api': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Classify job types with better labels
  const getJobTypeInfo = (job: JobWithUserInfo) => {
    // Check if it has miniapp data (user-facing collection generation)
    if (job.miniapp_data || job.user_info) {
      return {
        category: 'collection_generation',
        label: 'Collection Generation',
        color: 'bg-purple-100 text-purple-800',
        icon: '🎨'
      };
    }

    // Check job_type field for internal testing
    const jobType = String(job.job_type || '').toLowerCase();

    // Mock/testing jobs
    if (jobType.includes('mock') || jobType.includes('test') || jobType.includes('simulation')) {
      return {
        category: 'internal_test',
        label: 'Internal Test',
        color: 'bg-orange-100 text-orange-800',
        icon: '🧪'
      };
    }

    // OpenAI jobs
    if (jobType.includes('openai') || jobType.includes('gpt')) {
      return {
        category: 'openai_api',
        label: 'OpenAI API',
        color: 'bg-green-100 text-green-800',
        icon: '🤖'
      };
    }

    // ComfyUI jobs
    if (jobType.includes('comfyui') || jobType.includes('comfy')) {
      return {
        category: 'comfyui',
        label: 'ComfyUI',
        color: 'bg-blue-100 text-blue-800',
        icon: '🎯'
      };
    }

    // Check for other indicators in job data
    const jobDataStr = JSON.stringify(job.data || {}).toLowerCase();
    if (jobDataStr.includes('mock') || jobDataStr.includes('test')) {
      return {
        category: 'internal_test',
        label: 'Internal Test',
        color: 'bg-orange-100 text-orange-800',
        icon: '🧪'
      };
    }

    // Default case
    return {
      category: 'unknown',
      label: jobType || 'Unknown Type',
      color: 'bg-gray-100 text-gray-800',
      icon: '❓'
    };
  };

  // Helper variable for miniapp data access
  const miniappData = forensicsData?.job?.payload?._miniapp_data as {
    user?: any;
    generation?: any;
    payment?: any;
    social_links?: any[];
  } | undefined;
  const user = miniappData?.user;
  const generation = miniappData?.generation;
  const payment = miniappData?.payment;

  // State for notification attestations from Redis
  const [notificationAttestations, setNotificationAttestations] = useState<any[]>([]);
  const [attestationsLoaded, setAttestationsLoaded] = useState(false);

  // Load notification attestations when forensics data is available
  useEffect(() => {
    const loadNotificationAttestations = async () => {
      if (forensicsData?.job?.workflow_id && !attestationsLoaded) {
        try {
          const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;
          const response = await fetch(`${apiBaseUrl}/api/attestations?workflow_id=${forensicsData.job.workflow_id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success) {
              setNotificationAttestations(data.notification_attestations || []);
            }
          }
        } catch (error) {
          console.error('Failed to load notification attestations:', error);
        }
        setAttestationsLoaded(true);
      }
    };

    loadNotificationAttestations();
  }, [forensicsData?.job?.workflow_id, attestationsLoaded]);

  // Check if notification was successfully sent
  const notificationSent = notificationAttestations.some(att => att.success === true);

  // Check if miniapp is actually complete (status = "complete" AND has image)
  const isMiniappComplete = generation && generation.status === 'complete' && generation.generated_image;

  // Debug logging to understand the data structure
  console.log('🔍 JobForensics Debug for job:', forensicsData?.job?.id);
  console.log('miniappData:', miniappData);
  console.log('generation:', generation);
  console.log('generation status check:', generation?.status);
  console.log('isMiniappComplete:', isMiniappComplete);

  // Filter jobs based on search query
  // Server-side search is now handled in the API, so we use allJobs directly
  const filteredJobs = allJobs;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Job Forensics & Analysis</h1>
        <p className="text-muted-foreground">
          Deep investigation of job failures across all systems for debugging and recovery
        </p>
      </div>

      <Tabs defaultValue="search" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="search">Job Investigation</TabsTrigger>
          <TabsTrigger value="analysis">Failure Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-6">
          {/* Workflows List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Workflows
              </CardTitle>
              <CardDescription>
                Search and browse workflows from EmProps API database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by workflow ID, job name, type, user, Farcaster username, wallet, or status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={() => loadAllJobs(searchQuery)} disabled={jobsLoading}>
                    {jobsLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Refresh
                  </Button>
                </div>

                {/* Always show workflows section */}
                <div className="space-y-2">
                  {/* Loading State */}
                  {jobsLoading && allJobs.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      Loading workflows...
                    </div>
                  )}

                  {/* Jobs List */}
                  {allJobs.length > 0 && (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                          <span>
                            {searchQuery.trim()
                              ? `${filteredJobs.length} of ${allJobs.length} jobs matching search`
                              : `Showing ${allJobs.length} of ${totalJobs} jobs (page ${currentPage + 1})`
                            }
                          </span>
                        </div>

                        {/* Job Type Breakdown */}
                        {(() => {
                          const jobsToAnalyze = searchQuery.trim() ? filteredJobs : allJobs;
                          const typeBreakdown = jobsToAnalyze.reduce((acc, job) => {
                            const typeInfo = getJobTypeInfo(job);
                            acc[typeInfo.category] = (acc[typeInfo.category] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>);

                          if (Object.keys(typeBreakdown).length > 1) {
                            return (
                              <div className="flex items-center gap-2 text-xs flex-wrap">
                                <span className="text-muted-foreground">Types:</span>
                                {Object.entries(typeBreakdown).map(([category, count]) => {
                                  const typeInfo = (() => {
                                    switch (category) {
                                      case 'collection_generation': return { label: 'Collection Generation', color: 'bg-purple-100 text-purple-800', icon: '🎨' };
                                      case 'internal_test': return { label: 'Internal Test', color: 'bg-orange-100 text-orange-800', icon: '🧪' };
                                      case 'openai_api': return { label: 'OpenAI API', color: 'bg-green-100 text-green-800', icon: '🤖' };
                                      case 'comfyui': return { label: 'ComfyUI', color: 'bg-blue-100 text-blue-800', icon: '🎯' };
                                      default: return { label: 'Other', color: 'bg-gray-100 text-gray-800', icon: '❓' };
                                    }
                                  })();
                                  return (
                                    <span key={category} className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${typeInfo.color}`}>
                                      <span>{typeInfo.icon}</span>
                                      <span>{typeInfo.label}: {count}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {!searchQuery.trim() && hasMore && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={loadMoreJobs}
                            disabled={jobsLoading}
                          >
                            {jobsLoading ? (
                              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
                            ) : null}
                            Load More ({totalJobs - allJobs.length} remaining)
                          </Button>
                        )}
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="max-h-96 overflow-y-auto">
                          {filteredJobs.length > 0 ? (
                            filteredJobs.map((job, idx) => (
                              <div key={idx}>
                                <div className="flex items-center justify-between p-3 border-b hover:bg-gray-50">
                                  <div className="flex items-center gap-3 flex-1">
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                      {String(job.id).substring(0, 8)}...
                                    </code>
                                    {/* Preview Image */}
                                    {job.miniapp_data?.generated_image && (
                                      <div className="flex-shrink-0">
                                        <SmartImage
                                          src={String(job.miniapp_data.generated_image)}
                                          alt="Generated preview"
                                          width={40}
                                          height={40}
                                          className="h-10 w-10 rounded border object-cover"
                                        />
                                      </div>
                                    )}
                                    <div className="flex flex-col flex-1">
                                      <div className="text-sm font-medium">
                                        {String(job.name || job.description || 'Unnamed Workflow')}
                                      </div>
                                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                        <span>
                                          {job.created_at ? new Date(String(job.created_at)).toLocaleString() : 'Unknown date'}
                                        </span>
                                        {(() => {
                                          const typeInfo = getJobTypeInfo(job);
                                          return (
                                            <span className={`px-1.5 py-0.5 rounded text-xs flex items-center gap-1 ${typeInfo.color}`}>
                                              <span>{typeInfo.icon}</span>
                                              <span>{typeInfo.label}</span>
                                            </span>
                                          );
                                        })()}
                                        {job.user_id != null && (
                                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                        {job.user_info?.farcaster_pfp ? (
                                          <SmartImage
                                            src={job.user_info.farcaster_pfp}
                                            alt="Profile"
                                            width={12}
                                            height={12}
                                            className="h-3 w-3 rounded-full"
                                          />
                                        ) : (
                                          <User className="h-3 w-3" />
                                        )}
                                        <span>
                                          {job.user_info?.farcaster_username ||
                                           `${String(job.user_id).substring(0, 8)}...`}
                                        </span>
                                      </div>
                                    )}
                                    {job.progress != null && Number(job.progress) > 0 && (
                                      <span className="text-green-600">
                                        {String(job.progress)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className={getStatusColor(String(job.status))}>
                                  {String(job.status)}
                                </Badge>
                                {job.miniapp_data?.payment?.amount && (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                    <DollarSign className="h-3 w-3 mr-1" />
                                    ${job.miniapp_data.payment.amount}
                                  </Badge>
                                )}
                                {job.error_message != null && String(job.error_message).trim() !== '' && (
                                  <div title={String(job.error_message)}>
                                    <AlertTriangle className="h-4 w-4 text-red-500" />
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const id = String(job.id);
                                    setExpandedJobId(expandedJobId === id ? null : id);
                                  }}
                                  className="ml-2"
                                >
                                  <Info className="h-3 w-3 mr-1" />
                                  {expandedJobId === String(job.id) ? 'Hide Details' : 'More Info'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => retryJob(String(job.id))}
                                  disabled={retryingJobIds.has(String(job.id))}
                                  className="ml-2"
                                  title="Retry this job with the same parameters"
                                >
                                  <RotateCcw className={`h-3 w-3 mr-1 ${retryingJobIds.has(String(job.id)) ? 'animate-spin' : ''}`} />
                                  {retryingJobIds.has(String(job.id)) ? 'Retrying...' : 'Retry Job'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resetJob(String(job.id))}
                                  disabled={resettingJobIds.has(String(job.id))}
                                  className="ml-2"
                                  title="Reset job to pending state (stops phantom processing)"
                                >
                                  <Square className={`h-3 w-3 mr-1 ${resettingJobIds.has(String(job.id)) ? 'animate-pulse' : ''}`} />
                                  {resettingJobIds.has(String(job.id)) ? 'Resetting...' : 'Reset Job'}
                                </Button>
                                {job.workflow_id && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        const response = await fetch(`/api/workflows/${job.workflow_id}/trigger-webhook`, {
                                          method: 'POST'
                                        });
                                        const result = await response.json();
                                        if (result.success) {
                                          alert('Webhook triggered successfully!');
                                        } else {
                                          alert(`Webhook trigger failed: ${result.error || 'Unknown error'}`);
                                        }
                                      } catch (error) {
                                        alert('Failed to trigger webhook - check console for details');
                                        console.error('Webhook trigger error:', error);
                                      }
                                    }}
                                    className="ml-2"
                                    title="Manually trigger webhook for this workflow"
                                  >
                                    <Webhook className="h-3 w-3 mr-1" />
                                    Trigger Webhook
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Expanded Job Details */}
                            {expandedJobId === String(job.id) && (
                              <div className="bg-gray-50 border-b p-4 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground">Full Job ID</div>
                                    <code className="text-xs bg-white px-2 py-1 rounded border font-mono break-all">
                                      {String(job.id)}
                                    </code>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground">Priority</div>
                                    <div className="text-sm">{String(job.priority || 'N/A')}</div>
                                  </div>
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground">Duration</div>
                                    <div className="text-sm">
                                      {job.started_at && job.completed_at
                                        ? formatDuration(new Date(String(job.completed_at)).getTime() - new Date(String(job.started_at)).getTime())
                                        : 'N/A'
                                      }
                                    </div>
                                  </div>
                                </div>

                                {/* Enhanced User Info */}
                                {job.user_info && (
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground mb-2">User Information</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-white rounded border">
                                      <div className="flex items-center gap-3">
                                        {(job.user_info as any).farcaster_pfp && (
                                          <SmartImage
                                            src={(job.user_info as any).farcaster_pfp}
                                            alt="Profile"
                                            width={32}
                                            height={32}
                                            className="h-8 w-8 rounded-full border"
                                          />
                                        )}
                                        <div>
                                          <div className="text-sm font-medium">
                                            {job.user_info?.farcaster_username || 'No username'}
                                          </div>
                                          <div className="text-xs text-muted-foreground">
                                            ID: {String(job.user_id).substring(0, 12)}...
                                          </div>
                                        </div>
                                      </div>
                                      {job.user_info?.wallet_address && (
                                        <div>
                                          <div className="text-xs font-medium text-muted-foreground">Wallet</div>
                                          <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono break-all">
                                            {String(job.user_info.wallet_address).substring(0, 20)}...
                                          </code>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                
                                <div>
                                  <div className="text-sm font-medium text-muted-foreground mb-2">Timeline</div>
                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                                    <div>
                                      <div className="font-medium">Created</div>
                                      <div>{job.created_at ? new Date(String(job.created_at)).toLocaleString() : 'N/A'}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Started</div>
                                      <div>{job.started_at ? new Date(String(job.started_at)).toLocaleString() : 'N/A'}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Updated</div>
                                      <div>{job.updated_at ? new Date(String(job.updated_at)).toLocaleString() : 'N/A'}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Completed</div>
                                      <div>{job.completed_at ? new Date(String(job.completed_at)).toLocaleString() : 'N/A'}</div>
                                    </div>
                                  </div>
                                </div>

                                {/* Error Message */}
                                {job.error_message && String(job.error_message).trim() !== '' && (
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground mb-2">Error Details</div>
                                    <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                                      {String(job.error_message)}
                                    </div>
                                  </div>
                                )}

                                {/* Job Data */}
                                {job.data && (
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground mb-2">Job Data</div>
                                    <details className="bg-white border rounded">
                                      <summary className="p-2 cursor-pointer hover:bg-gray-50 text-sm">
                                        View Raw Data
                                      </summary>
                                      <pre className="p-3 text-xs bg-gray-50 overflow-x-auto border-t max-h-64 overflow-y-auto">
                                        {JSON.stringify(job.data, null, 2)}
                                      </pre>
                                    </details>
                                  </div>
                                )}

                                {/* Miniapp Generation Data */}
                                {job.miniapp_data && (
                                  <div>
                                    <div className="text-sm font-medium text-muted-foreground mb-2">Generation Details</div>
                                    <div className="space-y-3 p-3 bg-white rounded border">
                                      {/* Generated Images */}
                                      {(job.miniapp_data.generated_image || job.miniapp_data.output_url) && (
                                        <div>
                                          <div className="text-sm font-medium text-purple-800 mb-2">Generated Output</div>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {job.miniapp_data.generated_image && (
                                              <div>
                                                <div className="text-xs text-muted-foreground mb-1">Generated Image</div>
                                                <div className="space-y-2">
                                                  <SmartImage
                                                    src={String(job.miniapp_data.generated_image)}
                                                    alt="Generated output"
                                                    width={200}
                                                    height={200}
                                                    className="max-w-full h-auto rounded border"
                                                  />
                                                  <a
                                                    href={String(job.miniapp_data.generated_image)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-purple-600 hover:underline flex items-center gap-1"
                                                  >
                                                    <ExternalLink className="h-3 w-3" />
                                                    View Full Size
                                                  </a>
                                                </div>
                                              </div>
                                            )}
                                            {job.miniapp_data.output_url && (
                                              <div>
                                                <div className="text-xs text-muted-foreground mb-1">Output URL</div>
                                                <div className="text-xs font-mono break-all bg-purple-50 p-2 rounded border">
                                                  <a
                                                    href={String(job.miniapp_data.output_url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-purple-600 hover:underline"
                                                  >
                                                    {String(job.miniapp_data.output_url)}
                                                  </a>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {/* Input/Output Data */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {job.miniapp_data.input_data && (
                                          <div>
                                            <details className="space-y-2">
                                              <summary className="text-sm font-medium text-purple-800 cursor-pointer hover:text-purple-900">
                                                Input Data
                                              </summary>
                                              <pre className="text-xs bg-purple-50 p-3 rounded border max-h-32 overflow-y-auto">
                                                {JSON.stringify(job.miniapp_data.input_data, null, 2)}
                                              </pre>
                                            </details>
                                          </div>
                                        )}
                                        {job.miniapp_data.output_data && (
                                          <div>
                                            <details className="space-y-2">
                                              <summary className="text-sm font-medium text-purple-800 cursor-pointer hover:text-purple-900">
                                                Output Data
                                              </summary>
                                              <pre className="text-xs bg-purple-50 p-3 rounded border max-h-32 overflow-y-auto">
                                                {JSON.stringify(job.miniapp_data.output_data, null, 2)}
                                              </pre>
                                            </details>
                                          </div>
                                        )}
                                      </div>

                                      {/* Generation Status */}
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t">
                                        <div>
                                          <div className="text-xs font-medium text-muted-foreground">Status</div>
                                          <Badge className={getStatusColor(String(job.miniapp_data.status || 'unknown'))}>
                                            {String(job.miniapp_data.status || 'Unknown')}
                                          </Badge>
                                        </div>
                                        {job.miniapp_data.collection_id && (
                                          <div>
                                            <div className="text-xs font-medium text-muted-foreground">Collection</div>
                                            <div className="text-xs font-mono">
                                              {String(job.miniapp_data.collection_id).substring(0, 12)}...
                                            </div>
                                          </div>
                                        )}
                                        {job.miniapp_data.created_at && (
                                          <div>
                                            <div className="text-xs font-medium text-muted-foreground">Generated</div>
                                            <div className="text-xs">
                                              {new Date(String(job.miniapp_data.created_at)).toLocaleString()}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* Actions */}
                                <div className="flex gap-2 pt-2 border-t">
                                  <Button
                                    size="sm"
                                    onClick={async () => {
                                      const id = String(job.id);

                                      // Load full forensics
                                      setLoading(true);
                                      setError(null);

                                      try {
                                        const response = await fetch(`/api/jobs/${id}/forensics`);
                                        const data = await response.json();

                                        if (data.success) {
                                          setForensicsData(data);
                                          // Keep expanded view open to show main card info alongside forensics
                                        } else {
                                          setError(data.error || 'Job not found');
                                          setForensicsData(null);
                                        }
                                      } catch (error) {
                                        setError(error instanceof Error ? error.message : 'Failed to fetch job forensics');
                                        setForensicsData(null);
                                      } finally {
                                        setLoading(false);
                                      }
                                    }}
                                    disabled={loading}
                                  >
                                    {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                                    Full Forensics
                                  </Button>
                                </div>
                              </div>
                            )}
                              </div>
                            ))
                          ) : (
                            <div className="flex items-center justify-center py-8 text-muted-foreground">
                              <div className="text-center">
                                <div className="text-sm">No workflows match your search criteria</div>
                                {searchQuery && (
                                  <div className="text-xs mt-1">Try adjusting your search terms</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Empty State */}
                  {allJobs.length === 0 && !jobsLoading && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <div className="text-center">
                        <div className="text-sm">No workflows found</div>
                        <div className="text-xs mt-1">Check your database connection or try refreshing</div>
                      </div>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
                    {error}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Job Forensics Results */}
          {forensicsData && (
            <div className="space-y-6">
              {/* Job Overview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Job Overview
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Status</div>
                      <Badge className={getStatusColor(String(forensicsData.job.status))}>
                        {String(forensicsData.job.status)}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Created</div>
                      <div className="text-sm">{new Date(String(forensicsData.job.created_at)).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Retries</div>
                      <div className="text-sm">{String(forensicsData.job.retry_count)}/3</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Worker</div>
                      <div className="text-sm">N/A</div>
                    </div>
                  </div>

                  {forensicsData.forensics.failure_analysis?.root_cause && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="font-medium text-red-800">Error Message:</div>
                      <div className="text-red-700 text-sm mt-1">{forensicsData.forensics.failure_analysis.root_cause}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Collection & Workflow Details */}
              {(forensicsData?.job?.payload as any)?._collection && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Collection & Workflow Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Collection Information */}
                    <div>
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-blue-700 border-b border-blue-200 pb-2">
                          Collection Information
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Collection Name</div>
                            <div className="text-sm font-medium">{String((forensicsData.job.payload as any)._collection?.title || 'Untitled Collection')}</div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Collection ID</div>
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                              {String((forensicsData.job.payload as any)._collection?.id)}
                            </code>
                          </div>
                          {(forensicsData.job.payload as any)._collection?.description && String((forensicsData.job.payload as any)._collection.description).trim() !== '' && (
                            <div className="md:col-span-2">
                              <div className="text-sm font-medium text-muted-foreground">Description</div>
                              <div className="text-sm">{String((forensicsData.job.payload as any)._collection.description)}</div>
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Collection Status</div>
                            <Badge className={getStatusColor(String((forensicsData.job.payload as any)._collection?.status))}>
                              {String((forensicsData.job.payload as any)._collection?.status)}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Parameters */}
                    {forensicsData.job.payload.variables && Object.keys(forensicsData.job.payload.variables).length > 0 && (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-green-700 border-b border-green-200 pb-2">
                          Input Parameters
                        </div>
                        <div className="space-y-2">
                          {Object.entries(forensicsData.job.payload.variables || {}).map(([key, value]) => (
                            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-green-50 rounded-md">
                              <div className="text-sm font-medium text-green-800 min-w-0 flex-shrink-0">
                                {key}:
                              </div>
                              <div className="text-sm text-green-700 font-mono break-all">
                                {typeof value === 'string' && value.startsWith('http') ? (
                                  <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {String(value)}
                                  </a>
                                ) : (
                                  String(value)
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Job-Test IDs (Workflow Steps) */}
                    {forensicsData.job.payload.outputs && Array.isArray(forensicsData.job.payload.outputs) && forensicsData.job.payload.outputs.length > 0 && (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-purple-700 border-b border-purple-200 pb-2">
                          Workflow Steps (Job-Test IDs)
                        </div>
                        <div className="space-y-3">
                          {forensicsData.job.payload.outputs?.map((output: WorkflowOutput, outputIndex: number) => (
                            <div key={outputIndex} className="border border-purple-200 rounded-lg p-4 bg-purple-50">
                              <div className="text-sm font-medium text-purple-800 mb-3">
                                Generation {output.generation?.id || outputIndex}
                                {output.generation?.hash && (
                                  <span className="ml-2 text-xs text-purple-600 font-mono">
                                    Hash: {String(output.generation.hash).substring(0, 16)}...
                                  </span>
                                )}
                              </div>
                              {output.steps && Array.isArray(output.steps) && (
                                <div className="space-y-2">
                                  {output.steps.map((step: WorkflowStep, stepIndex: number) => (
                                    <div key={stepIndex} className="flex items-center gap-3 p-2 bg-white rounded border">
                                      <code className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded font-mono font-bold">
                                        ID: {step.id}
                                      </code>
                                      <div className="flex-grow">
                                        <div className="text-sm font-medium">
                                          {step.nodeAlias || step.nodeName}
                                        </div>
                                        {step.nodeName !== step.nodeAlias && step.nodeAlias && (
                                          <div className="text-xs text-muted-foreground">
                                            Node: {step.nodeName}
                                          </div>
                                        )}
                                      </div>
                                      {step.nodeResponse?.mimeType && (
                                        <Badge variant="outline" className="text-xs">
                                          {step.nodeResponse.mimeType}
                                        </Badge>
                                      )}
                                      {step.nodeResponse?.src && (
                                        <a
                                          href={step.nodeResponse.src}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:underline text-xs"
                                        >
                                          View Output
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Mini-App User & Farcaster Data */}
              {miniappData && (miniappData.user || miniappData.generation) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Mini-App User & Farcaster Data
                    </CardTitle>
                    <CardDescription>
                      User profile and generation data from the Emerge mini-app integration
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Farcaster User Profile */}
                    {user && (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-violet-700 border-b border-violet-200 pb-2">
                          Farcaster User Profile
                        </div>

                        <div className="flex items-start gap-4 p-4 bg-violet-50 rounded-lg border border-violet-200">
                          {/* Profile Picture */}
                          {miniappData.user.farcaster_pfp && (
                            <div className="flex-shrink-0">
                              <SmartImage
                                src={miniappData.user.farcaster_pfp as string}
                                alt="Farcaster Profile"
                                width={64}
                                height={64}
                                className="w-16 h-16 rounded-full border-2 border-violet-300"
                              />
                            </div>
                          )}

                          {/* User Info */}
                          <div className="flex-grow space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="text-sm font-medium text-violet-800">Farcaster Username</div>
                                <div className="text-sm text-violet-700 font-medium">
                                  {(miniappData.user.farcaster_username as string) || 'Not set'}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium text-violet-800">Farcaster ID</div>
                                <code className="text-xs bg-violet-100 text-violet-800 px-2 py-1 rounded font-mono">
                                  {miniappData.user.farcaster_id as string}
                                </code>
                              </div>
                              {miniappData.user.wallet_address && (
                                <div className="md:col-span-2">
                                  <div className="text-sm font-medium text-violet-800 flex items-center gap-1">
                                    <Wallet className="h-3 w-3" />
                                    Wallet Address
                                  </div>
                                  <code className="text-xs bg-violet-100 text-violet-800 px-2 py-1 rounded font-mono break-all">
                                    {miniappData.user.wallet_address}
                                  </code>
                                </div>
                              )}
                              <div>
                                <div className="text-sm font-medium text-violet-800">User Created</div>
                                <div className="text-sm text-violet-700">
                                  {new Date(miniappData.user.created_at).toLocaleString()}
                                </div>
                              </div>
                              {miniappData.user.notification_token && (
                                <div>
                                  <div className="text-sm font-medium text-violet-800">Notifications</div>
                                  <Badge variant="outline" className="text-xs text-violet-700">
                                    {miniappData.user.notification_token}
                                  </Badge>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Social Links */}
                        {miniappData.social_links && miniappData.social_links.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-md font-semibold text-violet-700">Social Connections</div>
                            <div className="flex flex-wrap gap-2">
                              {miniappData.social_links.map((link: Record<string, unknown>, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 p-2 bg-violet-100 rounded border border-violet-200">
                                  <MessageCircle className="h-3 w-3 text-violet-600" />
                                  <span className="text-xs font-medium text-violet-800">{String(link.social_org)}</span>
                                  <span className="text-xs text-violet-700">{String(link.identifier)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Mini-App Generation Data */}
                    {generation && (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-pink-700 border-b border-pink-200 pb-2">
                          Mini-App Generation Record
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm font-medium text-pink-800">Generation ID</div>
                              <code className="text-xs bg-pink-100 text-pink-800 px-2 py-1 rounded font-mono">
                                {miniappData.generation.id}
                              </code>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-pink-800">Status</div>
                              <Badge className={getStatusColor(String(miniappData.generation.status))}>
                                {String(miniappData.generation.status)}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-pink-800">Created</div>
                              <div className="text-sm text-pink-700">
                                {new Date(miniappData.generation.created_at).toLocaleString()}
                              </div>
                            </div>
                            {miniappData.generation.retry_count > 0 && (
                              <div>
                                <div className="text-sm font-medium text-pink-800">Retry Count</div>
                                <Badge variant="outline" className="text-pink-700">
                                  {miniappData.generation.retry_count}
                                </Badge>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            {miniappData.generation.output_url && (
                              <div>
                                <div className="text-sm font-medium text-pink-800">Output URL</div>
                                <div className="text-xs text-pink-700 font-mono break-all bg-pink-50 p-2 rounded border">
                                  <a
                                    href={miniappData.generation.output_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-600 hover:underline"
                                  >
                                    {miniappData.generation.output_url}
                                  </a>
                                </div>
                              </div>
                            )}
                            {miniappData.generation.generated_image && (
                              <div>
                                <div className="text-sm font-medium text-pink-800">Generated Image</div>
                                <div className="text-xs text-pink-700 font-mono break-all bg-pink-50 p-2 rounded border">
                                  <a
                                    href={miniappData.generation.generated_image}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-600 hover:underline"
                                  >
                                    {miniappData.generation.generated_image}
                                  </a>
                                </div>
                              </div>
                            )}
                            {miniappData.generation.error_message && (
                              <div>
                                <div className="text-sm font-medium text-pink-800">Error Message</div>
                                <div className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                                  {miniappData.generation.error_message}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Generation Input/Output Data */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {miniappData.generation.input_data && (
                            <details className="space-y-2">
                              <summary className="text-sm font-medium text-pink-800 cursor-pointer hover:text-pink-900">
                                Generation Input Data
                              </summary>
                              <pre className="text-xs bg-pink-50 p-3 rounded border max-h-32 overflow-y-auto">
                                {JSON.stringify(miniappData.generation.input_data, null, 2)}
                              </pre>
                            </details>
                          )}
                          {miniappData.generation.output_data && (
                            <details className="space-y-2">
                              <summary className="text-sm font-medium text-pink-800 cursor-pointer hover:text-pink-900">
                                Generation Output Data
                              </summary>
                              <pre className="text-xs bg-pink-50 p-3 rounded border max-h-32 overflow-y-auto">
                                {JSON.stringify(miniappData.generation.output_data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Payment Information */}
                    {payment && (
                      <div className="space-y-3">
                        <div className="text-lg font-semibold text-emerald-700 border-b border-emerald-200 pb-2">
                          Payment Information
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-emerald-50 rounded border border-emerald-200">
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Amount</div>
                            <div className="text-sm text-emerald-700 font-medium">
                              {miniappData.payment.amount} {miniappData.payment.currency}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Status</div>
                            <Badge className={getStatusColor(String(miniappData.payment.status))}>
                              {String(miniappData.payment.status)}
                            </Badge>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Payment ID</div>
                            <code className="text-xs bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-mono">
                              {String(miniappData.payment.id).substring(0, 8)}...
                            </code>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Created</div>
                            <div className="text-sm text-emerald-700">
                              {new Date(miniappData.payment.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Job Pipeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5" />
                    Job Pipeline
                  </CardTitle>
                  <CardDescription>
                    Complete flow from generation request to final miniapp completion
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Pipeline Flow */}
                  <div className="space-y-4">
                    {/* Step 1: Generation Requested */}
                    <div className="flex items-center gap-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">1</div>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-blue-800">Generation Requested</div>
                        <div className="text-sm text-blue-600">
                          User requested generation via EmProps API
                        </div>
                        {forensicsData.job.created_at && (
                          <div className="text-xs text-blue-500 mt-1">
                            <Clock className="h-3 w-3 inline mr-1" />
                            {new Date(forensicsData.job.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 2: Job Created (Job Table Record) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      forensicsData.job.id ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          forensicsData.job.id ? 'bg-green-600 text-white' : 'bg-gray-400 text-white'
                        }`}>2</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${forensicsData.job.id ? 'text-green-800' : 'text-gray-600'}`}>
                          Job Record Created
                        </div>
                        <div className={`text-sm ${forensicsData.job.id ? 'text-green-600' : 'text-gray-500'}`}>
                          {forensicsData.job.id ? `Job table record created: ${String(forensicsData.job.id).substring(0, 8)}...` : 'No job record found'}
                        </div>
                        {forensicsData.job.service_required && (
                          <div className={`text-xs mt-1 ${forensicsData.job.id ? 'text-green-500' : 'text-gray-400'}`}>
                            <FileText className="h-3 w-3 inline mr-1" />
                            Service: {forensicsData.job.service_required}
                          </div>
                        )}
                      </div>
                      {forensicsData.job.id ? <CheckCircle className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-gray-400" />}
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 3: Workflow Requested (Redis Job Added) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      forensicsData.job.status !== 'pending' ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          forensicsData.job.status !== 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-400 text-white'
                        }`}>3</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${forensicsData.job.status !== 'pending' ? 'text-yellow-800' : 'text-gray-600'}`}>
                          Workflow Requested
                        </div>
                        <div className={`text-sm ${forensicsData.job.status !== 'pending' ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {forensicsData.job.status !== 'pending' ? 'Job submitted to Redis queue for processing' : 'Job still pending submission'}
                        </div>
                        {forensicsData.job.workflow_id && (
                          <div className={`text-xs mt-1 ${forensicsData.job.status !== 'pending' ? 'text-yellow-500' : 'text-gray-400'}`}>
                            <Database className="h-3 w-3 inline mr-1" />
                            Workflow: {String(forensicsData.job.workflow_id).substring(0, 8)}...
                          </div>
                        )}
                      </div>
                      {forensicsData.job.status !== 'pending' ? <CheckCircle className="h-5 w-5 text-yellow-600" /> : <Clock className="h-5 w-5 text-gray-400" />}
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 4: Workflow Processed (Redis Completion) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      forensicsData.job.status === 'completed' ? 'border-purple-200 bg-purple-50' :
                      forensicsData.job.status === 'failed' ? 'border-red-200 bg-red-50' :
                      forensicsData.job.status === 'in_progress' ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          forensicsData.job.status === 'completed' ? 'bg-purple-600 text-white' :
                          forensicsData.job.status === 'failed' ? 'bg-red-600 text-white' :
                          forensicsData.job.status === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-gray-400 text-white'
                        }`}>4</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${
                          forensicsData.job.status === 'completed' ? 'text-purple-800' :
                          forensicsData.job.status === 'failed' ? 'text-red-800' :
                          forensicsData.job.status === 'in_progress' ? 'text-blue-800' : 'text-gray-600'
                        }`}>
                          Workflow Processing
                        </div>
                        <div className={`text-sm ${
                          forensicsData.job.status === 'completed' ? 'text-purple-600' :
                          forensicsData.job.status === 'failed' ? 'text-red-600' :
                          forensicsData.job.status === 'in_progress' ? 'text-blue-600' : 'text-gray-500'
                        }`}>
                          Status: {forensicsData.job.status}
                          {forensicsData.job.error_message && ` - ${forensicsData.job.error_message}`}
                        </div>
                        {forensicsData.job.started_at && (
                          <div className={`text-xs mt-1 ${
                            forensicsData.job.status === 'completed' ? 'text-purple-500' :
                            forensicsData.job.status === 'failed' ? 'text-red-500' :
                            forensicsData.job.status === 'in_progress' ? 'text-blue-500' : 'text-gray-400'
                          }`}>
                            <Play className="h-3 w-3 inline mr-1" />
                            Started: {new Date(forensicsData.job.started_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {forensicsData.job.status === 'completed' ? <CheckCircle className="h-5 w-5 text-purple-600" /> :
                       forensicsData.job.status === 'failed' ? <XCircle className="h-5 w-5 text-red-600" /> :
                       forensicsData.job.status === 'in_progress' ? <Clock className="h-5 w-5 text-blue-600" /> :
                       <Clock className="h-5 w-5 text-gray-400" />}
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 5: Job Completed EmProps (Job Table completed_at) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      forensicsData.job.completed_at ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          forensicsData.job.completed_at ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white'
                        }`}>5</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${forensicsData.job.completed_at ? 'text-emerald-800' : 'text-gray-600'}`}>
                          Job Completed (EmProps)
                        </div>
                        <div className={`text-sm ${forensicsData.job.completed_at ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {forensicsData.job.completed_at ? 'EmProps API received completion notification' : 'EmProps completion pending'}
                        </div>
                        {forensicsData.job.completed_at && (
                          <div className="text-xs text-emerald-500 mt-1">
                            <CheckCircle className="h-3 w-3 inline mr-1" />
                            {new Date(forensicsData.job.completed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {forensicsData.job.completed_at ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-gray-400" />}
                    </div>

                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 6: Job Completed Miniapp (miniapp_generation table) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      isMiniappComplete ? 'border-teal-200 bg-teal-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          isMiniappComplete ? 'bg-teal-600 text-white' : 'bg-gray-400 text-white'
                        }`}>6</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${isMiniappComplete ? 'text-teal-800' : 'text-gray-600'}`}>
                          Miniapp Completion
                        </div>

                        <div className={`text-sm ${isMiniappComplete ? 'text-teal-600' : 'text-gray-500'}`}>
                          {generation
                            ? `Miniapp generation record found (Status: ${generation.status})`
                            : 'Miniapp webhook completion pending'}
                        </div>
                        {generation && (
                          <div className={`text-xs mt-1 ${isMiniappComplete ? 'text-teal-500' : 'text-amber-600'}`}>
                            {isMiniappComplete ? <CheckCircle className="h-3 w-3 inline mr-1" /> : <Clock className="h-3 w-3 inline mr-1" />}
                            Generation ID: {generation.id.substring(0, 8)}... | {generation.generated_image ? 'Image available' : 'No image'}
                          </div>
                        )}
                      </div>
                      {isMiniappComplete ? <CheckCircle className="h-5 w-5 text-teal-600" /> : <Clock className="h-5 w-5 text-gray-400" />}
                    </div>

                    {/* Arrow */}
                    <div className="flex justify-center">
                      <ArrowRight className="h-5 w-5 text-gray-400" />
                    </div>

                    {/* Step 7: Customer Notified (Redis attestation) */}
                    <div className={`flex items-center gap-4 p-4 border rounded-lg ${
                      notificationSent ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                    }`}>
                      <div className="flex-shrink-0">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                          notificationSent ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white'
                        }`}>7</div>
                      </div>
                      <div className="flex-1">
                        <div className={`font-medium ${notificationSent ? 'text-emerald-800' : 'text-gray-600'}`}>
                          Customer Notified
                        </div>
                        <div className={`text-sm ${notificationSent ? 'text-emerald-600' : 'text-gray-500'}`}>
                          {notificationSent
                            ? `Customer notification sent successfully (${notificationAttestations.filter(att => att.success).length} of ${notificationAttestations.length} attempts)`
                            : notificationAttestations.length > 0
                            ? `Notification failed: ${notificationAttestations.filter(att => !att.success).length} failed attempts`
                            : 'Customer notification pending'}
                        </div>
                        {notificationSent && notificationAttestations.length > 0 && (
                          <div className="text-xs text-emerald-500 mt-1">
                            <CheckCircle className="h-3 w-3 inline mr-1" />
                            Latest: {new Date(notificationAttestations.find(att => att.success)?.attested_at).toLocaleString()} |
                            Method: {notificationAttestations.find(att => att.success)?.notification_method}
                          </div>
                        )}
                      </div>
                      {notificationSent ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <Clock className="h-5 w-5 text-gray-400" />}
                    </div>
                  </div>

                  {/* Pipeline Summary */}
                  <div className="border-t pt-4">
                    <div className="text-lg font-semibold text-gray-800 mb-3">Pipeline Summary</div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-lg font-semibold text-blue-600">
                          {forensicsData.job.status === 'completed' ? '✓' :
                           forensicsData.job.status === 'failed' ? '✗' :
                           forensicsData.job.status === 'in_progress' ? '⏳' : '○'}
                        </div>
                        <div className="text-xs text-blue-600 font-medium">Redis Status</div>
                      </div>
                      <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                        <div className="text-lg font-semibold text-emerald-600">
                          {forensicsData.job.completed_at ? '✓' : '○'}
                        </div>
                        <div className="text-xs text-emerald-600 font-medium">EmProps Table</div>
                      </div>
                      <div className={`text-center p-3 rounded-lg border ${isMiniappComplete ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}>
                        <div className={`text-lg font-semibold ${isMiniappComplete ? 'text-teal-600' : 'text-gray-400'}`}>
                          {isMiniappComplete ? '✓' : '○'}
                        </div>
                        <div className={`text-xs font-medium ${isMiniappComplete ? 'text-teal-600' : 'text-gray-400'}`}>Miniapp Table</div>
                      </div>
                      <div className="text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                        <div className="text-lg font-semibold text-amber-600">
                          {notificationSent ? '✓' : '○'}
                        </div>
                        <div className="text-xs text-amber-600 font-medium">Notification</div>
                      </div>
                    </div>
                  </div>

                  {/* Generated Content (if available) - Disabled until _flat_files structure is available */}
                  {false && (
                    <div className="border-t pt-4">
                      <div className="text-lg font-semibold text-gray-800 mb-3">Generated Content</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(forensicsData.job.payload as any)._flat_files.slice(0, 4).map((file: FlatFile, idx: number) => (
                          <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-sm font-medium text-gray-800">
                                {file.name || `File ${idx + 1}`}
                              </div>
                              <div className="flex gap-1">
                                {file.url && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => window.open(file.url, '_blank')}>
                                      <ExternalLink className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const a = document.createElement('a');
                                      a.href = file.url;
                                      a.download = file.name || 'download';
                                      a.click();
                                    }}>
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                            {file.url && file.mime_type?.includes('image') && (
                              <SmartImage
                                src={file.url}
                                alt={file.name || `Generated image ${idx + 1}`}
                                width={200}
                                height={100}
                                className="w-full h-24 object-cover rounded border"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {(forensicsData.job.payload as any)._flat_files.length > 4 && (
                        <div className="text-center mt-3 text-sm text-gray-600">
                          ... and {(forensicsData.job.payload as any)._flat_files.length - 4} more files
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Forensics Data */}
              {forensicsData.forensics && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Info className="h-5 w-5" />
                      Forensics Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {forensicsData.forensics.source_system != null && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Source System</div>
                          <Badge variant="outline">{String(forensicsData.forensics.source_system)}</Badge>
                        </div>
                      )}

                      {forensicsData.forensics.error_category != null && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Error Category</div>
                          <Badge className={getErrorCategoryColor(String(forensicsData.forensics.error_category))}>
                            {String(forensicsData.forensics.error_category)}
                          </Badge>
                        </div>
                      )}

                      {forensicsData.forensics.queue_wait_time_ms != null && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Queue Wait Time</div>
                          <div className="text-sm">{formatDuration(Number(forensicsData.forensics.queue_wait_time_ms))}</div>
                        </div>
                      )}
                    </div>

                    {forensicsData.forensics.attempted_workers != null && Array.isArray(forensicsData.forensics.attempted_workers) && forensicsData.forensics.attempted_workers.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-2">Attempted Workers</div>
                        <div className="flex flex-wrap gap-2">
                          {forensicsData.forensics.attempted_workers.map((worker: unknown, idx: number) => (
                            <Badge key={idx} variant="outline">{String(worker)}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {forensicsData.forensics.cross_system_refs != null && Array.isArray(forensicsData.forensics.cross_system_refs) && forensicsData.forensics.cross_system_refs.length > 0 && (
                      <div>
                        <div className="text-sm font-medium text-muted-foreground mb-2">Cross-System References</div>
                        <div className="space-y-2">
                          {forensicsData.forensics.cross_system_refs.map((ref: Record<string, unknown>, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                              <Badge variant="outline">{String(ref.system)}</Badge>
                              <div className="text-sm">{String(ref.reference_type)}: {String(ref.reference_id).substring(0, 8)}...</div>
                              <Badge className={getStatusColor(String(ref.status))}>{String(ref.status)}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Completion Attestations */}
              {forensicsData.job?.id && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Completion Attestations
                    </CardTitle>
                    <CardDescription>
                      Persistent proof of job/workflow completion for recovery purposes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <AttestationRecords
                      jobId={String(forensicsData.job.id)}
                      workflowId={forensicsData.job.workflow_id ? String(forensicsData.job.workflow_id) : undefined}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Recovery Suggestions */}
              {forensicsData.recovery_suggestions != null && Array.isArray(forensicsData.recovery_suggestions) && forensicsData.recovery_suggestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="h-5 w-5" />
                      Recovery Suggestions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {forensicsData.recovery_suggestions.map((suggestion: Record<string, unknown>, idx: number) => (
                        <div key={idx} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">{String(suggestion.type)}</Badge>
                            <Badge className={
                              suggestion.confidence === 'high' ? 'bg-green-100 text-green-800' :
                              suggestion.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }>
                              {String(suggestion.confidence)} confidence
                            </Badge>
                            {suggestion.estimated_success_rate != null && (
                              <span className="text-sm text-muted-foreground">
                                {String(suggestion.estimated_success_rate)}% success rate
                              </span>
                            )}
                          </div>
                          <div className="text-sm">{String(suggestion.description)}</div>
                          {suggestion.automated_action_available != null && (
                            <div className="mt-2">
                              <Badge variant="outline" className="text-xs">Automated action available</Badge>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Similar Failures */}
              {forensicsData.similar_failures != null && Array.isArray(forensicsData.similar_failures) && forensicsData.similar_failures.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Similar Failures ({forensicsData.similar_failures.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {forensicsData.similar_failures.map((job: Record<string, unknown>, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded">{String(job.id).substring(0, 8)}...</code>
                            <div className="text-sm">{new Date(String(job.created_at)).toLocaleDateString()}</div>
                          </div>
                          <div className="text-xs text-muted-foreground max-w-xs truncate">
                            {String(job.error || '')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Failed Jobs Analysis
              </CardTitle>
              <CardDescription>
                Pattern analysis of recent failed jobs to identify systemic issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadFailedAnalysis} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Load Analysis
              </Button>
            </CardContent>
          </Card>

          {failedAnalysis && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Error Categories</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(failedAnalysis.error_categories as Record<string, unknown>).map(([category, count]) => (
                      <div key={category} className="flex justify-between items-center">
                        <Badge className={getErrorCategoryColor(category)}>{category}</Badge>
                        <span className="text-sm font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Source Systems</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(failedAnalysis.source_systems as Record<string, unknown>).map(([system, count]) => (
                      <div key={system} className="flex justify-between items-center">
                        <Badge variant="outline">{system}</Badge>
                        <span className="text-sm font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Worker Failures</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(failedAnalysis.worker_failures as Record<string, unknown>).slice(0, 5).map(([worker, count]) => (
                      <div key={worker} className="flex justify-between items-center">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">{worker.substring(0, 12)}...</code>
                        <span className="text-sm font-medium">{count as number}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Summary Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Failed Jobs:</span>
                      <span className="font-medium">{String(failedAnalysis.total_failed_jobs)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cross-System Refs:</span>
                      <span className="font-medium">{String(failedAnalysis.jobs_with_cross_system_refs)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Retry Count:</span>
                      <span className="font-medium">{Number(failedAnalysis.avg_retry_count || 0).toFixed(1)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}