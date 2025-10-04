'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle, XCircle, Clock, Search, AlertTriangle, FileText, Database, Zap } from 'lucide-react';
import AgentModal from '@/components/AgentModal';

export interface QueryResult {
  step: string;
  query: string;
  result: any;
  status: 'success' | 'error' | 'empty';
  timing: number;
}

export interface AnalysisResult {
  mismatches: Array<{ severity: 'high' | 'medium' | 'low'; message: string; details?: string }>;
  attestationSummary: { total: number; failures: number; completions: number; retries: number };
  outputStatus: { hasFiles: boolean; hasDbColumn: boolean; fileCount: number; mismatch: boolean };
  statusConsistency: { redis: string | null; db: string | null; consistent: boolean };
  timeline: Array<{ timestamp: string; event: string; source: string }>;
}

// Analysis function to detect mismatches and anomalies
function analyzeResults(results: QueryResult[]): AnalysisResult {
  const mismatches: Array<{ severity: 'high' | 'medium' | 'low'; message: string; details?: string }> = [];
  const timeline: Array<{ timestamp: string; event: string; source: string }> = [];

  // Extract key data points from results
  const dbJob = results.find(r => r.step === 'EmProps Database - Job Record')?.result;
  const redisJob = results.find(r => r.step === 'Redis - Direct Job Lookup')?.result;
  const workerFailures = results.find(r => r.step === 'Redis - Worker Failure Attestations')?.result || [];
  const workerCompletions = results.find(r => r.step === 'Redis - Worker Completion Attestations')?.result || [];
  const apiAttestations = results.find(r => r.step === 'Redis - API Workflow Attestations')?.result || [];
  const flatFiles = results.find(r => r.step === 'EmProps Database - Flat Files')?.result || [];
  const retryBackups = results.find(r => r.step === 'EmProps Database - Job Retry Backups')?.result || [];

  // Status consistency check
  const redisStatus = redisJob?.status || null;
  const dbStatus = dbJob?.status || null;
  const statusConsistent = !redisStatus || !dbStatus || redisStatus === dbStatus;

  if (!statusConsistent && redisStatus && dbStatus) {
    mismatches.push({
      severity: 'high',
      message: `Status mismatch: Redis shows "${redisStatus}" but DB shows "${dbStatus}"`,
      details: 'Redis is the authoritative source for job status. DB may be out of sync.'
    });
  }

  // Output file vs workflow_output column check
  const hasFiles = Array.isArray(flatFiles) && flatFiles.length > 0;
  const hasDbWorkflowOutput = dbJob?.workflow_output && Object.keys(dbJob.workflow_output).length > 0;
  const outputMismatch = hasFiles && !hasDbWorkflowOutput;

  if (outputMismatch) {
    mismatches.push({
      severity: 'high',
      message: `Output mismatch: ${flatFiles.length} file(s) detected but workflow_output column is empty`,
      details: 'Generated files exist but are not recorded in the job workflow_output field.'
    });
  }

  // Check if job is in Redis but not in DB
  if (redisJob && !dbJob) {
    mismatches.push({
      severity: 'medium',
      message: 'Job exists in Redis but not found in database',
      details: 'This may indicate a job that was created in Redis but never persisted to the DB.'
    });
  }

  // Check if job is in DB but not in Redis
  if (dbJob && !redisJob) {
    mismatches.push({
      severity: 'medium',
      message: 'Job exists in database but not found in Redis',
      details: 'This may indicate an old job that has been cleaned up from Redis.'
    });
  }

  // Attestation summary
  const allAttestations = [...(Array.isArray(workerFailures) ? workerFailures : []),
                           ...(Array.isArray(workerCompletions) ? workerCompletions : []),
                           ...(Array.isArray(apiAttestations) ? apiAttestations : [])];

  const failureCount = (Array.isArray(workerFailures) ? workerFailures.length : 0) +
                       (Array.isArray(apiAttestations) ? apiAttestations.filter((a: any) => a.key?.includes('failure')).length : 0);
  const completionCount = (Array.isArray(workerCompletions) ? workerCompletions.length : 0) +
                          (Array.isArray(apiAttestations) ? apiAttestations.filter((a: any) => a.key?.includes('completion')).length : 0);
  const retryCount = Array.isArray(retryBackups) ? retryBackups.length : 0;

  // Build timeline from various sources
  if (dbJob?.created_at) {
    timeline.push({ timestamp: dbJob.created_at, event: 'Job Created', source: 'Database' });
  }
  if (dbJob?.started_at) {
    timeline.push({ timestamp: dbJob.started_at, event: 'Job Started', source: 'Database' });
  }
  if (redisJob?.assigned_at) {
    timeline.push({ timestamp: redisJob.assigned_at, event: 'Job Assigned', source: 'Redis' });
  }

  // Add attestation events
  allAttestations.forEach((att: any) => {
    const timestamp = att.data?.timestamp || att.data?.failed_at || att.data?.completed_at;
    if (timestamp) {
      const eventType = att.key?.includes('failure') ? 'Failure Attested' : 'Completion Attested';
      timeline.push({ timestamp, event: eventType, source: 'Redis Attestation' });
    }
  });

  if (dbJob?.completed_at) {
    timeline.push({ timestamp: dbJob.completed_at, event: 'Job Completed', source: 'Database' });
  }

  // Sort timeline chronologically
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    mismatches,
    attestationSummary: {
      total: allAttestations.length,
      failures: failureCount,
      completions: completionCount,
      retries: retryCount
    },
    outputStatus: {
      hasFiles,
      hasDbColumn: hasDbWorkflowOutput,
      fileCount: Array.isArray(flatFiles) ? flatFiles.length : 0,
      mismatch: outputMismatch
    },
    statusConsistency: {
      redis: redisStatus,
      db: dbStatus,
      consistent: statusConsistent
    },
    timeline
  };
}

