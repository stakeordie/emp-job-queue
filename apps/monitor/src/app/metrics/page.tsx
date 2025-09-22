'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, TrendingUp, TrendingDown, Activity, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface MetricsData {
  overview: {
    total_jobs: number;
    completed: number;
    failed: number;
    processing: number;
    pending: number;
    retried_jobs: number;
    avg_duration_seconds: number;
    success_rate: number;
  };
  hourly_stats: Array<{
    hour: string;
    total: number;
    completed: number;
    failed: number;
    avg_duration: number;
  }>;
  retry_analysis: {
    total_retries: number;
    retry_success_rate: number;
    most_retried_workflows: Array<{
      name: string;
      retry_count: number;
    }>;
  };
  performance: {
    p50_duration: number;
    p95_duration: number;
    fastest_job: number;
    slowest_job: number;
  };
}

export default function MetricsPage() {
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/metrics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setMetricsData(data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [timeRange]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const formatPercentage = (value: number) => `${Math.round(value * 100)}%`;

  if (loading && !metricsData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Job Queue Metrics</h1>
          <p className="text-gray-600 mt-2">Real-time performance and analytics dashboard</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchMetrics} disabled={loading} size="sm" variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {metricsData && (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metricsData.overview.total_jobs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Last {timeRange}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatPercentage(metricsData.overview.success_rate)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {metricsData.overview.completed} of {metricsData.overview.total_jobs} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(metricsData.overview.avg_duration_seconds)}
                </div>
                <p className="text-xs text-muted-foreground">Mean processing time</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Retried Jobs</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {metricsData.overview.retried_jobs}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(metricsData.overview.retried_jobs / metricsData.overview.total_jobs)} of total
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Status Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Job Status Distribution</CardTitle>
                <CardDescription>Current status of all jobs in {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{metricsData.overview.completed}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPercentage(metricsData.overview.completed / metricsData.overview.total_jobs)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">Failed</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{metricsData.overview.failed}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPercentage(metricsData.overview.failed / metricsData.overview.total_jobs)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Processing</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{metricsData.overview.processing}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPercentage(metricsData.overview.processing / metricsData.overview.total_jobs)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">Pending</Badge>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{metricsData.overview.pending}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatPercentage(metricsData.overview.pending / metricsData.overview.total_jobs)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Job processing time distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">P50 (Median)</span>
                    <span className="font-semibold">{formatDuration(metricsData.performance.p50_duration)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">P95</span>
                    <span className="font-semibold">{formatDuration(metricsData.performance.p95_duration)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Fastest</span>
                    <span className="font-semibold text-green-600">{formatDuration(metricsData.performance.fastest_job)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Slowest</span>
                    <span className="font-semibold text-red-600">{formatDuration(metricsData.performance.slowest_job)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Last Updated */}
          <div className="text-center text-sm text-muted-foreground">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </div>
        </>
      )}
    </div>
  );
}