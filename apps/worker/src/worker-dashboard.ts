// Worker Dashboard - Real-time worker monitoring and debugging interface
// Serves an HTTP dashboard for each worker showing state, stats, and job history
//
// PORT STRATEGY:
// - For Docker containers: Use fixed ports (1511, 1512, 1513, etc.) with explicit port mapping
// - For standalone workers: Use port 0 for auto-assignment to avoid conflicts
// - Each worker gets its own dashboard to avoid port conflicts

import express, { Request, Response } from 'express';
import { Server } from 'http';
import { BaseWorker } from './base-worker.js';
import { Job, WorkerStatus, logger } from '@emp/core';

interface JobHistoryEntry {
  job: Job;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
  result?: unknown;
}

interface WorkerStats {
  totalJobsProcessed: number;
  totalJobsFailed: number;
  totalJobsCancelled: number;
  averageJobDuration: number;
  uptimeSeconds: number;
  lastHeartbeat: string;
  currentStatus: WorkerStatus;
  connectorStatuses: Record<string, unknown>;
}

export class WorkerDashboard {
  private app: express.Express;
  private server: Server | null = null;
  private worker: BaseWorker;
  private port: number;
  private isRunning = false;
  private jobHistory: JobHistoryEntry[] = [];
  private maxHistoryEntries = 100;
  private startTime = Date.now();

