import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Network } from "lucide-react";
import { useState, useRef } from "react";
import type { Job, Machine, Worker } from "@/types";

interface TopologyNode {
  id: string;
  type: 'client' | 'api' | 'redis' | 'fast-pool' | 'standard-pool' | 'heavy-pool' | 'machine' | 'service';
  label: string;
  position: { x: number; y: number };
  status: 'active' | 'busy' | 'idle' | 'error' | 'optimal';
  metrics: {
    load: number;
    throughput: number;
    connections: number;
    health: number;
  };
  poolType?: 'fast-lane' | 'standard' | 'heavy';
  children?: string[];
  parent?: string;
}

interface TopologyConnection {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'data' | 'control' | 'pool-routing';
  weight: number;
  latency: number;
  status: 'active' | 'congested' | 'error';
  flowDirection: 'bidirectional' | 'unidirectional';
}

interface TopologyLayer {
  name: string;
  nodes: TopologyNode[];
  description: string;
  color: string;
}

interface SystemTopologyProps {
  jobs: Job[];
  machines: Machine[];
  workers: Worker[];
}

export function SystemTopology({ jobs, machines }: SystemTopologyProps) {
  const [viewMode, setViewMode] = useState<'current' | 'pools' | 'hybrid'>('current');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [animateFlow, setAnimateFlow] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);

  const topology = generateSystemTopology(jobs, machines, [] as Worker[], viewMode);
  const selectedNodeData = topology.nodes.find(n => n.id === selectedNode);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          System Topology
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Network-style visualization of system architecture and data flow
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">View:</span>
            {(['current', 'pools', 'hybrid'] as const).map((mode) => (
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
            <Button
              variant={showLabels ? "default" : "outline"}
              size="sm"
              onClick={() => setShowLabels(!showLabels)}
            >
              Labels
            </Button>
            <Button
              variant={animateFlow ? "default" : "outline"}
              size="sm"
              onClick={() => setAnimateFlow(!animateFlow)}
            >
              Animate
            </Button>
          </div>

          <div className="flex gap-2 items-center">
            <span className="text-sm">Zoom:</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.1))}
            >
              -
            </Button>
            <span className="text-sm w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.1))}
            >
              +
            </Button>
          </div>
        </div>

        {/* Topology Visualization */}
        <div className="relative border rounded-lg p-4 bg-gray-50 overflow-hidden" style={{ height: '600px' }}>
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            viewBox="0 0 1000 500"
            className="absolute inset-0"
            style={{ transform: `scale(${zoomLevel})` }}
          >
            {/* Background Grid */}
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e5e7eb" strokeWidth="1" opacity="0.5"/>
              </pattern>
              
              {/* Flow Animation */}
              {animateFlow && (
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
                </marker>
              )}
            </defs>
            
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Connections */}
            {topology.connections.map((connection) => {
              const fromNode = topology.nodes.find(n => n.id === connection.from);
              const toNode = topology.nodes.find(n => n.id === connection.to);
              if (!fromNode || !toNode) return null;

              return (
                <TopologyConnectionSVG
                  key={connection.id}
                  connection={connection}
                  fromNode={fromNode}
                  toNode={toNode}
                  animate={animateFlow}
                />
              );
            })}

            {/* Nodes */}
            {topology.nodes.map((node) => (
              <TopologyNodeSVG
                key={node.id}
                node={node}
                isSelected={selectedNode === node.id}
                showLabel={showLabels}
                onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
              />
            ))}

            {/* Layer Labels */}
            {topology.layers.map((layer, index) => (
              <g key={layer.name}>
                <rect
                  x={50}
                  y={50 + (index * 120)}
                  width={120}
                  height={80}
                  fill={layer.color}
                  opacity={0.1}
                  stroke={layer.color}
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  rx="8"
                />
                <text
                  x={110}
                  y={40 + (index * 120)}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="bold"
                  fill={layer.color}
                >
                  {layer.name}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Node Details Panel */}
        {selectedNodeData && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <NodeDetailsPanel node={selectedNodeData} />
          </div>
        )}

        {/* Topology Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {topology.nodes.length}
            </div>
            <div className="text-sm text-muted-foreground">Total Nodes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">
              {topology.connections.length}
            </div>
            <div className="text-sm text-muted-foreground">Connections</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {topology.layers.length}
            </div>
            <div className="text-sm text-muted-foreground">Architecture Layers</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {calculateSystemHealth(topology.nodes)}%
            </div>
            <div className="text-sm text-muted-foreground">System Health</div>
          </div>
        </div>

        {/* Architecture Insights */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3">Architecture Insights</h4>
          <ArchitectureInsights topology={topology} viewMode={viewMode} />
        </div>
      </CardContent>
    </Card>
  );
}

