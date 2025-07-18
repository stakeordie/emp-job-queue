import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Target, CheckCircle, AlertTriangle, Clock, Zap, Cpu } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface PoolReadiness {
  poolType: 'fast-lane' | 'standard' | 'heavy';
  overallScore: number;
  criteriaScores: {
    jobVolume: number;
    performanceConsistency: number;
    resourceAlignment: number;
    machineAvailability: number;
    userDemand: number;
  };
  readinessLevel: 'not-ready' | 'preparation-needed' | 'ready' | 'optimal';
  blockers: string[];
  opportunities: string[];
  estimatedBenefit: {
    throughputIncrease: number;
    latencyReduction: number;
    resourceEfficiency: number;
  };
  implementationEffort: 'low' | 'medium' | 'high';
  timeToImplement: string;
  prerequisites: string[];
}

interface ReadinessFactors {
  hasJobVolumeData: boolean;
  hasPerformanceVariance: boolean;
  hasMachineCapacity: boolean;
  hasModelUsagePatterns: boolean;
  hasBottleneckIdentification: boolean;
}

interface PoolReadinessScoreProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function PoolReadinessScore({ jobs, machines, workers }: PoolReadinessScoreProps) {
  const [selectedPool, setSelectedPool] = useState<'fast-lane' | 'standard' | 'heavy' | null>('fast-lane');
  const [showImplementationPlan, setShowImplementationPlan] = useState(false);
  
