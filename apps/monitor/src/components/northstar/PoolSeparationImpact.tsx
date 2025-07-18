import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Target, Zap, Clock, Cpu, ArrowRight, Calculator } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface PoolImpactScenario {
  scenarioName: string;
  description: string;
  poolConfiguration: {
    fastLane: { machines: number; avgDuration: number; throughput: number; };
    standard: { machines: number; avgDuration: number; throughput: number; };
    heavy: { machines: number; avgDuration: number; throughput: number; };
  };
  impactMetrics: {
    throughputIncrease: number;
    latencyReduction: number;
    resourceEfficiency: number;
    queueWaitReduction: number;
    contentionReduction: number;
  };
  beforeAfterComparison: {
    avgJobDuration: { before: number; after: number; };
    queueSize: { before: number; after: number; };
    machineUtilization: { before: number; after: number; };
    userWaitTime: { before: number; after: number; };
  };
  implementationComplexity: 'low' | 'medium' | 'high';
  estimatedRoi: number;
  riskFactors: string[];
  timeline: string;
}

interface PoolSeparationImpactProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function PoolSeparationImpact({ jobs, machines }: PoolSeparationImpactProps) {
  const [selectedScenario, setSelectedScenario] = useState<string>('conservative');
  const [showDetailedAnalysis, setShowDetailedAnalysis] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<'side-by-side' | 'overlay'>('side-by-side');

