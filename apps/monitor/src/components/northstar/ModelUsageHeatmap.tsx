import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Grid, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { Job, Machine } from "@/types";

interface ModelUsageData {
  modelName: string;
  totalUsage: number;
  successfulDownloads: number;
  failedDownloads: number;
  avgDownloadTime: number;
  diskUsage: number;
  lastUsed: number;
  machineDistribution: MachineModelUsage[];
  popularityRank: number;
  coOccurrenceModels: string[];
}

interface MachineModelUsage {
  machineId: string;
  usageCount: number;
  downloadSuccess: boolean;
  lastAccessed: number;
  storageUsed: number;
}

interface HeatmapCell {
  machineId: string;
  modelName: string;
  intensity: number;
  status: 'active' | 'cached' | 'failed' | 'missing';
  lastUsed: number;
  downloadTime?: number;
}

interface ModelUsageHeatmapProps {
  jobs: Job[];
  machines: Machine[];
}

export function ModelUsageHeatmap({ jobs, machines }: ModelUsageHeatmapProps) {
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('24h');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'usage' | 'performance' | 'storage'>('usage');
  
  const modelData = analyzeModelUsage(jobs, machines, selectedTimeRange);
  const heatmapData = generateHeatmapData(modelData, machines, viewMode);
  const topModels = modelData.slice(0, 10).sort((a, b) => b.totalUsage - a.totalUsage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid className="h-5 w-5" />
          Model Usage Heatmap
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Track model usage patterns and download performance across machines
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <span className="text-sm font-medium">Time Range:</span>
            {(['1h', '6h', '24h', '7d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setSelectedTimeRange(range)}
                className={`px-3 py-1 text-sm rounded ${
                  selectedTimeRange === range
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
          
          <div className="flex gap-2">
            <span className="text-sm font-medium">View:</span>
            {(['usage', 'performance', 'storage'] as const).map((mode) => (
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
        </div>

        {/* Top Models Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {topModels.slice(0, 6).map((model) => (
            <div 
              key={model.modelName}
              className={`border rounded p-3 cursor-pointer transition-colors ${
                selectedModel === model.modelName 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'hover:border-gray-300'
              }`}
              onClick={() => setSelectedModel(
                selectedModel === model.modelName ? null : model.modelName
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium text-sm truncate">{model.modelName}</div>
                <Badge variant="outline">#{model.popularityRank}</Badge>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span>Usage:</span>
                  <span className="font-medium">{model.totalUsage}x</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Success Rate:</span>
                  <span className={`font-medium ${
                    model.successfulDownloads / (model.successfulDownloads + model.failedDownloads) > 0.9
                      ? 'text-green-600' : 'text-orange-600'
                  }`}>
                    {model.totalUsage > 0 
                      ? Math.round((model.successfulDownloads / (model.successfulDownloads + model.failedDownloads)) * 100)
                      : 0}%
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span>Avg Download:</span>
                  <span className="font-medium">{formatDuration(model.avgDownloadTime)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Heatmap Visualization */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Model Distribution Heatmap</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Intensity:</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-200 rounded"></div>
                <span>None</span>
                <div className="w-3 h-3 bg-blue-300 rounded"></div>
                <span>Low</span>
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span>Medium</span>
                <div className="w-3 h-3 bg-blue-700 rounded"></div>
                <span>High</span>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <HeatmapGrid 
              data={heatmapData}
              models={topModels.map(m => m.modelName)}
              machines={machines}
              onCellClick={(cell) => setSelectedModel(cell.modelName)}
            />
          </div>
        </div>

        {/* Detailed Model Analysis */}
        {selectedModel && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <ModelDetailedAnalysis 
              model={modelData.find(m => m.modelName === selectedModel)!}
            />
          </div>
        )}

        {/* Storage Optimization Insights */}
        <div className="border-t pt-4">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Storage Optimization Insights
          </h4>
          <StorageOptimizationInsights modelData={modelData} machines={machines} />
        </div>
      </CardContent>
    </Card>
  );
}

function analyzeModelUsage(jobs: Job[], machines: Machine[], timeRange: '1h' | '6h' | '24h' | '7d'): ModelUsageData[] {
  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000
  };

  const cutoffTime = Date.now() - timeRangeMs[timeRange];
  const recentJobs = jobs.filter(job => 
    job.created_at > cutoffTime && job.payload
  );

  // Extract model information from job payloads
  const modelUsage = new Map<string, {
    usage: number;
    successfulDownloads: number;
    failedDownloads: number;
    downloadTimes: number[];
    lastUsed: number;
    machineUsage: Map<string, number>;
  }>();

  recentJobs.forEach(job => {
    // Mock model extraction from job payload
    const models = extractModelsFromJob();
    
    models.forEach(modelName => {
      if (!modelUsage.has(modelName)) {
        modelUsage.set(modelName, {
          usage: 0,
          successfulDownloads: 0,
          failedDownloads: 0,
          downloadTimes: [],
          lastUsed: 0,
          machineUsage: new Map()
        });
      }

      const data = modelUsage.get(modelName)!;
      data.usage++;
      data.lastUsed = Math.max(data.lastUsed, job.created_at);

      if (job.status === 'completed') {
        data.successfulDownloads++;
        if (job.started_at && job.created_at) {
          data.downloadTimes.push(job.started_at - job.created_at);
        }
      } else if (job.status === 'failed') {
        data.failedDownloads++;
      }

      // Track machine usage
      if (job.worker_id) {
        const machineId = findMachineForWorker(job.worker_id, machines);
        if (machineId) {
          data.machineUsage.set(machineId, (data.machineUsage.get(machineId) || 0) + 1);
        }
      }
    });
  });

  // Convert to array and add derived metrics
  const result: ModelUsageData[] = [];
  let rank = 1;

  Array.from(modelUsage.entries())
    .sort(([,a], [,b]) => b.usage - a.usage)
    .forEach(([modelName, data]) => {
      const machineDistribution: MachineModelUsage[] = [];
      
      data.machineUsage.forEach((count, machineId) => {
        machineDistribution.push({
          machineId,
          usageCount: count,
          downloadSuccess: true, // Mock data
          lastAccessed: data.lastUsed,
          storageUsed: Math.random() * 2000 + 500 // Mock storage in MB
        });
      });

      result.push({
        modelName,
        totalUsage: data.usage,
        successfulDownloads: data.successfulDownloads,
        failedDownloads: data.failedDownloads,
        avgDownloadTime: data.downloadTimes.length > 0 
          ? data.downloadTimes.reduce((a, b) => a + b, 0) / data.downloadTimes.length
          : 0,
        diskUsage: Math.random() * 3000 + 1000, // Mock disk usage in MB
        lastUsed: data.lastUsed,
        machineDistribution,
        popularityRank: rank++,
        coOccurrenceModels: getCoOccurrenceModels(modelName)
      });
    });

  return result;
}

function extractModelsFromJob(/* _job: Job */): string[] {
  // Mock model extraction - in real implementation, this would parse job.payload
  const mockModels = [
    'SDXL Base 1.0',
    'SDXL Refiner 1.0',
    'ControlNet OpenPose',
    'ControlNet Depth',
    'LoRA Style Collection',
    'VAE ft-mse',
    'CLIP Vision',
    'AnimateDiff',
    'IP-Adapter',
    'PhotoMaker'
  ];

  // Return 1-3 random models per job
  const numModels = Math.floor(Math.random() * 3) + 1;
  const selectedModels = [];
  for (let i = 0; i < numModels; i++) {
    selectedModels.push(mockModels[Math.floor(Math.random() * mockModels.length)]);
  }
  
  return [...new Set(selectedModels)]; // Remove duplicates
}

function findMachineForWorker(workerId: string, machines: Machine[]): string | null {
  for (const machine of machines) {
    if (machine.workers.includes(workerId)) {
      return machine.machine_id;
    }
  }
  return null;
}

function getCoOccurrenceModels(modelName: string /* _jobs: Job[] */): string[] {
  // Mock co-occurrence analysis
  const coOccurrenceMap: Record<string, string[]> = {
    'SDXL Base 1.0': ['SDXL Refiner 1.0', 'VAE ft-mse'],
    'SDXL Refiner 1.0': ['SDXL Base 1.0', 'LoRA Style Collection'],
    'ControlNet OpenPose': ['SDXL Base 1.0', 'IP-Adapter'],
    'ControlNet Depth': ['SDXL Base 1.0', 'ControlNet OpenPose'],
    'LoRA Style Collection': ['SDXL Base 1.0', 'SDXL Refiner 1.0'],
    'VAE ft-mse': ['SDXL Base 1.0', 'SDXL Refiner 1.0'],
    'CLIP Vision': ['IP-Adapter', 'PhotoMaker'],
    'AnimateDiff': ['SDXL Base 1.0', 'ControlNet OpenPose'],
    'IP-Adapter': ['SDXL Base 1.0', 'CLIP Vision'],
    'PhotoMaker': ['SDXL Base 1.0', 'IP-Adapter']
  };

  return coOccurrenceMap[modelName] || [];
}

function generateHeatmapData(
  modelData: ModelUsageData[], 
  machines: Machine[], 
  viewMode: 'usage' | 'performance' | 'storage'
): HeatmapCell[] {
  const cells: HeatmapCell[] = [];
  
  modelData.forEach(model => {
    machines.forEach(machine => {
      const machineUsage = model.machineDistribution.find(m => m.machineId === machine.machine_id);
      
      let intensity = 0;
      let status: HeatmapCell['status'] = 'missing';
      
      if (machineUsage) {
        if (viewMode === 'usage') {
          intensity = Math.min(100, (machineUsage.usageCount / model.totalUsage) * 100);
        } else if (viewMode === 'performance') {
          intensity = machineUsage.downloadSuccess ? 100 : 0;
        } else if (viewMode === 'storage') {
          intensity = Math.min(100, (machineUsage.storageUsed / 5000) * 100);
        }
        
        status = machineUsage.downloadSuccess ? 'active' : 'failed';
      }
      
      cells.push({
        machineId: machine.machine_id,
        modelName: model.modelName,
        intensity,
        status,
        lastUsed: machineUsage?.lastAccessed || 0,
        downloadTime: model.avgDownloadTime
      });
    });
  });
  
  return cells;
}

function HeatmapGrid({ data, models, machines, onCellClick }: {
  data: HeatmapCell[];
  models: string[];
  machines: Machine[];
  onCellClick: (cell: HeatmapCell) => void;
}) {
  const getIntensityColor = (intensity: number, status: HeatmapCell['status']) => {
    if (status === 'failed') return 'bg-red-200';
    if (status === 'missing') return 'bg-gray-100';
    
    if (intensity < 25) return 'bg-blue-100';
    if (intensity < 50) return 'bg-blue-300';
    if (intensity < 75) return 'bg-blue-500';
    return 'bg-blue-700';
  };

  return (
    <div className="grid gap-1" style={{ 
      gridTemplateColumns: `120px repeat(${Math.min(machines.length, 10)}, 40px)` 
    }}>
      {/* Header */}
      <div className="font-medium text-sm"></div>
      {machines.slice(0, 10).map(machine => (
        <div 
          key={machine.machine_id}
          className="text-xs text-center transform -rotate-45 origin-bottom-left w-8"
          title={machine.machine_id}
        >
          {machine.machine_id.slice(-3)}
        </div>
      ))}
      
      {/* Data rows */}
      {models.slice(0, 10).map(modelName => (
        <div key={modelName} className="contents">
          <div className="text-sm font-medium truncate pr-2" title={modelName}>
            {modelName}
          </div>
          {machines.slice(0, 10).map(machine => {
            const cell = data.find(d => d.modelName === modelName && d.machineId === machine.machine_id);
            return (
              <div
                key={`${modelName}-${machine.machine_id}`}
                className={`h-8 w-8 cursor-pointer border border-gray-200 ${
                  cell ? getIntensityColor(cell.intensity, cell.status) : 'bg-gray-100'
                }`}
                onClick={() => cell && onCellClick(cell)}
                title={cell ? `${modelName} on ${machine.machine_id}: ${cell.intensity.toFixed(0)}%` : 'No data'}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ModelDetailedAnalysis({ model }: { model: ModelUsageData }) {
  return (
    <div className="space-y-4">
      <h5 className="font-semibold">{model.modelName} - Detailed Analysis</h5>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h6 className="font-medium mb-2">Usage Statistics</h6>
          <div className="space-y-1 text-sm">
            <div>Total Usage: {model.totalUsage} times</div>
            <div>Success Rate: {Math.round((model.successfulDownloads / (model.successfulDownloads + model.failedDownloads)) * 100)}%</div>
            <div>Avg Download: {formatDuration(model.avgDownloadTime)}</div>
            <div>Disk Usage: {(model.diskUsage / 1024).toFixed(1)} GB</div>
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Machine Distribution</h6>
          <div className="space-y-1 text-sm">
            {model.machineDistribution.slice(0, 3).map(machine => (
              <div key={machine.machineId} className="flex justify-between">
                <span>{machine.machineId}</span>
                <span>{machine.usageCount}x</span>
              </div>
            ))}
            {model.machineDistribution.length > 3 && (
              <div className="text-muted-foreground">
                +{model.machineDistribution.length - 3} more machines
              </div>
            )}
          </div>
        </div>
        
        <div>
          <h6 className="font-medium mb-2">Co-occurrence</h6>
          <div className="space-y-1 text-sm">
            {model.coOccurrenceModels.map(coModel => (
              <div key={coModel} className="text-muted-foreground">
                • {coModel}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StorageOptimizationInsights({ modelData, machines }: { 
  modelData: ModelUsageData[]; 
  machines: Machine[] 
}) {
  const insights = [];
  
  // Identify unused models
  const unusedModels = modelData.filter(m => 
    m.lastUsed < Date.now() - (7 * 24 * 60 * 60 * 1000)
  );
  
  if (unusedModels.length > 0) {
    const totalWaste = unusedModels.reduce((sum, m) => sum + m.diskUsage, 0);
    insights.push(
      `${unusedModels.length} models unused for 7+ days - potential ${(totalWaste / 1024).toFixed(1)} GB savings`
    );
  }
  
  // Identify popular models not widely distributed
  const popularModels = modelData.filter(m => 
    m.totalUsage > 10 && m.machineDistribution.length < machines.length * 0.5
  );
  
  if (popularModels.length > 0) {
    insights.push(
      `${popularModels.length} popular models should be pre-cached on more machines`
    );
  }
  
  // Identify models with high failure rates
  const problematicModels = modelData.filter(m => 
    m.failedDownloads > 0 && 
    m.failedDownloads / (m.successfulDownloads + m.failedDownloads) > 0.2
  );
  
  if (problematicModels.length > 0) {
    insights.push(
      `${problematicModels.length} models have high download failure rates - investigate storage issues`
    );
  }
  
  return (
    <div className="space-y-2">
      {insights.length > 0 ? (
        insights.map((insight, index) => (
          <div key={index} className="text-sm text-muted-foreground">
            • {insight}
          </div>
        ))
      ) : (
        <div className="text-sm text-muted-foreground">
          • Model storage appears optimized - no immediate action needed
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}