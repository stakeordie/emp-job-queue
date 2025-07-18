import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Users, Cpu, Clock, Zap, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface MachinePoolClassification {
  machineId: string;
  currentPerformance: {
    totalJobs: number;
    avgDuration: number;
    successRate: number;
    resourceUtilization: number;
  };
  poolScores: {
    fastLane: number;
    standard: number;
    heavy: number;
  };
  recommendedPool: 'fast-lane' | 'standard' | 'heavy' | 'mixed';
  confidence: number;
  strengths: string[];
  limitations: string[];
  hardwareProfile: {
    cpuScore: number;
    memoryScore: number;
    storageScore: number;
    networkScore: number;
  };
  workloadProfile: {
    fastJobs: number;
    standardJobs: number;
    heavyJobs: number;
    peakConcurrency: number;
  };
  futureCapacity: {
    estimatedThroughput: number;
    optimalPoolSize: number;
    scalingPotential: 'low' | 'medium' | 'high';
  };
}

interface PoolDistribution {
  poolType: 'fast-lane' | 'standard' | 'heavy';
  machines: string[];
  totalCapacity: number;
  expectedThroughput: number;
  resourceEfficiency: number;
  balanceScore: number;
}

interface MachinePoolPotentialProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function MachinePoolPotential({ jobs, machines, workers }: MachinePoolPotentialProps) {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'classification' | 'distribution' | 'optimization'>('classification');
  const [showRecommendations, setShowRecommendations] = useState(false);
  