  constructor(worker: BaseWorker, port: number = 0) {
    this.worker = worker;
    // Use port 0 for auto-assignment, or specific port from env
    this.port = port || parseInt(process.env.WORKER_DASHBOARD_PORT || '0');
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private getRandomPort(): number {
    return 9000 + Math.floor(Math.random() * 1000);
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.static('public')); // In case we want to serve static assets

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });
  }

  private setupRoutes(): void {
    // Main dashboard HTML
    this.app.get('/', this.handleDashboard.bind(this));

    // API endpoints
    this.app.get('/api/status', this.handleApiStatus.bind(this));
    this.app.get('/api/capabilities', this.handleApiCapabilities.bind(this));
    this.app.get('/api/jobs/current', this.handleApiCurrentJobs.bind(this));
    this.app.get('/api/jobs/history', this.handleApiJobHistory.bind(this));
    this.app.get('/api/stats', this.handleApiStats.bind(this));
    this.app.get('/api/connectors', this.handleApiConnectors.bind(this));
    this.app.get('/api/system', this.handleApiSystem.bind(this));

    // Control endpoints
    this.app.post('/api/control/pause', this.handleControlPause.bind(this));
    this.app.post('/api/control/resume', this.handleControlResume.bind(this));
    this.app.post('/api/control/cancel-job/:jobId', this.handleControlCancelJob.bind(this));
  }

  private async handleDashboard(req: Request, res: Response): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Worker Dashboard - ${this.worker.getWorkerId()}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5; 
            color: #333;
        }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header h1 { color: #2c3e50; margin-bottom: 10px; }
        .header .subtitle { color: #7f8c8d; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card h2 { margin-bottom: 15px; color: #2c3e50; font-size: 18px; }
        
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
        .status-item { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .status-value { font-size: 24px; font-weight: bold; color: #3498db; }
        .status-label { font-size: 12px; color: #7f8c8d; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .job-item { 
            padding: 12px; 
            margin: 8px 0; 
            background: #f8f9fa; 
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .job-item.active { border-left-color: #e74c3c; }
        .job-item.completed { border-left-color: #27ae60; }
        .job-item.failed { border-left-color: #e67e22; }
        
        .job-id { font-family: monospace; font-size: 12px; color: #7f8c8d; }
        .job-type { font-weight: bold; margin: 4px 0; }
        .job-duration { font-size: 12px; color: #7f8c8d; }
        
        .connector-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            margin: 8px 0;
            background: #f8f9fa;
            border-radius: 6px;
        }
        .connector-status {
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            text-transform: uppercase;
        }
        .connector-status.connected { background: #d4edda; color: #155724; }
        .connector-status.disconnected { background: #f8d7da; color: #721c24; }
        
        .control-button {
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            margin: 5px;
            font-size: 12px;
        }
        .control-button:hover { background: #2980b9; }
        .control-button.danger { background: #e74c3c; }
        .control-button.danger:hover { background: #c0392b; }
        
        .refresh-info { text-align: center; color: #7f8c8d; font-size: 12px; margin-top: 20px; }
        
        .metric { margin: 8px 0; }
        .metric-label { font-weight: 500; color: #2c3e50; }
        .metric-value { color: #7f8c8d; }
        
        .capability-section { margin-bottom: 15px; }
        .capability-title { font-weight: 600; color: #2c3e50; margin-bottom: 5px; }
        .capability-list { display: flex; flex-wrap: wrap; gap: 5px; }
        .capability-tag {
            display: inline-block;
            background: #e3f2fd;
            color: #1976d2;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
        }
        .hardware-spec {
            background: #f3e5f5;
            color: #7b1fa2;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
            margin: 2px;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Worker Dashboard</h1>
            <div class="subtitle">Worker ID: <span id="workerId">Loading...</span></div>
        </div>
        
        <div class="grid">
            <!-- Status Overview -->
            <div class="card">
                <h2>Status Overview</h2>
                <div class="status-grid" id="statusGrid">
                    <!-- Status items will be populated by JavaScript -->
                </div>
                <div style="margin-top: 15px;">
                    <button class="control-button" onclick="pauseWorker()">Pause</button>
                    <button class="control-button" onclick="resumeWorker()">Resume</button>
                </div>
            </div>
            
            <!-- Current Jobs -->
            <div class="card">
                <h2>Current Jobs</h2>
                <div id="currentJobs">
                    <div style="text-align: center; color: #7f8c8d; padding: 20px;">No active jobs</div>
                </div>
            </div>
            
            <!-- Job Statistics -->
            <div class="card">
                <h2>Job Statistics</h2>
                <div id="jobStats">
                    <!-- Job stats will be populated by JavaScript -->
                </div>
            </div>
            
            <!-- Worker Capabilities -->
            <div class="card">
                <h2>Worker Capabilities</h2>
                <div id="capabilities">
                    <!-- Capabilities will be populated by JavaScript -->
                </div>
            </div>
            
            <!-- Connectors -->
            <div class="card">
                <h2>Connectors</h2>
                <div id="connectors">
                    <!-- Connector status will be populated by JavaScript -->
                </div>
            </div>
            
            <!-- System Information -->
            <div class="card">
                <h2>System Information</h2>
                <div id="systemInfo">
                    <!-- System info will be populated by JavaScript -->
                </div>
            </div>
            
            <!-- Recent Job History -->
            <div class="card" style="grid-column: 1 / -1;">
                <h2>Recent Job History</h2>
                <div id="jobHistory">
                    <!-- Job history will be populated by JavaScript -->
                </div>
            </div>
        </div>
        
        <div class="refresh-info">
            Auto-refreshing every 2 seconds • Last updated: <span id="lastUpdated">Never</span>
        </div>
    </div>

    <script>
        let refreshInterval;
        
        async function fetchData(endpoint) {
            try {
                const response = await fetch(endpoint);
                return await response.json();
            } catch (error) {
                console.error('Failed to fetch data:', error);
                return null;
            }
        }
        
        function formatDuration(seconds) {
            if (seconds < 60) return seconds.toFixed(1) + 's';
            if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + (seconds % 60).toFixed(0) + 's';
            return Math.floor(seconds / 3600) + 'h ' + Math.floor((seconds % 3600) / 60) + 'm';
        }
        
        function formatTime(timestamp) {
            return new Date(timestamp).toLocaleString();
        }
        
        function createStatusItem(label, value, unit = '') {
            return \`
                <div class="status-item">
                    <div class="status-value">\${value}\${unit}</div>
                    <div class="status-label">\${label}</div>
                </div>
            \`;
        }
        
        async function updateDashboard() {
            const [status, capabilities, currentJobs, jobHistory, stats, connectors, systemInfo] = await Promise.all([
                fetchData('/api/status'),
                fetchData('/api/capabilities'),
                fetchData('/api/jobs/current'),
                fetchData('/api/jobs/history'),
                fetchData('/api/stats'),
                fetchData('/api/connectors'),
                fetchData('/api/system')
            ]);
            
            if (!status) return;
            
            // Update worker ID
            document.getElementById('workerId').textContent = status.workerId;
            
            // Update status grid
            const statusGrid = document.getElementById('statusGrid');
            statusGrid.innerHTML = \`
                \${createStatusItem('Status', status.status)}
                \${createStatusItem('Uptime', formatDuration(stats?.uptimeSeconds || 0))}
                \${createStatusItem('Jobs Processed', stats?.totalJobsProcessed || 0)}
                \${createStatusItem('Jobs Failed', stats?.totalJobsFailed || 0)}
                \${createStatusItem('Avg Duration', formatDuration(stats?.averageJobDuration || 0))}
                \${createStatusItem('Last Heartbeat', status.lastHeartbeat ? 'Active' : 'None')}
            \`;
            
            // Update current jobs
            const currentJobsDiv = document.getElementById('currentJobs');
            if (currentJobs && currentJobs.length > 0) {
                currentJobsDiv.innerHTML = currentJobs.map(job => \`
                    <div class="job-item active">
                        <div class="job-id">Job ID: \${job.id}</div>
                        <div class="job-type">\${job.type}</div>
                        <div class="job-duration">Started: \${formatTime(job.started_at)}</div>
                        <button class="control-button danger" onclick="cancelJob('\${job.id}')">Cancel</button>
                    </div>
                \`).join('');
            } else {
                currentJobsDiv.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 20px;">No active jobs</div>';
            }
            
            // Update job statistics
            const jobStatsDiv = document.getElementById('jobStats');
            if (stats) {
                jobStatsDiv.innerHTML = \`
                    <div class="metric">
                        <span class="metric-label">Total Processed:</span>
                        <span class="metric-value">\${stats.totalJobsProcessed}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Success Rate:</span>
                        <span class="metric-value">\${stats.totalJobsProcessed > 0 ? 
                            ((stats.totalJobsProcessed - stats.totalJobsFailed) / stats.totalJobsProcessed * 100).toFixed(1) + '%' : 'N/A'}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Average Duration:</span>
                        <span class="metric-value">\${formatDuration(stats.averageJobDuration)}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Worker Uptime:</span>
                        <span class="metric-value">\${formatDuration(stats.uptimeSeconds)}</span>
                    </div>
                \`;
            }
            
            // Update capabilities
            const capabilitiesDiv = document.getElementById('capabilities');
            if (capabilities) {
                let capabilitiesHtml = '';
                
                // Services
                if (capabilities.services && capabilities.services.length > 0) {
                    capabilitiesHtml += \`
                        <div class="capability-section">
                            <div class="capability-title">Supported Services</div>
                            <div class="capability-list">
                                \${capabilities.services.map(service => 
                                    \`<span class="capability-tag">\${service}</span>\`
                                ).join('')}
                            </div>
                        </div>
                    \`;
                }
                
                // Hardware
                if (capabilities.hardware) {
                    const hw = capabilities.hardware;
                    capabilitiesHtml += \`
                        <div class="capability-section">
                            <div class="capability-title">Hardware Specifications</div>
                            <div class="capability-list">
                                \${hw.gpu_count ? \`<span class="hardware-spec">GPU: \${hw.gpu_count}x</span>\` : ''}
                                \${hw.gpu_model ? \`<span class="hardware-spec">\${hw.gpu_model}</span>\` : ''}
                                \${hw.gpu_memory_gb ? \`<span class="hardware-spec">\${hw.gpu_memory_gb}GB VRAM</span>\` : ''}
                                \${hw.cpu_cores ? \`<span class="hardware-spec">CPU: \${hw.cpu_cores} cores</span>\` : ''}
                                \${hw.ram_gb ? \`<span class="hardware-spec">RAM: \${hw.ram_gb}GB</span>\` : ''}
                            </div>
                        </div>
                    \`;
                }
                
                // Models/Filters
                if (capabilities.models && capabilities.models.length > 0) {
                    capabilitiesHtml += \`
                        <div class="capability-section">
                            <div class="capability-title">Available Models</div>
                            <div class="capability-list">
                                \${capabilities.models.slice(0, 10).map(model => 
                                    \`<span class="capability-tag">\${model}</span>\`
                                ).join('')}
                                \${capabilities.models.length > 10 ? 
                                    \`<span class="capability-tag">+\${capabilities.models.length - 10} more</span>\` : ''}
                            </div>
                        </div>
                    \`;
                }
                
                // Customer isolation
                if (capabilities.customer_isolation) {
                    capabilitiesHtml += \`
                        <div class="capability-section">
                            <div class="capability-title">Customer Isolation</div>
                            <div class="capability-list">
                                <span class="capability-tag">\${capabilities.customer_isolation}</span>
                            </div>
                        </div>
                    \`;
                }
                
                // Geographic/compliance
                if (capabilities.region || capabilities.compliance) {
                    capabilitiesHtml += \`
                        <div class="capability-section">
                            <div class="capability-title">Location & Compliance</div>
                            <div class="capability-list">
                                \${capabilities.region ? \`<span class="capability-tag">Region: \${capabilities.region}</span>\` : ''}
                                \${capabilities.compliance ? \`<span class="capability-tag">Compliance: \${capabilities.compliance}</span>\` : ''}
                            </div>
                        </div>
                    \`;
                }
                
                capabilitiesDiv.innerHTML = capabilitiesHtml || '<div style="color: #7f8c8d;">No capabilities data available</div>';
            }
            
            // Update connectors
            const connectorsDiv = document.getElementById('connectors');
            if (connectors) {
                connectorsDiv.innerHTML = Object.entries(connectors).map(([name, status]) => \`
                    <div class="connector-item">
                        <span>\${name}</span>
                        <span class="connector-status \${status.connected ? 'connected' : 'disconnected'}">
                            \${status.connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                \`).join('');
            }
            
            // Update system info
            const systemInfoDiv = document.getElementById('systemInfo');
            if (systemInfo) {
                systemInfoDiv.innerHTML = \`
                    <div class="metric">
                        <span class="metric-label">CPU Usage:</span>
                        <span class="metric-value">\${systemInfo.cpu_usage?.toFixed(1) || 'N/A'}%</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Memory Usage:</span>
                        <span class="metric-value">\${systemInfo.memory_usage?.toFixed(1) || 'N/A'}%</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Free Memory:</span>
                        <span class="metric-value">\${(systemInfo.memory_free_gb || 0).toFixed(1)} GB</span>
                    </div>
                \`;
            }
            
            // Update job history
            const jobHistoryDiv = document.getElementById('jobHistory');
            if (jobHistory && jobHistory.length > 0) {
                jobHistoryDiv.innerHTML = jobHistory.slice(0, 10).map(entry => \`
                    <div class="job-item \${entry.status}">
                        <div class="job-id">Job ID: \${entry.job.id}</div>
                        <div class="job-type">\${entry.job.type} • \${entry.status.toUpperCase()}</div>
                        <div class="job-duration">
                            Duration: \${entry.duration ? formatDuration(entry.duration / 1000) : 'N/A'} • 
                            Completed: \${entry.completedAt ? formatTime(entry.completedAt) : 'N/A'}
                        </div>
                        \${entry.error ? \`<div style="color: #e74c3c; font-size: 12px; margin-top: 5px;">Error: \${entry.error}</div>\` : ''}
                    </div>
                \`).join('');
            } else {
                jobHistoryDiv.innerHTML = '<div style="text-align: center; color: #7f8c8d; padding: 20px;">No job history</div>';
            }
            
            // Update last updated time
            document.getElementById('lastUpdated').textContent = new Date().toLocaleTimeString();
        }
        
        async function pauseWorker() {
            await fetch('/api/control/pause', { method: 'POST' });
            updateDashboard();
        }
        
        async function resumeWorker() {
            await fetch('/api/control/resume', { method: 'POST' });
            updateDashboard();
        }
        
        async function cancelJob(jobId) {
            if (confirm('Cancel job ' + jobId + '?')) {
                await fetch(\`/api/control/cancel-job/\${jobId}\`, { method: 'POST' });
                updateDashboard();
            }
        }
        
        // Initialize dashboard
        updateDashboard();
        refreshInterval = setInterval(updateDashboard, 2000);
    </script>
</body>
</html>`;

    res.send(html);
  }

  private async handleApiStatus(req: Request, res: Response): Promise<void> {
    try {
      res.json({
        workerId: this.worker.getWorkerId(),
        status: this.worker.getStatus(),
        isRunning: this.worker.isRunning(),
        lastHeartbeat: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  }

  private async handleApiCapabilities(req: Request, res: Response): Promise<void> {
    try {
      res.json(this.worker.getCapabilities());
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get capabilities' });
    }
  }

  private async handleApiCurrentJobs(req: Request, res: Response): Promise<void> {
    try {
      // Get current jobs from worker
      const currentJobs = this.worker.getCurrentJobs ? this.worker.getCurrentJobs() : [];
      res.json(currentJobs);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get current jobs' });
    }
  }

  private async handleApiJobHistory(req: Request, res: Response): Promise<void> {
    try {
      res.json(this.jobHistory);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get job history' });
    }
  }

  private async handleApiStats(req: Request, res: Response): Promise<void> {
    try {
      const completedJobs = this.jobHistory.filter(entry => entry.status === 'completed');
      const failedJobs = this.jobHistory.filter(entry => entry.status === 'failed');
      const cancelledJobs = this.jobHistory.filter(entry => entry.status === 'cancelled');

      const totalDuration = completedJobs.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const averageJobDuration =
        completedJobs.length > 0 ? totalDuration / completedJobs.length / 1000 : 0;

      const stats: WorkerStats = {
        totalJobsProcessed: completedJobs.length,
        totalJobsFailed: failedJobs.length,
        totalJobsCancelled: cancelledJobs.length,
        averageJobDuration,
        uptimeSeconds: (Date.now() - this.startTime) / 1000,
        lastHeartbeat: new Date().toISOString(),
        currentStatus: this.worker.getStatus(),
        connectorStatuses: {}, // TODO: Get from connectors
      };

      res.json(stats);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  }

  private async handleApiConnectors(req: Request, res: Response): Promise<void> {
    try {
      // Get connector statuses from worker's connector manager
      const connectorManager = this.worker.getConnectorManager();
      const connectors: Record<string, unknown> = {};

      if (connectorManager && connectorManager.getConnectorStatistics) {
        const statuses = await connectorManager.getConnectorStatistics();
        for (const [name, status] of Object.entries(statuses)) {
          connectors[name] = status;
        }
      }

      res.json(connectors);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get connector statuses' });
    }
  }

  private async handleApiSystem(req: Request, res: Response): Promise<void> {
    try {
      const memoryUsage = process.memoryUsage();
      const _cpuUsage = process.cpuUsage();

      res.json({
        memory_usage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        memory_free_gb: (memoryUsage.heapTotal - memoryUsage.heapUsed) / 1024 / 1024 / 1024,
        cpu_usage: 0, // TODO: Calculate actual CPU usage
        uptime: process.uptime(),
        node_version: process.version,
        pid: process.pid,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to get system info' });
    }
  }

  private async handleControlPause(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implement pause functionality in BaseWorker
      res.json({ success: true, message: 'Worker paused (not implemented yet)' });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to pause worker' });
    }
  }

  private async handleControlResume(req: Request, res: Response): Promise<void> {
    try {
      // TODO: Implement resume functionality in BaseWorker
      res.json({ success: true, message: 'Worker resumed (not implemented yet)' });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to resume worker' });
    }
  }

  private async handleControlCancelJob(req: Request, res: Response): Promise<void> {
    try {
      const jobId = req.params.jobId;
      // TODO: Implement job cancellation in BaseWorker
      res.json({
        success: true,
        message: `Job ${jobId} cancellation requested (not implemented yet)`,
      });
    } catch (_error) {
      res.status(500).json({ error: 'Failed to cancel job' });
    }
  }

  // Public methods for worker to call when job events occur
  public recordJobStarted(job: Job): void {
    // Remove any existing entry for this job
    this.jobHistory = this.jobHistory.filter(entry => entry.job.id !== job.id);

    const entry: JobHistoryEntry = {
      job,
      startedAt: new Date().toISOString(),
      status: 'completed', // Will be updated when job completes
    };

    this.jobHistory.unshift(entry);
    this.trimJobHistory();
  }

  public recordJobCompleted(job: Job, result: unknown, duration: number): void {
    const entry = this.jobHistory.find(e => e.job.id === job.id);
    if (entry) {
      entry.completedAt = new Date().toISOString();
      entry.duration = duration;
      entry.status = 'completed';
      entry.result = result;
    }
  }

  public recordJobFailed(job: Job, error: string, duration: number): void {
    const entry = this.jobHistory.find(e => e.job.id === job.id);
    if (entry) {
      entry.completedAt = new Date().toISOString();
      entry.duration = duration;
      entry.status = 'failed';
      entry.error = error;
    }
  }

  public recordJobCancelled(job: Job, duration: number): void {
    const entry = this.jobHistory.find(e => e.job.id === job.id);
    if (entry) {
      entry.completedAt = new Date().toISOString();
      entry.duration = duration;
      entry.status = 'cancelled';
    }
  }

  private trimJobHistory(): void {
    if (this.jobHistory.length > this.maxHistoryEntries) {
      this.jobHistory = this.jobHistory.slice(0, this.maxHistoryEntries);
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        this.isRunning = true;
        const address = this.server?.address();
        const actualPort =
          address && typeof address === 'object' && 'port' in address
            ? address.port || this.port
            : this.port;
        this.port = actualPort;
        logger.info(`Worker dashboard listening on http://localhost:${actualPort}`);
        resolve();
      });

      this.server.on('error', error => {
        logger.error('Worker dashboard server error:', error);
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          this.isRunning = false;
          logger.info('Worker dashboard stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  getPort(): number {
    return this.port;
  }

  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