function generateSystemTopology(
  jobs: Job[], 
  machines: Machine[], 
  workers: Worker[], 
  viewMode: 'current' | 'pools' | 'hybrid'
): {
  nodes: TopologyNode[];
  connections: TopologyConnection[];
  layers: TopologyLayer[];
} {
  if (viewMode === 'current') {
    return generateCurrentTopology(jobs, machines, workers);
  } else if (viewMode === 'pools') {
    return generatePoolsTopology(jobs);
  } else {
    return generateHybridTopology(jobs, machines, workers);
  }
}

function generateCurrentTopology(jobs: Job[], machines: Machine[], workers: Worker[]) {
  const nodes: TopologyNode[] = [
    {
      id: 'clients',
      type: 'client',
      label: 'Clients',
      position: { x: 100, y: 100 },
      status: 'active',
      metrics: {
        load: 70,
        throughput: jobs.filter(j => j.created_at > Date.now() - 3600000).length,
        connections: 1,
        health: 95
      }
    },
    {
      id: 'api-server',
      type: 'api',
      label: 'API Server',
      position: { x: 300, y: 100 },
      status: 'active',
      metrics: {
        load: 60,
        throughput: jobs.length,
        connections: 2,
        health: 98
      }
    },
    {
      id: 'redis-queue',
      type: 'redis',
      label: 'Redis Queue',
      position: { x: 500, y: 100 },
      status: jobs.filter(j => j.status === 'pending').length > 10 ? 'busy' : 'active',
      metrics: {
        load: Math.min(100, jobs.filter(j => j.status === 'pending').length * 5),
        throughput: jobs.filter(j => j.status === 'completed').length,
        connections: machines.length,
        health: 96
      }
    }
  ];

  // Add machine nodes
  machines.forEach((machine, index) => {
    const machineWorkers = workers.filter(w => machine.workers.includes(w.worker_id));
    const busyWorkers = machineWorkers.filter(w => w.status === 'busy');
    
    nodes.push({
      id: machine.machine_id,
      type: 'machine',
      label: machine.machine_id,
      position: { x: 700 + (index % 3) * 120, y: 60 + Math.floor(index / 3) * 100 },
      status: machine.status === 'ready' ? (busyWorkers.length > 0 ? 'busy' : 'active') : 'error',
      metrics: {
        load: machineWorkers.length > 0 ? (busyWorkers.length / machineWorkers.length) * 100 : 0,
        throughput: jobs.filter(j => machineWorkers.some(w => w.worker_id === j.worker_id)).length,
        connections: machineWorkers.length,
        health: machine.status === 'ready' ? 95 : 60
      }
    });
  });

  const connections: TopologyConnection[] = [
    {
      id: 'client-api',
      from: 'clients',
      to: 'api-server',
      type: 'request',
      weight: Math.min(10, jobs.length / 10),
      latency: 50,
      status: 'active',
      flowDirection: 'bidirectional'
    },
    {
      id: 'api-redis',
      from: 'api-server',
      to: 'redis-queue',
      type: 'data',
      weight: Math.min(10, jobs.length / 8),
      latency: 25,
      status: jobs.filter(j => j.status === 'pending').length > 20 ? 'congested' : 'active',
      flowDirection: 'bidirectional'
    }
  ];

  // Add machine connections
  machines.forEach((machine) => {
    connections.push({
      id: `redis-${machine.machine_id}`,
      from: 'redis-queue',
      to: machine.machine_id,
      type: 'data',
      weight: Math.min(8, workers.filter(w => machine.workers.includes(w.worker_id) && w.status === 'busy').length),
      latency: 100,
      status: 'active',
      flowDirection: 'bidirectional'
    });
  });

  const layers: TopologyLayer[] = [
    {
      name: 'Client Layer',
      nodes: nodes.filter(n => n.type === 'client'),
      description: 'External clients submitting jobs',
      color: '#3b82f6'
    },
    {
      name: 'API Layer',
      nodes: nodes.filter(n => n.type === 'api'),
      description: 'Request processing and validation',
      color: '#10b981'
    },
    {
      name: 'Queue Layer',
      nodes: nodes.filter(n => n.type === 'redis'),
      description: 'Job queuing and distribution',
      color: '#f59e0b'
    },
    {
      name: 'Execution Layer',
      nodes: nodes.filter(n => n.type === 'machine'),
      description: 'Job processing machines',
      color: '#ef4444'
    }
  ];

  return { nodes, connections, layers };
}

