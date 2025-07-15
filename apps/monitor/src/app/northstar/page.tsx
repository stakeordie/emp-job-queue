"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Target, TrendingUp, Activity, Users } from "lucide-react";
import { useMonitorStore } from "@/store";
import { useState, useEffect } from "react";
import Link from "next/link";
import { NorthStarAnalytics } from "@/analytics/NorthStarAnalytics";
import type { NorthStarMetrics } from "@/analytics/NorthStarAnalytics";
import { JobDurationDistribution } from "@/components/northstar/JobDurationDistribution";
import { PoolCandidateAnalysis } from "@/components/northstar/PoolCandidateAnalysis";
import { PerformanceHeterogeneity } from "@/components/northstar/PerformanceHeterogeneity";
import { ModelUsageHeatmap } from "@/components/northstar/ModelUsageHeatmap";
import { ModelDownloadTracker } from "@/components/northstar/ModelDownloadTracker";
import { PoolReadinessScore } from "@/components/northstar/PoolReadinessScore";
import { MachinePoolPotential } from "@/components/northstar/MachinePoolPotential";
import { PoolSeparationImpact } from "@/components/northstar/PoolSeparationImpact";
import { JobFlowDiagram } from "@/components/northstar/JobFlowDiagram";
import { SystemTopology } from "@/components/northstar/SystemTopology";
import { BottleneckIdentifier } from "@/components/northstar/BottleneckIdentifier";
import { NorthStarProgress } from "@/components/northstar/NorthStarProgress";
import { StrategicMetrics } from "@/components/northstar/StrategicMetrics";
import { ProductionReadiness } from "@/components/northstar/ProductionReadiness";

