import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, Play, Pause, RotateCcw, AlertTriangle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import type { Job, Machine, Worker } from "@/types";

interface FlowNode {
  id: string;
  type: 'client' | 'api' | 'redis' | 'worker' | 'service';
  label: string;
  position: { x: number; y: number };
  status: 'active' | 'busy' | 'idle' | 'error';
  connections: string[];
  metrics: {
    throughput: number;
    latency: number;
    queueSize: number;
    errorRate: number;
  };
}

interface FlowConnection {
  id: string;
  from: string;
  to: string;
  type: 'job-submit' | 'job-claim' | 'job-result' | 'heartbeat';
  status: 'active' | 'congested' | 'error';
  metrics: {
    jobsPerSecond: number;
    avgLatency: number;
    errorCount: number;
  };
  recentJobs: string[];
}

interface AnimatedJob {
  id: string;
  connectionId: string;
  progress: number; // 0-100
  startTime: number;
  jobType: string;
  priority: number;
  poolTarget?: 'fast-lane' | 'standard' | 'heavy';
}

interface JobFlowDiagramProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function JobFlowDiagram({ jobs, machines, workers }: JobFlowDiagramProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'5m' | '15m' | '1h'>('15m');
  const [animatedJobs, setAnimatedJobs] = useState<AnimatedJob[]>([]);
  const [showPoolRouting, setShowPoolRouting] = useState(false);
  const animationRef = useRef<number | undefined>(undefined);

  const flowData = generateFlowTopology(jobs, machines, workers, timeRange);
  const bottlenecks = identifyBottlenecks(flowData.nodes, flowData.connections);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) return;

    const animate = () => {
      setAnimatedJobs(prev => {
        // Update existing jobs
        const updated = prev.map(job => ({
          ...job,
          progress: Math.min(100, job.progress + 2)
        })).filter(job => job.progress < 100);

        // Add new jobs occasionally
        if (Math.random() < 0.1 && updated.length < 10) {
          const connections = flowData.connections.filter(c => c.type === 'job-submit');
          if (connections.length > 0) {
            const connection = connections[Math.floor(Math.random() * connections.length)];
            const newJob = createAnimatedJob(connection.id, jobs);
            updated.push(newJob);
          }
        }

        return updated;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, flowData.connections, jobs]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Real-Time Job Flow
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Live visualization of job routing through the system
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <Button
              variant={isPlaying ? "default" : "outline"}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAnimatedJobs([])}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>

          <div className="flex gap-2">
            <span className="text-sm font-medium">Time Range:</span>
            {(['5m', '15m', '1h'] as const).map((range) => (
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

          <Button
            variant={showPoolRouting ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPoolRouting(!showPoolRouting)}
          >
            Pool Routing
          </Button>
        </div>

        {/* Flow Diagram */}
        <div className="relative border rounded-lg p-6 bg-gray-50 overflow-hidden" style={{ height: '500px' }}>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 800 400"
            className="absolute inset-0"
          >
            {/* Connections */}
            {flowData.connections.map((connection) => {
              const fromNode = flowData.nodes.find(n => n.id === connection.from);
              const toNode = flowData.nodes.find(n => n.id === connection.to);
              if (!fromNode || !toNode) return null;

              return (
                <FlowConnectionSVG
                  key={connection.id}
                  connection={connection}
                  fromNode={fromNode}
                  toNode={toNode}
                  animatedJobs={animatedJobs.filter(j => j.connectionId === connection.id)}
                  showPoolRouting={showPoolRouting}
                />
              );
            })}

            {/* Nodes */}
            {flowData.nodes.map((node) => (
              <FlowNodeSVG
                key={node.id}
                node={node}
                isSelected={selectedNode === node.id}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                isBottleneck={bottlenecks.includes(node.id)}
              />
            ))}
          </svg>
        </div>

        {/* Node Details */}
        {selectedNode && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <NodeDetailsPanel 
              node={flowData.nodes.find(n => n.id === selectedNode)!}
              connections={flowData.connections.filter(c => c.from === selectedNode || c.to === selectedNode)}
            />
          </div>
        )}

        {/* System Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {animatedJobs.length}
            </div>
            <div className="text-sm text-muted-foreground">Active Jobs</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {calculateSystemThroughput(flowData.connections)}
            </div>
            <div className="text-sm text-muted-foreground">Jobs/Min</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {calculateAvgLatency(flowData.connections)}ms
            </div>
            <div className="text-sm text-muted-foreground">Avg Latency</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">
              {bottlenecks.length}
            </div>
            <div className="text-sm text-muted-foreground">Bottlenecks</div>
          </div>
        </div>

        {/* Bottleneck Analysis */}
        {bottlenecks.length > 0 && (
          <BottleneckAnalysis 
            bottlenecks={bottlenecks}
            nodes={flowData.nodes}
          />
        )}
      </CardContent>
    </Card>
  );
}

function generateFlowTopology(jobs: Job[], machines: Machine[], workers: Worker[], timeRange: string): {
  nodes: FlowNode[];
  connections: FlowConnection[];
} {
  const timeRangeMs = {
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000
  }[timeRange] || 15 * 60 * 1000; // Default to 15 minutes

  const cutoffTime = Date.now() - timeRangeMs;
  const recentJobs = jobs.filter(job => job.created_at > cutoffTime);

  // Define nodes
  const nodes: FlowNode[] = [
    {
      id: 'client',
      type: 'client',
      label: 'Client',
      position: { x: 50, y: 200 },
      status: recentJobs.length > 0 ? 'active' : 'idle',
      connections: ['api'],
      metrics: {
        throughput: recentJobs.length,
        latency: 0,
        queueSize: 0,
        errorRate: 0
      }
    },
    {
      id: 'api',
      type: 'api',
      label: 'API Server',
      position: { x: 200, y: 200 },
      status: 'active',
      connections: ['redis'],
      metrics: {
        throughput: recentJobs.length,
        latency: 50,
        queueSize: jobs.filter(j => j.status === 'pending').length,
        errorRate: 0
      }
    },
    {
      id: 'redis',
      type: 'redis',
      label: 'Redis Queue',
      position: { x: 350, y: 200 },
      status: jobs.filter(j => j.status === 'pending').length > 10 ? 'busy' : 'active',
      connections: ['worker-pool'],
      metrics: {
        throughput: recentJobs.length,
        latency: 25,
        queueSize: jobs.filter(j => j.status === 'pending').length,
        errorRate: 0
      }
    },
    {
      id: 'worker-pool',
      type: 'worker',
      label: 'Worker Pool',
      position: { x: 500, y: 200 },
      status: workers.some(w => w.status === 'busy') ? 'busy' : 'active',
      connections: ['comfyui-services'],
      metrics: {
        throughput: workers.filter(w => w.status === 'busy').length,
        latency: 100,
        queueSize: 0,
        errorRate: workers.filter(w => w.status === 'error').length / (workers.length || 1) * 100
      }
    },
    {
      id: 'comfyui-services',
      type: 'service',
      label: 'ComfyUI Services',
      position: { x: 650, y: 200 },
      status: workers.some(w => w.status === 'busy') ? 'busy' : 'active',
      connections: [],
      metrics: {
        throughput: recentJobs.filter(j => j.status === 'completed').length,
        latency: 5000,
        queueSize: 0,
        errorRate: recentJobs.filter(j => j.status === 'failed').length / (recentJobs.length || 1) * 100
      }
    }
  ];

  // Define connections
  const connections: FlowConnection[] = [
    {
      id: 'client-api',
      from: 'client',
      to: 'api',
      type: 'job-submit',
      status: 'active',
      metrics: {
        jobsPerSecond: recentJobs.length / (timeRangeMs / 1000),
        avgLatency: 50,
        errorCount: 0
      },
      recentJobs: recentJobs.slice(0, 5).map(j => j.id)
    },
    {
      id: 'api-redis',
      from: 'api',
      to: 'redis',
      type: 'job-submit',
      status: jobs.filter(j => j.status === 'pending').length > 20 ? 'congested' : 'active',
      metrics: {
        jobsPerSecond: recentJobs.length / (timeRangeMs / 1000),
        avgLatency: 75,
        errorCount: 0
      },
      recentJobs: recentJobs.slice(0, 5).map(j => j.id)
    },
    {
      id: 'redis-worker',
      from: 'redis',
      to: 'worker-pool',
      type: 'job-claim',
      status: 'active',
      metrics: {
        jobsPerSecond: workers.filter(w => w.status === 'busy').length,
        avgLatency: 125,
        errorCount: 0
      },
      recentJobs: recentJobs.filter(j => j.status !== 'pending').slice(0, 5).map(j => j.id)
    },
    {
      id: 'worker-service',
      from: 'worker-pool',
      to: 'comfyui-services',
      type: 'job-submit',
      status: 'active',
      metrics: {
        jobsPerSecond: workers.filter(w => w.status === 'busy').length,
        avgLatency: 5125,
        errorCount: recentJobs.filter(j => j.status === 'failed').length
      },
      recentJobs: recentJobs.filter(j => j.status === 'active' || j.status === 'processing').slice(0, 5).map(j => j.id)
    }
  ];

  return { nodes, connections };
}

function createAnimatedJob(connectionId: string, jobs: Job[]): AnimatedJob {
  const recentJob = jobs[Math.floor(Math.random() * Math.min(jobs.length, 10))];
  const duration = recentJob?.completed_at && recentJob?.started_at 
    ? recentJob.completed_at - recentJob.started_at 
    : 60000;

  let poolTarget: 'fast-lane' | 'standard' | 'heavy' | undefined;
  if (duration < 30000) poolTarget = 'fast-lane';
  else if (duration > 180000) poolTarget = 'heavy';
  else poolTarget = 'standard';

  return {
    id: `animated-${Date.now()}-${Math.random()}`,
    connectionId,
    progress: 0,
    startTime: Date.now(),
    jobType: recentJob?.job_type || 'unknown',
    priority: recentJob?.priority || 1,
    poolTarget
  };
}

function identifyBottlenecks(nodes: FlowNode[], connections: FlowConnection[]): string[] {
  const bottlenecks: string[] = [];
  
  // High queue size
  nodes.forEach(node => {
    if (node.metrics.queueSize > 10) {
      bottlenecks.push(node.id);
    }
    if (node.metrics.errorRate > 5) {
      bottlenecks.push(node.id);
    }
  });

  // Congested connections
  connections.forEach(connection => {
    if (connection.status === 'congested' || connection.metrics.errorCount > 0) {
      bottlenecks.push(connection.to);
    }
  });

  return [...new Set(bottlenecks)];
}

function FlowNodeSVG({ node, isSelected, onClick, isBottleneck }: {
  node: FlowNode;
  isSelected: boolean;
  onClick: () => void;
  isBottleneck: boolean;
}) {
  const getNodeColor = () => {
    if (isBottleneck) return '#ef4444'; // red
    switch (node.status) {
      case 'active': return '#10b981'; // green
      case 'busy': return '#f59e0b'; // orange
      case 'error': return '#ef4444'; // red
      default: return '#6b7280'; // gray
    }
  };

  const getNodeIcon = () => {
    switch (node.type) {
      case 'client': return '👤';
      case 'api': return '🔧';
      case 'redis': return '📦';
      case 'worker': return '⚡';
      case 'service': return '🎨';
      default: return '⚪';
    }
  };

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle
        cx={node.position.x}
        cy={node.position.y}
        r={isSelected ? 25 : 20}
        fill={getNodeColor()}
        stroke={isSelected ? '#3b82f6' : '#ffffff'}
        strokeWidth={isSelected ? 3 : 2}
        opacity={0.9}
      />
      <text
        x={node.position.x}
        y={node.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="16"
      >
        {getNodeIcon()}
      </text>
      <text
        x={node.position.x}
        y={node.position.y + 35}
        textAnchor="middle"
        fontSize="12"
        fill="#374151"
        fontWeight="500"
      >
        {node.label}
      </text>
      {node.metrics.queueSize > 0 && (
        <text
          x={node.position.x + 25}
          y={node.position.y - 15}
          textAnchor="middle"
          fontSize="10"
          fill="#ef4444"
          fontWeight="bold"
        >
          {node.metrics.queueSize}
        </text>
      )}
    </g>
  );
}

function FlowConnectionSVG({ connection, fromNode, toNode, animatedJobs, showPoolRouting }: {
  connection: FlowConnection;
  fromNode: FlowNode;
  toNode: FlowNode;
  animatedJobs: AnimatedJob[];
  showPoolRouting: boolean;
}) {
  const getConnectionColor = () => {
    switch (connection.status) {
      case 'congested': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getConnectionWidth = () => {
    return Math.max(1, Math.min(5, connection.metrics.jobsPerSecond));
  };

  return (
    <g>
      <line
        x1={fromNode.position.x}
        y1={fromNode.position.y}
        x2={toNode.position.x}
        y2={toNode.position.y}
        stroke={getConnectionColor()}
        strokeWidth={getConnectionWidth()}
        opacity={0.6}
        markerEnd="url(#arrowhead)"
      />
      
      {/* Animated jobs */}
      {animatedJobs.map((job) => {
        const progress = job.progress / 100;
        const x = fromNode.position.x + (toNode.position.x - fromNode.position.x) * progress;
        const y = fromNode.position.y + (toNode.position.y - fromNode.position.y) * progress;
        
        const getJobColor = () => {
          if (!showPoolRouting) return '#3b82f6';
          switch (job.poolTarget) {
            case 'fast-lane': return '#10b981';
            case 'heavy': return '#f59e0b';
            default: return '#3b82f6';
          }
        };

        return (
          <circle
            key={job.id}
            cx={x}
            cy={y}
            r={3}
            fill={getJobColor()}
            opacity={0.8}
          >
            <title>{`Job: ${job.jobType} (Priority: ${job.priority})`}</title>
          </circle>
        );
      })}
      
      {/* Arrow marker definition */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon
            points="0 0, 10 3.5, 0 7"
            fill={getConnectionColor()}
          />
        </marker>
      </defs>
    </g>
  );
}

function NodeDetailsPanel({ node, connections }: {
  node: FlowNode;
  connections: FlowConnection[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h5 className="font-semibold">{node.label}</h5>
        <Badge variant={
          node.status === 'active' ? 'default' :
          node.status === 'busy' ? 'secondary' :
          node.status === 'error' ? 'destructive' : 'outline'
        }>
          {node.status}
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="font-medium">Throughput</div>
          <div className="text-muted-foreground">{node.metrics.throughput}</div>
        </div>
        <div>
          <div className="font-medium">Latency</div>
          <div className="text-muted-foreground">{node.metrics.latency}ms</div>
        </div>
        <div>
          <div className="font-medium">Queue Size</div>
          <div className="text-muted-foreground">{node.metrics.queueSize}</div>
        </div>
        <div>
          <div className="font-medium">Error Rate</div>
          <div className="text-muted-foreground">{node.metrics.errorRate.toFixed(1)}%</div>
        </div>
      </div>
      
      <div>
        <div className="font-medium mb-2">Connections</div>
        <div className="space-y-2">
          {connections.map((connection) => (
            <div key={connection.id} className="flex items-center justify-between text-sm border rounded p-2">
              <span>{connection.from === node.id ? `→ ${connection.to}` : `← ${connection.from}`}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {connection.type}
                </Badge>
                <span className="text-muted-foreground">
                  {connection.metrics.jobsPerSecond.toFixed(1)} j/s
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BottleneckAnalysis({ bottlenecks, nodes }: {
  bottlenecks: string[];
  nodes: FlowNode[];
}) {
  return (
    <div className="border rounded-lg p-4 bg-red-50">
      <h4 className="font-semibold mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        Bottleneck Analysis
      </h4>
      <div className="space-y-2">
        {bottlenecks.map((nodeId) => {
          const node = nodes.find(n => n.id === nodeId);
          if (!node) return null;
          
          const issues = [];
          if (node.metrics.queueSize > 10) issues.push(`High queue size: ${node.metrics.queueSize}`);
          if (node.metrics.errorRate > 5) issues.push(`High error rate: ${node.metrics.errorRate.toFixed(1)}%`);
          if (node.metrics.latency > 1000) issues.push(`High latency: ${node.metrics.latency}ms`);
          
          return (
            <div key={nodeId} className="text-sm">
              <span className="font-medium text-red-700">{node.label}:</span>
              <span className="text-red-600 ml-2">{issues.join(', ')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function calculateSystemThroughput(connections: FlowConnection[]): number {
  return Math.round(connections.reduce((sum, conn) => sum + conn.metrics.jobsPerSecond, 0) * 60);
}

function calculateAvgLatency(connections: FlowConnection[]): number {
  if (connections.length === 0) return 0;
  return Math.round(connections.reduce((sum, conn) => sum + conn.metrics.avgLatency, 0) / connections.length);
}