function generatePoolsTopology(jobs: Job[]) {
  const nodes: TopologyNode[] = [
    {
      id: 'clients',
      type: 'client',
      label: 'Clients',
      position: { x: 100, y: 200 },
      status: 'active',
      metrics: { load: 70, throughput: jobs.length, connections: 1, health: 95 }
    },
    {
      id: 'intelligent-router',
      type: 'api',
      label: 'Intelligent Router',
      position: { x: 350, y: 200 },
      status: 'optimal',
      metrics: { load: 45, throughput: jobs.length, connections: 3, health: 99 }
    },
    {
      id: 'fast-pool',
      type: 'fast-pool',
      label: 'Fast Lane Pool',
      poolType: 'fast-lane',
      position: { x: 600, y: 100 },
      status: 'optimal',
      metrics: { load: 60, throughput: Math.floor(jobs.length * 0.4), connections: 2, health: 97 }
    },
    {
      id: 'standard-pool',
      type: 'standard-pool',
      label: 'Standard Pool',
      poolType: 'standard',
      position: { x: 600, y: 200 },
      status: 'active',
      metrics: { load: 70, throughput: Math.floor(jobs.length * 0.5), connections: 3, health: 95 }
    },
    {
      id: 'heavy-pool',
      type: 'heavy-pool',
      label: 'Heavy Pool',
      poolType: 'heavy',
      position: { x: 600, y: 300 },
      status: 'busy',
      metrics: { load: 85, throughput: Math.floor(jobs.length * 0.1), connections: 2, health: 92 }
    }
  ];

  const connections: TopologyConnection[] = [
    {
      id: 'client-router',
      from: 'clients',
      to: 'intelligent-router',
      type: 'request',
      weight: 8,
      latency: 30,
      status: 'active',
      flowDirection: 'bidirectional'
    },
    {
      id: 'router-fast',
      from: 'intelligent-router',
      to: 'fast-pool',
      type: 'pool-routing',
      weight: 5,
      latency: 15,
      status: 'active',
      flowDirection: 'unidirectional'
    },
    {
      id: 'router-standard',
      from: 'intelligent-router',
      to: 'standard-pool',
      type: 'pool-routing',
      weight: 6,
      latency: 25,
      status: 'active',
      flowDirection: 'unidirectional'
    },
    {
      id: 'router-heavy',
      from: 'intelligent-router',
      to: 'heavy-pool',
      type: 'pool-routing',
      weight: 3,
      latency: 40,
      status: 'active',
      flowDirection: 'unidirectional'
    }
  ];

  const layers: TopologyLayer[] = [
    {
      name: 'Client Layer',
      nodes: nodes.filter(n => n.type === 'client'),
      description: 'External clients',
      color: '#3b82f6'
    },
    {
      name: 'Routing Layer',
      nodes: nodes.filter(n => n.type === 'api'),
      description: 'Intelligent job routing',
      color: '#10b981'
    },
    {
      name: 'Pool Layer',
      nodes: nodes.filter(n => n.type.includes('pool')),
      description: 'Specialized execution pools',
      color: '#f59e0b'
    }
  ];

  return { nodes, connections, layers };
}

function generateHybridTopology(jobs: Job[], machines: Machine[], workers: Worker[]) {
  // Combines current and pool views
  const current = generateCurrentTopology(jobs, machines, workers);
  const pools = generatePoolsTopology(jobs);
  
  return {
    nodes: [...current.nodes, ...pools.nodes.filter(n => n.type.includes('pool'))],
    connections: [...current.connections, ...pools.connections.filter(c => c.type === 'pool-routing')],
    layers: [...current.layers, ...pools.layers.filter(l => l.name === 'Pool Layer')]
  };
}

