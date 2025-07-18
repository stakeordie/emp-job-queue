import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, CheckCircle, Clock, Zap, Brain, Route } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface NorthStarGoal {
  id: string;
  category: 'foundation' | 'pools' | 'intelligence' | 'optimization';
  title: string;
  description: string;
  targetMetric: string;
  currentValue: number;
  targetValue: number;
  progress: number;
  status: 'not-started' | 'in-progress' | 'completed' | 'blocked';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dependencies: string[];
  milestones: Milestone[];
  estimatedCompletionDate: string;
  blockers: string[];
  benefits: string[];
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'pending' | 'active' | 'completed' | 'delayed';
  progress: number;
  dependencies: string[];
}

interface PhaseProgress {
  phase: string;
  description: string;
  progress: number;
  status: 'current' | 'next' | 'future' | 'completed';
  goals: string[];
  estimatedDuration: string;
  keyDeliverables: string[];
}

interface NorthStarProgressProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function NorthStarProgress({ jobs }: NorthStarProgressProps) {
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'detailed' | 'timeline'>('overview');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'foundation' | 'pools' | 'intelligence' | 'optimization'>('all');

  const goals = calculateNorthStarGoals(jobs);
  const phases = calculatePhaseProgress(goals);
  const overallProgress = calculateOverallProgress(goals);
  const filteredGoals = categoryFilter === 'all' ? goals : goals.filter(g => g.category === categoryFilter);
  const selectedGoalData = goals.find(g => g.id === selectedGoal);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          North Star Progress Tracker
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Track progress toward specialized machine pools and predictive model management
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div className="text-center space-y-4">
          <div className="space-y-2">
            <div className="text-4xl font-bold text-blue-600">
              {overallProgress.percentage}%
            </div>
            <div className="text-lg font-semibold">
              North Star Achievement
            </div>
            <Badge variant={
              overallProgress.percentage > 80 ? 'default' :
              overallProgress.percentage > 50 ? 'secondary' : 'outline'
            }>
              {overallProgress.stage}
            </Badge>
          </div>
          <Progress value={overallProgress.percentage} className="w-full" />
          <div className="text-sm text-muted-foreground">
            {overallProgress.description}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">View:</span>
            {(['overview', 'detailed', 'timeline'] as const).map((mode) => (
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
            {(['all', 'foundation', 'pools', 'intelligence', 'optimization'] as const).map((category) => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={`px-3 py-1 text-sm rounded capitalize ${
                  categoryFilter === category
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Phase Progress */}
        <div className="space-y-4">
          <h4 className="font-semibold">Implementation Phases</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {phases.map((phase) => (
              <PhaseCard key={phase.phase} phase={phase} />
            ))}
          </div>
        </div>

        {/* Goals Grid */}
        {viewMode === 'overview' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Key Goals</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredGoals.map((goal) => (
                <div
                  key={goal.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedGoal === goal.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedGoal(selectedGoal === goal.id ? null : goal.id)}
                >
                  <GoalCard goal={goal} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Detailed View */}
        {viewMode === 'detailed' && selectedGoalData && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <DetailedGoalView goal={selectedGoalData} />
          </div>
        )}

        {/* Timeline View */}
        {viewMode === 'timeline' && (
          <div className="space-y-4">
            <h4 className="font-semibold">Implementation Timeline</h4>
            <TimelineView goals={filteredGoals} />
          </div>
        )}

        {/* Key Metrics Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {goals.filter(g => g.status === 'completed').length}
            </div>
            <div className="text-sm text-muted-foreground">Goals Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {goals.filter(g => g.status === 'in-progress').length}
            </div>
            <div className="text-sm text-muted-foreground">Goals Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {goals.filter(g => g.status === 'blocked').length}
            </div>
            <div className="text-sm text-muted-foreground">Goals Blocked</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)}%
            </div>
            <div className="text-sm text-muted-foreground">Avg Progress</div>
          </div>
        </div>

        {/* Next Actions */}
        <div className="border-t pt-4">
          <NextActions goals={goals} />
        </div>
      </CardContent>
    </Card>
  );
}

function calculateNorthStarGoals(jobs: Job[]): NorthStarGoal[] {
  const completedJobs = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );

  const FAST_LANE_THRESHOLD = 30 * 1000;
  const HEAVY_THRESHOLD = 3 * 60 * 1000;

  const fastJobs = completedJobs.filter(job => 
    (job.completed_at! - job.started_at!) < FAST_LANE_THRESHOLD
  );
  const heavyJobs = completedJobs.filter(job => 
    (job.completed_at! - job.started_at!) >= HEAVY_THRESHOLD
  );

  return [
    {
      id: 'job-classification',
      category: 'foundation',
      title: 'Job Duration Classification',
      description: 'Establish clear patterns for job duration categorization',
      targetMetric: 'Jobs with clear duration patterns',
      currentValue: completedJobs.length,
      targetValue: 100,
      progress: Math.min(100, (completedJobs.length / 100) * 100),
      status: completedJobs.length >= 50 ? 'completed' : 'in-progress',
      priority: 'critical',
      dependencies: [],
      milestones: [
        {
          id: 'collect-data',
          title: 'Collect Job Duration Data',
          description: 'Gather sufficient job completion data',
          targetDate: '2024-01-15',
          status: completedJobs.length >= 50 ? 'completed' : 'active',
          progress: Math.min(100, (completedJobs.length / 50) * 100),
          dependencies: []
        }
      ],
      estimatedCompletionDate: '2024-01-20',
      blockers: completedJobs.length < 20 ? ['Insufficient job data'] : [],
      benefits: ['Enables pool separation', 'Improves routing accuracy']
    },
    {
      id: 'pool-separation',
      category: 'pools',
      title: 'Specialized Machine Pools',
      description: 'Implement separate pools for fast, standard, and heavy workloads',
      targetMetric: 'Pools successfully routing jobs',
      currentValue: 0,
      targetValue: 3,
      progress: fastJobs.length > 10 && heavyJobs.length > 5 ? 30 : 0,
      status: fastJobs.length > 10 && heavyJobs.length > 5 ? 'in-progress' : 'not-started',
      priority: 'critical',
      dependencies: ['job-classification'],
      milestones: [
        {
          id: 'fast-pool',
          title: 'Fast Lane Pool',
          description: 'Implement dedicated fast lane processing',
          targetDate: '2024-02-01',
          status: fastJobs.length > 10 ? 'active' : 'pending',
          progress: fastJobs.length > 10 ? 40 : 0,
          dependencies: ['job-classification']
        },
        {
          id: 'heavy-pool',
          title: 'Heavy Processing Pool',
          description: 'Implement dedicated heavy workload processing',
          targetDate: '2024-02-15',
          status: heavyJobs.length > 5 ? 'active' : 'pending',
          progress: heavyJobs.length > 5 ? 30 : 0,
          dependencies: ['job-classification']
        }
      ],
      estimatedCompletionDate: '2024-02-28',
      blockers: fastJobs.length < 10 ? ['Insufficient fast job volume'] : [],
      benefits: ['Eliminate resource contention', 'Improve performance consistency']
    },
    {
      id: 'intelligent-routing',
      category: 'intelligence',
      title: 'Multi-dimensional Job Router',
      description: 'Advanced routing based on job characteristics and machine capabilities',
      targetMetric: 'Routing accuracy',
      currentValue: 60,
      targetValue: 95,
      progress: 25,
      status: 'not-started',
      priority: 'high',
      dependencies: ['pool-separation'],
      milestones: [
        {
          id: 'duration-routing',
          title: 'Duration-based Routing',
          description: 'Route jobs based on expected duration',
          targetDate: '2024-03-01',
          status: 'pending',
          progress: 0,
          dependencies: ['pool-separation']
        },
        {
          id: 'model-affinity',
          title: 'Model Affinity Routing',
          description: 'Route based on required models and machine capabilities',
          targetDate: '2024-03-15',
          status: 'pending',
          progress: 0,
          dependencies: ['duration-routing']
        }
      ],
      estimatedCompletionDate: '2024-03-30',
      blockers: ['Pool separation not implemented'],
      benefits: ['Optimal job placement', 'Reduced model download times']
    },
    {
      id: 'model-intelligence',
      category: 'intelligence',
      title: 'Predictive Model Management',
      description: 'Intelligent model placement and preloading strategies',
      targetMetric: 'Model cache hit rate',
      currentValue: 20,
      targetValue: 80,
      progress: 10,
      status: 'not-started',
      priority: 'high',
      dependencies: ['pool-separation'],
      milestones: [
        {
          id: 'usage-tracking',
          title: 'Model Usage Tracking',
          description: 'Track model usage patterns across machines',
          targetDate: '2024-03-01',
          status: 'pending',
          progress: 0,
          dependencies: []
        },
        {
          id: 'predictive-placement',
          title: 'Predictive Model Placement',
          description: 'Preload models based on usage patterns',
          targetDate: '2024-04-01',
          status: 'pending',
          progress: 0,
          dependencies: ['usage-tracking']
        }
      ],
      estimatedCompletionDate: '2024-04-15',
      blockers: ['Model tracking not implemented'],
      benefits: ['Eliminate download wait times', 'Improve user experience']
    },
    {
      id: 'performance-optimization',
      category: 'optimization',
      title: 'Advanced Performance Optimization',
      description: 'ML-based demand prediction and resource scaling',
      targetMetric: 'Resource utilization efficiency',
      currentValue: 70,
      targetValue: 95,
      progress: 5,
      status: 'not-started',
      priority: 'medium',
      dependencies: ['intelligent-routing', 'model-intelligence'],
      milestones: [
        {
          id: 'demand-prediction',
          title: 'Demand Prediction',
          description: 'ML models for predicting job volume and patterns',
          targetDate: '2024-05-01',
          status: 'pending',
          progress: 0,
          dependencies: ['intelligent-routing']
        }
      ],
      estimatedCompletionDate: '2024-05-30',
      blockers: ['Prerequisites not completed'],
      benefits: ['Proactive scaling', 'Cost optimization']
    }
  ];
}

function calculatePhaseProgress(goals: NorthStarGoal[]): PhaseProgress[] {
  return [
    {
      phase: 'Foundation',
      description: 'Establish data collection and classification',
      progress: Math.round(goals.filter(g => g.category === 'foundation').reduce((sum, g) => sum + g.progress, 0) / goals.filter(g => g.category === 'foundation').length || 0),
      status: goals.some(g => g.category === 'foundation' && g.status === 'in-progress') ? 'current' : 'completed',
      goals: goals.filter(g => g.category === 'foundation').map(g => g.title),
      estimatedDuration: '2-3 weeks',
      keyDeliverables: ['Job classification system', 'Performance data collection']
    },
    {
      phase: 'Pool Implementation',
      description: 'Create specialized machine pools',
      progress: Math.round(goals.filter(g => g.category === 'pools').reduce((sum, g) => sum + g.progress, 0) / goals.filter(g => g.category === 'pools').length || 0),
      status: goals.some(g => g.category === 'foundation' && g.status === 'completed') ? 'next' : 'future',
      goals: goals.filter(g => g.category === 'pools').map(g => g.title),
      estimatedDuration: '3-4 weeks',
      keyDeliverables: ['Fast lane pool', 'Standard pool', 'Heavy processing pool']
    },
    {
      phase: 'Intelligence Layer',
      description: 'Add intelligent routing and model management',
      progress: Math.round(goals.filter(g => g.category === 'intelligence').reduce((sum, g) => sum + g.progress, 0) / goals.filter(g => g.category === 'intelligence').length || 0),
      status: 'future',
      goals: goals.filter(g => g.category === 'intelligence').map(g => g.title),
      estimatedDuration: '4-6 weeks',
      keyDeliverables: ['Multi-dimensional router', 'Predictive model placement']
    },
    {
      phase: 'Optimization',
      description: 'Advanced ML-based optimization',
      progress: Math.round(goals.filter(g => g.category === 'optimization').reduce((sum, g) => sum + g.progress, 0) / goals.filter(g => g.category === 'optimization').length || 0),
      status: 'future',
      goals: goals.filter(g => g.category === 'optimization').map(g => g.title),
      estimatedDuration: '2-3 weeks',
      keyDeliverables: ['Demand prediction', 'Autonomous scaling']
    }
  ];
}

function calculateOverallProgress(goals: NorthStarGoal[]): {
  percentage: number;
  stage: string;
  description: string;
} {
  const avgProgress = goals.reduce((sum, goal) => sum + goal.progress, 0) / goals.length;
  
  let stage = 'Early Development';
  let description = 'Building foundation for north star architecture';
  
  if (avgProgress >= 80) {
    stage = 'Advanced Implementation';
    description = 'North star architecture nearly complete';
  } else if (avgProgress >= 60) {
    stage = 'Active Implementation';
    description = 'Core features being implemented';
  } else if (avgProgress >= 30) {
    stage = 'Foundation Building';
    description = 'Establishing core capabilities';
  }
  
  return {
    percentage: Math.round(avgProgress),
    stage,
    description
  };
}

function PhaseCard({ phase }: { phase: PhaseProgress }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'current': return 'secondary';
      case 'next': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'current': return <Clock className="h-4 w-4 text-blue-600" />;
      case 'next': return <TrendingUp className="h-4 w-4 text-orange-600" />;
      default: return <Target className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon(phase.status)}
          <span className="font-medium">{phase.phase}</span>
        </div>
        <Badge variant={getStatusColor(phase.status)}>
          {phase.status}
        </Badge>
      </div>
      
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          {phase.description}
        </div>
        
        <div className="flex items-center gap-2">
          <Progress value={phase.progress} className="flex-1" />
          <span className="text-sm font-medium">{phase.progress}%</span>
        </div>
        
        <div className="text-xs text-muted-foreground">
          Duration: {phase.estimatedDuration}
        </div>
      </div>
    </div>
  );
}

function GoalCard({ goal }: { goal: NorthStarGoal }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in-progress': return 'secondary';
      case 'blocked': return 'destructive';
      default: return 'outline';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'foundation': return <Target className="h-4 w-4" />;
      case 'pools': return <Zap className="h-4 w-4" />;
      case 'intelligence': return <Brain className="h-4 w-4" />;
      case 'optimization': return <TrendingUp className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getCategoryIcon(goal.category)}
          <span className="font-medium">{goal.title}</span>
        </div>
        <Badge variant={getStatusColor(goal.status)}>
          {goal.status.replace('-', ' ')}
        </Badge>
      </div>

      <div className="text-sm text-muted-foreground">
        {goal.description}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>{goal.targetMetric}</span>
          <span className="font-medium">
            {goal.currentValue} / {goal.targetValue}
          </span>
        </div>
        <Progress value={goal.progress} className="w-full" />
      </div>

      {goal.blockers.length > 0 && (
        <div className="text-xs text-red-600">
          Blocked: {goal.blockers[0]}
        </div>
      )}
    </div>
  );
}

function DetailedGoalView({ goal }: { goal: NorthStarGoal }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h5 className="font-semibold">{goal.title}</h5>
        <Badge variant="outline">{goal.estimatedCompletionDate}</Badge>
      </div>

      {/* Milestones */}
      <div>
        <h6 className="font-medium mb-3">Milestones</h6>
        <div className="space-y-3">
          {goal.milestones.map((milestone) => (
            <div key={milestone.id} className="border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{milestone.title}</span>
                <Badge variant={
                  milestone.status === 'completed' ? 'default' :
                  milestone.status === 'active' ? 'secondary' : 'outline'
                }>
                  {milestone.status}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground mb-2">
                {milestone.description}
              </div>
              <Progress value={milestone.progress} className="w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Benefits */}
      <div>
        <h6 className="font-medium mb-2">Expected Benefits</h6>
        <div className="space-y-1">
          {goal.benefits.map((benefit, index) => (
            <div key={index} className="text-sm text-green-600">
              • {benefit}
            </div>
          ))}
        </div>
      </div>

      {/* Dependencies & Blockers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h6 className="font-medium mb-2">Dependencies</h6>
          <div className="space-y-1">
            {goal.dependencies.map((dep, index) => (
              <div key={index} className="text-sm text-muted-foreground">
                • {dep}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h6 className="font-medium mb-2">Current Blockers</h6>
          <div className="space-y-1">
            {goal.blockers.map((blocker, index) => (
              <div key={index} className="text-sm text-red-600">
                • {blocker}
              </div>
            ))}
            {goal.blockers.length === 0 && (
              <div className="text-sm text-green-600">No blockers</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineView({ goals }: { goals: NorthStarGoal[] }) {
  const sortedGoals = [...goals].sort((a, b) => 
    new Date(a.estimatedCompletionDate).getTime() - new Date(b.estimatedCompletionDate).getTime()
  );

  return (
    <div className="space-y-4">
      {sortedGoals.map((goal, index) => (
        <div key={goal.id} className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm">
              {index + 1}
            </div>
            {index < sortedGoals.length - 1 && (
              <div className="w-px h-16 bg-gray-200 mt-2" />
            )}
          </div>
          <div className="flex-1 border rounded p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{goal.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{goal.estimatedCompletionDate}</Badge>
                <Badge variant={
                  goal.status === 'completed' ? 'default' :
                  goal.status === 'in-progress' ? 'secondary' : 'outline'
                }>
                  {goal.status.replace('-', ' ')}
                </Badge>
              </div>
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              {goal.description}
            </div>
            <Progress value={goal.progress} className="w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function NextActions({ goals }: { goals: NorthStarGoal[] }) {
  const nextActions = [];
  
  // Find immediate actionable items
  const activeGoals = goals.filter(g => g.status === 'in-progress');
  const blockedGoals = goals.filter(g => g.status === 'blocked');
  const readyToStart = goals.filter(g => 
    g.status === 'not-started' && 
    g.dependencies.every(dep => goals.find(g2 => g2.id === dep)?.status === 'completed')
  );

  if (activeGoals.length > 0) {
    nextActions.push(`Continue work on ${activeGoals.length} active goals`);
  }
  
  if (blockedGoals.length > 0) {
    nextActions.push(`Resolve ${blockedGoals.length} blocked goals`);
  }
  
  if (readyToStart.length > 0) {
    nextActions.push(`${readyToStart.length} goals ready to start`);
  }

  const criticalGoals = goals.filter(g => g.priority === 'critical' && g.status !== 'completed');
  if (criticalGoals.length > 0) {
    nextActions.push(`Focus on ${criticalGoals.length} critical goals`);
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold flex items-center gap-2">
        <Route className="h-4 w-4" />
        Next Actions
      </h4>
      <div className="space-y-2">
        {nextActions.map((action, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {action}
          </div>
        ))}
        {nextActions.length === 0 && (
          <div className="text-sm text-muted-foreground">
            • All goals on track - continue monitoring progress
          </div>
        )}
      </div>
    </div>
  );
}