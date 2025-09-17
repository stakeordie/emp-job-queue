'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Database, RefreshCw, Search, Info, Image as ImageIcon, Download, ExternalLink, User, Wallet, MessageCircle } from 'lucide-react';

interface WorkflowStep {
  id: number;
  alias?: string;
  nodeName: string;
  nodeAlias?: string;
  nodeResponse?: {
    src?: string;
    mimeType?: string;
  };
}

interface WorkflowOutput {
  steps: WorkflowStep[];
  generation?: {
    id: number;
    hash: string;
  };
}

interface JobPayload {
  _collection?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  outputs?: WorkflowOutput[];
  collectionId?: string;
}

interface JobForensicsData {
  job: {
    payload: JobPayload;
    [key: string]: unknown;
  };
  forensics: Record<string, unknown>;
  similar_failures: Record<string, unknown>[];
  recovery_suggestions: Record<string, unknown>[];
}

export default function JobForensics() {
  const [jobId, setJobId] = useState('');
  const [forensicsData, setForensicsData] = useState<JobForensicsData | null>(null);
  const [failedAnalysis, setFailedAnalysis] = useState<Record<string, unknown> | null>(null);
  const [allJobs, setAllJobs] = useState<Record<string, unknown>[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const searchJob = async () => {
    if (!jobId.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${jobId}/forensics`);
      const data = await response.json();

      if (data.success) {
        setForensicsData(data);
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
  };

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

  const loadAllJobs = async () => {
    setJobsLoading(true);
    try {
      const response = await fetch('/api/jobs/all?limit=50');
      const data = await response.json();
      if (data.success) {
        setAllJobs(data.jobs);
      }
    } catch {
      setError('Failed to load jobs list');
    } finally {
      setJobsLoading(false);
    }
  };

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

  // Helper variable for miniapp data access
  const miniappData = (forensicsData?.job?.payload as any)?._miniapp_data;

  // Filter jobs based on search query
  const filteredJobs = allJobs.filter((job) => {
    if (!searchQuery.trim()) return true;

    const searchLower = searchQuery.toLowerCase();
    const jobId = String(job.id).toLowerCase();
    const jobName = String(job.name || job.description || '').toLowerCase();
    const jobType = String(job.job_type || '').toLowerCase();
    const userId = String(job.user_id || '').toLowerCase();
    const status = String(job.status || '').toLowerCase();

    return jobId.includes(searchLower) ||
           jobName.includes(searchLower) ||
           jobType.includes(searchLower) ||
           userId.includes(searchLower) ||
           status.includes(searchLower);
  });

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
                Search and browse workflow jobs from EmProps API database
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by job ID, name, type, user, or status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={loadAllJobs} disabled={jobsLoading}>
                    {jobsLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Load Jobs
                  </Button>
                </div>

                {allJobs.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      {filteredJobs.length} of {allJobs.length} jobs {searchQuery.trim() && 'matching search'}
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="max-h-96 overflow-y-auto">
                        {filteredJobs.map((job, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border-b last:border-b-0 hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded font-mono">
                                {String(job.id).substring(0, 8)}...
                              </code>
                              <div className="flex flex-col flex-1">
                                <div className="text-sm font-medium">
                                  {String(job.name || job.description || 'Unnamed Workflow')}
                                </div>
                                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                  <span>
                                    {job.created_at ? new Date(String(job.created_at)).toLocaleString() : 'Unknown date'}
                                  </span>
                                  {job.job_type != null && String(job.job_type).trim() !== '' && (
                                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                                      {String(job.job_type)}
                                    </span>
                                  )}
                                  {job.user_id != null && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                                      <User className="h-3 w-3" />
                                      {String(job.user_id).substring(0, 8)}...
                                    </span>
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
                              {job.error_message != null && String(job.error_message).trim() !== '' && (
                                <div title={String(job.error_message)}>
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  const id = String(job.id);
                                  setJobId(id);

                                  // Trigger the search with the new job ID
                                  setLoading(true);
                                  setError(null);

                                  try {
                                    const response = await fetch(`/api/jobs/${id}/forensics`);
                                    const data = await response.json();

                                    if (data.success) {
                                      setForensicsData(data);
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
                                className="ml-2"
                              >
                                <Info className="h-3 w-3 mr-1" />
                                More Info
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

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
                      <div className="text-sm">{String(forensicsData.job.retry_count)}/{String(forensicsData.job.max_retries)}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Worker</div>
                      <div className="text-sm">{String(forensicsData.job.worker_id || 'None')}</div>
                    </div>
                  </div>

                  {forensicsData.forensics.last_known_error != null && String(forensicsData.forensics.last_known_error).trim() !== '' ? (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="font-medium text-red-800">Error Message:</div>
                      <div className="text-red-700 text-sm mt-1">{String(forensicsData.forensics.last_known_error || 'Unknown error')}</div>
                    </div>
                  ) : null}
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
                          {forensicsData.job.payload.outputs.map((output: object, outputIndex: number) => (
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
                                  {output.steps.map((step: object, stepIndex: number) => (
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
                              <img
                                src={miniappData.user.farcaster_pfp as string}
                                alt="Farcaster Profile"
                                className="w-16 h-16 rounded-full border-2 border-violet-300"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
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
                                  <span className="text-xs font-medium text-violet-800">{link.social_org}</span>
                                  <span className="text-xs text-violet-700">{link.identifier}</span>
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

              {/* Job Queue Results & Image Outputs */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Job Queue Results & Image Outputs
                  </CardTitle>
                  <CardDescription>
                    Generated images, files, and processing results from the job queue system
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Job Result Data */}
                  {forensicsData.job.result && (
                    <div className="space-y-4">
                      <div className="text-lg font-semibold text-blue-700 border-b border-blue-200 pb-2">
                        Job Queue Processing Results
                      </div>

                      {/* Processing Metadata */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {forensicsData.job.result.success !== undefined && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Success Status</div>
                            <Badge className={forensicsData.job.result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {forensicsData.job.result.success ? 'Success' : 'Failed'}
                            </Badge>
                          </div>
                        )}
                        {forensicsData.job.result.processing_time && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Processing Time</div>
                            <div className="text-sm">{formatDuration(Number(forensicsData.job.result.processing_time))}</div>
                          </div>
                        )}
                        {forensicsData.job.result.connector_info?.connector_type && (
                          <div>
                            <div className="text-sm font-medium text-muted-foreground">Connector Type</div>
                            <Badge variant="outline">{String(forensicsData.job.result.connector_info.connector_type)}</Badge>
                          </div>
                        )}
                      </div>

                      {/* Generated Images/Files */}
                      {forensicsData.job.result.output_files && Array.isArray(forensicsData.job.result.output_files) && forensicsData.job.result.output_files.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-md font-semibold text-green-700">Generated Files ({forensicsData.job.result.output_files.length})</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {forensicsData.job.result.output_files.map((fileUrl: string, idx: number) => (
                              <div key={idx} className="border border-green-200 rounded-lg p-4 bg-green-50">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="text-sm font-medium text-green-800">File {idx + 1}</div>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => window.open(fileUrl, '_blank')}>
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const a = document.createElement('a');
                                      a.href = fileUrl;
                                      a.download = fileUrl.split('/').pop() || 'download';
                                      a.click();
                                    }}>
                                      <Download className="h-3 w-3 mr-1" />
                                      Download
                                    </Button>
                                  </div>
                                </div>

                                {/* Image Preview */}
                                {(fileUrl.includes('.png') || fileUrl.includes('.jpg') || fileUrl.includes('.jpeg') || fileUrl.includes('.webp') || fileUrl.includes('.gif')) && (
                                  <div className="mb-3">
                                    <img
                                      src={fileUrl}
                                      alt={`Generated image ${idx + 1}`}
                                      className="w-full h-32 object-cover rounded border"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                      }}
                                    />
                                  </div>
                                )}

                                {/* File URL */}
                                <div className="text-xs text-green-700 font-mono break-all bg-white p-2 rounded border">
                                  {fileUrl}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Generation Metadata */}
                      {forensicsData.job.result.metadata && (
                        <div className="space-y-3">
                          <div className="text-md font-semibold text-orange-700">Generation Metadata</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {Object.entries(forensicsData.job.result.metadata).map(([key, value]) => (
                              <div key={key} className="flex flex-col gap-1 p-3 bg-orange-50 rounded border border-orange-200">
                                <div className="text-sm font-medium text-orange-800">{key}</div>
                                <div className="text-sm text-orange-700 font-mono">
                                  {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Connector Performance Stats */}
                      {forensicsData.job.result.connector_info?.processing_stats && (
                        <div className="space-y-3">
                          <div className="text-md font-semibold text-purple-700">Performance Statistics</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {Object.entries(forensicsData.job.result.connector_info.processing_stats).map(([key, value]) => (
                              <div key={key} className="flex flex-col gap-1 p-3 bg-purple-50 rounded border border-purple-200">
                                <div className="text-sm font-medium text-purple-800">{key}</div>
                                <div className="text-sm text-purple-700 font-mono">
                                  {typeof value === 'number' && (key.includes('time') || key.includes('ms'))
                                    ? formatDuration(value)
                                    : String(value)
                                  }
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Raw Job Result (Collapsible) */}
                      <details className="space-y-2">
                        <summary className="text-md font-semibold text-gray-700 cursor-pointer hover:text-gray-900">
                          Raw Job Result Data (Click to expand)
                        </summary>
                        <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto border max-h-64 overflow-y-auto">
                          {JSON.stringify(forensicsData.job.result, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}

                  {/* Job Data (from EmProps) */}
                  {forensicsData.job.data && (
                    <div className="space-y-4">
                      <div className="text-lg font-semibold text-indigo-700 border-b border-indigo-200 pb-2">
                        EmProps Job Data
                      </div>

                      {/* Progress Information */}
                      {forensicsData.job.progress !== undefined && (
                        <div className="flex items-center gap-3">
                          <div className="text-sm font-medium text-muted-foreground">Progress</div>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, Number(forensicsData.job.progress)))}%` }}
                            ></div>
                          </div>
                          <div className="text-sm font-medium">{forensicsData.job.progress}%</div>
                        </div>
                      )}

                      {/* Raw EmProps Data (Collapsible) */}
                      <details className="space-y-2">
                        <summary className="text-md font-semibold text-indigo-700 cursor-pointer hover:text-indigo-900">
                          Raw EmProps Data (Click to expand)
                        </summary>
                        <pre className="text-xs bg-indigo-50 p-3 rounded overflow-x-auto border max-h-64 overflow-y-auto">
                          {JSON.stringify(forensicsData.job.data, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}

                  {/* EmProps Database Images */}
                  {(forensicsData.job.payload as any)._flat_files && Array.isArray((forensicsData.job.payload as any)._flat_files) && (forensicsData.job.payload as any)._flat_files.length > 0 && (
                    <div className="space-y-4">
                      <div className="text-lg font-semibold text-cyan-700 border-b border-cyan-200 pb-2">
                        EmProps Database Images ({(forensicsData.job.payload as any)._flat_files.length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(forensicsData.job.payload as any)._flat_files.map((file: object, idx: number) => (
                          <div key={idx} className="border border-cyan-200 rounded-lg p-4 bg-cyan-50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-medium text-cyan-800">
                                {file.name || `Image ${idx + 1}`}
                              </div>
                              <div className="flex gap-2">
                                {file.url && (
                                  <>
                                    <Button size="sm" variant="outline" onClick={() => window.open(file.url, '_blank')}>
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      View
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => {
                                      const a = document.createElement('a');
                                      a.href = file.url;
                                      a.download = file.name || 'download';
                                      a.click();
                                    }}>
                                      <Download className="h-3 w-3 mr-1" />
                                      Download
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Image Preview */}
                            {file.url && file.mime_type?.includes('image') && (
                              <div className="mb-3">
                                <img
                                  src={file.url}
                                  alt={file.name || `Generated image ${idx + 1}`}
                                  className="w-full h-32 object-cover rounded border"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                  }}
                                />
                              </div>
                            )}

                            {/* Metadata */}
                            <div className="space-y-2 text-xs">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="font-medium text-cyan-800">ID:</span>
                                  <span className="text-cyan-700 ml-1">{file.id}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-cyan-800">Type:</span>
                                  <span className="text-cyan-700 ml-1">{file.mime_type || 'unknown'}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-cyan-800">Relation:</span>
                                  <span className="text-cyan-700 ml-1">{file.rel_type}</span>
                                </div>
                                <div>
                                  <span className="font-medium text-cyan-800">Created:</span>
                                  <span className="text-cyan-700 ml-1">
                                    {file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Unknown'}
                                  </span>
                                </div>
                              </div>

                              {/* File URL */}
                              {file.url && (
                                <div className="text-cyan-700 font-mono break-all bg-white p-2 rounded border mt-2">
                                  {file.url}
                                </div>
                              )}

                              {/* Generation Input Data */}
                              {file.gen_in_data && (
                                <details className="mt-2">
                                  <summary className="font-medium text-cyan-800 cursor-pointer hover:text-cyan-900">
                                    Generation Input
                                  </summary>
                                  <pre className="text-xs bg-white p-2 rounded border mt-1 max-h-24 overflow-y-auto">
                                    {JSON.stringify(file.gen_in_data, null, 2)}
                                  </pre>
                                </details>
                              )}

                              {/* Generation Output Data */}
                              {file.gen_out_data && (
                                <details className="mt-2">
                                  <summary className="font-medium text-cyan-800 cursor-pointer hover:text-cyan-900">
                                    Generation Output
                                  </summary>
                                  <pre className="text-xs bg-white p-2 rounded border mt-1 max-h-24 overflow-y-auto">
                                    {JSON.stringify(file.gen_out_data, null, 2)}
                                  </pre>
                                </details>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* No Results Message */}
                  {!forensicsData.job.result && !forensicsData.job.data && (!(forensicsData.job.payload as any)._flat_files || (forensicsData.job.payload as any)._flat_files.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <div className="text-sm">No image outputs or processing results available for this job</div>
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