function TopologyNodeSVG({ node, isSelected, showLabel, onClick }: {
  node: TopologyNode;
  isSelected: boolean;
  showLabel: boolean;
  onClick: () => void;
}) {
  const getNodeColor = () => {
    switch (node.status) {
      case 'optimal': return '#10b981';
      case 'active': return '#3b82f6';
      case 'busy': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getNodeIcon = () => {
    switch (node.type) {
      case 'client': return '👥';
      case 'api': return '🔧';
      case 'redis': return '📦';
      case 'fast-pool': return '⚡';
      case 'standard-pool': return '⚙️';
      case 'heavy-pool': return '🏋️';
      case 'machine': return '💻';
      default: return '⚪';
    }
  };

  const radius = isSelected ? 30 : 25;

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <circle
        cx={node.position.x}
        cy={node.position.y}
        r={radius}
        fill={getNodeColor()}
        stroke={isSelected ? '#1f2937' : '#ffffff'}
        strokeWidth={isSelected ? 3 : 2}
        opacity={0.9}
      />
      
      {/* Load indicator */}
      <circle
        cx={node.position.x}
        cy={node.position.y}
        r={radius - 5}
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeDasharray={`${(node.metrics.load / 100) * 2 * Math.PI * (radius - 5)} ${2 * Math.PI * (radius - 5)}`}
        opacity={0.8}
        transform={`rotate(-90 ${node.position.x} ${node.position.y})`}
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
      
      {showLabel && (
        <text
          x={node.position.x}
          y={node.position.y + radius + 15}
          textAnchor="middle"
          fontSize="12"
          fill="#374151"
          fontWeight="500"
        >
          {node.label}
        </text>
      )}

      {/* Health indicator */}
      <circle
        cx={node.position.x + radius - 8}
        cy={node.position.y - radius + 8}
        r="6"
        fill={node.metrics.health > 95 ? '#10b981' : node.metrics.health > 80 ? '#f59e0b' : '#ef4444'}
        stroke="#ffffff"
        strokeWidth="1"
      />
    </g>
  );
}

function TopologyConnectionSVG({ connection, fromNode, toNode, animate }: {
  connection: TopologyConnection;
  fromNode: TopologyNode;
  toNode: TopologyNode;
  animate: boolean;
}) {
  const getConnectionColor = () => {
    switch (connection.status) {
      case 'congested': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const strokeWidth = Math.max(1, Math.min(8, connection.weight));
  const opacity = connection.status === 'active' ? 0.8 : 0.6;

  return (
    <g>
      <line
        x1={fromNode.position.x}
        y1={fromNode.position.y}
        x2={toNode.position.x}
        y2={toNode.position.y}
        stroke={getConnectionColor()}
        strokeWidth={strokeWidth}
        opacity={opacity}
        markerEnd={animate ? "url(#arrowhead)" : undefined}
        strokeDasharray={connection.type === 'pool-routing' ? '5,5' : 'none'}
      >
        {animate && (
          <animate
            attributeName="stroke-dashoffset"
            values="0;10"
            dur="2s"
            repeatCount="indefinite"
          />
        )}
      </line>
      
      {/* Connection weight label */}
      <text
        x={(fromNode.position.x + toNode.position.x) / 2}
        y={(fromNode.position.y + toNode.position.y) / 2 - 10}
        textAnchor="middle"
        fontSize="10"
        fill={getConnectionColor()}
        fontWeight="bold"
      >
        {connection.weight}
      </text>
    </g>
  );
}

function NodeDetailsPanel({ node }: { node: TopologyNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h5 className="font-semibold">{node.label}</h5>
        <Badge variant={
          node.status === 'optimal' ? 'default' :
          node.status === 'active' ? 'secondary' :
          node.status === 'busy' ? 'outline' : 'destructive'
        }>
          {node.status}
        </Badge>
        {node.poolType && (
          <Badge variant="outline">{node.poolType}</Badge>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="font-medium">Load</div>
          <div className="text-muted-foreground">{node.metrics.load}%</div>
        </div>
        <div>
          <div className="font-medium">Throughput</div>
          <div className="text-muted-foreground">{node.metrics.throughput}</div>
        </div>
        <div>
          <div className="font-medium">Connections</div>
          <div className="text-muted-foreground">{node.metrics.connections}</div>
        </div>
        <div>
          <div className="font-medium">Health</div>
          <div className="text-muted-foreground">{node.metrics.health}%</div>
        </div>
      </div>
    </div>
  );
}

function calculateSystemHealth(nodes: TopologyNode[]): number {
  if (nodes.length === 0) return 0;
  return Math.round(nodes.reduce((sum, node) => sum + node.metrics.health, 0) / nodes.length);
}

function ArchitectureInsights({ topology, viewMode }: {
  topology: { nodes: TopologyNode[]; connections: TopologyConnection[]; layers: TopologyLayer[] };
  viewMode: string;
}) {
  const insights = [];
  
  if (viewMode === 'current') {
    insights.push("Current architecture shows traditional single-queue bottleneck pattern");
    insights.push("Redis queue becomes a chokepoint with increasing load");
    insights.push("All machines compete for the same job queue");
  } else if (viewMode === 'pools') {
    insights.push("Pool-based architecture enables specialized resource allocation");
    insights.push("Intelligent routing eliminates cross-pool contention");
    insights.push("Each pool optimized for specific workload characteristics");
  } else {
    insights.push("Hybrid view shows migration path from current to pool architecture");
    insights.push("Gradual implementation reduces risk while improving performance");
  }

  const healthScore = calculateSystemHealth(topology.nodes);
  if (healthScore > 95) {
    insights.push("System health is excellent - ready for optimization");
  } else if (healthScore > 80) {
    insights.push("System health is good - consider preventive improvements");
  } else {
    insights.push("System health needs attention before major changes");
  }

  return (
    <div className="space-y-2">
      {insights.map((insight, index) => (
        <div key={index} className="text-sm text-muted-foreground">
          • {insight}
        </div>
      ))}
    </div>
  );
}