import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Zap, Clock, Cpu, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { Job, Machine } from "@/types";

interface PoolCandidate {
  poolType: 'fast-lane' | 'standard' | 'heavy';
  jobIds: string[];
  jobTypes: string[];
  avgDuration: number;
  resourceRequirements: {
    cpu: 'low' | 'medium' | 'high';
    memory: 'low' | 'medium' | 'high';
    storage: 'low' | 'medium' | 'high';
  };
  estimatedThroughput: number;
  currentBottlenecks: string[];
}

interface PoolCandidateAnalysisProps {
  jobs: Job[];
  machines: Machine[];
}

export function PoolCandidateAnalysis({ jobs, machines }: PoolCandidateAnalysisProps) {
  const [selectedPool, setSelectedPool] = useState<'fast-lane' | 'standard' | 'heavy' | null>(null);
  
  const candidates = analyzePoolCandidates(jobs);
  const poolConfig = getPoolConfiguration();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Pool Candidate Analysis
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Jobs and machines ready for specialized pool assignment
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pool Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {candidates.map((candidate) => (
            <div 
              key={candidate.poolType}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedPool === candidate.poolType 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'hover:border-gray-300'
              }`}
              onClick={() => setSelectedPool(
                selectedPool === candidate.poolType ? null : candidate.poolType
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {candidate.poolType === 'fast-lane' && <Zap className="h-4 w-4 text-green-600" />}
                  {candidate.poolType === 'standard' && <Clock className="h-4 w-4 text-blue-600" />}
                  {candidate.poolType === 'heavy' && <Cpu className="h-4 w-4 text-orange-600" />}
                  <span className="font-medium capitalize">
                    {candidate.poolType.replace('-', ' ')}
                  </span>
                </div>
                <Badge variant="outline">
                  {candidate.jobIds.length} jobs
                </Badge>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Avg Duration</span>
                  <span className="font-medium">
                    {formatDuration(candidate.avgDuration)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Throughput</span>
                  <span className="font-medium">
                    {candidate.estimatedThroughput}/hour
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Resources</span>
                  <div className="flex gap-1">
                    <ResourceIndicator 
                      level={candidate.resourceRequirements.cpu} 
                      type="CPU" 
                    />
                    <ResourceIndicator 
                      level={candidate.resourceRequirements.memory} 
                      type="RAM" 
                    />
                    <ResourceIndicator 
                      level={candidate.resourceRequirements.storage} 
                      type="Storage" 
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detailed Analysis */}
        {selectedPool && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <DetailedPoolAnalysis 
              candidate={candidates.find(c => c.poolType === selectedPool)!}
              config={poolConfig[selectedPool]}
            />
          </div>
        )}

        {/* Pool Readiness Score */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pool Implementation Readiness
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {candidates.map((candidate) => {
              const readinessScore = calculatePoolReadiness(candidate, machines);
              return (
                <div key={candidate.poolType} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium capitalize">
                      {candidate.poolType.replace('-', ' ')}
                    </span>
                    <Badge variant={readinessScore > 70 ? 'default' : 'secondary'}>
                      {readinessScore}%
                    </Badge>
                  </div>
                  <Progress value={readinessScore} className="w-full" />
                  <div className="text-xs text-muted-foreground">
                    {getReadinessDescription(readinessScore)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Implementation Recommendations */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Implementation Recommendations</h4>
          <div className="space-y-2">
            <ImplementationRecommendations candidates={candidates} machines={machines} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function analyzePoolCandidates(jobs: Job[] /* _machines: Machine[] */): PoolCandidate[] {
  const FAST_LANE_THRESHOLD = 30 * 1000; // 30 seconds
  const HEAVY_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  const fastLaneJobs = completedJobs.filter(job => {
    const duration = job.completed_at! - job.started_at!;
    return duration < FAST_LANE_THRESHOLD;
  });

  const standardJobs = completedJobs.filter(job => {
    const duration = job.completed_at! - job.started_at!;
    return duration >= FAST_LANE_THRESHOLD && duration < HEAVY_THRESHOLD;
  });

  const heavyJobs = completedJobs.filter(job => {
    const duration = job.completed_at! - job.started_at!;
    return duration >= HEAVY_THRESHOLD;
  });

  return [
    {
      poolType: 'fast-lane',
      jobIds: fastLaneJobs.map(j => j.id),
      jobTypes: [...new Set(fastLaneJobs.map(j => j.job_type))],
      avgDuration: fastLaneJobs.length > 0 
        ? fastLaneJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / fastLaneJobs.length
        : 0,
      resourceRequirements: {
        cpu: 'low',
        memory: 'low',
        storage: 'low'
      },
      estimatedThroughput: calculateThroughput(fastLaneJobs),
      currentBottlenecks: identifyBottlenecks(fastLaneJobs, 'fast-lane')
    },
    {
      poolType: 'standard',
      jobIds: standardJobs.map(j => j.id),
      jobTypes: [...new Set(standardJobs.map(j => j.job_type))],
      avgDuration: standardJobs.length > 0 
        ? standardJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / standardJobs.length
        : 0,
      resourceRequirements: {
        cpu: 'medium',
        memory: 'medium',
        storage: 'medium'
      },
      estimatedThroughput: calculateThroughput(standardJobs),
      currentBottlenecks: identifyBottlenecks(standardJobs, 'standard')
    },
    {
      poolType: 'heavy',
      jobIds: heavyJobs.map(j => j.id),
      jobTypes: [...new Set(heavyJobs.map(j => j.job_type))],
      avgDuration: heavyJobs.length > 0 
        ? heavyJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / heavyJobs.length
        : 0,
      resourceRequirements: {
        cpu: 'high',
        memory: 'high',
        storage: 'high'
      },
      estimatedThroughput: calculateThroughput(heavyJobs),
      currentBottlenecks: identifyBottlenecks(heavyJobs, 'heavy')
    }
  ];
}

function calculateThroughput(jobs: Job[]): number {
  if (jobs.length === 0) return 0;
  
  const totalDuration = jobs.reduce((sum, job) => 
    sum + (job.completed_at! - job.started_at!), 0
  );
  
  const avgDuration = totalDuration / jobs.length;
  return Math.round(3600000 / avgDuration); // Jobs per hour
}

function identifyBottlenecks(jobs: Job[], _poolType: string): string[] {
  const bottlenecks = [];
  
  if (jobs.length === 0) return ['No jobs to analyze'];
  
  // Analyze wait times
  const waitTimes = jobs
    .filter(job => job.started_at && job.created_at)
    .map(job => job.started_at! - job.created_at);
  
  if (waitTimes.length > 0) {
    const avgWait = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
    if (avgWait > 60000) { // More than 1 minute wait
      bottlenecks.push('High queue wait times');
    }
  }

  // Resource-specific bottlenecks
  if (_poolType === 'fast-lane') {
    bottlenecks.push('Network latency sensitivity');
  } else if (_poolType === 'heavy') {
    bottlenecks.push('GPU memory limitations');
    bottlenecks.push('Model loading overhead');
  }

  return bottlenecks.length > 0 ? bottlenecks : ['No significant bottlenecks'];
}

function calculatePoolReadiness(candidate: PoolCandidate, machines: Machine[]): number {
  let score = 0;
  
  // Job volume score (0-30 points)
  if (candidate.jobIds.length > 50) score += 30;
  else if (candidate.jobIds.length > 20) score += 20;
  else if (candidate.jobIds.length > 5) score += 10;
  
  // Throughput consistency score (0-25 points)
  if (candidate.estimatedThroughput > 50) score += 25;
  else if (candidate.estimatedThroughput > 20) score += 15;
  else if (candidate.estimatedThroughput > 5) score += 5;
  
  // Resource requirements clarity score (0-25 points)
  const { cpu, memory, storage } = candidate.resourceRequirements;
  if (cpu !== 'medium' && memory !== 'medium') score += 15;
  if (storage !== 'medium') score += 10;
  
  // Machine availability score (0-20 points)
  const availableMachines = machines.filter(m => m.status === 'ready').length;
  if (availableMachines > 5) score += 20;
  else if (availableMachines > 2) score += 10;
  
  return Math.min(100, score);
}

function getReadinessDescription(score: number): string {
  if (score >= 80) return 'Ready for immediate implementation';
  if (score >= 60) return 'Good candidate, minor preparation needed';
  if (score >= 40) return 'Moderate readiness, significant preparation required';
  return 'Low readiness, extensive preparation needed';
}

function getPoolConfiguration() {
  return {
    'fast-lane': {
      targetDuration: '< 30 seconds',
      machineSpec: 'CPU-optimized, 20-40GB storage',
      features: ['Low latency', 'High throughput', 'Minimal model loading']
    },
    'standard': {
      targetDuration: '30 seconds - 3 minutes',
      machineSpec: 'Balanced GPU, 80-120GB storage',
      features: ['Standard ComfyUI workflows', 'Model caching', 'General purpose']
    },
    'heavy': {
      targetDuration: '> 3 minutes',
      machineSpec: 'High-end GPU, 150-300GB storage',
      features: ['Video processing', 'Complex workflows', 'Large model support']
    }
  };
}

function ResourceIndicator({ level, type }: { level: 'low' | 'medium' | 'high'; type: string }) {
  const colors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500',
    high: 'bg-red-500'
  };
  
  return (
    <div 
      className={`w-2 h-2 rounded-full ${colors[level]}`}
      title={`${type}: ${level}`}
    />
  );
}

function DetailedPoolAnalysis({ candidate, config }: { 
  candidate: PoolCandidate; 
  config: { targetDuration: string; machineSpec: string; features: string[] }
}) {
  return (
    <div className="space-y-4">
      <h5 className="font-semibold capitalize">
        {candidate.poolType.replace('-', ' ')} Pool Analysis
      </h5>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2">Current Jobs</h6>
          <div className="space-y-1">
            <div className="text-sm">Total Jobs: {candidate.jobIds.length}</div>
            <div className="text-sm">Job Types: {candidate.jobTypes.join(', ')}</div>
            <div className="text-sm">Avg Duration: {formatDuration(candidate.avgDuration)}</div>
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Target Configuration</h6>
          <div className="space-y-1">
            <div className="text-sm">Duration: {config.targetDuration}</div>
            <div className="text-sm">Machine Spec: {config.machineSpec}</div>
            <div className="text-sm">Features: {config.features.join(', ')}</div>
          </div>
        </div>
      </div>
      
      <div>
        <h6 className="font-medium mb-2">Current Bottlenecks</h6>
        <div className="space-y-1">
          {candidate.currentBottlenecks.map((bottleneck, index) => (
            <div key={index} className="text-sm text-muted-foreground">
              • {bottleneck}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ImplementationRecommendations({ candidates, machines }: { 
  candidates: PoolCandidate[]; 
  machines: Machine[] 
}) {
  const recommendations = [];
  
  const fastLane = candidates.find(c => c.poolType === 'fast-lane');
  const heavy = candidates.find(c => c.poolType === 'heavy');
  
  if (fastLane && fastLane.jobIds.length > 20) {
    recommendations.push(
      "Fast Lane pool shows high potential - consider implementing first for immediate impact"
    );
  }
  
  if (heavy && heavy.jobIds.length > 10) {
    recommendations.push(
      "Heavy pool would reduce contention - implement to improve overall system performance"
    );
  }
  
  if (machines.length > 10) {
    recommendations.push(
      "Sufficient machines available - can implement pool separation without new hardware"
    );
  }
  
  const totalJobs = candidates.reduce((sum, c) => sum + c.jobIds.length, 0);
  if (totalJobs > 100) {
    recommendations.push(
      "High job volume supports pool specialization - ROI would be significant"
    );
  }
  
  return recommendations.length > 0 ? (
    <div className="space-y-1">
      {recommendations.map((rec, index) => (
        <div key={index} className="text-sm text-muted-foreground">
          • {rec}
        </div>
      ))}
    </div>
  ) : (
    <div className="text-sm text-muted-foreground">
      • Current job volume may not justify pool separation yet
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}