import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, TrendingUp, AlertTriangle } from "lucide-react";
import type { Job } from "@/types";

interface JobDurationDistribution {
  fastLane: {
    count: number;
    percentage: number;
    avgDuration: number;
    examples: string[];
  };
  standard: {
    count: number;
    percentage: number;
    avgDuration: number;
    examples: string[];
  };
  heavy: {
    count: number;
    percentage: number;
    avgDuration: number;
    examples: string[];
  };
  unknown: {
    count: number;
    percentage: number;
  };
}

interface JobDurationDistributionProps {
  jobs: Job[];
}

export function JobDurationDistribution({ jobs }: JobDurationDistributionProps) {
  const FAST_LANE_THRESHOLD = 30 * 1000; // 30 seconds
  const HEAVY_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  const distribution = analyzeJobDurations(jobs, FAST_LANE_THRESHOLD, HEAVY_THRESHOLD);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Job Duration Distribution
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Analysis of job durations to identify future pool candidates
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {distribution.fastLane.count}
            </div>
            <div className="text-sm text-muted-foreground">Fast Lane</div>
            <div className="text-xs text-muted-foreground">&lt;30s</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {distribution.standard.count}
            </div>
            <div className="text-sm text-muted-foreground">Standard</div>
            <div className="text-xs text-muted-foreground">30s-3m</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {distribution.heavy.count}
            </div>
            <div className="text-sm text-muted-foreground">Heavy</div>
            <div className="text-xs text-muted-foreground">&gt;3m</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-600">
              {distribution.unknown.count}
            </div>
            <div className="text-sm text-muted-foreground">Unknown</div>
            <div className="text-xs text-muted-foreground">no timing</div>
          </div>
        </div>

        {/* Histogram Visualization */}
        <div className="space-y-4">
          <h4 className="font-semibold">Pool Distribution</h4>
          
          {/* Fast Lane */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  Fast Lane
                </Badge>
                <span className="text-sm">{distribution.fastLane.percentage}%</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Avg: {formatDuration(distribution.fastLane.avgDuration)}
              </div>
            </div>
            <Progress value={distribution.fastLane.percentage} className="w-full" />
            <div className="text-xs text-muted-foreground">
              Common job types: {distribution.fastLane.examples.join(", ") || "None"}
            </div>
          </div>

          {/* Standard */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                  Standard
                </Badge>
                <span className="text-sm">{distribution.standard.percentage}%</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Avg: {formatDuration(distribution.standard.avgDuration)}
              </div>
            </div>
            <Progress value={distribution.standard.percentage} className="w-full" />
            <div className="text-xs text-muted-foreground">
              Common job types: {distribution.standard.examples.join(", ") || "None"}
            </div>
          </div>

          {/* Heavy */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-orange-100 text-orange-800">
                  Heavy
                </Badge>
                <span className="text-sm">{distribution.heavy.percentage}%</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Avg: {formatDuration(distribution.heavy.avgDuration)}
              </div>
            </div>
            <Progress value={distribution.heavy.percentage} className="w-full" />
            <div className="text-xs text-muted-foreground">
              Common job types: {distribution.heavy.examples.join(", ") || "None"}
            </div>
          </div>
        </div>

        {/* Pool Separation Insights */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Pool Separation Insights
          </h4>
          <div className="space-y-2">
            <PoolSeparationInsight distribution={distribution} />
          </div>
        </div>

        {/* Performance Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              distribution.fastLane.percentage > 20 ? 'bg-green-500' : 'bg-gray-300'
            }`} />
            <span>Fast Lane Viable: {distribution.fastLane.percentage > 20 ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              distribution.heavy.percentage > 10 ? 'bg-orange-500' : 'bg-gray-300'
            }`} />
            <span>Heavy Pool Needed: {distribution.heavy.percentage > 10 ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              distribution.unknown.percentage < 10 ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span>Data Quality: {distribution.unknown.percentage < 10 ? 'Good' : 'Poor'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function analyzeJobDurations(
  jobs: Job[], 
  fastLaneThreshold: number, 
  heavyThreshold: number
): JobDurationDistribution {
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  const fastLane = { count: 0, durations: [] as number[], types: [] as string[] };
  const standard = { count: 0, durations: [] as number[], types: [] as string[] };
  const heavy = { count: 0, durations: [] as number[], types: [] as string[] };
  const unknown = { count: 0 };

  completedJobs.forEach(job => {
    if (!job.started_at || !job.completed_at) {
      unknown.count++;
      return;
    }

    const duration = job.completed_at - job.started_at;
    
    if (duration < fastLaneThreshold) {
      fastLane.count++;
      fastLane.durations.push(duration);
      fastLane.types.push(job.job_type);
    } else if (duration < heavyThreshold) {
      standard.count++;
      standard.durations.push(duration);
      standard.types.push(job.job_type);
    } else {
      heavy.count++;
      heavy.durations.push(duration);
      heavy.types.push(job.job_type);
    }
  });

  const total = completedJobs.length || 1;

  return {
    fastLane: {
      count: fastLane.count,
      percentage: Math.round((fastLane.count / total) * 100),
      avgDuration: fastLane.durations.length > 0 
        ? fastLane.durations.reduce((a, b) => a + b, 0) / fastLane.durations.length 
        : 0,
      examples: getTopJobTypes(fastLane.types, 3)
    },
    standard: {
      count: standard.count,
      percentage: Math.round((standard.count / total) * 100),
      avgDuration: standard.durations.length > 0 
        ? standard.durations.reduce((a, b) => a + b, 0) / standard.durations.length 
        : 0,
      examples: getTopJobTypes(standard.types, 3)
    },
    heavy: {
      count: heavy.count,
      percentage: Math.round((heavy.count / total) * 100),
      avgDuration: heavy.durations.length > 0 
        ? heavy.durations.reduce((a, b) => a + b, 0) / heavy.durations.length 
        : 0,
      examples: getTopJobTypes(heavy.types, 3)
    },
    unknown: {
      count: unknown.count,
      percentage: Math.round((unknown.count / total) * 100)
    }
  };
}

function getTopJobTypes(types: string[], limit: number): string[] {
  const counts = types.reduce((acc, type) => {
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([type]) => type);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function PoolSeparationInsight({ distribution }: { distribution: JobDurationDistribution }) {
  const totalJobs = distribution.fastLane.count + distribution.standard.count + distribution.heavy.count;
  
  if (totalJobs === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertTriangle className="h-4 w-4" />
        No completed jobs available for analysis
      </div>
    );
  }

  const insights = [];

  // Fast Lane analysis
  if (distribution.fastLane.percentage > 30) {
    insights.push("High volume of fast jobs - Fast Lane pool would be highly beneficial");
  } else if (distribution.fastLane.percentage > 15) {
    insights.push("Moderate fast job volume - Fast Lane pool recommended");
  }

  // Heavy job analysis
  if (distribution.heavy.percentage > 20) {
    insights.push("Significant heavy workload - Dedicated Heavy pool essential");
  } else if (distribution.heavy.percentage > 5) {
    insights.push("Some heavy jobs present - Consider specialized Heavy pool");
  }

  // Balance analysis
  if (distribution.standard.percentage > 60) {
    insights.push("Most jobs are standard duration - Current system well-suited");
  }

  // Data quality
  if (distribution.unknown.percentage > 15) {
    insights.push("⚠️ High percentage of jobs without timing data - improve tracking");
  }

  return (
    <div className="space-y-1">
      {insights.length > 0 ? (
        insights.map((insight, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {insight}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">
          • Job patterns suggest current unified system is appropriate
        </div>
      )}
    </div>
  );
}