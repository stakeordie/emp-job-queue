import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, CheckCircle, XCircle, Clock, TrendingDown } from "lucide-react";
import { useState } from "react";
import type { Job, Machine } from "@/types";

interface ModelDownloadEvent {
  modelName: string;
  machineId: string;
  timestamp: number;
  status: 'success' | 'failure' | 'timeout' | 'in_progress';
  downloadTime: number;
  fileSize: number;
  errorMessage?: string;
  retryCount: number;
  source: 'huggingface' | 'civitai' | 'github' | 'local';
}

interface ModelDownloadStats {
  modelName: string;
  totalAttempts: number;
  successfulDownloads: number;
  failedDownloads: number;
  avgDownloadTime: number;
  avgFileSize: number;
  successRate: number;
  recentFailures: ModelDownloadEvent[];
  slowestDownloads: ModelDownloadEvent[];
  machinePerformance: MachineDownloadPerformance[];
  downloadTrends: DailyDownloadTrend[];
}

interface MachineDownloadPerformance {
  machineId: string;
  successRate: number;
  avgDownloadTime: number;
  totalDownloads: number;
  lastFailure?: string;
  networkScore: number;
  storageScore: number;
}

interface DailyDownloadTrend {
  date: string;
  attempts: number;
  successes: number;
  failures: number;
  avgTime: number;
}

interface ModelDownloadTrackerProps {
  jobs: Job[];
  machines: Machine[];
}