function WorkflowDebugContent() {
  const searchParams = useSearchParams();
  const [workflowId, setWorkflowId] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Auto-populate and debug from URL query parameter
  useEffect(() => {
    const urlWorkflowId = searchParams.get('workflow-id');
    if (urlWorkflowId) {
      setWorkflowId(urlWorkflowId);
      // Auto-trigger debug if workflow ID is provided in URL
      debugWorkflowById(urlWorkflowId);
    }
  }, [searchParams]);

  const debugWorkflowById = async (id: string) => {
    if (!id.trim()) return;

    setLoading(true);
    setResults([]);

    try {
      const response = await fetch(`/api/workflow-debug/${id}`);
      const data = await response.json();

      if (data.success) {
        setResults(data.results);
        setAnalysis(analyzeResults(data.results));
      } else {
        setResults([{
          step: 'Error',
          query: 'Failed to debug workflow',
          result: data.error,
          status: 'error',
          timing: 0
        }]);
      }
    } catch (error) {
      setResults([{
        step: 'Error',
        query: 'Network error',
        result: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        timing: 0
      }]);
    } finally {
      setLoading(false);
    }
  };

  const debugWorkflow = async () => {
    debugWorkflowById(workflowId);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'empty': return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-50 border-green-200';
      case 'error': return 'bg-red-50 border-red-200';
      case 'empty': return 'bg-yellow-50 border-yellow-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Workflow Debugger</h1>
        <p className="text-gray-600">
          Enter a workflow ID to see step-by-step what happened at each stage
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Debug Workflow</CardTitle>
          <CardDescription>
            Enter a workflow/job ID to trace its execution path
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              placeholder="Enter workflow ID (e.g., job-123 or step-456)"
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && debugWorkflow()}
            />
            <Button
              onClick={debugWorkflow}
              disabled={loading || !workflowId.trim()}
            >
              {loading ? (
                <Clock className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Debug
            </Button>
            {results.length > 0 && (
              <AgentModal
                workflowId={workflowId}
                queryResults={results}
                analysis={analysis || undefined}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Tabs defaultValue="analysis" className="space-y-4">
          <TabsList>
            <TabsTrigger value="analysis">
              <Zap className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="queries">
              <Database className="w-4 h-4 mr-2" />
              Raw Queries
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="space-y-4">
            {analysis && (
              <>
                {/* Mismatches / Issues */}
                <Card className={analysis.mismatches.length > 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      {analysis.mismatches.length > 0 ? (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      <CardTitle className="text-lg">
                        {analysis.mismatches.length > 0
                          ? `${analysis.mismatches.length} Issue${analysis.mismatches.length > 1 ? 's' : ''} Detected`
                          : 'No Issues Detected'}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  {analysis.mismatches.length > 0 && (
                    <CardContent className="space-y-3">
                      {analysis.mismatches.map((mismatch, idx) => (
                        <div key={idx} className="p-3 bg-white rounded border border-red-200">
                          <div className="flex items-start gap-2">
                            <Badge variant={mismatch.severity === 'high' ? 'destructive' : 'default'} className="mt-0.5">
                              {mismatch.severity}
                            </Badge>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{mismatch.message}</p>
                              {mismatch.details && (
                                <p className="text-xs text-gray-600 mt-1">{mismatch.details}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>

                {/* Status Consistency */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Database className="w-5 h-5" />
                      Status Consistency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Redis Status</p>
                        <Badge className="mt-1">{analysis.statusConsistency.redis || 'N/A'}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Database Status</p>
                        <Badge className="mt-1">{analysis.statusConsistency.db || 'N/A'}</Badge>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Consistency</p>
                        {analysis.statusConsistency.consistent ? (
                          <Badge variant="default" className="mt-1 bg-green-100 text-green-800">Consistent</Badge>
                        ) : (
                          <Badge variant="destructive" className="mt-1">Mismatch</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Attestation Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Attestation Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Attestations</p>
                        <p className="text-2xl font-bold mt-1">{analysis.attestationSummary.total}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Failures</p>
                        <p className="text-2xl font-bold mt-1 text-red-600">{analysis.attestationSummary.failures}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Completions</p>
                        <p className="text-2xl font-bold mt-1 text-green-600">{analysis.attestationSummary.completions}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Retries</p>
                        <p className="text-2xl font-bold mt-1 text-orange-600">{analysis.attestationSummary.retries}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Output Status */}
                <Card className={analysis.outputStatus.mismatch ? 'border-orange-200 bg-orange-50' : ''}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Output Status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Files Generated</p>
                        <p className="text-2xl font-bold mt-1">{analysis.outputStatus.fileCount}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">DB Column Populated</p>
                        <Badge className="mt-1" variant={analysis.outputStatus.hasDbColumn ? 'default' : 'destructive'}>
                          {analysis.outputStatus.hasDbColumn ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Status</p>
                        <Badge className="mt-1" variant={analysis.outputStatus.mismatch ? 'destructive' : 'default'}>
                          {analysis.outputStatus.mismatch ? 'Mismatch' : 'OK'}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timeline */}
                {analysis.timeline.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        Event Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {analysis.timeline.map((event, idx) => (
                          <div key={idx} className="flex items-start gap-3 pb-3 border-b last:border-b-0">
                            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <p className="font-medium text-sm">{event.event}</p>
                                <Badge variant="outline" className="text-xs">{event.source}</Badge>
                              </div>
                              <p className="text-xs text-gray-600 mt-1">{new Date(event.timestamp).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="queries" className="space-y-4">
            <h2 className="text-2xl font-semibold">Raw Query Results</h2>

            {results.map((result, index) => (
            <Card key={index} className={`${getStatusColor(result.status)}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(result.status)}
                    <CardTitle className="text-lg">
                      Step {index + 1}: {result.step}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{result.timing}ms</Badge>
                    <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                      {result.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-sm mb-1">Query:</h4>
                    <code className="text-sm bg-gray-100 p-2 rounded block">
                      {result.query}
                    </code>
                  </div>

                  <div>
                    <h4 className="font-medium text-sm mb-1">Result:</h4>
                    <div className="bg-gray-100 p-3 rounded">
                      <pre className="text-sm overflow-auto max-h-96">
                        {typeof result.result === 'string'
                          ? result.result
                          : JSON.stringify(result.result, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export default function WorkflowDebugPage() {
  return (
    <Suspense fallback={<div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Workflow Debugger</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>}>
      <WorkflowDebugContent />
    </Suspense>
  );
}