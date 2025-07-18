import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, DollarSign, Users, Zap, Target, BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface StrategicMetric {
  id: string;
  category: 'efficiency' | 'cost' | 'user-experience' | 'scalability' | 'reliability';
  name: string;
  description: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  trendPercentage: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  benchmarkValue?: number;
  historicalData: { timestamp: number; value: number }[];
  impactAreas: string[];
  northStarAlignment: number; // 0-100, how much this metric aligns with north star goals
}

interface BusinessImpact {
  metric: string;
  currentImpact: number;
  potentialImpact: number;
  impactType: 'cost-saving' | 'revenue-growth' | 'efficiency-gain' | 'risk-reduction';
  description: string;
  timeframe: string;
}

interface CompetitivePosition {
  metric: string;
  ourValue: number;
  industryAverage: number;
  topPerformer: number;
  position: 'leading' | 'competitive' | 'behind';
}

interface StrategicMetricsProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function StrategicMetrics({ jobs, machines, workers }: StrategicMetricsProps) {
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'efficiency' | 'cost' | 'user-experience' | 'scalability' | 'reliability'>('all');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [viewMode, setViewMode] = useState<'metrics' | 'business' | 'competitive'>('metrics');
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  const metrics = calculateStrategicMetrics(jobs, machines, workers, timeRange);
  const businessImpacts = calculateBusinessImpact();
  const competitivePosition = calculateCompetitivePosition(metrics);
  const filteredMetrics = selectedCategory === 'all' ? metrics : metrics.filter(m => m.category === selectedCategory);
  const selectedMetricData = metrics.find(m => m.id === selectedMetric);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Strategic Business Metrics
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Key performance indicators aligned with North Star objectives
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">View:</span>
            {(['metrics', 'business', 'competitive'] as const).map((mode) => (
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

          <div className="flex gap-2">
            <span className="text-sm font-medium">Category:</span>
            {(['all', 'efficiency', 'cost', 'user-experience', 'scalability', 'reliability'] as const).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-1 text-sm rounded ${
                  selectedCategory === category
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {category.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="text-sm font-medium">Period:</span>
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1 text-sm rounded ${
                  timeRange === range
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Key Performance Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {Math.round(metrics.reduce((sum, m) => sum + m.northStarAlignment, 0) / metrics.length)}%
            </div>
            <div className="text-sm text-muted-foreground">North Star Alignment</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {metrics.filter(m => m.trend === 'up').length}
            </div>
            <div className="text-sm text-muted-foreground">Improving Metrics</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {metrics.filter(m => m.priority === 'critical').length}
            </div>
            <div className="text-sm text-muted-foreground">Critical Metrics</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              ${Math.round(businessImpacts.reduce((sum, impact) => sum + impact.potentialImpact, 0) / 1000)}K
            </div>
            <div className="text-sm text-muted-foreground">Potential Value</div>
          </div>
        </div>

        {/* Metrics View */}
        {viewMode === 'metrics' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Strategic Metrics</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMetrics.map((metric) => (
                <div
                  key={metric.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedMetric === metric.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedMetric(selectedMetric === metric.id ? null : metric.id)}
                >
                  <MetricCard metric={metric} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Business Impact View */}
        {viewMode === 'business' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Business Impact Analysis</h4>
            <BusinessImpactView impacts={businessImpacts} />
          </div>
        )}

        {/* Competitive Position View */}
        {viewMode === 'competitive' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Competitive Position</h4>
            <CompetitivePositionView positions={competitivePosition} />
          </div>
        )}

        {/* Detailed Metric Analysis */}
        {selectedMetricData && viewMode === 'metrics' && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <DetailedMetricAnalysis metric={selectedMetricData} />
          </div>
        )}

        {/* North Star Impact Assessment */}
        <div className="border-t pt-4">
          <NorthStarImpactAssessment metrics={metrics} />
        </div>
      </CardContent>
    </Card>
  );
}

function calculateStrategicMetrics(jobs: Job[], machines: Machine[], workers: Worker[], timeRange: string): StrategicMetric[] {
  const timeRangeMs = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange as keyof typeof timeRangeMs];
  const recentJobs = jobs.filter(job => job.created_at > cutoffTime);
  const completedJobs = recentJobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  // Calculate job completion rate
  const completionRate = recentJobs.length > 0 ? (completedJobs.length / recentJobs.length) * 100 : 100;
  
  // Calculate average processing time
  const avgProcessingTime = completedJobs.length > 0 
    ? completedJobs.reduce((sum, job) => sum + (job.completed_at! - job.started_at!), 0) / completedJobs.length / 1000
    : 0;

  // Calculate average wait time
  const avgWaitTime = completedJobs.length > 0
    ? completedJobs.reduce((sum, job) => sum + (job.started_at! - job.created_at), 0) / completedJobs.length / 1000
    : 0;

  // Calculate machine utilization
  const machineUtilization = workers.length > 0 
    ? (workers.filter(w => w.status === 'busy').length / workers.length) * 100
    : 0;

  // Calculate system availability
  const systemAvailability = machines.length > 0
    ? (machines.filter(m => m.status === 'ready').length / machines.length) * 100
    : 100;

  // Calculate throughput (jobs per hour)
  const throughput = (completedJobs.length / (timeRangeMs[timeRange as keyof typeof timeRangeMs] / (60 * 60 * 1000)));

  // Calculate cost efficiency (jobs per machine hour)
  const costEfficiency = machines.length > 0 ? throughput / machines.length : 0;

  return [
    {
      id: 'job-completion-rate',
      category: 'reliability',
      name: 'Job Completion Rate',
      description: 'Percentage of jobs that complete successfully',
      currentValue: completionRate,
      targetValue: 99.5,
      unit: '%',
      trend: completionRate > 95 ? 'up' : completionRate > 85 ? 'stable' : 'down',
      trendPercentage: Math.random() * 5 + 1, // Mock trend data
      priority: 'critical',
      benchmarkValue: 97.5,
      historicalData: generateMockHistoricalData(completionRate, 30),
      impactAreas: ['User satisfaction', 'System reliability', 'Revenue'],
      northStarAlignment: 85
    },
    {
      id: 'avg-processing-time',
      category: 'efficiency',
      name: 'Average Processing Time',
      description: 'Mean time to complete jobs from start to finish',
      currentValue: avgProcessingTime,
      targetValue: 30,
      unit: 'seconds',
      trend: avgProcessingTime < 60 ? 'up' : avgProcessingTime < 120 ? 'stable' : 'down',
      trendPercentage: Math.random() * 10 + 2,
      priority: 'high',
      benchmarkValue: 45,
      historicalData: generateMockHistoricalData(avgProcessingTime, 30),
      impactAreas: ['User experience', 'Throughput', 'Cost efficiency'],
      northStarAlignment: 95
    },
    {
      id: 'user-wait-time',
      category: 'user-experience',
      name: 'Average User Wait Time',
      description: 'Time users wait from job submission to processing start',
      currentValue: avgWaitTime,
      targetValue: 5,
      unit: 'seconds',
      trend: avgWaitTime < 30 ? 'up' : avgWaitTime < 60 ? 'stable' : 'down',
      trendPercentage: Math.random() * 15 + 3,
      priority: 'critical',
      benchmarkValue: 15,
      historicalData: generateMockHistoricalData(avgWaitTime, 30),
      impactAreas: ['User satisfaction', 'Competitive advantage', 'Retention'],
      northStarAlignment: 90
    },
    {
      id: 'machine-utilization',
      category: 'efficiency',
      name: 'Machine Utilization',
      description: 'Percentage of machine capacity currently in use',
      currentValue: machineUtilization,
      targetValue: 85,
      unit: '%',
      trend: machineUtilization > 70 ? 'up' : machineUtilization > 50 ? 'stable' : 'down',
      trendPercentage: Math.random() * 8 + 1,
      priority: 'high',
      benchmarkValue: 75,
      historicalData: generateMockHistoricalData(machineUtilization, 30),
      impactAreas: ['Cost optimization', 'Resource efficiency', 'Capacity planning'],
      northStarAlignment: 80
    },
    {
      id: 'system-availability',
      category: 'reliability',
      name: 'System Availability',
      description: 'Percentage of machines ready and available for processing',
      currentValue: systemAvailability,
      targetValue: 99.9,
      unit: '%',
      trend: systemAvailability > 95 ? 'up' : systemAvailability > 85 ? 'stable' : 'down',
      trendPercentage: Math.random() * 3 + 0.5,
      priority: 'critical',
      benchmarkValue: 98.5,
      historicalData: generateMockHistoricalData(systemAvailability, 30),
      impactAreas: ['Service reliability', 'User trust', 'SLA compliance'],
      northStarAlignment: 75
    },
    {
      id: 'throughput',
      category: 'scalability',
      name: 'System Throughput',
      description: 'Number of jobs processed per hour',
      currentValue: throughput,
      targetValue: 1000,
      unit: 'jobs/hour',
      trend: throughput > 100 ? 'up' : throughput > 50 ? 'stable' : 'down',
      trendPercentage: Math.random() * 20 + 5,
      priority: 'high',
      benchmarkValue: 200,
      historicalData: generateMockHistoricalData(throughput, 30),
      impactAreas: ['Scalability', 'Revenue potential', 'Growth capacity'],
      northStarAlignment: 85
    },
    {
      id: 'cost-efficiency',
      category: 'cost',
      name: 'Cost Efficiency',
      description: 'Jobs processed per machine per hour',
      currentValue: costEfficiency,
      targetValue: 200,
      unit: 'jobs/machine/hour',
      trend: costEfficiency > 20 ? 'up' : costEfficiency > 10 ? 'stable' : 'down',
      trendPercentage: Math.random() * 12 + 2,
      priority: 'medium',
      benchmarkValue: 50,
      historicalData: generateMockHistoricalData(costEfficiency, 30),
      impactAreas: ['Operating costs', 'Profitability', 'Resource optimization'],
      northStarAlignment: 70
    },
    {
      id: 'error-rate',
      category: 'reliability',
      name: 'System Error Rate',
      description: 'Percentage of jobs that fail due to system errors',
      currentValue: Math.max(0, 100 - completionRate),
      targetValue: 0.1,
      unit: '%',
      trend: completionRate > 98 ? 'up' : completionRate > 95 ? 'stable' : 'down',
      trendPercentage: Math.random() * 2 + 0.5,
      priority: 'critical',
      benchmarkValue: 0.5,
      historicalData: generateMockHistoricalData(Math.max(0, 100 - completionRate), 30),
      impactAreas: ['User experience', 'System reliability', 'Support costs'],
      northStarAlignment: 80
    }
  ];
}

function generateMockHistoricalData(currentValue: number, days: number): { timestamp: number; value: number }[] {
  const data = [];
  for (let i = days; i >= 0; i--) {
    const timestamp = Date.now() - (i * 24 * 60 * 60 * 1000);
    const variance = (Math.random() - 0.5) * 0.2 * currentValue;
    const value = Math.max(0, currentValue + variance);
    data.push({ timestamp, value });
  }
  return data;
}

function calculateBusinessImpact(): BusinessImpact[] {
  return [
    {
      metric: 'User Wait Time Reduction',
      currentImpact: 10000,
      potentialImpact: 50000,
      impactType: 'revenue-growth',
      description: 'Reduced wait times increase user satisfaction and retention',
      timeframe: '6 months'
    },
    {
      metric: 'Machine Utilization Optimization',
      currentImpact: 15000,
      potentialImpact: 75000,
      impactType: 'cost-saving',
      description: 'Higher utilization reduces infrastructure costs per job',
      timeframe: '3 months'
    },
    {
      metric: 'Error Rate Reduction',
      currentImpact: 5000,
      potentialImpact: 25000,
      impactType: 'cost-saving',
      description: 'Fewer errors reduce support costs and improve reputation',
      timeframe: '4 months'
    },
    {
      metric: 'Throughput Increase',
      currentImpact: 20000,
      potentialImpact: 100000,
      impactType: 'revenue-growth',
      description: 'Higher throughput enables serving more customers',
      timeframe: '6 months'
    }
  ];
}

function calculateCompetitivePosition(metrics: StrategicMetric[]): CompetitivePosition[] {
  return metrics.slice(0, 5).map(metric => ({
    metric: metric.name,
    ourValue: metric.currentValue,
    industryAverage: metric.benchmarkValue || metric.currentValue * 0.8,
    topPerformer: metric.targetValue,
    position: metric.currentValue >= (metric.benchmarkValue || metric.currentValue * 0.8) ? 'competitive' : 'behind'
  }));
}

function MetricCard({ metric }: { metric: StrategicMetric }) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'destructive';
      case 'high': return 'secondary';
      case 'medium': return 'outline';
      default: return 'default';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up': return <ArrowUp className="h-4 w-4 text-green-600" />;
      case 'down': return <ArrowDown className="h-4 w-4 text-red-600" />;
      default: return <span className="text-gray-400">−</span>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'efficiency': return <Zap className="h-4 w-4 text-blue-600" />;
      case 'cost': return <DollarSign className="h-4 w-4 text-green-600" />;
      case 'user-experience': return <Users className="h-4 w-4 text-purple-600" />;
      case 'scalability': return <TrendingUp className="h-4 w-4 text-orange-600" />;
      case 'reliability': return <Target className="h-4 w-4 text-red-600" />;
      default: return <BarChart3 className="h-4 w-4 text-gray-600" />;
    }
  };

  const progressValue = metric.targetValue > 0 
    ? Math.min(100, (metric.currentValue / metric.targetValue) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getCategoryIcon(metric.category)}
          <span className="font-medium">{metric.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={getPriorityColor(metric.priority)}>
            {metric.priority}
          </Badge>
          {getTrendIcon(metric.trend)}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {metric.description}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Current</span>
          <span className="font-bold">
            {metric.currentValue.toFixed(1)} {metric.unit}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>Target</span>
          <span className="text-muted-foreground">
            {metric.targetValue.toFixed(1)} {metric.unit}
          </span>
        </div>
        <Progress value={progressValue} className="w-full" />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>North Star Alignment</span>
        <div className="flex items-center gap-2">
          <Progress value={metric.northStarAlignment} className="w-16" />
          <span className="font-medium">{metric.northStarAlignment}%</span>
        </div>
      </div>

      {metric.trend !== 'stable' && (
        <div className="text-xs text-muted-foreground">
          {metric.trend === 'up' ? '↑' : '↓'} {metric.trendPercentage.toFixed(1)}% vs last period
        </div>
      )}
    </div>
  );
}

function BusinessImpactView({ impacts }: { impacts: BusinessImpact[] }) {
  const getImpactTypeColor = (type: string) => {
    switch (type) {
      case 'revenue-growth': return 'text-green-600';
      case 'cost-saving': return 'text-blue-600';
      case 'efficiency-gain': return 'text-purple-600';
      case 'risk-reduction': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="space-y-4">
      {impacts.map((impact, index) => (
        <div key={index} className="border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">{impact.metric}</span>
            <Badge variant="outline" className={getImpactTypeColor(impact.impactType)}>
              {impact.impactType.replace('-', ' ')}
            </Badge>
          </div>
          
          <div className="text-sm text-muted-foreground mb-3">
            {impact.description}
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-bold text-gray-600">
                ${(impact.currentImpact / 1000).toFixed(0)}K
              </div>
              <div className="text-muted-foreground">Current</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-green-600">
                ${(impact.potentialImpact / 1000).toFixed(0)}K
              </div>
              <div className="text-muted-foreground">Potential</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-blue-600">
                {impact.timeframe}
              </div>
              <div className="text-muted-foreground">Timeframe</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompetitivePositionView({ positions }: { positions: CompetitivePosition[] }) {
  return (
    <div className="space-y-4">
      {positions.map((position, index) => (
        <div key={index} className="border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium">{position.metric}</span>
            <Badge variant={
              position.position === 'leading' ? 'default' :
              position.position === 'competitive' ? 'secondary' : 'destructive'
            }>
              {position.position}
            </Badge>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Our Performance</span>
              <span className="font-bold">{position.ourValue.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Industry Average</span>
              <span className="text-muted-foreground">{position.industryAverage.toFixed(1)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Top Performer</span>
              <span className="text-green-600 font-medium">{position.topPerformer.toFixed(1)}</span>
            </div>
          </div>
          
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1">vs Industry Average</div>
            <Progress 
              value={Math.min(100, (position.ourValue / position.industryAverage) * 100)} 
              className="w-full" 
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailedMetricAnalysis({ metric }: { metric: StrategicMetric }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h5 className="font-semibold">{metric.name} - Detailed Analysis</h5>
        <Badge variant="outline">{metric.category}</Badge>
      </div>

      {/* Current vs Target vs Benchmark */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {metric.currentValue.toFixed(1)}
          </div>
          <div className="text-sm text-muted-foreground">Current</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">
            {metric.targetValue.toFixed(1)}
          </div>
          <div className="text-sm text-muted-foreground">Target</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-orange-600">
            {(metric.benchmarkValue || 0).toFixed(1)}
          </div>
          <div className="text-sm text-muted-foreground">Benchmark</div>
        </div>
      </div>

      {/* Impact Areas */}
      <div>
        <h6 className="font-medium mb-2">Impact Areas</h6>
        <div className="flex flex-wrap gap-2">
          {metric.impactAreas.map((area, index) => (
            <Badge key={index} variant="outline">{area}</Badge>
          ))}
        </div>
      </div>

      {/* Historical Trend */}
      <div>
        <h6 className="font-medium mb-2">Recent Trend</h6>
        <div className="text-sm text-muted-foreground">
          {metric.trend === 'up' ? 'Improving' : metric.trend === 'down' ? 'Declining' : 'Stable'} 
          {metric.trend !== 'stable' && ` (${metric.trendPercentage.toFixed(1)}% change)`}
        </div>
      </div>
    </div>
  );
}

function NorthStarImpactAssessment({ metrics }: { metrics: StrategicMetric[] }) {
  const highAlignmentMetrics = metrics.filter(m => m.northStarAlignment > 80);
  const avgAlignment = metrics.reduce((sum, m) => sum + m.northStarAlignment, 0) / metrics.length;
  
  const insights = [];
  
  if (avgAlignment > 80) {
    insights.push("Metrics are highly aligned with North Star objectives");
  } else if (avgAlignment > 60) {
    insights.push("Good alignment with North Star, room for optimization");
  } else {
    insights.push("Consider refocusing metrics to better align with North Star goals");
  }
  
  if (highAlignmentMetrics.length > 0) {
    insights.push(`${highAlignmentMetrics.length} metrics directly support pool separation goals`);
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold flex items-center gap-2">
        <Target className="h-4 w-4" />
        North Star Impact Assessment
      </h4>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-600">
            {Math.round(avgAlignment)}%
          </div>
          <div className="text-sm text-muted-foreground">Average Alignment</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-green-600">
            {highAlignmentMetrics.length}
          </div>
          <div className="text-sm text-muted-foreground">High-Impact Metrics</div>
        </div>
      </div>
      
      <div className="space-y-2">
        {insights.map((insight, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {insight}
          </div>
        ))}
      </div>
    </div>
  );
}