  const readinessData = calculatePoolReadiness(jobs, machines, workers);
  const factors = assessReadinessFactors(jobs, machines, workers);
  const overallReadiness = calculateOverallReadiness(readinessData);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Pool Readiness Analysis
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Assessment of system readiness for specialized pool implementation
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Readiness Score */}
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <div className="text-4xl font-bold text-blue-600">
              {overallReadiness.score}%
            </div>
            <div className="text-lg font-semibold">
              Overall Pool Readiness
            </div>
            <Badge variant={
              overallReadiness.level === 'optimal' ? 'default' :
              overallReadiness.level === 'ready' ? 'secondary' :
              overallReadiness.level === 'preparation-needed' ? 'outline' : 'destructive'
            }>
              {overallReadiness.level.replace('-', ' ').toUpperCase()}
            </Badge>
          </div>
          <Progress value={overallReadiness.score} className="w-full" />
          <p className="text-sm text-muted-foreground">
            {getReadinessDescription(overallReadiness.level)}
          </p>
        </div>

        {/* Pool-Specific Readiness */}
        <div className="space-y-4">
          <h4 className="font-semibold">Pool-Specific Readiness</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {readinessData.map((pool) => (
              <div 
                key={pool.poolType}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedPool === pool.poolType 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'hover:border-gray-300'
                }`}
                onClick={() => setSelectedPool(
                  selectedPool === pool.poolType ? null : pool.poolType
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {pool.poolType === 'fast-lane' && <Zap className="h-4 w-4 text-green-600" />}
                    {pool.poolType === 'standard' && <Clock className="h-4 w-4 text-blue-600" />}
                    {pool.poolType === 'heavy' && <Cpu className="h-4 w-4 text-orange-600" />}
                    <span className="font-medium capitalize">
                      {pool.poolType.replace('-', ' ')}
                    </span>
                  </div>
                  <ReadinessLevelBadge level={pool.readinessLevel} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Readiness Score</span>
                    <span className="font-medium">{pool.overallScore}%</span>
                  </div>
                  <Progress value={pool.overallScore} className="w-full" />
                  
                  <div className="text-xs text-muted-foreground">
                    Effort: {pool.implementationEffort} | 
                    Time: {pool.timeToImplement}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detailed Pool Analysis */}
        {selectedPool && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <DetailedPoolReadiness 
              pool={readinessData.find(p => p.poolType === selectedPool)!}
              onShowImplementationPlan={() => setShowImplementationPlan(true)}
            />
          </div>
        )}

        {/* Readiness Factors Assessment */}
        <div className="space-y-4">
          <h4 className="font-semibold">Readiness Factors</h4>
          <ReadinessFactorsGrid factors={factors} />
        </div>

        {/* Strategic Recommendations */}
        <div className="space-y-4">
          <h4 className="font-semibold">Strategic Recommendations</h4>
          <StrategicRecommendations 
            readinessData={readinessData} 
            factors={factors}
            overallReadiness={overallReadiness}
          />
        </div>

        {/* Implementation Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Implementation Timeline</h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImplementationPlan(!showImplementationPlan)}
            >
              {showImplementationPlan ? 'Hide' : 'Show'} Implementation Plan
            </Button>
          </div>
          
          {showImplementationPlan && (
            <ImplementationTimeline readinessData={readinessData} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function calculatePoolReadiness(jobs: Job[], machines: Machine[], workers: Worker[]): PoolReadiness[] {
  const FAST_LANE_THRESHOLD = 30 * 1000; // 30 seconds
  const HEAVY_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  // Analyze job patterns
  const fastLaneJobs = completedJobs.filter(job => 
    (job.completed_at! - job.started_at!) < FAST_LANE_THRESHOLD
  );
  const standardJobs = completedJobs.filter(job => {
    const duration = job.completed_at! - job.started_at!;
    return duration >= FAST_LANE_THRESHOLD && duration < HEAVY_THRESHOLD;
  });
  const heavyJobs = completedJobs.filter(job => 
    (job.completed_at! - job.started_at!) >= HEAVY_THRESHOLD
  );

  const totalJobs = completedJobs.length || 1;
  const onlineWorkers = workers.filter(w => w.status !== 'offline').length;
  const readyMachines = machines.filter(m => m.status === 'ready').length;

  return [
    {
      poolType: 'fast-lane',
      overallScore: calculateIndividualPoolScore({
        jobVolume: (fastLaneJobs.length / totalJobs) * 100,
        machineCount: readyMachines,
        workerCount: onlineWorkers,
        avgDuration: fastLaneJobs.length > 0 
          ? fastLaneJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / fastLaneJobs.length
          : 0
      }),
      criteriaScores: {
        jobVolume: Math.min(100, (fastLaneJobs.length / totalJobs) * 300), // 30%+ is good
        performanceConsistency: calculatePerformanceConsistency(fastLaneJobs),
        resourceAlignment: 85, // Fast lane needs low resources
        machineAvailability: Math.min(100, (readyMachines / 3) * 100), // Need at least 3 machines
        userDemand: Math.min(100, (fastLaneJobs.length / 10) * 100) // 10+ jobs shows demand
      },
      readinessLevel: fastLaneJobs.length > 20 && readyMachines >= 3 ? 'ready' : 
                     fastLaneJobs.length > 10 ? 'preparation-needed' : 'not-ready',
      blockers: fastLaneJobs.length < 10 ? ['Insufficient fast job volume'] : [],
      opportunities: ['Immediate latency improvements', 'User experience enhancement'],
      estimatedBenefit: {
        throughputIncrease: 40,
        latencyReduction: 60,
        resourceEfficiency: 25
      },
      implementationEffort: 'low',
      timeToImplement: '1-2 weeks',
      prerequisites: ['Network optimization', 'Basic routing logic']
    },
    {
      poolType: 'standard',
      overallScore: calculateIndividualPoolScore({
        jobVolume: (standardJobs.length / totalJobs) * 100,
        machineCount: readyMachines,
        workerCount: onlineWorkers,
        avgDuration: standardJobs.length > 0 
          ? standardJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / standardJobs.length
          : 0
      }),
      criteriaScores: {
        jobVolume: Math.min(100, (standardJobs.length / totalJobs) * 200), // 50%+ is good
        performanceConsistency: calculatePerformanceConsistency(standardJobs),
        resourceAlignment: 75, // Standard resources
        machineAvailability: Math.min(100, (readyMachines / 5) * 100), // Need at least 5 machines
        userDemand: Math.min(100, (standardJobs.length / 20) * 100) // 20+ jobs shows demand
      },
      readinessLevel: standardJobs.length > 30 && readyMachines >= 5 ? 'ready' : 
                     standardJobs.length > 15 ? 'preparation-needed' : 'not-ready',
      blockers: readyMachines < 5 ? ['Need more machines for standard pool'] : [],
      opportunities: ['Balanced performance improvements', 'Resource optimization'],
      estimatedBenefit: {
        throughputIncrease: 25,
        latencyReduction: 30,
        resourceEfficiency: 35
      },
      implementationEffort: 'medium',
      timeToImplement: '2-3 weeks',
      prerequisites: ['Load balancing', 'Resource monitoring', 'Advanced routing']
    },
    {
      poolType: 'heavy',
      overallScore: calculateIndividualPoolScore({
        jobVolume: (heavyJobs.length / totalJobs) * 100,
        machineCount: readyMachines,
        workerCount: onlineWorkers,
        avgDuration: heavyJobs.length > 0 
          ? heavyJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / heavyJobs.length
          : 0
      }),
      criteriaScores: {
        jobVolume: Math.min(100, (heavyJobs.length / totalJobs) * 500), // 20%+ is good
        performanceConsistency: calculatePerformanceConsistency(heavyJobs),
        resourceAlignment: 60, // Heavy needs high resources
        machineAvailability: Math.min(100, (readyMachines / 2) * 100), // Need at least 2 high-end machines
        userDemand: Math.min(100, (heavyJobs.length / 5) * 100) // 5+ jobs shows demand
      },
      readinessLevel: heavyJobs.length > 10 && readyMachines >= 2 ? 'ready' : 
                     heavyJobs.length > 5 ? 'preparation-needed' : 'not-ready',
      blockers: heavyJobs.length < 5 ? ['Low heavy job volume'] : 
                readyMachines < 2 ? ['Need high-end machines'] : [],
      opportunities: ['Eliminate resource contention', 'Specialized optimization'],
      estimatedBenefit: {
        throughputIncrease: 20,
        latencyReduction: 15,
        resourceEfficiency: 50
      },
      implementationEffort: 'high',
      timeToImplement: '3-4 weeks',
      prerequisites: ['High-end hardware', 'Storage optimization', 'Model pre-loading']
    }
  ];
}

function calculateIndividualPoolScore({ jobVolume, machineCount, workerCount, avgDuration }: {
  jobVolume: number;
  machineCount: number;
  workerCount: number;
  avgDuration: number;
}): number {
  const volumeScore = Math.min(100, jobVolume * 2);
  const infraScore = Math.min(100, (machineCount + workerCount) * 5);
  const performanceScore = avgDuration > 0 ? Math.min(100, 60000 / avgDuration) : 50;
  
  return Math.round((volumeScore * 0.4) + (infraScore * 0.3) + (performanceScore * 0.3));
}

function calculatePerformanceConsistency(jobs: Job[]): number {
  if (jobs.length < 2) return 50;
  
  const durations = jobs.map(job => job.completed_at! - job.started_at!);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
  const cv = avg > 0 ? Math.sqrt(variance) / avg : 1;
  
  return Math.max(0, Math.min(100, 100 - (cv * 100)));
}

function calculateOverallReadiness(readinessData: PoolReadiness[]): { score: number; level: string } {
  const avgScore = readinessData.reduce((sum, pool) => sum + pool.overallScore, 0) / readinessData.length;
  
  let level = 'not-ready';
  if (avgScore >= 80) level = 'optimal';
  else if (avgScore >= 60) level = 'ready';
  else if (avgScore >= 40) level = 'preparation-needed';
  
  return { score: Math.round(avgScore), level };
}

function assessReadinessFactors(jobs: Job[], machines: Machine[], workers: Worker[]): ReadinessFactors {
  return {
    hasJobVolumeData: jobs.length > 50,
    hasPerformanceVariance: jobs.filter(j => j.started_at && j.completed_at).length > 20,
    hasMachineCapacity: machines.length >= 3,
    hasModelUsagePatterns: jobs.some(j => j.payload), // Mock check
    hasBottleneckIdentification: workers.some(w => w.status === 'error') // Has some failure data
  };
}

function ReadinessLevelBadge({ level }: { level: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
    'optimal': 'default',
    'ready': 'secondary',
    'preparation-needed': 'outline',
    'not-ready': 'destructive'
  };
  
  return <Badge variant={variants[level]}>{level.replace('-', ' ')}</Badge>;
}

function getReadinessDescription(level: string): string {
  switch (level) {
    case 'optimal':
      return 'System is optimally prepared for pool implementation with maximum benefits expected';
    case 'ready':
      return 'System meets requirements for pool implementation - proceed with confidence';
    case 'preparation-needed':
      return 'Additional preparation required before pool implementation';
    case 'not-ready':
      return 'Significant preparation needed - focus on building foundation first';
    default:
      return 'Assessment in progress';
  }
}

function DetailedPoolReadiness({ pool, onShowImplementationPlan }: { 
  pool: PoolReadiness; 
  onShowImplementationPlan: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h5 className="font-semibold capitalize">
          {pool.poolType.replace('-', ' ')} Pool Readiness
        </h5>
        <Button size="sm" onClick={onShowImplementationPlan}>
          View Implementation Plan
        </Button>
      </div>
      
      {/* Criteria Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2">Readiness Criteria</h6>
          <div className="space-y-2">
            {Object.entries(pool.criteriaScores).map(([criterion, score]) => (
              <div key={criterion} className="flex items-center justify-between text-sm">
                <span className="capitalize">{criterion.replace(/([A-Z])/g, ' $1')}</span>
                <div className="flex items-center gap-2">
                  <Progress value={score} className="w-16" />
                  <span className="w-8 text-right">{Math.round(score)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Expected Benefits</h6>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Throughput Increase:</span>
              <span className="font-medium text-green-600">+{pool.estimatedBenefit.throughputIncrease}%</span>
            </div>
            <div className="flex justify-between">
              <span>Latency Reduction:</span>
              <span className="font-medium text-blue-600">-{pool.estimatedBenefit.latencyReduction}%</span>
            </div>
            <div className="flex justify-between">
              <span>Resource Efficiency:</span>
              <span className="font-medium text-purple-600">+{pool.estimatedBenefit.resourceEfficiency}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Blockers and Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Current Blockers
          </h6>
          <div className="space-y-1">
            {pool.blockers.length > 0 ? (
              pool.blockers.map((blocker, index) => (
                <div key={index} className="text-sm text-red-600">
                  • {blocker}
                </div>
              ))
            ) : (
              <div className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                No blockers identified
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2 flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Opportunities
          </h6>
          <div className="space-y-1">
            {pool.opportunities.map((opportunity, index) => (
              <div key={index} className="text-sm text-green-600">
                • {opportunity}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadinessFactorsGrid({ factors }: { factors: ReadinessFactors }) {
  const factorsList = [
    { key: 'hasJobVolumeData', label: 'Job Volume Data', description: 'Sufficient job history for analysis' },
    { key: 'hasPerformanceVariance', label: 'Performance Variance', description: 'Performance timing data available' },
    { key: 'hasMachineCapacity', label: 'Machine Capacity', description: 'Adequate machine resources' },
    { key: 'hasModelUsagePatterns', label: 'Model Usage Patterns', description: 'Model usage tracking active' },
    { key: 'hasBottleneckIdentification', label: 'Bottleneck Identification', description: 'System bottlenecks identified' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {factorsList.map((factor) => {
        const isReady = factors[factor.key as keyof ReadinessFactors];
        return (
          <div key={factor.key} className="border rounded p-3">
            <div className="flex items-center gap-2 mb-1">
              {isReady ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium text-sm">{factor.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{factor.description}</p>
          </div>
        );
      })}
    </div>
  );
}

function StrategicRecommendations({ readinessData, factors, overallReadiness }: {
  readinessData: PoolReadiness[];
  factors: ReadinessFactors;
  overallReadiness: { score: number; level: string };
}) {
  const recommendations = [];
  
  // Overall readiness recommendations
  if (overallReadiness.score < 40) {
    recommendations.push("Focus on data collection and system stabilization before pool implementation");
  } else if (overallReadiness.score < 60) {
    recommendations.push("Begin preparation for pool implementation - address identified blockers");
  } else if (overallReadiness.score < 80) {
    recommendations.push("System ready for phased pool implementation - start with highest-scoring pool");
  } else {
    recommendations.push("Optimal conditions for full pool implementation - proceed with confidence");
  }
  
  // Pool-specific recommendations
  const readyPools = readinessData.filter(pool => pool.readinessLevel === 'ready' || pool.readinessLevel === 'optimal');
  if (readyPools.length > 0) {
    recommendations.push(`Start with ${readyPools.map(p => p.poolType).join(', ')} pool(s) for maximum impact`);
  }
  
  // Factor-based recommendations
  if (!factors.hasJobVolumeData) {
    recommendations.push("Increase job volume to gather more performance data");
  }
  if (!factors.hasMachineCapacity) {
    recommendations.push("Scale machine capacity before implementing pools");
  }
  if (!factors.hasModelUsagePatterns) {
    recommendations.push("Implement model usage tracking for better pool optimization");
  }

  return (
    <div className="space-y-2">
      {recommendations.map((rec, index) => (
        <div key={index} className="text-sm text-muted-foreground">
          • {rec}
        </div>
      ))}
    </div>
  );
}

function ImplementationTimeline({ readinessData }: { readinessData: PoolReadiness[] }) {
  const sortedPools = [...readinessData].sort((a, b) => b.overallScore - a.overallScore);
  
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Recommended implementation order based on readiness scores:
      </div>
      
      {sortedPools.map((pool, index) => (
        <div key={pool.poolType} className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm">
                {index + 1}
              </span>
              <span className="font-medium capitalize">
                {pool.poolType.replace('-', ' ')} Pool
              </span>
              <Badge variant="outline">{pool.timeToImplement}</Badge>
            </div>
            <Badge variant={pool.implementationEffort === 'low' ? 'default' : 
                           pool.implementationEffort === 'medium' ? 'secondary' : 'destructive'}>
              {pool.implementationEffort} effort
            </Badge>
          </div>
          
          <div className="text-sm text-muted-foreground">
            <div className="mb-1">Prerequisites:</div>
            <div className="pl-4">
              {pool.prerequisites.map((prereq, i) => (
                <div key={i}>• {prereq}</div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}