  const scenarios = generateImpactScenarios(jobs, machines);
  const selectedScenarioData = scenarios.find(s => s.scenarioName === selectedScenario) || scenarios[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Pool Separation Impact Analysis
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          What-if scenarios showing the impact of implementing specialized machine pools
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scenario Selector */}
        <div className="space-y-3">
          <h4 className="font-semibold">Implementation Scenarios</h4>
          <div className="flex flex-wrap gap-2">
            {scenarios.map((scenario) => (
              <button
                key={scenario.scenarioName}
                onClick={() => setSelectedScenario(scenario.scenarioName)}
                className={`px-4 py-2 text-sm rounded border ${
                  selectedScenario === scenario.scenarioName
                    ? 'bg-blue-500 text-white border-blue-500'
                    : 'bg-white hover:bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-left">
                  <div className="font-medium capitalize">{scenario.scenarioName}</div>
                  <div className="text-xs opacity-75">{scenario.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* High-Level Impact Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center space-y-2">
            <div className="text-2xl font-bold text-green-600">
              +{selectedScenarioData.impactMetrics.throughputIncrease}%
            </div>
            <div className="text-sm text-muted-foreground">Throughput Increase</div>
            <Progress value={selectedScenarioData.impactMetrics.throughputIncrease} className="w-full" />
          </div>
          <div className="text-center space-y-2">
            <div className="text-2xl font-bold text-blue-600">
              -{selectedScenarioData.impactMetrics.latencyReduction}%
            </div>
            <div className="text-sm text-muted-foreground">Latency Reduction</div>
            <Progress value={selectedScenarioData.impactMetrics.latencyReduction} className="w-full" />
          </div>
          <div className="text-center space-y-2">
            <div className="text-2xl font-bold text-purple-600">
              +{selectedScenarioData.impactMetrics.resourceEfficiency}%
            </div>
            <div className="text-sm text-muted-foreground">Resource Efficiency</div>
            <Progress value={selectedScenarioData.impactMetrics.resourceEfficiency} className="w-full" />
          </div>
          <div className="text-center space-y-2">
            <div className="text-2xl font-bold text-orange-600">
              -{selectedScenarioData.impactMetrics.queueWaitReduction}%
            </div>
            <div className="text-sm text-muted-foreground">Queue Wait Reduction</div>
            <Progress value={selectedScenarioData.impactMetrics.queueWaitReduction} className="w-full" />
          </div>
        </div>

        {/* Pool Configuration Visualization */}
        <div className="space-y-4">
          <h4 className="font-semibold">Proposed Pool Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PoolConfigCard
              poolType="fast-lane"
              icon={<Zap className="h-4 w-4 text-green-600" />}
              config={selectedScenarioData.poolConfiguration.fastLane}
            />
            <PoolConfigCard
              poolType="standard"
              icon={<Clock className="h-4 w-4 text-blue-600" />}
              config={selectedScenarioData.poolConfiguration.standard}
            />
            <PoolConfigCard
              poolType="heavy"
              icon={<Cpu className="h-4 w-4 text-orange-600" />}
              config={selectedScenarioData.poolConfiguration.heavy}
            />
          </div>
        </div>

        {/* Before/After Comparison */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Before vs After Comparison</h4>
            <div className="flex gap-2">
              <Button
                variant={comparisonMode === 'side-by-side' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComparisonMode('side-by-side')}
              >
                Side by Side
              </Button>
              <Button
                variant={comparisonMode === 'overlay' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setComparisonMode('overlay')}
              >
                Overlay
              </Button>
            </div>
          </div>
          
          <BeforeAfterComparison 
            comparison={selectedScenarioData.beforeAfterComparison}
            mode={comparisonMode}
          />
        </div>

        {/* ROI and Implementation Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-semibold flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Return on Investment
            </h4>
            <div className="border rounded p-4">
              <div className="text-center space-y-2">
                <div className="text-3xl font-bold text-green-600">
                  {selectedScenarioData.estimatedRoi}%
                </div>
                <div className="text-sm text-muted-foreground">Estimated ROI</div>
                <Badge variant={
                  selectedScenarioData.implementationComplexity === 'low' ? 'default' :
                  selectedScenarioData.implementationComplexity === 'medium' ? 'secondary' : 'destructive'
                }>
                  {selectedScenarioData.implementationComplexity} complexity
                </Badge>
              </div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Timeline:</span>
                  <span className="font-medium">{selectedScenarioData.timeline}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Risk Level:</span>
                  <Badge variant="outline">
                    {selectedScenarioData.riskFactors.length > 2 ? 'High' : 
                     selectedScenarioData.riskFactors.length > 1 ? 'Medium' : 'Low'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-semibold">Risk Factors & Mitigation</h4>
            <div className="space-y-2">
              {selectedScenarioData.riskFactors.map((risk, index) => (
                <div key={index} className="border rounded p-3">
                  <div className="text-sm font-medium text-orange-600">{risk}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {getRiskMitigation(risk)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detailed Analysis Toggle */}
        <div className="border-t pt-4">
          <Button
            variant="outline"
            onClick={() => setShowDetailedAnalysis(!showDetailedAnalysis)}
            className="w-full"
          >
            {showDetailedAnalysis ? 'Hide' : 'Show'} Detailed Impact Analysis
          </Button>
          
          {showDetailedAnalysis && (
            <div className="mt-6">
              <DetailedImpactAnalysis />
            </div>
          )}
        </div>

        {/* Action Plan */}
        <div className="border rounded-lg p-4 bg-blue-50">
          <h4 className="font-semibold mb-3">Next Steps for Implementation</h4>
          <ImplementationActionPlan />
        </div>
      </CardContent>
    </Card>
  );
}

function generateImpactScenarios(jobs: Job[], machines: Machine[]): PoolImpactScenario[] {
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  // Job classification for pool analysis - used for scenario calculations

  const totalMachines = machines.length;
  const avgJobDuration = completedJobs.length > 0 
    ? completedJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / completedJobs.length
    : 60000;

  return [
    {
      scenarioName: 'conservative',
      description: 'Minimal changes, low risk',
      poolConfiguration: {
        fastLane: { machines: Math.max(1, Math.floor(totalMachines * 0.3)), avgDuration: 15000, throughput: 240 },
        standard: { machines: Math.max(2, Math.floor(totalMachines * 0.5)), avgDuration: 90000, throughput: 40 },
        heavy: { machines: Math.max(1, Math.floor(totalMachines * 0.2)), avgDuration: 300000, throughput: 12 }
      },
      impactMetrics: {
        throughputIncrease: 25,
        latencyReduction: 30,
        resourceEfficiency: 20,
        queueWaitReduction: 35,
        contentionReduction: 40
      },
      beforeAfterComparison: {
        avgJobDuration: { before: avgJobDuration, after: avgJobDuration * 0.7 },
        queueSize: { before: jobs.filter(j => j.status === 'pending').length, after: Math.round(jobs.filter(j => j.status === 'pending').length * 0.65) },
        machineUtilization: { before: 70, after: 85 },
        userWaitTime: { before: 120000, after: 78000 }
      },
      implementationComplexity: 'low',
      estimatedRoi: 180,
      riskFactors: ['Initial routing complexity', 'Load balancing adjustments'],
      timeline: '2-3 weeks'
    },
    {
      scenarioName: 'aggressive',
      description: 'Maximum optimization, higher complexity',
      poolConfiguration: {
        fastLane: { machines: Math.max(2, Math.floor(totalMachines * 0.4)), avgDuration: 12000, throughput: 300 },
        standard: { machines: Math.max(2, Math.floor(totalMachines * 0.4)), avgDuration: 75000, throughput: 48 },
        heavy: { machines: Math.max(1, Math.floor(totalMachines * 0.2)), avgDuration: 240000, throughput: 15 }
      },
      impactMetrics: {
        throughputIncrease: 45,
        latencyReduction: 55,
        resourceEfficiency: 40,
        queueWaitReduction: 60,
        contentionReduction: 70
      },
      beforeAfterComparison: {
        avgJobDuration: { before: avgJobDuration, after: avgJobDuration * 0.5 },
        queueSize: { before: jobs.filter(j => j.status === 'pending').length, after: Math.round(jobs.filter(j => j.status === 'pending').length * 0.4) },
        machineUtilization: { before: 70, after: 92 },
        userWaitTime: { before: 120000, after: 54000 }
      },
      implementationComplexity: 'high',
      estimatedRoi: 320,
      riskFactors: ['Complex routing logic', 'Model pre-loading requirements', 'Machine specialization needs'],
      timeline: '4-6 weeks'
    },
    {
      scenarioName: 'phased',
      description: 'Gradual rollout, balanced approach',
      poolConfiguration: {
        fastLane: { machines: Math.max(1, Math.floor(totalMachines * 0.35)), avgDuration: 18000, throughput: 200 },
        standard: { machines: Math.max(2, Math.floor(totalMachines * 0.45)), avgDuration: 85000, throughput: 42 },
        heavy: { machines: Math.max(1, Math.floor(totalMachines * 0.2)), avgDuration: 280000, throughput: 13 }
      },
      impactMetrics: {
        throughputIncrease: 35,
        latencyReduction: 40,
        resourceEfficiency: 30,
        queueWaitReduction: 45,
        contentionReduction: 55
      },
      beforeAfterComparison: {
        avgJobDuration: { before: avgJobDuration, after: avgJobDuration * 0.6 },
        queueSize: { before: jobs.filter(j => j.status === 'pending').length, after: Math.round(jobs.filter(j => j.status === 'pending').length * 0.55) },
        machineUtilization: { before: 70, after: 88 },
        userWaitTime: { before: 120000, after: 66000 }
      },
      implementationComplexity: 'medium',
      estimatedRoi: 250,
      riskFactors: ['Phasing coordination complexity', 'Interim performance dips'],
      timeline: '3-4 weeks'
    }
  ];
}


function PoolConfigCard({ poolType, icon, config }: {
  poolType: string;
  icon: React.ReactNode;
  config: { machines: number; avgDuration: number; throughput: number; };
}) {
  return (
    <div className="border rounded p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="font-medium capitalize">{poolType.replace('-', ' ')}</span>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Machines:</span>
          <span className="font-medium">{config.machines}</span>
        </div>
        <div className="flex justify-between">
          <span>Avg Duration:</span>
          <span className="font-medium">{formatDuration(config.avgDuration)}</span>
        </div>
        <div className="flex justify-between">
          <span>Throughput:</span>
          <span className="font-medium">{config.throughput}/hr</span>
        </div>
      </div>
    </div>
  );
}

function BeforeAfterComparison({ comparison, mode }: {
  comparison: PoolImpactScenario['beforeAfterComparison'];
  mode: 'side-by-side' | 'overlay';
}) {
  const metrics = [
    { key: 'avgJobDuration', label: 'Avg Job Duration', format: formatDuration },
    { key: 'queueSize', label: 'Queue Size', format: (val: number) => val.toString() },
    { key: 'machineUtilization', label: 'Machine Utilization', format: (val: number) => `${val}%` },
    { key: 'userWaitTime', label: 'User Wait Time', format: formatDuration }
  ];

  if (mode === 'side-by-side') {
    return (
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <h5 className="font-medium text-center">Current System</h5>
          {metrics.map((metric) => (
            <div key={metric.key} className="border rounded p-3">
              <div className="text-sm text-muted-foreground">{metric.label}</div>
              <div className="text-lg font-bold">
                {metric.format(comparison[metric.key as keyof typeof comparison].before)}
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <h5 className="font-medium text-center">With Pool Separation</h5>
          {metrics.map((metric) => (
            <div key={metric.key} className="border rounded p-3 bg-green-50">
              <div className="text-sm text-muted-foreground">{metric.label}</div>
              <div className="text-lg font-bold text-green-600">
                {metric.format(comparison[metric.key as keyof typeof comparison].after)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {metrics.map((metric) => {
        const before = comparison[metric.key as keyof typeof comparison].before;
        const after = comparison[metric.key as keyof typeof comparison].after;
        const improvement = ((before - after) / before) * 100;
        
        return (
          <div key={metric.key} className="border rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{metric.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{metric.format(before)}</span>
                <ArrowRight className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">{metric.format(after)}</span>
                <Badge variant="outline" className="text-green-600">
                  {improvement > 0 ? `-${improvement.toFixed(0)}%` : `+${Math.abs(improvement).toFixed(0)}%`}
                </Badge>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getRiskMitigation(risk: string): string {
  const mitigations: Record<string, string> = {
    'Initial routing complexity': 'Start with simple duration-based routing, expand gradually',
    'Load balancing adjustments': 'Monitor metrics closely during rollout, adjust thresholds',
    'Complex routing logic': 'Implement feature flags for gradual activation',
    'Model pre-loading requirements': 'Begin with most common models, expand coverage',
    'Machine specialization needs': 'Use existing hardware initially, optimize later',
    'Phasing coordination complexity': 'Clear rollback procedures and monitoring',
    'Interim performance dips': 'Schedule during low-traffic periods'
  };
  
  return mitigations[risk] || 'Monitor closely and adjust as needed';
}

function DetailedImpactAnalysis() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h5 className="font-medium mb-3">Performance Impact Details</h5>
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">Throughput Analysis</div>
              <div className="text-muted-foreground">
                Expected increase from better resource allocation and reduced contention
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium">Latency Improvements</div>
              <div className="text-muted-foreground">
                Fast-lane jobs benefit most, heavy jobs see resource consistency
              </div>
            </div>
          </div>
        </div>
        <div>
          <h5 className="font-medium mb-3">Resource Optimization</h5>
          <div className="space-y-3">
            <div className="text-sm">
              <div className="font-medium">Machine Specialization</div>
              <div className="text-muted-foreground">
                Each pool optimized for specific workload characteristics
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium">Queue Management</div>
              <div className="text-muted-foreground">
                Separate queues prevent blocking between job types
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImplementationActionPlan() {
  const steps = [
    'Update Redis functions for pool-aware job routing',
    'Configure machine pool assignments',
    'Implement pool-specific monitoring',
    'Deploy routing logic with feature flags',
    'Monitor and adjust pool thresholds'
  ];

  return (
    <div className="space-y-2">
      {steps.map((step, index) => (
        <div key={index} className="flex items-center gap-3 text-sm">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
            {index + 1}
          </div>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}