export function ModelDownloadTracker({ jobs, machines }: ModelDownloadTrackerProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'6h' | '24h' | '7d' | '30d'>('24h');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'failures' | 'time' | 'success_rate'>('failures');
  const [showOnlyProblematic, setShowOnlyProblematic] = useState(false);
  
  const downloadEvents = extractDownloadEvents(jobs, machines, selectedTimeRange);
  const modelStats = aggregateModelDownloadStats(downloadEvents);
  const machinePerformance = analyzeMachineDownloadPerformance(downloadEvents, machines);
  const filteredStats = showOnlyProblematic 
    ? modelStats.filter(stat => stat.successRate < 90 || stat.avgDownloadTime > 30000)
    : modelStats;
  
  const sortedStats = sortModelStats(filteredStats, sortBy);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Model Download Tracker
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Monitor model download success rates and identify bottlenecks
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">Time Range:</span>
            {(['6h', '24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setSelectedTimeRange(range)}
                className={`px-3 py-1 text-sm rounded ${
                  selectedTimeRange === range
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          
          <div className="flex gap-2">
            <span className="text-sm font-medium">Sort by:</span>
            {(['failures', 'time', 'success_rate'] as const).map((sort) => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`px-3 py-1 text-sm rounded capitalize ${
                  sortBy === sort
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {sort.replace('_', ' ')}
              </button>
            ))}
          </div>
          
          <Button
            variant={showOnlyProblematic ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyProblematic(!showOnlyProblematic)}
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Problems Only
          </Button>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {downloadEvents.length}
            </div>
            <div className="text-sm text-muted-foreground">Total Downloads</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {downloadEvents.filter(e => e.status === 'success').length}
            </div>
            <div className="text-sm text-muted-foreground">Successful</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {downloadEvents.filter(e => e.status === 'failure').length}
            </div>
            <div className="text-sm text-muted-foreground">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {downloadEvents.length > 0 
                ? Math.round((downloadEvents.filter(e => e.status === 'success').length / downloadEvents.length) * 100)
                : 0}%
            </div>
            <div className="text-sm text-muted-foreground">Success Rate</div>
          </div>
        </div>

        {/* Model Download Statistics */}
        <div className="space-y-4">
          <h4 className="font-semibold">Model Download Performance</h4>
          <div className="space-y-3">
            {sortedStats.slice(0, 10).map((stat) => (
              <div 
                key={stat.modelName}
                className={`border rounded p-4 cursor-pointer transition-colors ${
                  selectedModel === stat.modelName 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:border-gray-300'
                }`}
                onClick={() => setSelectedModel(
                  selectedModel === stat.modelName ? null : stat.modelName
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{stat.modelName}</span>
                    <DownloadStatusBadge 
                      successRate={stat.successRate}
                      avgTime={stat.avgDownloadTime}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {stat.totalAttempts} attempts
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span>Success Rate</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={stat.successRate} className="flex-1" />
                      <span className="font-medium">{stat.successRate}%</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3 text-blue-600" />
                      <span>Avg Time</span>
                    </div>
                    <div className="font-medium">
                      {formatDuration(stat.avgDownloadTime)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Download className="h-3 w-3 text-purple-600" />
                      <span>File Size</span>
                    </div>
                    <div className="font-medium">
                      {formatFileSize(stat.avgFileSize)}
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <XCircle className="h-3 w-3 text-red-600" />
                      <span>Failures</span>
                    </div>
                    <div className="font-medium">
                      {stat.failedDownloads}
                    </div>
                  </div>
                </div>
                
                {selectedModel === stat.modelName && (
                  <div className="mt-4 pt-4 border-t">
                    <DetailedModelAnalysis 
                      stat={stat} 
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Machine Performance Comparison */}
        <div className="space-y-4">
          <h4 className="font-semibold">Machine Download Performance</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {machinePerformance.map((machine) => (
              <div key={machine.machineId} className="border rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{machine.machineId}</div>
                  <Badge variant={machine.successRate > 90 ? 'default' : 'destructive'}>
                    {machine.successRate}%
                  </Badge>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Downloads:</span>
                    <span className="font-medium">{machine.totalDownloads}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Avg Time:</span>
                    <span className="font-medium">{formatDuration(machine.avgDownloadTime)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Network Score:</span>
                    <span className="font-medium">{machine.networkScore}/100</span>
                  </div>
                  {machine.lastFailure && (
                    <div className="text-red-600 text-xs">
                      Last failure: {machine.lastFailure}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Download Trends */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Download Trends
          </h4>
          <DownloadTrendsChart 
            trends={aggregateDailyTrends(downloadEvents)}
          />
        </div>

        {/* Optimization Recommendations */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Optimization Recommendations</h4>
          <OptimizationRecommendations 
            modelStats={modelStats}
            machinePerformance={machinePerformance}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function extractDownloadEvents(jobs: Job[], machines: Machine[], timeRange: '6h' | '24h' | '7d' | '30d'): ModelDownloadEvent[] {
  const timeRangeMs = {
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange];
  
  // Mock download events - in real implementation, these would come from actual logs
  const events: ModelDownloadEvent[] = [];
  
  jobs.filter(job => job.created_at > cutoffTime).forEach(job => {
    const models = extractModelsFromJob();
    const machineId = findMachineForJob(job, machines);
    
    models.forEach(modelName => {
      events.push({
        modelName,
        machineId: machineId || 'unknown',
        timestamp: job.created_at,
        status: job.status === 'completed' ? 'success' : 
                job.status === 'failed' ? 'failure' : 'in_progress',
        downloadTime: job.started_at && job.created_at 
          ? job.started_at - job.created_at 
          : Math.random() * 60000 + 5000,
        fileSize: Math.random() * 3000 + 500, // Mock file size in MB
        errorMessage: job.status === 'failed' ? job.error || 'Download failed' : undefined,
        retryCount: Math.floor(Math.random() * 3),
        source: ['huggingface', 'civitai', 'github', 'local'][Math.floor(Math.random() * 4)] as 'huggingface' | 'civitai' | 'github' | 'local'
      });
    });
  });

  return events;
}

function extractModelsFromJob(/* _job: Job */): string[] {
  // Mock model extraction
  const models = [
    'SDXL Base 1.0',
    'SDXL Refiner 1.0',
    'ControlNet OpenPose',
    'ControlNet Depth',
    'LoRA Style Collection',
    'VAE ft-mse',
    'CLIP Vision',
    'AnimateDiff',
    'IP-Adapter'
  ];
  
  return [models[Math.floor(Math.random() * models.length)]];
}

function findMachineForJob(job: Job, machines: Machine[]): string | null {
  if (!job.worker_id) return null;
  
  for (const machine of machines) {
    if (machine.workers.includes(job.worker_id)) {
      return machine.machine_id;
    }
  }
  return null;
}

function aggregateModelDownloadStats(events: ModelDownloadEvent[]): ModelDownloadStats[] {
  const modelMap = new Map<string, ModelDownloadEvent[]>();
  
  events.forEach(event => {
    if (!modelMap.has(event.modelName)) {
      modelMap.set(event.modelName, []);
    }
    modelMap.get(event.modelName)!.push(event);
  });

  return Array.from(modelMap.entries()).map(([modelName, modelEvents]) => {
    const successful = modelEvents.filter(e => e.status === 'success');
    const failed = modelEvents.filter(e => e.status === 'failure');
    const avgDownloadTime = successful.length > 0 
      ? successful.reduce((sum, e) => sum + e.downloadTime, 0) / successful.length
      : 0;
    const avgFileSize = modelEvents.length > 0
      ? modelEvents.reduce((sum, e) => sum + e.fileSize, 0) / modelEvents.length
      : 0;

    return {
      modelName,
      totalAttempts: modelEvents.length,
      successfulDownloads: successful.length,
      failedDownloads: failed.length,
      avgDownloadTime,
      avgFileSize,
      successRate: modelEvents.length > 0 
        ? Math.round((successful.length / modelEvents.length) * 100) 
        : 0,
      recentFailures: failed.slice(-3),
      slowestDownloads: modelEvents
        .filter(e => e.status === 'success')
        .sort((a, b) => b.downloadTime - a.downloadTime)
        .slice(0, 3),
      machinePerformance: aggregateMachinePerformance(modelEvents),
      downloadTrends: []
    };
  });
}

function aggregateMachinePerformance(events: ModelDownloadEvent[]): MachineDownloadPerformance[] {
  const machineMap = new Map<string, ModelDownloadEvent[]>();
  
  events.forEach(event => {
    if (!machineMap.has(event.machineId)) {
      machineMap.set(event.machineId, []);
    }
    machineMap.get(event.machineId)!.push(event);
  });

  return Array.from(machineMap.entries()).map(([machineId, machineEvents]) => {
    const successful = machineEvents.filter(e => e.status === 'success');
    const failed = machineEvents.filter(e => e.status === 'failure');
    const avgDownloadTime = successful.length > 0
      ? successful.reduce((sum, e) => sum + e.downloadTime, 0) / successful.length
      : 0;

    return {
      machineId,
      successRate: machineEvents.length > 0 
        ? Math.round((successful.length / machineEvents.length) * 100)
        : 0,
      avgDownloadTime,
      totalDownloads: machineEvents.length,
      lastFailure: failed.length > 0 ? failed[failed.length - 1].errorMessage : undefined,
      networkScore: Math.max(0, 100 - (avgDownloadTime / 1000)), // Simple network score
      storageScore: Math.random() * 100 // Mock storage score
    };
  });
}

function analyzeMachineDownloadPerformance(events: ModelDownloadEvent[], machines: Machine[]): MachineDownloadPerformance[] {
  const machineMap = new Map<string, ModelDownloadEvent[]>();
  
  events.forEach(event => {
    if (!machineMap.has(event.machineId)) {
      machineMap.set(event.machineId, []);
    }
    machineMap.get(event.machineId)!.push(event);
  });

  return machines.map(machine => {
    const machineEvents = machineMap.get(machine.machine_id) || [];
    const successful = machineEvents.filter(e => e.status === 'success');
    const failed = machineEvents.filter(e => e.status === 'failure');
    const avgDownloadTime = successful.length > 0
      ? successful.reduce((sum, e) => sum + e.downloadTime, 0) / successful.length
      : 0;

    return {
      machineId: machine.machine_id,
      successRate: machineEvents.length > 0 
        ? Math.round((successful.length / machineEvents.length) * 100)
        : 100,
      avgDownloadTime,
      totalDownloads: machineEvents.length,
      lastFailure: failed.length > 0 ? failed[failed.length - 1].errorMessage : undefined,
      networkScore: Math.max(0, 100 - Math.round(avgDownloadTime / 1000)),
      storageScore: Math.random() * 100
    };
  });
}

function sortModelStats(stats: ModelDownloadStats[], sortBy: 'failures' | 'time' | 'success_rate'): ModelDownloadStats[] {
  return [...stats].sort((a, b) => {
    switch (sortBy) {
      case 'failures':
        return b.failedDownloads - a.failedDownloads;
      case 'time':
        return b.avgDownloadTime - a.avgDownloadTime;
      case 'success_rate':
        return a.successRate - b.successRate;
      default:
        return 0;
    }
  });
}

function aggregateDailyTrends(events: ModelDownloadEvent[]): DailyDownloadTrend[] {
  const dailyMap = new Map<string, ModelDownloadEvent[]>();
  
  events.forEach(event => {
    const date = new Date(event.timestamp).toDateString();
    if (!dailyMap.has(date)) {
      dailyMap.set(date, []);
    }
    dailyMap.get(date)!.push(event);
  });

  return Array.from(dailyMap.entries()).map(([date, dayEvents]) => {
    const successes = dayEvents.filter(e => e.status === 'success');
    const failures = dayEvents.filter(e => e.status === 'failure');
    const avgTime = successes.length > 0
      ? successes.reduce((sum, e) => sum + e.downloadTime, 0) / successes.length
      : 0;

    return {
      date,
      attempts: dayEvents.length,
      successes: successes.length,
      failures: failures.length,
      avgTime
    };
  }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function DownloadStatusBadge({ successRate, avgTime }: { successRate: number; avgTime: number }) {
  if (successRate < 70) {
    return <Badge variant="destructive">High Failure</Badge>;
  } else if (avgTime > 60000) {
    return <Badge variant="secondary">Slow</Badge>;
  } else if (successRate > 95) {
    return <Badge variant="default">Excellent</Badge>;
  } else {
    return <Badge variant="outline">Good</Badge>;
  }
}

function DetailedModelAnalysis({ stat }: { 
  stat: ModelDownloadStats; 
}) {
  return (
    <div className="space-y-4">
      <h5 className="font-semibold">Detailed Analysis: {stat.modelName}</h5>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2">Recent Failures</h6>
          <div className="space-y-2">
            {stat.recentFailures.length > 0 ? (
              stat.recentFailures.map((failure, index) => (
                <div key={index} className="text-sm border rounded p-2 bg-red-50">
                  <div className="font-medium">{failure.machineId}</div>
                  <div className="text-red-600">{failure.errorMessage}</div>
                  <div className="text-muted-foreground">
                    {new Date(failure.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">No recent failures</div>
            )}
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Slowest Downloads</h6>
          <div className="space-y-2">
            {stat.slowestDownloads.map((download, index) => (
              <div key={index} className="text-sm border rounded p-2">
                <div className="font-medium">{download.machineId}</div>
                <div className="text-orange-600">{formatDuration(download.downloadTime)}</div>
                <div className="text-muted-foreground">
                  {new Date(download.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DownloadTrendsChart({ trends }: { trends: DailyDownloadTrend[] }) {
  if (trends.length === 0) {
    return <div className="text-muted-foreground">No trend data available</div>;
  }

  return (
    <div className="space-y-2">
      {trends.slice(-7).map((trend, index) => (
        <div key={index} className="flex items-center gap-4 text-sm">
          <div className="w-20 font-medium">{trend.date.slice(0, 10)}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="w-16">Attempts: {trend.attempts}</span>
              <div className="flex-1 bg-gray-200 rounded">
                <div 
                  className="bg-green-500 h-2 rounded"
                  style={{ width: `${(trend.successes / trend.attempts) * 100}%` }}
                />
              </div>
              <span className="w-16">Success: {Math.round((trend.successes / trend.attempts) * 100)}%</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OptimizationRecommendations({ modelStats, machinePerformance }: { 
  modelStats: ModelDownloadStats[]; 
  machinePerformance: MachineDownloadPerformance[] 
}) {
  const recommendations = [];
  
  // High failure rate models
  const problematicModels = modelStats.filter(stat => stat.successRate < 80);
  if (problematicModels.length > 0) {
    recommendations.push(
      `${problematicModels.length} models have high failure rates - investigate network/storage issues`
    );
  }
  
  // Slow downloads
  const slowModels = modelStats.filter(stat => stat.avgDownloadTime > 60000);
  if (slowModels.length > 0) {
    recommendations.push(
      `${slowModels.length} models are slow to download - consider pre-caching or CDN optimization`
    );
  }
  
  // Poor performing machines
  const poorMachines = machinePerformance.filter(machine => machine.successRate < 90);
  if (poorMachines.length > 0) {
    recommendations.push(
      `${poorMachines.length} machines have poor download performance - check network connectivity`
    );
  }
  
  // Popular models not cached
  const popularModels = modelStats.filter(stat => stat.totalAttempts > 10);
  if (popularModels.length > 0) {
    recommendations.push(
      `${popularModels.length} popular models should be pre-cached across all machines`
    );
  }

  return (
    <div className="space-y-2">
      {recommendations.length > 0 ? (
        recommendations.map((rec, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {rec}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">
          • Download performance is optimal - no immediate action needed
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatFileSize(mb: number): string {
  if (mb < 1024) return `${Math.round(mb)}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
}