function NorthStarDashboard() {
  const { jobs, workers, machines, connection } = useMonitorStore();
  const [analytics] = useState(() => new NorthStarAnalytics());
  const [metrics, setMetrics] = useState<NorthStarMetrics | null>(null);

  // Update analytics with current state and recalculate metrics
  useEffect(() => {
    analytics.updateState(jobs, workers, machines);
    const newMetrics = analytics.calculateMetrics();
    setMetrics(newMetrics);
  }, [jobs, workers, machines, analytics]);

  if (!metrics) {
    return (
      <main className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading North Star analytics...</div>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Monitor
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Target className="h-6 w-6" />
              North Star Progress
            </h1>
            <p className="text-sm text-muted-foreground">
              Progress toward Specialized Machine Pools + Predictive Model Management
            </p>
          </div>
          <Badge variant={connection.isConnected ? "default" : "destructive"}>
            {connection.isConnected ? "Live Data" : "Disconnected"}
          </Badge>
        </div>
      </div>

      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Overall North Star Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">{metrics.overallNorthStarProgress}%</span>
              <Badge variant={metrics.overallNorthStarProgress > 50 ? "default" : "secondary"}>
                {metrics.overallNorthStarProgress > 70 ? "Advanced" : 
                 metrics.overallNorthStarProgress > 40 ? "Developing" : "Early"}
              </Badge>
            </div>
            <Progress value={metrics.overallNorthStarProgress} className="w-full" />
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="font-semibold">{metrics.poolSeparationReadiness}%</div>
                <div className="text-muted-foreground">Pool Separation</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">{metrics.modelIntelligenceReadiness}%</div>
                <div className="text-muted-foreground">Model Intelligence</div>
              </div>
              <div className="text-center">
                <div className="font-semibold">{metrics.routingIntelligenceReadiness}%</div>
                <div className="text-muted-foreground">Routing Intelligence</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Production Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Production Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-green-600">{metrics.systemHealthScore}%</div>
              <div className="text-sm text-muted-foreground">System Health</div>
              <Progress value={metrics.systemHealthScore} className="w-full" />
            </div>
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-blue-600">{metrics.jobCompletionRate}%</div>
              <div className="text-sm text-muted-foreground">Job Success Rate</div>
              <Progress value={metrics.jobCompletionRate} className="w-full" />
            </div>
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-purple-600">{metrics.workerStabilityScore}%</div>
              <div className="text-sm text-muted-foreground">Worker Stability</div>
              <Progress value={metrics.workerStabilityScore} className="w-full" />
            </div>
            <div className="text-center space-y-2">
              <div className="text-2xl font-bold text-orange-600">
                {Math.round(metrics.averageQueueWaitTime / 1000)}s
              </div>
              <div className="text-sm text-muted-foreground">Avg Wait Time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Job Duration Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Job Duration Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Fast Lane (&lt;30s)</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{metrics.jobDurationDistribution.fastLane}%</Badge>
                  <Progress value={metrics.jobDurationDistribution.fastLane} className="w-20" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Standard (30s-3m)</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{metrics.jobDurationDistribution.standard}%</Badge>
                  <Progress value={metrics.jobDurationDistribution.standard} className="w-20" />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Heavy (&gt;3m)</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{metrics.jobDurationDistribution.heavy}%</Badge>
                  <Progress value={metrics.jobDurationDistribution.heavy} className="w-20" />
                </div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Clear duration patterns indicate pool separation readiness.
                Current score: <span className="font-semibold">{metrics.poolSeparationReadiness}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Variance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-semibold">Average</div>
                  <div className="text-muted-foreground">
                    {Math.round(metrics.performanceHeterogeneity.avgProcessingTime / 1000)}s
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Range</div>
                  <div className="text-muted-foreground">
                    {Math.round(metrics.performanceHeterogeneity.minProcessingTime / 1000)}s - 
                    {Math.round(metrics.performanceHeterogeneity.maxProcessingTime / 1000)}s
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm">Contention Score</span>
                  <Badge variant={metrics.performanceHeterogeneity.contentionScore > 50 ? "destructive" : "secondary"}>
                    {metrics.performanceHeterogeneity.contentionScore}%
                  </Badge>
                </div>
                <Progress value={metrics.performanceHeterogeneity.contentionScore} className="w-full" />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                High variance indicates resource contention that specialized pools would solve.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Machine Pool Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Machine Pool Potential
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.machinePoolPotentials.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No machines available for analysis
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.machinePoolPotentials.map((machine) => (
                <div key={machine.machineId} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="font-medium">{machine.machineId}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        machine.recommendedPool === 'fast-lane' ? 'default' :
                        machine.recommendedPool === 'heavy' ? 'destructive' :
                        machine.recommendedPool === 'standard' ? 'secondary' : 'outline'
                      }>
                        {machine.recommendedPool}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {machine.currentUtilization}% utilized
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="flex items-center justify-between">
                        <span>Fast Lane</span>
                        <span className="font-medium">{machine.fastLaneScore}%</span>
                      </div>
                      <Progress value={machine.fastLaneScore} className="w-full mt-1" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span>Standard</span>
                        <span className="font-medium">{machine.standardScore}%</span>
                      </div>
                      <Progress value={machine.standardScore} className="w-full mt-1" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span>Heavy</span>
                        <span className="font-medium">{machine.heavyScore}%</span>
                      </div>
                      <Progress value={machine.heavyScore} className="w-full mt-1" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Usage Patterns */}
      <Card>
        <CardHeader>
          <CardTitle>Model Usage Patterns</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.modelUsagePatterns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Model tracking not yet implemented
            </div>
          ) : (
            <div className="space-y-4">
              {metrics.modelUsagePatterns.map((model) => (
                <div key={model.modelName} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{model.modelName}</div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{model.frequency}% usage</Badge>
                      <Badge variant="secondary">{model.successRate}% success</Badge>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Avg download: {Math.round(model.avgDownloadTime / 1000)}s |
                    Co-occurs with: {model.coOccurrences.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Model usage patterns will drive predictive placement strategies.
              Current readiness: <span className="font-semibold">{metrics.modelIntelligenceReadiness}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase 2: Job Pattern Analysis */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Job Pattern Analysis</h2>
          <p className="text-sm text-muted-foreground">
            Detailed analysis of job characteristics and pool readiness
          </p>
        </div>

        {/* Job Duration Distribution */}
        <JobDurationDistribution jobs={jobs} />

        {/* Pool Candidate Analysis */}
        <PoolCandidateAnalysis jobs={jobs} machines={machines} />

        {/* Performance Heterogeneity */}
        <PerformanceHeterogeneity jobs={jobs} machines={machines} workers={workers} />
      </div>

      {/* Phase 2: Model Intelligence Insights */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Model Intelligence Insights</h2>
          <p className="text-sm text-muted-foreground">
            Model usage patterns and download performance analysis
          </p>
        </div>

        {/* Model Usage Heatmap */}
        <ModelUsageHeatmap jobs={jobs} machines={machines} />

        {/* Model Download Tracker */}
        <ModelDownloadTracker jobs={jobs} machines={machines} />
      </div>

      {/* Phase 3: Strategic Insights */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Strategic Insights</h2>
          <p className="text-sm text-muted-foreground">
            Deep analysis of system readiness and strategic metrics for pool implementation
          </p>
        </div>

        {/* Pool Readiness Score */}
        <PoolReadinessScore jobs={jobs} machines={machines} workers={workers} />

        {/* Machine Pool Potential */}
        <MachinePoolPotential jobs={jobs} machines={machines} workers={workers} />

        {/* Pool Separation Impact */}
        <PoolSeparationImpact jobs={jobs} machines={machines} workers={workers} />
      </div>

      {/* Phase 3: System Visualization */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">System Visualization</h2>
          <p className="text-sm text-muted-foreground">
            Real-time flow analysis and system topology insights
          </p>
        </div>

        {/* Job Flow Diagram */}
        <JobFlowDiagram jobs={jobs} machines={machines} workers={workers} />

        {/* System Topology */}
        <SystemTopology jobs={jobs} machines={machines} workers={workers} />

        {/* Bottleneck Identifier */}
        <BottleneckIdentifier jobs={jobs} machines={machines} workers={workers} />
      </div>

      {/* Phase 3: Progress & Metrics */}
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Progress & Strategic Metrics</h2>
          <p className="text-sm text-muted-foreground">
            North Star progress tracking and business impact analysis
          </p>
        </div>

        {/* North Star Progress */}
        <NorthStarProgress jobs={jobs} machines={machines} workers={workers} />

        {/* Strategic Metrics */}
        <StrategicMetrics jobs={jobs} machines={machines} workers={workers} />

        {/* Production Readiness */}
        <ProductionReadiness jobs={jobs} machines={machines} workers={workers} />
      </div>

      {/* Bottom padding */}
      <div className="h-12" />
    </main>
  );
}

export default NorthStarDashboard;