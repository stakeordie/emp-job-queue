import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, TrendingUp, Activity } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface PerformanceMetrics {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  variance: number;
  standardDeviation: number;
  coefficientOfVariation: number;
  contentionScore: number;
  outlierJobs: Job[];
  performanceByMachine: MachinePerformance[];
}

interface MachinePerformance {
  machineId: string;
  avgDuration: number;
  jobCount: number;
  performanceScore: number;
  contentionLevel: 'low' | 'medium' | 'high';
  bottlenecks: string[];
}

interface ContentionPeriod {
  startTime: number;
  endTime: number;
  affectedJobs: number;
  avgSlowdown: number;
  cause: string;
}

interface PerformanceHeterogeneityProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function PerformanceHeterogeneity({ jobs, machines, workers }: PerformanceHeterogeneityProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h'>('6h');
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  
  const metrics = analyzePerformanceHeterogeneity(jobs, machines, workers, selectedTimeRange);
  const contentionPeriods = identifyContentionPeriods(jobs, selectedTimeRange);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Performance Heterogeneity Analysis
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Identify performance variance and contention patterns across the system
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Time Range Selector */}
        <div className="flex gap-2">
          {(['1h', '6h', '24h'] as const).map((range) => (
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

        {/* Overall Performance Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {formatDuration(metrics.avgDuration)}
            </div>
            <div className="text-sm text-muted-foreground">Avg Duration</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {formatDuration(metrics.minDuration)}
            </div>
            <div className="text-sm text-muted-foreground">Best Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {formatDuration(metrics.maxDuration)}
            </div>
            <div className="text-sm text-muted-foreground">Worst Time</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.contentionScore}%
            </div>
            <div className="text-sm text-muted-foreground">Contention</div>
          </div>
        </div>

        {/* Contention Score Visualization */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">System Contention Level</h4>
            <Badge variant={
              metrics.contentionScore > 70 ? 'destructive' : 
              metrics.contentionScore > 40 ? 'secondary' : 'default'
            }>
              {metrics.contentionScore > 70 ? 'High' : 
               metrics.contentionScore > 40 ? 'Medium' : 'Low'}
            </Badge>
          </div>
          <Progress value={metrics.contentionScore} className="w-full" />
          <div className="text-sm text-muted-foreground">
            <ContentionDescription score={metrics.contentionScore} />
          </div>
        </div>

        {/* Performance Variance Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="font-semibold">Variance Analysis</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Standard Deviation</span>
                <span className="font-medium">
                  {formatDuration(metrics.standardDeviation)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Coefficient of Variation</span>
                <span className="font-medium">
                  {(metrics.coefficientOfVariation * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Performance Range</span>
                <span className="font-medium">
                  {((metrics.maxDuration / metrics.minDuration) || 1).toFixed(1)}x
                </span>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold">Outlier Jobs</h4>
            <div className="space-y-2">
              {metrics.outlierJobs.slice(0, 3).map((job) => (
                <div key={job.id} className="text-sm border rounded p-2">
                  <div className="font-medium">{job.id}</div>
                  <div className="text-muted-foreground">
                    {job.job_type} - {formatDuration(
                      (job.completed_at || 0) - (job.started_at || 0)
                    )}
                  </div>
                </div>
              ))}
              {metrics.outlierJobs.length > 3 && (
                <div className="text-sm text-muted-foreground">
                  +{metrics.outlierJobs.length - 3} more outliers
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Machine Performance Comparison */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Machine Performance Comparison
          </h4>
          <div className="space-y-3">
            {metrics.performanceByMachine.map((machine) => (
              <div 
                key={machine.machineId}
                className={`border rounded p-3 cursor-pointer transition-colors ${
                  selectedMachine === machine.machineId 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:border-gray-300'
                }`}
                onClick={() => setSelectedMachine(
                  selectedMachine === machine.machineId ? null : machine.machineId
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{machine.machineId}</span>
                    <Badge variant={
                      machine.contentionLevel === 'high' ? 'destructive' :
                      machine.contentionLevel === 'medium' ? 'secondary' : 'default'
                    }>
                      {machine.contentionLevel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span>{machine.jobCount} jobs</span>
                    <span className="font-medium">
                      {formatDuration(machine.avgDuration)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Performance Score:</span>
                  <Progress value={machine.performanceScore} className="flex-1" />
                  <span className="text-sm font-medium">{machine.performanceScore}%</span>
                </div>
                
                {selectedMachine === machine.machineId && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="space-y-2">
                      <div className="font-medium">Identified Bottlenecks:</div>
                      {machine.bottlenecks.map((bottleneck, index) => (
                        <div key={index} className="text-sm text-muted-foreground">
                          • {bottleneck}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contention Periods */}
        {contentionPeriods.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Recent Contention Periods
            </h4>
            <div className="space-y-3">
              {contentionPeriods.slice(0, 5).map((period, index) => (
                <div key={index} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">
                      {new Date(period.startTime).toLocaleTimeString()} - 
                      {new Date(period.endTime).toLocaleTimeString()}
                    </div>
                    <Badge variant="destructive">
                      {period.affectedJobs} jobs affected
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Average slowdown: {period.avgSlowdown.toFixed(1)}x | 
                    Cause: {period.cause}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pool Separation Impact */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Pool Separation Impact Prediction</h4>
          <PoolSeparationImpact metrics={metrics} />
        </div>
      </CardContent>
    </Card>
  );
}

function analyzePerformanceHeterogeneity(
  jobs: Job[], 
  machines: Machine[], 
  workers: Worker[], 
  timeRange: '1h' | '6h' | '24h'
): PerformanceMetrics {
  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange];
  const recentJobs = jobs.filter(job => 
    job.status === 'completed' && 
    job.started_at && 
    job.completed_at && 
    job.started_at > cutoffTime
  );

  const durations = recentJobs.map(job => job.completed_at! - job.started_at!);
  
  if (durations.length === 0) {
    return {
      avgDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      variance: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      contentionScore: 0,
      outlierJobs: [],
      performanceByMachine: []
    };
  }

  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = avgDuration > 0 ? standardDeviation / avgDuration : 0;
  
  const contentionScore = Math.min(100, Math.round(coefficientOfVariation * 100));

  // Identify outliers (jobs > 2 standard deviations from mean)
  const outlierThreshold = avgDuration + (2 * standardDeviation);
  const outlierJobs = recentJobs.filter(job => 
    (job.completed_at! - job.started_at!) > outlierThreshold
  );

  // Analyze performance by machine
  const performanceByMachine = machines.map(machine => {
    const machineJobs = recentJobs.filter(job => 
      workers.some(worker => 
        worker.worker_id === job.worker_id && 
        machine.workers.includes(worker.worker_id)
      )
    );

    if (machineJobs.length === 0) {
      return {
        machineId: machine.machine_id,
        avgDuration: 0,
        jobCount: 0,
        performanceScore: 0,
        contentionLevel: 'low' as const,
        bottlenecks: ['No recent jobs']
      };
    }

    const machineDurations = machineJobs.map(job => job.completed_at! - job.started_at!);
    const machineAvgDuration = machineDurations.reduce((a, b) => a + b, 0) / machineDurations.length;
    
    // Performance score: inverse of duration relative to system average
    const performanceScore = avgDuration > 0 
      ? Math.max(0, Math.min(100, Math.round(100 * (avgDuration / machineAvgDuration))))
      : 50;

    const machineVariance = machineDurations.reduce((sum, d) => sum + Math.pow(d - machineAvgDuration, 2), 0) / machineDurations.length;
    const machineCV = machineAvgDuration > 0 ? Math.sqrt(machineVariance) / machineAvgDuration : 0;
    
    const contentionLevel: 'low' | 'medium' | 'high' = machineCV > 0.5 ? 'high' : machineCV > 0.2 ? 'medium' : 'low';

    return {
      machineId: machine.machine_id,
      avgDuration: machineAvgDuration,
      jobCount: machineJobs.length,
      performanceScore,
      contentionLevel,
      bottlenecks: identifyMachineBottlenecks(machine, machineJobs, workers)
    };
  }).filter(m => m.jobCount > 0);

  return {
    avgDuration,
    minDuration,
    maxDuration,
    variance,
    standardDeviation,
    coefficientOfVariation,
    contentionScore,
    outlierJobs,
    performanceByMachine
  };
}

function identifyMachineBottlenecks(machine: Machine, jobs: Job[], workers: Worker[]): string[] {
  const bottlenecks = [];
  
  // Check worker health
  const machineWorkers = workers.filter(w => machine.workers.includes(w.worker_id));
  const errorWorkers = machineWorkers.filter(w => w.status === 'error');
  if (errorWorkers.length > 0) {
    bottlenecks.push(`${errorWorkers.length} workers in error state`);
  }

  // Check job failure rate
  const failedJobs = jobs.filter(j => j.status === 'failed').length;
  const failureRate = jobs.length > 0 ? (failedJobs / jobs.length) * 100 : 0;
  if (failureRate > 10) {
    bottlenecks.push(`High failure rate: ${failureRate.toFixed(1)}%`);
  }

  // Check queue wait times
  const waitTimes = jobs
    .filter(job => job.started_at && job.created_at)
    .map(job => job.started_at! - job.created_at);
  if (waitTimes.length > 0) {
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    if (avgWait > 60000) {
      bottlenecks.push(`High queue wait: ${formatDuration(avgWait)}`);
    }
  }

  // Check machine status
  if (machine.status !== 'ready') {
    bottlenecks.push(`Machine status: ${machine.status}`);
  }

  return bottlenecks.length > 0 ? bottlenecks : ['No significant bottlenecks detected'];
}

function identifyContentionPeriods(jobs: Job[], timeRange: '1h' | '6h' | '24h'): ContentionPeriod[] {
  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange];
  const recentJobs = jobs.filter(job => 
    job.status === 'completed' && 
    job.started_at && 
    job.completed_at && 
    job.started_at > cutoffTime
  );

  // Group jobs by 10-minute windows
  const windowSize = 10 * 60 * 1000; // 10 minutes
  const windows = new Map<number, Job[]>();
  
  recentJobs.forEach(job => {
    const windowStart = Math.floor(job.started_at! / windowSize) * windowSize;
    if (!windows.has(windowStart)) {
      windows.set(windowStart, []);
    }
    windows.get(windowStart)!.push(job);
  });

  const periods: ContentionPeriod[] = [];
  
  windows.forEach((windowJobs, windowStart) => {
    if (windowJobs.length < 5) return; // Skip windows with few jobs
    
    const durations = windowJobs.map(job => job.completed_at! - job.started_at!);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    
    // Compare with overall average
    const overallAvg = recentJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / recentJobs.length;
    const slowdown = avgDuration / overallAvg;
    
    if (slowdown > 1.5) { // 50% slower than average
      periods.push({
        startTime: windowStart,
        endTime: windowStart + windowSize,
        affectedJobs: windowJobs.length,
        avgSlowdown: slowdown,
        cause: determineCause(windowJobs, slowdown)
      });
    }
  });

  return periods.sort((a, b) => b.startTime - a.startTime);
}

function determineCause(jobs: Job[], slowdown: number): string {
  if (slowdown > 3) return 'Severe resource contention';
  if (jobs.length > 20) return 'High concurrent job load';
  if (jobs.some(j => j.job_type.includes('video'))) return 'Heavy video processing jobs';
  return 'Resource contention';
}

function ContentionDescription({ score }: { score: number }) {
  if (score < 20) {
    return "Low contention - jobs complete with consistent timing";
  } else if (score < 50) {
    return "Moderate contention - some performance variance observed";
  } else if (score < 80) {
    return "High contention - significant performance inconsistency";
  } else {
    return "Critical contention - pool separation highly recommended";
  }
}

function PoolSeparationImpact({ metrics }: { metrics: PerformanceMetrics }) {
  const currentContentionScore = metrics.contentionScore;
  const predictedImprovement = Math.min(80, currentContentionScore * 0.7); // 70% improvement
  
  const benefits = [];
  
  if (currentContentionScore > 60) {
    benefits.push(`Contention reduction: ${currentContentionScore}% → ${Math.round(currentContentionScore - predictedImprovement)}%`);
  }
  
  if (metrics.coefficientOfVariation > 0.3) {
    benefits.push(`Performance consistency improvement: ${(predictedImprovement).toFixed(0)}% more predictable`);
  }
  
  if (metrics.outlierJobs.length > 5) {
    benefits.push(`Outlier job reduction: ${metrics.outlierJobs.length} → ${Math.max(1, Math.round(metrics.outlierJobs.length * 0.3))} extreme cases`);
  }
  
  return (
    <div className="space-y-2">
      {benefits.length > 0 ? (
        benefits.map((benefit, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {benefit}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">
          • Current performance is relatively consistent - pool separation may provide minimal benefit
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