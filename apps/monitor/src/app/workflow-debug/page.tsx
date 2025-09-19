'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, Search } from 'lucide-react';

interface QueryResult {
  step: string;
  query: string;
  result: any;
  status: 'success' | 'error' | 'empty';
  timing: number;
}

export default function WorkflowDebugPage() {
  const searchParams = useSearchParams();
  const [workflowId, setWorkflowId] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<QueryResult[]>([]);

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
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold mb-4">Debug Results</h2>

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
        </div>
      )}
    </div>
  );
}