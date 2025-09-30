'use client';

import React, { useState, useEffect } from 'react';
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

// Utility to get auth bypass parameter from URL and append to API calls
function getAuthBypassParam(): string {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const authBypass = urlParams.get('auth');
    return authBypass ? `?auth=${authBypass}` : '';
  }
  return '';
}

// Helper to append auth bypass to existing query parameters
function appendAuthBypass(url: string): string {
  const authBypass = getAuthBypassParam();
  if (!authBypass) return url;

  const separator = url.includes('?') ? '&' : '?';
  return url + separator + authBypass.substring(1); // Remove leading ?
}

// Component to display worker and API attestation records for debugging
function AttestationRecords({ attestations }: { attestations: any[] }) {

  // Process attestations from forensics data
  const processedAttestations = React.useMemo(() => {
    if (!attestations || attestations.length === 0) {
      return { hasAttestations: false, groupedAttestations: [] };
    }

    // Group attestations by retry count and step
    const groupedByRetry: { [key: string]: any[] } = {};

    attestations.forEach(att => {
      const retryCount = att.retry_count || 0;
      const key = `retry-${retryCount}`;
      if (!groupedByRetry[key]) groupedByRetry[key] = [];
      groupedByRetry[key].push(att);
    });

    // Sort by retry count and sort attestations within each group
    const sortedRetryGroups = Object.keys(groupedByRetry)
      .sort((a, b) => {
        const retryA = parseInt(a.replace('retry-', ''));
        const retryB = parseInt(b.replace('retry-', ''));
        return retryA - retryB;
      })
      .map(key => {
        const retryCount = parseInt(key.replace('retry-', ''));
        const retryAttestations = groupedByRetry[key].sort((a: any, b: any) => {
          // Sort by current_step if available, otherwise by timestamp
          const stepA = parseInt(a.current_step || '0');
          const stepB = parseInt(b.current_step || '0');
          if (stepA !== stepB) return stepA - stepB;

          // Use appropriate timestamp for sorting
          const timestampA = new Date(a.completed_at || a.failed_at || a.attestation_created_at || 0).getTime();
          const timestampB = new Date(b.completed_at || b.failed_at || b.attestation_created_at || 0).getTime();
          return timestampA - timestampB;
        });

        return {
          retry_count: retryCount,
          attestations: retryAttestations
        };
      });

    return {
      hasAttestations: true,
      groupedAttestations: sortedRetryGroups
    };
  }, [attestations]);

  const { hasAttestations, groupedAttestations } = processedAttestations;



  // Always show the component - don't hide it
  // if (!hasAttestations && !loading) {
  //   return null;
  // }

  return (
    <div>
      {!hasAttestations ? (
        <div className="text-sm text-muted-foreground italic">
          No attestations found for this workflow
        </div>
      ) : (
        <div className="space-y-4">
          {groupedAttestations.map((retryGroup) => (
            <div key={`retry-${retryGroup.retry_count}`} className="space-y-3">
              {retryGroup.retry_count > 0 && (
                <Badge variant="outline" className="text-xs">
                  Retry {retryGroup.retry_count}
                </Badge>
              )}

              {retryGroup.attestations.map((attestation, idx) => {
                const isFailure = attestation.attestation_type?.includes('failure') ||
                                 attestation.status?.includes('failed') ||
                                 attestation.failure_type;
                const isCompletion = attestation.status === 'completed' ||
                                   attestation.attestation_type?.includes('completion');

                return (
                  <div key={idx} className={`p-4 border rounded-lg ${
                    isFailure ? 'border-red-200 bg-red-50' :
                    isCompletion ? 'border-green-200 bg-green-50' :
                    'border-gray-200 bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isFailure ? (
                          <XCircle className="h-4 w-4 text-red-600" />
                        ) : isCompletion ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-gray-600" />
                        )}
                        <span className="font-medium text-sm">
                          {isFailure ? 'Failure Attestation' :
                           isCompletion ? 'Completion Attestation' :
                           'Worker Attestation'} - Step {attestation.current_step || '?'} of {attestation.total_steps || '?'}
                        </span>
                        <Badge className={`text-xs ${
                          isFailure ? 'bg-red-100 text-red-800' :
                          isCompletion ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {attestation.status || 'unknown'}
                        </Badge>
                      </div>
                    </div>

                    {/* Job Details */}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>Job ID: <code className="bg-gray-100 px-1 rounded">{attestation.job_id}</code></div>
                      <div>Worker ID: <code className="bg-gray-100 px-1 rounded">{attestation.worker_id}</code></div>
                      {(attestation.completed_at || attestation.failed_at) && (
                        <div>
                          {isFailure ? 'Failed' : 'Completed'} at: {new Date(attestation.completed_at || attestation.failed_at).toLocaleString()}
                        </div>
                      )}
                      {attestation.retry_count !== undefined && (
                        <div>Retry Count: {attestation.retry_count}</div>
                      )}
                    </div>

                    {/* Failure Details */}
                    {isFailure && (attestation.failure_type || attestation.failure_reason) && (
                      <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-xs">
                        <div className="font-medium text-red-800">Failure Classification:</div>
                        <div className="text-red-700">
                          {attestation.failure_type && (
                            <div>Type: <span className="font-mono">{attestation.failure_type}</span></div>
                          )}
                          {attestation.failure_reason && (
                            <div>Reason: <span className="font-mono">{attestation.failure_reason}</span></div>
                          )}
                          {attestation.failure_description && (
                            <div>Description: {attestation.failure_description}</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Raw Service Output (Debugging) */}
                    {attestation.raw_service_output && (
                      <details className="mt-3">
                        <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                          ▶ Click to view raw service response for step {attestation.current_step}
                        </summary>
                        <div className="mt-2 p-2 bg-gray-100 border rounded text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {typeof attestation.raw_service_output === 'string'
                            ? attestation.raw_service_output
                            : JSON.stringify(attestation.raw_service_output, null, 2)}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-3">
        <div className="flex items-start gap-2">
          <Info className="h-3 w-3 mt-0.5 text-amber-600" />
          <div>
            <strong>Attestations:</strong> These records prove the worker completed the job, API determined workflow completion,
            and notifications were sent to users, even if EmProps verification failed. Used for recovery of orphaned workflows.
          </div>
        </div>
      </div>
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
      const response = await fetch(appendAuthBypass('/api/jobs/failed-analysis?limit=100'));
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
      const response = await fetch(appendAuthBypass(`/api/jobs/all?limit=${jobsPerPage}&offset=${offset}${searchParam}`));
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
      const response = await fetch(appendAuthBypass(`/api/jobs/${jobId}/retry`), {
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
      const response = await fetch(appendAuthBypass(`/api/jobs/${jobId}/reset`), {
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

  // Format date safely, handling invalid dates
  const formatDate = (dateValue: any): string => {
    if (!dateValue) return 'N/A';

    // Handle empty objects (common API response issue)
    if (typeof dateValue === 'object' && Object.keys(dateValue).length === 0) {
      return 'N/A';
    }

    try {
      // Handle different input types
      let date: Date;

      if (typeof dateValue === 'string') {
        // If it's already a formatted string, return it
        if (dateValue.includes('GMT') || dateValue.includes('Z') || dateValue.includes('+')) {
          date = new Date(dateValue);
        } else {
          // Try parsing as timestamp or ISO string
          const timestamp = parseInt(dateValue);
          date = isNaN(timestamp) ? new Date(dateValue) : new Date(timestamp);
        }
      } else if (typeof dateValue === 'number') {
        // Handle timestamp (both seconds and milliseconds)
        date = new Date(dateValue > 1e10 ? dateValue : dateValue * 1000);
      } else {
        date = new Date(dateValue);
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'N/A';
      }

      // Format as readable date string
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      console.warn('Date formatting error:', error, 'Input:', dateValue);
      return 'N/A';
    }
  };

  // Safely get payment status with fallback
  const getPaymentStatus = (payment: any): string => {
    if (!payment) return 'Unknown';

    // Try different possible status field names
    return payment.payment_status ||
           payment.status ||
           payment.state ||
           'pending';
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

  // Check if notification was successfully sent (from forensics attestations)
  const notificationSent = forensicsData?.forensics?.attestations?.some(att =>
    att.attestation_type?.includes('notification') && att.success === true
  ) || false;

  // Get notification attestations from forensics data
  const notificationAttestations = forensicsData?.forensics?.notification_attestations || [];

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
                                          {formatDate(job.created_at)}
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
                                {(job.workflow_id || job.id) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      try {
                                        const response = await fetch(appendAuthBypass(`/api/workflows/${job.workflow_id || job.id}/trigger-webhook`), {
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
                                      <div>{formatDate(job.created_at)}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Started</div>
                                      <div>{formatDate(job.started_at)}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Updated</div>
                                      <div>{formatDate(job.updated_at)}</div>
                                    </div>
                                    <div>
                                      <div className="font-medium">Completed</div>
                                      <div>{formatDate(job.completed_at)}</div>
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
                                              {formatDate(job.miniapp_data.created_at)}
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
                                        const response = await fetch(appendAuthBypass(`/api/jobs/${id}/forensics`));
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
                      <div className="text-sm">{formatDate(forensicsData.job.created_at)}</div>
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
                                  {formatDate(miniappData.user.created_at)}
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
                        <div className="text-lg font-semibold text-orange-700 border-b border-orange-200 pb-2">
                          Mini-App Generation Record
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <div>
                              <div className="text-sm font-medium text-orange-800">Generation ID</div>
                              <code className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-mono">
                                {miniappData.generation.id}
                              </code>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-orange-800">Status</div>
                              <Badge className={getStatusColor(String(miniappData.generation.status))}>
                                {String(miniappData.generation.status)}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-orange-800">Created</div>
                              <div className="text-sm text-orange-700">
                                {formatDate(miniappData.generation.created_at)}
                              </div>
                            </div>
                            {miniappData.generation.retry_count > 0 && (
                              <div>
                                <div className="text-sm font-medium text-orange-800">Retry Count</div>
                                <Badge variant="outline" className="text-orange-700">
                                  {miniappData.generation.retry_count}
                                </Badge>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            {miniappData.generation.output_url && (
                              <div>
                                <div className="text-sm font-medium text-orange-800">Output URL</div>
                                <div className="text-xs text-orange-700 font-mono break-all bg-orange-50 p-2 rounded border">
                                  <a
                                    href={miniappData.generation.output_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-600 hover:underline"
                                  >
                                    {miniappData.generation.output_url}
                                  </a>
                                </div>
                              </div>
                            )}
                            {miniappData.generation.generated_image && (
                              <div>
                                <div className="text-sm font-medium text-orange-800">Generated Image</div>
                                <div className="text-xs text-orange-700 font-mono break-all bg-orange-50 p-2 rounded border">
                                  <a
                                    href={miniappData.generation.generated_image}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-orange-600 hover:underline"
                                  >
                                    {miniappData.generation.generated_image}
                                  </a>
                                </div>
                              </div>
                            )}
                            {miniappData.generation.error_message && (
                              <div>
                                <div className="text-sm font-medium text-orange-800">Error Message</div>
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
                              <summary className="text-sm font-medium text-orange-800 cursor-pointer hover:text-orange-900">
                                Generation Input Data
                              </summary>
                              <pre className="text-xs bg-orange-50 p-3 rounded border max-h-32 overflow-y-auto">
                                {JSON.stringify(miniappData.generation.input_data, null, 2)}
                              </pre>
                            </details>
                          )}
                          {miniappData.generation.output_data && (
                            <details className="space-y-2">
                              <summary className="text-sm font-medium text-orange-800 cursor-pointer hover:text-orange-900">
                                Generation Output Data
                              </summary>
                              <pre className="text-xs bg-orange-50 p-3 rounded border max-h-32 overflow-y-auto">
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
                              ${miniappData.payment.amount || 'N/A'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm font-medium text-emerald-800">Status</div>
                            <Badge className={getStatusColor(getPaymentStatus(miniappData.payment))}>
                              {getPaymentStatus(miniappData.payment)}
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
                              {formatDate(miniappData.payment.created_at)}
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
                            {formatDate(forensicsData.job.created_at)}
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
                            Started: {formatDate(forensicsData.job.started_at)}
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
                            {formatDate(forensicsData.job.completed_at)}
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
                            Latest: {formatDate(notificationAttestations.find(att => att.success)?.attested_at)} |
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
                          {forensicsData.forensics.attempted_workers.map((worker: string, idx: number) => (
                            <Badge key={idx} variant="outline">{worker}</Badge>
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
                      attestations={forensicsData.forensics.attestations || []}
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