  const classifications = analyzeMachinePoolPotential(jobs, machines, workers);
  const poolDistribution = calculateOptimalDistribution(classifications);
  const optimizationOpportunities = identifyOptimizationOpportunities(classifications);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Machine Pool Potential
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Analysis of machine characteristics for optimal pool assignment
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* View Mode Selector */}
        <div className="flex gap-2">
          {(['classification', 'distribution', 'optimization'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-3 py-1 text-sm rounded capitalize ${
                viewMode === mode
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Pool Distribution Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {poolDistribution.map((pool) => (
            <div key={pool.poolType} className="border rounded p-3">
              <div className="flex items-center gap-2 mb-2">
                {pool.poolType === 'fast-lane' && <Zap className="h-4 w-4 text-green-600" />}
                {pool.poolType === 'standard' && <Clock className="h-4 w-4 text-blue-600" />}
                {pool.poolType === 'heavy' && <Cpu className="h-4 w-4 text-orange-600" />}
                <span className="font-medium capitalize">
                  {pool.poolType.replace('-', ' ')} Pool
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Machines:</span>
                  <span className="font-medium">{pool.machines.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Capacity:</span>
                  <span className="font-medium">{pool.totalCapacity}</span>
                </div>
                <div className="flex justify-between">
                  <span>Efficiency:</span>
                  <span className="font-medium">{pool.resourceEfficiency}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Balance:</span>
                  <div className="flex items-center gap-1">
                    <Progress value={pool.balanceScore} className="w-12" />
                    <span className="font-medium">{pool.balanceScore}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Content based on view mode */}
        {viewMode === 'classification' && (
          <MachineClassificationView 
            classifications={classifications}
            selectedMachine={selectedMachine}
            onSelectMachine={setSelectedMachine}
          />
        )}

        {viewMode === 'distribution' && (
          <PoolDistributionView 
            poolDistribution={poolDistribution}
            classifications={classifications}
          />
        )}

        {viewMode === 'optimization' && (
          <OptimizationView 
            opportunities={optimizationOpportunities}
          />
        )}

        {/* Strategic Recommendations */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Strategic Recommendations
            </h4>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRecommendations(!showRecommendations)}
            >
              {showRecommendations ? 'Hide' : 'Show'} Details
            </Button>
          </div>
          
          <PoolRecommendations 
            classifications={classifications}
            poolDistribution={poolDistribution}
            showDetails={showRecommendations}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function analyzeMachinePoolPotential(jobs: Job[], machines: Machine[], workers: Worker[]): MachinePoolClassification[] {
  const FAST_LANE_THRESHOLD = 30 * 1000; // 30 seconds
  const HEAVY_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  return machines.map(machine => {
    // Get workers for this machine
    const machineWorkers = workers.filter(w => machine.workers.includes(w.worker_id));
    
    // Get jobs for this machine
    const machineJobs = jobs.filter(job => 
      machineWorkers.some(w => w.worker_id === job.worker_id)
    );

    const completedJobs = machineJobs.filter(job => 
      job.status === 'completed' && job.started_at && job.completed_at
    );

    // Analyze job patterns
    const fastJobs = completedJobs.filter(job => 
      (job.completed_at! - job.started_at!) < FAST_LANE_THRESHOLD
    );
    const standardJobs = completedJobs.filter(job => {
      const duration = job.completed_at! - job.started_at!;
      return duration >= FAST_LANE_THRESHOLD && duration < HEAVY_THRESHOLD;
    });
    const heavyJobs = completedJobs.filter(job => 
      (job.completed_at! - job.started_at!) >= HEAVY_THRESHOLD
    );

    // Calculate performance metrics
    const totalJobs = completedJobs.length;
    const avgDuration = totalJobs > 0 
      ? completedJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / totalJobs
      : 0;
    const successRate = machineJobs.length > 0 
      ? (completedJobs.length / machineJobs.length) * 100 
      : 100;

    // Calculate pool scores
    const fastLaneScore = calculatePoolScore({
      jobCount: fastJobs.length,
      totalJobs,
      avgPerformance: fastJobs.length > 0 
        ? fastJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / fastJobs.length
        : avgDuration,
      targetProfile: 'fast-lane'
    });

    const standardScore = calculatePoolScore({
      jobCount: standardJobs.length,
      totalJobs,
      avgPerformance: standardJobs.length > 0 
        ? standardJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / standardJobs.length
        : avgDuration,
      targetProfile: 'standard'
    });

    const heavyScore = calculatePoolScore({
      jobCount: heavyJobs.length,
      totalJobs,
      avgPerformance: heavyJobs.length > 0 
        ? heavyJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / heavyJobs.length
        : avgDuration,
      targetProfile: 'heavy'
    });

    // Determine recommended pool
    let recommendedPool: 'fast-lane' | 'standard' | 'heavy';
    if (fastLaneScore >= standardScore && fastLaneScore >= heavyScore) {
      recommendedPool = 'fast-lane';
    } else if (standardScore >= heavyScore) {
      recommendedPool = 'standard';
    } else {
      recommendedPool = 'heavy';
    }

    const maxScore = Math.max(fastLaneScore, standardScore, heavyScore);
    const confidence = maxScore;

    // Mock hardware profile (in real implementation, this would come from machine specs)
    const hardwareProfile = {
      cpuScore: 70 + Math.random() * 30,
      memoryScore: 60 + Math.random() * 40,
      storageScore: 50 + Math.random() * 50,
      networkScore: 80 + Math.random() * 20
    };

    return {
      machineId: machine.machine_id,
      currentPerformance: {
        totalJobs,
        avgDuration,
        successRate,
        resourceUtilization: machineWorkers.filter(w => w.status === 'busy').length / (machineWorkers.length || 1) * 100
      },
      poolScores: {
        fastLane: fastLaneScore,
        standard: standardScore,
        heavy: heavyScore
      },
      recommendedPool: maxScore > 60 ? recommendedPool : 'mixed',
      confidence,
      strengths: generateStrengths(recommendedPool, hardwareProfile, { fastJobs: fastJobs.length, standardJobs: standardJobs.length, heavyJobs: heavyJobs.length }),
      limitations: generateLimitations(recommendedPool, hardwareProfile, successRate),
      hardwareProfile,
      workloadProfile: {
        fastJobs: fastJobs.length,
        standardJobs: standardJobs.length,
        heavyJobs: heavyJobs.length,
        peakConcurrency: Math.max(machineWorkers.length, 1)
      },
      futureCapacity: {
        estimatedThroughput: Math.round(3600000 / (avgDuration || 60000)) * machineWorkers.length,
        optimalPoolSize: Math.max(1, Math.round(machineWorkers.length * 1.2)),
        scalingPotential: hardwareProfile.cpuScore > 80 ? 'high' : hardwareProfile.cpuScore > 60 ? 'medium' : 'low'
      }
    };
  });
}

function calculatePoolScore({ jobCount, totalJobs, avgPerformance, targetProfile }: {
  jobCount: number;
  totalJobs: number;
  avgPerformance: number;
  targetProfile: string;
}): number {
  if (totalJobs === 0) return 50;
  
  const volumeScore = Math.min(100, (jobCount / totalJobs) * 200); // Job type prevalence
  
  let performanceScore = 50;
  if (targetProfile === 'fast-lane') {
    performanceScore = avgPerformance < 30000 ? 100 : Math.max(0, 100 - (avgPerformance / 1000));
  } else if (targetProfile === 'heavy') {
    performanceScore = avgPerformance > 180000 ? 100 : Math.min(100, avgPerformance / 2000);
  } else {
    performanceScore = avgPerformance > 30000 && avgPerformance < 180000 ? 100 : 70;
  }
  
  return Math.round((volumeScore * 0.6) + (performanceScore * 0.4));
}

function generateStrengths(recommendedPool: string, hardware: { cpuScore: number; memoryScore: number; networkScore: number; storageScore: number }, workload: { fastJobs: number; standardJobs: number; heavyJobs: number }): string[] {
  const strengths = [];
  
  if (hardware.cpuScore > 80) strengths.push('High CPU performance');
  if (hardware.memoryScore > 80) strengths.push('Excellent memory capacity');
  if (hardware.networkScore > 80) strengths.push('Fast network connectivity');
  if (hardware.storageScore > 80) strengths.push('High storage capacity');
  
  if (recommendedPool === 'fast-lane' && workload.fastJobs > 10) {
    strengths.push('Optimized for low-latency tasks');
  }
  if (recommendedPool === 'heavy' && workload.heavyJobs > 5) {
    strengths.push('Handles resource-intensive workloads well');
  }
  
  return strengths.length > 0 ? strengths : ['Stable performance', 'Reliable operation'];
}

function generateLimitations(_recommendedPool: string, hardware: { cpuScore: number; memoryScore: number; networkScore: number; storageScore: number }, successRate: number): string[] {
  const limitations = [];
  
  if (hardware.cpuScore < 60) limitations.push('Limited CPU performance');
  if (hardware.memoryScore < 60) limitations.push('Memory constraints');
  if (hardware.storageScore < 60) limitations.push('Storage limitations');
  if (hardware.networkScore < 60) limitations.push('Network performance issues');
  if (successRate < 90) limitations.push('Reliability concerns');
  
  return limitations.length > 0 ? limitations : ['No significant limitations'];
}

function calculateOptimalDistribution(classifications: MachinePoolClassification[]): PoolDistribution[] {
  const poolGroups = {
    'fast-lane': classifications.filter(m => m.recommendedPool === 'fast-lane'),
    'standard': classifications.filter(m => m.recommendedPool === 'standard'),
    'heavy': classifications.filter(m => m.recommendedPool === 'heavy')
  };

  return (['fast-lane', 'standard', 'heavy'] as const).map(poolType => {
    const machines = poolGroups[poolType];
    const totalCapacity = machines.reduce((sum, m) => sum + m.futureCapacity.estimatedThroughput, 0);
    const avgEfficiency = machines.length > 0 
      ? machines.reduce((sum, m) => sum + m.currentPerformance.resourceUtilization, 0) / machines.length
      : 0;
    
    // Balance score based on machine distribution
    const idealCount = Math.ceil(classifications.length / 3);
    const balanceScore = Math.max(0, 100 - Math.abs(machines.length - idealCount) * 20);

    return {
      poolType,
      machines: machines.map(m => m.machineId),
      totalCapacity,
      expectedThroughput: Math.round(totalCapacity * 0.8), // 80% efficiency factor
      resourceEfficiency: Math.round(avgEfficiency),
      balanceScore: Math.round(balanceScore)
    };
  });
}

function identifyOptimizationOpportunities(classifications: MachinePoolClassification[]) {
  return {
    reallocation: classifications.filter(m => m.confidence < 70),
    underutilized: classifications.filter(m => m.currentPerformance.resourceUtilization < 30),
    highPotential: classifications.filter(m => m.futureCapacity.scalingPotential === 'high'),
    mixedMachines: classifications.filter(m => m.recommendedPool === 'mixed'),
    total: classifications.length
  };
}

function MachineClassificationView({ classifications, selectedMachine, onSelectMachine }: {
  classifications: MachinePoolClassification[];
  selectedMachine: string | null;
  onSelectMachine: (machineId: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Machine Classifications</h4>
      <div className="space-y-3">
        {classifications.map((machine) => (
          <div 
            key={machine.machineId}
            className={`border rounded p-4 cursor-pointer transition-colors ${
              selectedMachine === machine.machineId 
                ? 'border-blue-500 bg-blue-50' 
                : 'hover:border-gray-300'
            }`}
            onClick={() => onSelectMachine(
              selectedMachine === machine.machineId ? null : machine.machineId
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{machine.machineId}</span>
                <Badge variant={
                  machine.recommendedPool === 'fast-lane' ? 'default' :
                  machine.recommendedPool === 'heavy' ? 'destructive' :
                  machine.recommendedPool === 'standard' ? 'secondary' : 'outline'
                }>
                  {machine.recommendedPool.replace('-', ' ')}
                </Badge>
                <Badge variant="outline">
                  {machine.confidence}% confidence
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {machine.currentPerformance.totalJobs} jobs
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="flex justify-between mb-1">
                  <span>Fast Lane:</span>
                  <span className="font-medium">{machine.poolScores.fastLane}%</span>
                </div>
                <Progress value={machine.poolScores.fastLane} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Standard:</span>
                  <span className="font-medium">{machine.poolScores.standard}%</span>
                </div>
                <Progress value={machine.poolScores.standard} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span>Heavy:</span>
                  <span className="font-medium">{machine.poolScores.heavy}%</span>
                </div>
                <Progress value={machine.poolScores.heavy} className="w-full" />
              </div>
            </div>
            
            {selectedMachine === machine.machineId && (
              <div className="mt-4 pt-4 border-t">
                <DetailedMachineAnalysis machine={machine} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PoolDistributionView({ poolDistribution, classifications }: {
  poolDistribution: PoolDistribution[];
  classifications: MachinePoolClassification[];
}) {
  return (
    <div className="space-y-6">
      <h4 className="font-semibold">Optimal Pool Distribution</h4>
      
      {poolDistribution.map((pool) => (
        <div key={pool.poolType} className="border rounded p-4">
          <div className="flex items-center justify-between mb-4">
            <h5 className="font-medium capitalize flex items-center gap-2">
              {pool.poolType === 'fast-lane' && <Zap className="h-4 w-4 text-green-600" />}
              {pool.poolType === 'standard' && <Clock className="h-4 w-4 text-blue-600" />}
              {pool.poolType === 'heavy' && <Cpu className="h-4 w-4 text-orange-600" />}
              {pool.poolType.replace('-', ' ')} Pool
            </h5>
            <Badge variant="outline">
              {pool.machines.length} machines
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-lg font-bold">{pool.totalCapacity}</div>
              <div className="text-sm text-muted-foreground">Total Capacity</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{pool.expectedThroughput}</div>
              <div className="text-sm text-muted-foreground">Expected Throughput</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{pool.resourceEfficiency}%</div>
              <div className="text-sm text-muted-foreground">Resource Efficiency</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold">{pool.balanceScore}%</div>
              <div className="text-sm text-muted-foreground">Balance Score</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="font-medium text-sm">Assigned Machines:</div>
            <div className="flex flex-wrap gap-2">
              {pool.machines.map((machineId) => {
                const machine = classifications.find(m => m.machineId === machineId);
                return (
                  <Badge 
                    key={machineId} 
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    {machineId}
                    {machine && (
                      <span className="text-xs">({machine.confidence}%)</span>
                    )}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OptimizationView({ opportunities }: {
  opportunities: {
    reallocation: MachinePoolClassification[];
    underutilized: MachinePoolClassification[];
    highPotential: MachinePoolClassification[];
    mixedMachines: MachinePoolClassification[];
    total: number;
  };
}) {
  return (
    <div className="space-y-6">
      <h4 className="font-semibold">Optimization Opportunities</h4>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="border rounded p-4">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              Low Confidence Classifications
            </h5>
            <div className="text-sm text-muted-foreground mb-2">
              {opportunities.reallocation.length} machines need review
            </div>
            <div className="space-y-1">
              {opportunities.reallocation.slice(0, 3).map((machine) => (
                <div key={machine.machineId} className="text-sm">
                  • {machine.machineId} ({machine.confidence}% confidence)
                </div>
              ))}
            </div>
          </div>
          
          <div className="border rounded p-4">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              High Potential Machines
            </h5>
            <div className="text-sm text-muted-foreground mb-2">
              {opportunities.highPotential.length} machines ready for scaling
            </div>
            <div className="space-y-1">
              {opportunities.highPotential.slice(0, 3).map((machine) => (
                <div key={machine.machineId} className="text-sm">
                  • {machine.machineId} ({machine.futureCapacity.estimatedThroughput} throughput)
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="border rounded p-4">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              Underutilized Resources
            </h5>
            <div className="text-sm text-muted-foreground mb-2">
              {opportunities.underutilized.length} machines below 30% utilization
            </div>
            <div className="space-y-1">
              {opportunities.underutilized.slice(0, 3).map((machine) => (
                <div key={machine.machineId} className="text-sm">
                  • {machine.machineId} ({Math.round(machine.currentPerformance.resourceUtilization)}% used)
                </div>
              ))}
            </div>
          </div>
          
          <div className="border rounded p-4">
            <h5 className="font-medium mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Mixed Assignment Machines
            </h5>
            <div className="text-sm text-muted-foreground mb-2">
              {opportunities.mixedMachines.length} machines with unclear specialization
            </div>
            <div className="space-y-1">
              {opportunities.mixedMachines.slice(0, 3).map((machine) => (
                <div key={machine.machineId} className="text-sm">
                  • {machine.machineId} (mixed workload pattern)
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailedMachineAnalysis({ machine }: { machine: MachinePoolClassification }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2">Performance Profile</h6>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Total Jobs:</span>
              <span className="font-medium">{machine.currentPerformance.totalJobs}</span>
            </div>
            <div className="flex justify-between">
              <span>Avg Duration:</span>
              <span className="font-medium">{Math.round(machine.currentPerformance.avgDuration / 1000)}s</span>
            </div>
            <div className="flex justify-between">
              <span>Success Rate:</span>
              <span className="font-medium">{Math.round(machine.currentPerformance.successRate)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Utilization:</span>
              <span className="font-medium">{Math.round(machine.currentPerformance.resourceUtilization)}%</span>
            </div>
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Hardware Scores</h6>
          <div className="space-y-2">
            {Object.entries(machine.hardwareProfile).map(([component, score]) => (
              <div key={component} className="flex items-center justify-between text-sm">
                <span className="capitalize">{component.replace('Score', '')}:</span>
                <div className="flex items-center gap-2">
                  <Progress value={score} className="w-16" />
                  <span className="w-8 text-right">{Math.round(score)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2 flex items-center gap-1">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Strengths
          </h6>
          <div className="space-y-1">
            {machine.strengths.map((strength, index) => (
              <div key={index} className="text-sm text-green-600">
                • {strength}
              </div>
            ))}
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2 flex items-center gap-1">
            <AlertCircle className="h-4 w-4 text-orange-500" />
            Limitations
          </h6>
          <div className="space-y-1">
            {machine.limitations.map((limitation, index) => (
              <div key={index} className="text-sm text-orange-600">
                • {limitation}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PoolRecommendations({ classifications, poolDistribution, showDetails }: {
  classifications: MachinePoolClassification[];
  poolDistribution: PoolDistribution[];
  showDetails: boolean;
}) {
  const recommendations = [];
  
  // Distribution analysis
  const unbalanced = poolDistribution.some(pool => pool.balanceScore < 70);
  if (unbalanced) {
    recommendations.push("Pool distribution is unbalanced - consider reallocating machines");
  }
  
  // Confidence analysis
  const lowConfidenceMachines = classifications.filter(m => m.confidence < 70).length;
  if (lowConfidenceMachines > 0) {
    recommendations.push(`${lowConfidenceMachines} machines need more data for accurate classification`);
  }
  
  // Utilization analysis
  const underutilized = classifications.filter(m => m.currentPerformance.resourceUtilization < 30).length;
  if (underutilized > 0) {
    recommendations.push(`${underutilized} machines are underutilized - consider consolidation`);
  }
  
  // Pool-specific recommendations
  const fastLanePool = poolDistribution.find(p => p.poolType === 'fast-lane');
  if (fastLanePool && fastLanePool.machines.length < 2) {
    recommendations.push("Fast lane pool needs more machines for redundancy");
  }
  
  return (
    <div className="space-y-2">
      {recommendations.slice(0, showDetails ? recommendations.length : 3).map((rec, index) => (
        <div key={index} className="text-sm text-muted-foreground">
          • {rec}
        </div>
      ))}
      {!showDetails && recommendations.length > 3 && (
        <div className="text-sm text-muted-foreground">
          • And {recommendations.length - 3} more recommendations...
        </div>
      )}
    </div>
  );
}