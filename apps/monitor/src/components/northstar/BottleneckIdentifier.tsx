import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, TrendingDown, Clock, Zap, Target } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface Bottleneck {
  id: string;
  type: 'queue' | 'machine' | 'network' | 'resource' | 'routing' | 'model';
  location: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  impact: {
    affectedJobs: number;
    throughputReduction: number;
    latencyIncrease: number;
    resourceWaste: number;
  };
  symptoms: string[];
  rootCause: string;
  detectionMethod: string;
  metrics: {
    queueDepth?: number;
    waitTime?: number;
    errorRate?: number;
    utilization?: number;
    throughput?: number;
  };
  solutions: Solution[];
  timeDetected: number;
  estimatedResolutionTime: string;
  poolImpact?: {
    wouldResolve: boolean;
    remainingImpact: number;
    explanation: string;
  };
}

interface Solution {
  action: string;
  effort: 'low' | 'medium' | 'high';
  timeToImplement: string;
  expectedImprovement: number;
  risks: string[];
  prerequisites: string[];
}

interface BottleneckPattern {
  pattern: string;
  frequency: number;
  timePattern: string;
  triggerConditions: string[];
}

interface BottleneckIdentifierProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function BottleneckIdentifier({ jobs, machines, workers }: BottleneckIdentifierProps) {
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h'>('6h');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high'>('all');
  const [, setShowResolved] = useState(false);
  const [selectedBottleneck, setSelectedBottleneck] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'current' | 'predictive' | 'pool-impact'>('current');

