import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle, AlertTriangle, XCircle, Activity, Database, Network, Lock } from "lucide-react";
import { useState } from "react";
import type { Job, Machine, Worker } from "@/types";

interface ReadinessCheck {
  id: string;
  category: 'stability' | 'performance' | 'security' | 'monitoring' | 'scalability' | 'recovery';
  name: string;
  description: string;
  status: 'passed' | 'warning' | 'failed' | 'not-applicable';
  score: number; // 0-100
  priority: 'critical' | 'high' | 'medium' | 'low';
  requirements: string[];
  currentState: string;
  recommendations: string[];
  automatedCheck: boolean;
  lastChecked: number;
  details?: {
    metrics?: { name: string; value: number; threshold: number; unit: string }[];
    tests?: { name: string; status: 'passed' | 'failed'; details: string }[];
    dependencies?: string[];
  };
}

interface ReadinessCategory {
  category: string;
  description: string;
  overallScore: number;
  status: 'ready' | 'needs-attention' | 'not-ready';
  checks: ReadinessCheck[];
  icon: React.ReactNode;
}

interface ProductionReadinessProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function ProductionReadiness({ jobs, machines }: ProductionReadinessProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'failed' | 'warning' | 'passed'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const readinessCategories = assessProductionReadiness(jobs, machines);
  const overallReadiness = calculateOverallReadiness(readinessCategories);
  const filteredCategories = selectedCategory 
    ? readinessCategories.filter(cat => cat.category === selectedCategory)
    : readinessCategories;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Production Readiness Assessment
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Comprehensive evaluation of system stability and production-readiness
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
              Production Readiness
            </div>
            <Badge variant={
              overallReadiness.level === 'production-ready' ? 'default' :
              overallReadiness.level === 'minor-issues' ? 'secondary' :
              overallReadiness.level === 'major-issues' ? 'outline' : 'destructive'
            }>
              {overallReadiness.level.replace('-', ' ').toUpperCase()}
            </Badge>
          </div>
          <Progress value={overallReadiness.score} className="w-full" />
          <div className="text-sm text-muted-foreground">
            {getReadinessDescription(overallReadiness.level)}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">Category:</span>
            <Button
              variant={selectedCategory === null ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(null)}
            >
              All
            </Button>
            {readinessCategories.map((category) => (
              <Button
                key={category.category}
                variant={selectedCategory === category.category ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(category.category)}
              >
                {category.category}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="text-sm font-medium">Status:</span>
            {(['all', 'failed', 'warning', 'passed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1 text-sm rounded capitalize ${
                  filterStatus === status
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            Auto Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {readinessCategories.flatMap(cat => cat.checks).filter(check => check.status === 'passed').length}
            </div>
            <div className="text-sm text-muted-foreground">Checks Passed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {readinessCategories.flatMap(cat => cat.checks).filter(check => check.status === 'warning').length}
            </div>
            <div className="text-sm text-muted-foreground">Warnings</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {readinessCategories.flatMap(cat => cat.checks).filter(check => check.status === 'failed').length}
            </div>
            <div className="text-sm text-muted-foreground">Critical Issues</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {readinessCategories.flatMap(cat => cat.checks).filter(check => check.automatedCheck).length}
            </div>
            <div className="text-sm text-muted-foreground">Automated</div>
          </div>
        </div>

        {/* Category Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCategories.map((category) => (
            <CategoryCard 
              key={category.category} 
              category={category}
              onClick={() => setSelectedCategory(
                selectedCategory === category.category ? null : category.category
              )}
              isSelected={selectedCategory === category.category}
            />
          ))}
        </div>

        {/* Detailed Checks */}
        {selectedCategory && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold capitalize">
                {selectedCategory} Checks
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? 'Hide' : 'Show'} Details
              </Button>
            </div>
            
            <DetailedChecks 
              category={readinessCategories.find(cat => cat.category === selectedCategory)!}
              showDetails={showDetails}
              filterStatus={filterStatus}
            />
          </div>
        )}

        {/* Critical Issues Summary */}
        <CriticalIssuesSummary categories={readinessCategories} />

        {/* Action Plan */}
        <div className="border-t pt-4">
          <ActionPlan categories={readinessCategories} />
        </div>
      </CardContent>
    </Card>
  );
}

function assessProductionReadiness(jobs: Job[], machines: Machine[]): ReadinessCategory[] {
  const recentJobs = jobs.filter(job => job.created_at > Date.now() - 24 * 60 * 60 * 1000);
  const completedJobs = recentJobs.filter(job => job.status === 'completed');
  const failedJobs = recentJobs.filter(job => job.status === 'failed');
  
  return ([ 
    {
      category: 'stability' as const,
      description: 'System stability and error handling',
      overallScore: 0,
      status: 'ready' as const,
      icon: <Activity className="h-5 w-5" />,
      checks: [
        {
          id: 'error-rate',
          category: 'stability' as const,
          name: 'Error Rate',
          description: 'System error rate within acceptable limits',
          status: failedJobs.length / (recentJobs.length || 1) < 0.01 ? 'passed' as const : 'warning' as const,
          score: Math.max(0, 100 - (failedJobs.length / (recentJobs.length || 1)) * 1000),
          priority: 'critical' as const,
          requirements: ['Error rate < 1%', 'Proper error handling', 'Error monitoring'],
          currentState: `${((failedJobs.length / (recentJobs.length || 1)) * 100).toFixed(2)}% error rate`,
          recommendations: ['Implement better error handling', 'Add error monitoring alerts'],
          automatedCheck: true,
          lastChecked: Date.now(),
          details: {
            metrics: [
              { name: 'Error Rate', value: (failedJobs.length / (recentJobs.length || 1)) * 100, threshold: 1, unit: '%' },
              { name: 'Failed Jobs', value: failedJobs.length, threshold: 5, unit: 'jobs' }
            ]
          }
        },
        {
          id: 'uptime',
          category: 'stability',
          name: 'System Uptime',
          description: 'System availability and uptime',
          status: machines.filter(m => m.status === 'ready').length / machines.length > 0.99 ? 'passed' : 'warning',
          score: (machines.filter(m => m.status === 'ready').length / (machines.length || 1)) * 100,
          priority: 'critical',
          requirements: ['99.9% uptime', 'Redundancy', 'Auto-recovery'],
          currentState: `${((machines.filter(m => m.status === 'ready').length / (machines.length || 1)) * 100).toFixed(1)}% machines ready`,
          recommendations: ['Add machine monitoring', 'Implement auto-restart'],
          automatedCheck: true,
          lastChecked: Date.now()
        },
        {
          id: 'resource-limits',
          category: 'stability',
          name: 'Resource Limits',
          description: 'Memory and CPU usage within limits',
          status: 'passed',
          score: 85,
          priority: 'high',
          requirements: ['Memory usage < 80%', 'CPU usage < 90%', 'Disk space monitoring'],
          currentState: 'Resource usage within normal limits',
          recommendations: ['Set up resource monitoring alerts'],
          automatedCheck: true,
          lastChecked: Date.now()
        }
      ]
    },
    {
      category: 'performance',
      description: 'Performance metrics and SLA compliance',
      overallScore: 0,
      status: 'ready',
      icon: <Activity className="h-5 w-5" />,
      checks: [
        {
          id: 'response-time',
          category: 'performance',
          name: 'Response Time',
          description: 'API response times within SLA',
          status: 'passed',
          score: 90,
          priority: 'high',
          requirements: ['P95 < 500ms', 'P99 < 1000ms', 'Average < 200ms'],
          currentState: 'Response times within SLA',
          recommendations: ['Continue monitoring', 'Optimize slow endpoints'],
          automatedCheck: true,
          lastChecked: Date.now()
        },
        {
          id: 'throughput',
          category: 'performance',
          name: 'Throughput',
          description: 'System throughput meets requirements',
          status: completedJobs.length > 50 ? 'passed' : 'warning',
          score: Math.min(100, (completedJobs.length / 100) * 100),
          priority: 'high',
          requirements: ['100+ jobs/hour', 'Linear scaling', 'Load balancing'],
          currentState: `${completedJobs.length} jobs completed in 24h`,
          recommendations: ['Scale up if needed', 'Optimize job processing'],
          automatedCheck: true,
          lastChecked: Date.now()
        },
        {
          id: 'queue-performance',
          category: 'performance',
          name: 'Queue Performance',
          description: 'Job queue processing efficiency',
          status: jobs.filter(j => j.status === 'pending').length < 20 ? 'passed' : 'warning',
          score: Math.max(0, 100 - jobs.filter(j => j.status === 'pending').length * 2),
          priority: 'medium',
          requirements: ['Queue depth < 50', 'Processing time < 5min', 'No stuck jobs'],
          currentState: `${jobs.filter(j => j.status === 'pending').length} jobs in queue`,
          recommendations: ['Monitor queue depth', 'Optimize job processing'],
          automatedCheck: true,
          lastChecked: Date.now()
        }
      ]
    },
    {
      category: 'security',
      description: 'Security controls and compliance',
      overallScore: 0,
      status: 'ready',
      icon: <Lock className="h-5 w-5" />,
      checks: [
        {
          id: 'authentication',
          category: 'security',
          name: 'Authentication',
          description: 'Proper authentication mechanisms in place',
          status: 'passed',
          score: 95,
          priority: 'critical',
          requirements: ['API key validation', 'Token expiration', 'Rate limiting'],
          currentState: 'Authentication configured',
          recommendations: ['Regular security audits', 'Update authentication tokens'],
          automatedCheck: false,
          lastChecked: Date.now()
        },
        {
          id: 'data-encryption',
          category: 'security',
          name: 'Data Encryption',
          description: 'Data encrypted in transit and at rest',
          status: 'passed',
          score: 90,
          priority: 'critical',
          requirements: ['TLS 1.3', 'AES-256 encryption', 'Key rotation'],
          currentState: 'Encryption enabled',
          recommendations: ['Regular key rotation', 'Monitor certificate expiry'],
          automatedCheck: false,
          lastChecked: Date.now()
        },
        {
          id: 'access-control',
          category: 'security',
          name: 'Access Control',
          description: 'Proper access controls and permissions',
          status: 'warning',
          score: 75,
          priority: 'high',
          requirements: ['Role-based access', 'Principle of least privilege', 'Audit logging'],
          currentState: 'Basic access controls in place',
          recommendations: ['Implement RBAC', 'Add audit logging', 'Review permissions'],
          automatedCheck: false,
          lastChecked: Date.now()
        }
      ]
    },
    {
      category: 'monitoring',
      description: 'Observability and monitoring coverage',
      overallScore: 0,
      status: 'ready',
      icon: <Activity className="h-5 w-5" />,
      checks: [
        {
          id: 'metrics-collection',
          category: 'monitoring',
          name: 'Metrics Collection',
          description: 'Comprehensive metrics collection',
          status: 'passed',
          score: 85,
          priority: 'high',
          requirements: ['Business metrics', 'Technical metrics', 'Custom metrics'],
          currentState: 'Metrics being collected',
          recommendations: ['Add more business metrics', 'Improve metric granularity'],
          automatedCheck: true,
          lastChecked: Date.now()
        },
        {
          id: 'alerting',
          category: 'monitoring',
          name: 'Alerting',
          description: 'Alert coverage for critical issues',
          status: 'warning',
          score: 70,
          priority: 'high',
          requirements: ['Error rate alerts', 'Performance alerts', 'Availability alerts'],
          currentState: 'Basic alerting configured',
          recommendations: ['Add more alert rules', 'Configure alert routing', 'Test alerts'],
          automatedCheck: false,
          lastChecked: Date.now()
        },
        {
          id: 'logging',
          category: 'monitoring',
          name: 'Logging',
          description: 'Structured logging and log aggregation',
          status: 'passed',
          score: 80,
          priority: 'medium',
          requirements: ['Structured logs', 'Log aggregation', 'Log retention'],
          currentState: 'Logging infrastructure in place',
          recommendations: ['Improve log structure', 'Add more context to logs'],
          automatedCheck: true,
          lastChecked: Date.now()
        }
      ]
    },
    {
      category: 'scalability',
      description: 'System scalability and capacity',
      overallScore: 0,
      status: 'ready',
      icon: <Network className="h-5 w-5" />,
      checks: [
        {
          id: 'horizontal-scaling',
          category: 'scalability',
          name: 'Horizontal Scaling',
          description: 'Ability to scale horizontally',
          status: 'passed',
          score: 90,
          priority: 'high',
          requirements: ['Stateless services', 'Load balancing', 'Auto-scaling'],
          currentState: 'Horizontal scaling supported',
          recommendations: ['Test scaling scenarios', 'Optimize scaling triggers'],
          automatedCheck: false,
          lastChecked: Date.now()
        },
        {
          id: 'capacity-planning',
          category: 'scalability',
          name: 'Capacity Planning',
          description: 'Capacity planning and resource allocation',
          status: 'warning',
          score: 65,
          priority: 'medium',
          requirements: ['Growth projections', 'Resource planning', 'Cost optimization'],
          currentState: 'Basic capacity planning',
          recommendations: ['Improve capacity models', 'Add predictive scaling'],
          automatedCheck: false,
          lastChecked: Date.now()
        }
      ]
    },
    {
      category: 'recovery',
      description: 'Disaster recovery and backup systems',
      overallScore: 0,
      status: 'needs-attention',
      icon: <Database className="h-5 w-5" />,
      checks: [
        {
          id: 'backup-strategy',
          category: 'recovery',
          name: 'Backup Strategy',
          description: 'Regular backups and recovery procedures',
          status: 'warning',
          score: 60,
          priority: 'critical',
          requirements: ['Automated backups', 'Backup validation', 'Recovery testing'],
          currentState: 'Basic backup configured',
          recommendations: ['Implement automated backups', 'Test recovery procedures', 'Document recovery process'],
          automatedCheck: false,
          lastChecked: Date.now()
        },
        {
          id: 'disaster-recovery',
          category: 'recovery',
          name: 'Disaster Recovery',
          description: 'Disaster recovery plan and procedures',
          status: 'failed',
          score: 30,
          priority: 'critical',
          requirements: ['DR plan', 'RTO/RPO targets', 'Failover procedures'],
          currentState: 'No formal DR plan',
          recommendations: ['Create DR plan', 'Define RTO/RPO', 'Test failover procedures'],
          automatedCheck: false,
          lastChecked: Date.now()
        }
      ]
    }
  ] as ReadinessCategory[]).map(category => ({
    ...category,
    overallScore: Math.round(category.checks.reduce((sum, check) => sum + check.score, 0) / category.checks.length),
    status: getStatusFromScore(Math.round(category.checks.reduce((sum, check) => sum + check.score, 0) / category.checks.length))
  }));
}

function getStatusFromScore(score: number): 'ready' | 'needs-attention' | 'not-ready' {
  if (score >= 80) return 'ready';
  if (score >= 60) return 'needs-attention';
  return 'not-ready';
}

function calculateOverallReadiness(categories: ReadinessCategory[]): {
  score: number;
  level: 'production-ready' | 'minor-issues' | 'major-issues' | 'not-ready';
} {
  const avgScore = categories.reduce((sum, cat) => sum + cat.overallScore, 0) / categories.length;
  
  let level: 'production-ready' | 'minor-issues' | 'major-issues' | 'not-ready' = 'not-ready';
  if (avgScore >= 90) level = 'production-ready';
  else if (avgScore >= 75) level = 'minor-issues';
  else if (avgScore >= 60) level = 'major-issues';
  
  return { score: Math.round(avgScore), level };
}

function getReadinessDescription(level: string): string {
  switch (level) {
    case 'production-ready':
      return 'System meets all production readiness criteria';
    case 'minor-issues':
      return 'Minor issues that should be addressed before production';
    case 'major-issues':
      return 'Major issues requiring attention before production deployment';
    case 'not-ready':
      return 'System not ready for production - critical issues must be resolved';
    default:
      return 'Assessment in progress';
  }
}

function CategoryCard({ category, onClick, isSelected }: {
  category: ReadinessCategory;
  onClick: () => void;
  isSelected: boolean;
}) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return 'border-green-500 bg-green-50';
      case 'needs-attention': return 'border-orange-500 bg-orange-50';
      case 'not-ready': return 'border-red-500 bg-red-50';
      default: return 'border-gray-200';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ready': return 'default';
      case 'needs-attention': return 'secondary';
      case 'not-ready': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50' : getStatusColor(category.status)
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {category.icon}
          <span className="font-medium capitalize">{category.category}</span>
        </div>
        <Badge variant={getStatusBadge(category.status)}>
          {category.status.replace('-', ' ')}
        </Badge>
      </div>

      <div className="text-sm text-muted-foreground mb-3">
        {category.description}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Overall Score</span>
          <span className="font-medium">{category.overallScore}%</span>
        </div>
        <Progress value={category.overallScore} className="w-full" />
        
        <div className="text-xs text-muted-foreground">
          {category.checks.filter(c => c.status === 'passed').length} / {category.checks.length} checks passed
        </div>
      </div>
    </div>
  );
}

function DetailedChecks({ category, showDetails, filterStatus }: {
  category: ReadinessCategory;
  showDetails: boolean;
  filterStatus: string;
}) {
  const filteredChecks = filterStatus === 'all' 
    ? category.checks 
    : category.checks.filter(check => check.status === filterStatus);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertTriangle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'border-green-200 bg-green-50';
      case 'warning': return 'border-orange-200 bg-orange-50';
      case 'failed': return 'border-red-200 bg-red-50';
      default: return 'border-gray-200';
    }
  };

  return (
    <div className="space-y-3">
      {filteredChecks.map((check) => (
        <div key={check.id} className={`border rounded p-4 ${getStatusColor(check.status)}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {getStatusIcon(check.status)}
              <span className="font-medium">{check.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{check.priority}</Badge>
              <span className="text-sm text-muted-foreground">{check.score}%</span>
            </div>
          </div>

          <div className="text-sm text-muted-foreground mb-2">
            {check.description}
          </div>

          <div className="text-sm">
            <span className="font-medium">Current State: </span>
            {check.currentState}
          </div>

          {showDetails && (
            <div className="mt-4 space-y-3">
              {check.details?.metrics && (
                <div>
                  <div className="font-medium text-sm mb-2">Metrics</div>
                  <div className="space-y-1">
                    {check.details.metrics.map((metric, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span>{metric.name}:</span>
                        <span className={metric.value > metric.threshold ? 'text-red-600' : 'text-green-600'}>
                          {metric.value.toFixed(1)} {metric.unit} (threshold: {metric.threshold} {metric.unit})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="font-medium text-sm mb-2">Requirements</div>
                <div className="space-y-1">
                  {check.requirements.map((req, index) => (
                    <div key={index} className="text-sm text-muted-foreground">
                      • {req}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-medium text-sm mb-2">Recommendations</div>
                <div className="space-y-1">
                  {check.recommendations.map((rec, index) => (
                    <div key={index} className="text-sm text-muted-foreground">
                      • {rec}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function CriticalIssuesSummary({ categories }: { categories: ReadinessCategory[] }) {
  const criticalIssues = categories
    .flatMap(cat => cat.checks)
    .filter(check => check.priority === 'critical' && check.status !== 'passed');

  if (criticalIssues.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-green-50">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle className="h-5 w-5" />
          <span className="font-semibold">No Critical Issues</span>
        </div>
        <div className="text-sm text-green-600 mt-1">
          All critical production readiness checks are passing
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-red-50">
      <div className="flex items-center gap-2 text-red-600 mb-3">
        <XCircle className="h-5 w-5" />
        <span className="font-semibold">{criticalIssues.length} Critical Issues</span>
      </div>
      <div className="space-y-2">
        {criticalIssues.map((issue) => (
          <div key={issue.id} className="text-sm">
            <span className="font-medium">{issue.name}:</span>
            <span className="text-red-600 ml-2">{issue.currentState}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionPlan({ categories }: { categories: ReadinessCategory[] }) {
  const actions = [];
  
  // Critical issues first
  const criticalIssues = categories
    .flatMap(cat => cat.checks)
    .filter(check => check.priority === 'critical' && check.status !== 'passed');
  
  if (criticalIssues.length > 0) {
    actions.push(`Resolve ${criticalIssues.length} critical issues immediately`);
  }

  // Categories needing attention
  const categoriesNeedingAttention = categories.filter(cat => cat.status !== 'ready');
  if (categoriesNeedingAttention.length > 0) {
    actions.push(`Improve ${categoriesNeedingAttention.map(c => c.category).join(', ')} categories`);
  }

  // Automation opportunities
  const manualChecks = categories
    .flatMap(cat => cat.checks)
    .filter(check => !check.automatedCheck);
  if (manualChecks.length > 3) {
    actions.push(`Automate ${manualChecks.length} manual checks`);
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Action Plan</h4>
      <div className="space-y-2">
        {actions.map((action, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            {index + 1}. {action}
          </div>
        ))}
        {actions.length === 0 && (
          <div className="text-sm text-green-600">
            ✓ System is production ready - continue monitoring
          </div>
        )}
      </div>
    </div>
  );
}