  const bottlenecks = identifyBottlenecks(jobs, machines, workers, timeRange);
  const patterns = identifyBottleneckPatterns(bottlenecks, timeRange);
  const filteredBottlenecks = filterBottlenecks(bottlenecks, severityFilter);
  const selectedBottleneckData = bottlenecks.find(b => b.id === selectedBottleneck);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Bottleneck Identifier
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Real-time identification and analysis of system performance bottlenecks
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">Time Range:</span>
            {(['1h', '6h', '24h'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-sm rounded ${
                  timeRange === range
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="text-sm font-medium">Severity:</span>
            {(['all', 'critical', 'high'] as const).map((severity) => (
              <button
                key={severity}
                onClick={() => setSeverityFilter(severity)}
                className={`px-3 py-1 text-sm rounded capitalize ${
                  severityFilter === severity
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {severity}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="text-sm font-medium">Analysis:</span>
            {(['current', 'predictive', 'pool-impact'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setAnalysisMode(mode)}
                className={`px-3 py-1 text-sm rounded ${
                  analysisMode === mode
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {mode.replace('-', ' ')}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowResolved(prev => !prev)}
          >
            Show Resolved
          </Button>
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {filteredBottlenecks.filter(b => b.severity === 'critical').length}
            </div>
            <div className="text-sm text-muted-foreground">Critical Issues</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {filteredBottlenecks.filter(b => b.severity === 'high').length}
            </div>
            <div className="text-sm text-muted-foreground">High Priority</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {patterns.length}
            </div>
            <div className="text-sm text-muted-foreground">Recurring Patterns</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(filteredBottlenecks.reduce((sum, b) => sum + b.impact.throughputReduction, 0))}%
            </div>
            <div className="text-sm text-muted-foreground">Total Impact</div>
          </div>
        </div>

        {/* Active Bottlenecks */}
        <div className="space-y-4">
          <h4 className="font-semibold">Active Bottlenecks</h4>
          {filteredBottlenecks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <div>No active bottlenecks detected</div>
              <div className="text-sm">System performance is optimal</div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBottlenecks.map((bottleneck) => (
                <div
                  key={bottleneck.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedBottleneck === bottleneck.id
                      ? 'border-red-500 bg-red-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedBottleneck(
                    selectedBottleneck === bottleneck.id ? null : bottleneck.id
                  )}
                >
                  <BottleneckCard bottleneck={bottleneck} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Analysis */}
        {selectedBottleneckData && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <DetailedBottleneckAnalysis 
              bottleneck={selectedBottleneckData}
              analysisMode={analysisMode}
            />
          </div>
        )}

        {/* Bottleneck Patterns */}
        {patterns.length > 0 && (
          <div className="space-y-4">
            <h4 className="font-semibold">Recurring Patterns</h4>
            <BottleneckPatterns patterns={patterns} />
          </div>
        )}

        {/* Pool Impact Analysis */}
        {analysisMode === 'pool-impact' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Pool Separation Impact</h4>
            <PoolImpactAnalysis bottlenecks={filteredBottlenecks} />
          </div>
        )}

        {/* Action Recommendations */}
        <div className="border-t pt-4">
          <ActionRecommendations 
            bottlenecks={filteredBottlenecks}
            patterns={patterns}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function identifyBottlenecks(
  jobs: Job[], 
  machines: Machine[], 
  workers: Worker[], 
  timeRange: '1h' | '6h' | '24h'
): Bottleneck[] {
  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange];
  const recentJobs = jobs.filter(job => job.created_at > cutoffTime);
  const bottlenecks: Bottleneck[] = [];

  // Queue bottlenecks
  const pendingJobs = jobs.filter(j => j.status === 'pending');
  if (pendingJobs.length > 20) {
    bottlenecks.push({
      id: 'queue-depth',
      type: 'queue',
      location: 'Redis Queue',
      severity: pendingJobs.length > 50 ? 'critical' : 'high',
      impact: {
        affectedJobs: pendingJobs.length,
        throughputReduction: Math.min(80, pendingJobs.length * 2),
        latencyIncrease: pendingJobs.length * 5000,
        resourceWaste: 30
      },
      symptoms: [
        `${pendingJobs.length} jobs waiting in queue`,
        'Increasing wait times',
        'Worker starvation'
      ],
      rootCause: 'Job submission rate exceeds processing capacity',
      detectionMethod: 'Queue depth monitoring',
      metrics: {
        queueDepth: pendingJobs.length,
        waitTime: 120000
      },
      solutions: [
        {
          action: 'Scale up worker capacity',
          effort: 'medium',
          timeToImplement: '15-30 minutes',
          expectedImprovement: 60,
          risks: ['Resource costs'],
          prerequisites: ['Available machines']
        },
        {
          action: 'Implement pool separation',
          effort: 'high',
          timeToImplement: '2-3 weeks',
          expectedImprovement: 80,
          risks: ['Implementation complexity'],
          prerequisites: ['Job classification', 'Routing logic']
        }
      ],
      timeDetected: Date.now(),
      estimatedResolutionTime: '30 minutes',
      poolImpact: {
        wouldResolve: true,
        remainingImpact: 20,
        explanation: 'Pool separation would eliminate queue contention'
      }
    });
  }

  // Machine bottlenecks
  machines.forEach((machine) => {
    const machineWorkers = workers.filter(w => machine.workers.includes(w.worker_id));
    const errorWorkers = machineWorkers.filter(w => w.status === 'error');
    const busyWorkers = machineWorkers.filter(w => w.status === 'busy');
    
    if (errorWorkers.length > 0) {
      bottlenecks.push({
        id: `machine-${machine.machine_id}-errors`,
        type: 'machine',
        location: machine.machine_id,
        severity: errorWorkers.length > machineWorkers.length / 2 ? 'critical' : 'high',
        impact: {
          affectedJobs: recentJobs.filter(j => errorWorkers.some(w => w.worker_id === j.worker_id)).length,
          throughputReduction: (errorWorkers.length / machineWorkers.length) * 100,
          latencyIncrease: 60000,
          resourceWaste: 50
        },
        symptoms: [
          `${errorWorkers.length} workers in error state`,
          'Job failures',
          'Reduced capacity'
        ],
        rootCause: 'Worker process failures or resource exhaustion',
        detectionMethod: 'Worker health monitoring',
        metrics: {
          errorRate: (errorWorkers.length / machineWorkers.length) * 100,
          utilization: (busyWorkers.length / machineWorkers.length) * 100
        },
        solutions: [
          {
            action: 'Restart failed workers',
            effort: 'low',
            timeToImplement: '2-5 minutes',
            expectedImprovement: 90,
            risks: ['Job interruption'],
            prerequisites: ['Machine access']
          },
          {
            action: 'Investigate resource limits',
            effort: 'medium',
            timeToImplement: '15-30 minutes',
            expectedImprovement: 95,
            risks: ['Downtime during investigation'],
            prerequisites: ['System monitoring access']
          }
        ],
        timeDetected: Date.now(),
        estimatedResolutionTime: '5 minutes',
        poolImpact: {
          wouldResolve: false,
          remainingImpact: 95,
          explanation: 'Machine issues require direct resolution, not routing changes'
        }
      });
    }

    // High utilization without errors
    if (errorWorkers.length === 0 && busyWorkers.length === machineWorkers.length && machineWorkers.length > 0) {
      bottlenecks.push({
        id: `machine-${machine.machine_id}-saturated`,
        type: 'resource',
        location: machine.machine_id,
        severity: 'medium',
        impact: {
          affectedJobs: 0,
          throughputReduction: 0,
          latencyIncrease: 30000,
          resourceWaste: 0
        },
        symptoms: [
          'All workers busy',
          'No spare capacity',
          'Potential queue backup'
        ],
        rootCause: 'Machine at full capacity',
        detectionMethod: 'Utilization monitoring',
        metrics: {
          utilization: 100
        },
        solutions: [
          {
            action: 'Add more workers to machine',
            effort: 'low',
            timeToImplement: '5-10 minutes',
            expectedImprovement: 40,
            risks: ['Resource exhaustion'],
            prerequisites: ['Available CPU/memory']
          }
        ],
        timeDetected: Date.now(),
        estimatedResolutionTime: '10 minutes',
        poolImpact: {
          wouldResolve: true,
          remainingImpact: 10,
          explanation: 'Pool separation would distribute load more evenly'
        }
      });
    }
  });

  // Performance variance bottleneck
  const completedJobs = recentJobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );
  
  if (completedJobs.length > 10) {
    const durations = completedJobs.map(job => job.completed_at! - job.started_at!);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const cv = avg > 0 ? Math.sqrt(variance) / avg : 0;
    
    if (cv > 0.5) {
      bottlenecks.push({
        id: 'performance-variance',
        type: 'routing',
        location: 'System-wide',
        severity: cv > 1.0 ? 'high' : 'medium',
        impact: {
          affectedJobs: Math.floor(completedJobs.length * 0.3),
          throughputReduction: Math.min(50, cv * 50),
          latencyIncrease: avg * cv,
          resourceWaste: cv * 40
        },
        symptoms: [
          'Inconsistent job completion times',
          'Resource contention',
          'Mixed workload interference'
        ],
        rootCause: 'Different job types competing for same resources',
        detectionMethod: 'Performance variance analysis',
        metrics: {
          throughput: completedJobs.length
        },
        solutions: [
          {
            action: 'Implement job type separation',
            effort: 'high',
            timeToImplement: '2-4 weeks',
            expectedImprovement: 70,
            risks: ['Routing complexity'],
            prerequisites: ['Job classification', 'Pool implementation']
          }
        ],
        timeDetected: Date.now(),
        estimatedResolutionTime: '2-4 weeks',
        poolImpact: {
          wouldResolve: true,
          remainingImpact: 15,
          explanation: 'Pool separation would eliminate cross-workload interference'
        }
      });
    }
  }

  return bottlenecks.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

function identifyBottleneckPatterns(bottlenecks: Bottleneck[], timeRange: string): BottleneckPattern[] {
  const patterns: BottleneckPattern[] = [];
  
  // Group bottlenecks by type
  const typeGroups = bottlenecks.reduce((groups, bottleneck) => {
    if (!groups[bottleneck.type]) groups[bottleneck.type] = [];
    groups[bottleneck.type].push(bottleneck);
    return groups;
  }, {} as Record<string, Bottleneck[]>);

  Object.entries(typeGroups).forEach(([type, typeBottlenecks]) => {
    if (typeBottlenecks.length > 1) {
      patterns.push({
        pattern: `Recurring ${type} bottlenecks`,
        frequency: typeBottlenecks.length,
        timePattern: timeRange,
        triggerConditions: Array.from(new Set(typeBottlenecks.flatMap(b => b.symptoms)))
      });
    }
  });

  return patterns;
}

function filterBottlenecks(
  bottlenecks: Bottleneck[], 
  severityFilter: string
): Bottleneck[] {
  let filtered = bottlenecks;
  
  if (severityFilter !== 'all') {
    filtered = filtered.filter(b => b.severity === severityFilter);
  }
  
  return filtered;
}

function BottleneckCard({ bottleneck }: { bottleneck: Bottleneck }) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'secondary';
      case 'medium': return 'outline';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'queue': return <Clock className="h-4 w-4" />;
      case 'machine': return <AlertTriangle className="h-4 w-4" />;
      case 'routing': return <TrendingDown className="h-4 w-4" />;
      default: return <AlertTriangle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getTypeIcon(bottleneck.type)}
          <span className="font-medium">{bottleneck.location}</span>
          <Badge variant={getSeverityColor(bottleneck.severity)}>
            {bottleneck.severity}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          {new Date(bottleneck.timeDetected).toLocaleTimeString()}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {bottleneck.rootCause}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="font-medium">Affected Jobs</div>
          <div className="text-muted-foreground">{bottleneck.impact.affectedJobs}</div>
        </div>
        <div>
          <div className="font-medium">Throughput Impact</div>
          <div className="text-muted-foreground">-{bottleneck.impact.throughputReduction}%</div>
        </div>
        <div>
          <div className="font-medium">Resolution Time</div>
          <div className="text-muted-foreground">{bottleneck.estimatedResolutionTime}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm">Impact Severity:</span>
        <Progress value={bottleneck.impact.throughputReduction} className="flex-1" />
        <span className="text-sm font-medium">{bottleneck.impact.throughputReduction}%</span>
      </div>
    </div>
  );
}

function DetailedBottleneckAnalysis({ bottleneck, analysisMode }: {
  bottleneck: Bottleneck;
  analysisMode: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h5 className="font-semibold">{bottleneck.location} - Detailed Analysis</h5>
        <Badge variant="outline">{bottleneck.detectionMethod}</Badge>
      </div>

      {/* Symptoms and Root Cause */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h6 className="font-medium mb-2">Symptoms</h6>
          <div className="space-y-1">
            {bottleneck.symptoms.map((symptom, index) => (
              <div key={index} className="text-sm text-muted-foreground">
                • {symptom}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h6 className="font-medium mb-2">Impact Metrics</h6>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Affected Jobs:</span>
              <span className="font-medium">{bottleneck.impact.affectedJobs}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Throughput Reduction:</span>
              <span className="font-medium text-red-600">-{bottleneck.impact.throughputReduction}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Latency Increase:</span>
              <span className="font-medium text-orange-600">+{Math.round(bottleneck.impact.latencyIncrease / 1000)}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Solutions */}
      <div>
        <h6 className="font-medium mb-3">Recommended Solutions</h6>
        <div className="space-y-3">
          {bottleneck.solutions.map((solution, index) => (
            <div key={index} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{solution.action}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    solution.effort === 'low' ? 'default' :
                    solution.effort === 'medium' ? 'secondary' : 'destructive'
                  }>
                    {solution.effort} effort
                  </Badge>
                  <span className="text-sm text-muted-foreground">{solution.timeToImplement}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                Expected improvement: {solution.expectedImprovement}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pool Impact Analysis */}
      {analysisMode === 'pool-impact' && bottleneck.poolImpact && (
        <div className="border rounded p-4 bg-blue-50">
          <h6 className="font-medium mb-2">Pool Separation Impact</h6>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">Would pool separation resolve this?</span>
              <Badge variant={bottleneck.poolImpact.wouldResolve ? 'default' : 'destructive'}>
                {bottleneck.poolImpact.wouldResolve ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {bottleneck.poolImpact.explanation}
            </div>
            {bottleneck.poolImpact.wouldResolve && (
              <div className="text-sm">
                Remaining impact after pools: {bottleneck.poolImpact.remainingImpact}%
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BottleneckPatterns({ patterns }: { patterns: BottleneckPattern[] }) {
  return (
    <div className="space-y-3">
      {patterns.map((pattern, index) => (
        <div key={index} className="border rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{pattern.pattern}</span>
            <Badge variant="outline">
              {pattern.frequency} occurrences
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            Time pattern: {pattern.timePattern} | 
            Triggers: {pattern.triggerConditions.slice(0, 2).join(', ')}
            {pattern.triggerConditions.length > 2 && ` +${pattern.triggerConditions.length - 2} more`}
          </div>
        </div>
      ))}
    </div>
  );
}

function PoolImpactAnalysis({ bottlenecks }: { bottlenecks: Bottleneck[] }) {
  const resolvableCount = bottlenecks.filter(b => b.poolImpact?.wouldResolve).length;
  const totalImpactReduction = bottlenecks.reduce((sum, b) => {
    return sum + (b.poolImpact?.wouldResolve ? b.impact.throughputReduction : 0);
  }, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-green-600">{resolvableCount}</div>
          <div className="text-sm text-muted-foreground">Resolvable by Pools</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-blue-600">{Math.round(totalImpactReduction)}%</div>
          <div className="text-sm text-muted-foreground">Total Impact Reduction</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-600">
            {bottlenecks.length - resolvableCount}
          </div>
          <div className="text-sm text-muted-foreground">Require Direct Action</div>
        </div>
      </div>
      
      <div className="text-sm text-muted-foreground">
        Pool separation would resolve {Math.round((resolvableCount / bottlenecks.length) * 100)}% of current bottlenecks
        and reduce overall performance impact by {Math.round(totalImpactReduction)}%.
      </div>
    </div>
  );
}

function ActionRecommendations({ bottlenecks, patterns }: {
  bottlenecks: Bottleneck[];
  patterns: BottleneckPattern[];
}) {
  const recommendations = [];
  
  const criticalBottlenecks = bottlenecks.filter(b => b.severity === 'critical');
  if (criticalBottlenecks.length > 0) {
    recommendations.push(`Immediate action required: ${criticalBottlenecks.length} critical bottlenecks detected`);
  }
  
  const poolResolvable = bottlenecks.filter(b => b.poolImpact?.wouldResolve).length;
  if (poolResolvable > bottlenecks.length * 0.5) {
    recommendations.push(`Pool separation would resolve ${poolResolvable} of ${bottlenecks.length} bottlenecks`);
  }
  
  if (patterns.length > 2) {
    recommendations.push(`${patterns.length} recurring patterns identified - consider systematic solutions`);
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold flex items-center gap-2">
        <Zap className="h-4 w-4" />
        Action Recommendations
      </h4>
      <div className="space-y-2">
        {recommendations.map((rec, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {rec}
          </div>
        ))}
        {recommendations.length === 0 && (
          <div className="text-sm text-muted-foreground">
            • System performance is optimal - continue monitoring
          </div>
        )}
      </div>
    </div>
  );
}