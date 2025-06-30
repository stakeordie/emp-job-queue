// Monitoring Dashboard - simple HTML dashboard for system monitoring
// Direct port from Python apps/simple-redis-monitor functionality

import express, { Request, Response } from 'express';
import { RedisServiceInterface } from '../core/interfaces/redis-service.js';
import { ConnectionManagerInterface } from '../core/interfaces/connection-manager.js';
import { logger } from '../core/utils/logger.js';

export class MonitoringDashboard {
  private app: express.Express;
  private redisService: RedisServiceInterface;
  private connectionManager: ConnectionManagerInterface;

  constructor(redisService: RedisServiceInterface, connectionManager: ConnectionManagerInterface) {
    this.redisService = redisService;
    this.connectionManager = connectionManager;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Serve static dashboard
    this.app.get('/', this.handleDashboard.bind(this));

    // API endpoints for dashboard data
    this.app.get('/api/status', this.handleApiStatus.bind(this));
    this.app.get('/api/jobs', this.handleApiJobs.bind(this));
    this.app.get('/api/workers', this.handleApiWorkers.bind(this));
    this.app.get('/api/metrics', this.handleApiMetrics.bind(this));
  }

  private async handleDashboard(req: Request, res: Response): Promise<void> {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>emp-redis Monitoring Dashboard</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0; 
            padding: 20px; 
            background-color: #f5f5f5;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 30px;
            border-bottom: 2px solid #eee;
            padding-bottom: 20px;
        }
        .status-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .status-card { 
            background: #f8f9fa; 
            padding: 20px; 
            border-radius: 6px; 
            border-left: 4px solid #007bff;
        }
        .status-card.success { border-left-color: #28a745; }
        .status-card.warning { border-left-color: #ffc107; }
        .status-card.error { border-left-color: #dc3545; }
        .status-title { 
            font-size: 14px; 
            color: #666; 
            margin-bottom: 8px; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .status-value { 
            font-size: 24px; 
            font-weight: 600; 
            color: #333; 
        }
        .section { 
            margin-bottom: 30px; 
        }
        .side-by-side {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        @media (max-width: 1200px) {
            .side-by-side {
                grid-template-columns: 1fr;
            }
        }
        .section-title { 
            font-size: 18px; 
            font-weight: 600; 
            margin-bottom: 15px; 
            color: #333;
        }
        .table { 
            width: 100%; 
            border-collapse: collapse; 
            background: white;
            border-radius: 6px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .table th, .table td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #eee; 
        }
        .table th { 
            background: #f8f9fa; 
            font-weight: 600;
            color: #555;
        }
        .badge { 
            padding: 4px 8px; 
            border-radius: 12px; 
            font-size: 11px; 
            font-weight: 500;
            text-transform: uppercase;
        }
        .badge.pending { background: #e3f2fd; color: #1976d2; }
        .badge.active { background: #e8f5e8; color: #388e3c; }
        .badge.completed { background: #f3e5f5; color: #7b1fa2; }
        .badge.failed { background: #ffebee; color: #d32f2f; }
        .badge.idle { background: #e8f5e8; color: #388e3c; }
        .badge.busy { background: #fff3e0; color: #f57c00; }
        .badge.offline { background: #ffebee; color: #d32f2f; }
        .refresh-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .refresh-btn:hover { background: #0056b3; }
        .last-updated { color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>emp-redis Monitoring Dashboard</h1>
            <div>
                <button class="refresh-btn" onclick="refreshData()">Refresh</button>
                <div class="last-updated" id="lastUpdated">Loading...</div>
            </div>
        </div>

        <div class="status-grid" id="statusGrid">
            <!-- Status cards will be populated by JavaScript -->
        </div>

        <div class="section">
            <h2 class="section-title">Active Jobs</h2>
            <table class="table" id="activeJobsTable">
                <thead>
                    <tr>
                        <th>Job ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Worker</th>
                        <th>Progress</th>
                        <th>Started</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="6">Loading...</td></tr>
                </tbody>
            </table>
        </div>

        <div class="side-by-side">
            <div class="section">
                <h2 class="section-title">Connected Workers</h2>
                <table class="table" id="workersTable">
                    <thead>
                        <tr>
                            <th>Worker ID</th>
                            <th>Status</th>
                            <th>Services</th>
                            <th>Hardware</th>
                            <th>Current Jobs</th>
                            <th>Last Heartbeat</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="6">Loading...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="section">
                <h2 class="section-title">Job Queue</h2>
                <table class="table" id="queueTable">
                    <thead>
                        <tr>
                            <th>Job ID</th>
                            <th>Type</th>
                            <th>Priority</th>
                            <th>Queue Position</th>
                            <th>Created</th>
                            <th>Requirements</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="6">Loading...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div class="section">
            <h2 class="section-title">Recently Completed Jobs</h2>
            <table class="table" id="completedTable">
                <thead>
                    <tr>
                        <th>Job ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Worker</th>
                        <th>Duration</th>
                        <th>Completed</th>
                    </tr>
                </thead>
                <tbody>
                    <tr><td colspan="6">Loading...</td></tr>
                </tbody>
            </table>
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

        function formatTime(timestamp) {
            if (!timestamp) return '-';
            return new Date(timestamp).toLocaleString();
        }

        function formatDuration(start, end) {
            if (!start) return '-';
            const startTime = new Date(start);
            const endTime = end ? new Date(end) : new Date();
            const duration = Math.floor((endTime - startTime) / 1000);
            return duration + 's';
        }

        function createStatusCard(title, value, status = 'info') {
            return \`
                <div class="status-card \${status}">
                    <div class="status-title">\${title}</div>
                    <div class="status-value">\${value}</div>
                </div>
            \`;
        }

        function createBadge(text, type) {
            return \`<span class="badge \${type}">\${text}</span>\`;
        }

        async function updateStatus() {
            const status = await fetchData('/api/status');
            if (!status) return;

            const statusGrid = document.getElementById('statusGrid');
            statusGrid.innerHTML = \`
                \${createStatusCard('Pending Jobs', status.jobs?.pending || 0, 'warning')}
                \${createStatusCard('Active Jobs', status.jobs?.active || 0, 'active')}
                \${createStatusCard('Connected Workers', status.workers?.active || 0, 'success')}
                \${createStatusCard('Completed Today', status.jobs?.completed || 0, 'success')}
            \`;
        }

        async function updateJobs() {
            const jobs = await fetchData('/api/jobs?status=active,in_progress');
            if (!jobs?.jobs) return;

            const tbody = document.querySelector('#activeJobsTable tbody');
            if (jobs.jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No active jobs</td></tr>';
                return;
            }

            tbody.innerHTML = jobs.jobs.map(job => \`
                <tr>
                    <td>\${job.id.substring(0, 8)}...</td>
                    <td>\${job.type}</td>
                    <td>\${createBadge(job.status, job.status)}</td>
                    <td>\${job.worker_id ? job.worker_id.substring(0, 8) + '...' : '-'}</td>
                    <td>-</td>
                    <td>\${formatTime(job.started_at)}</td>
                </tr>
            \`).join('');
        }

        async function updateWorkers() {
            const workers = await fetchData('/api/workers');
            if (!workers?.workers) return;

            const tbody = document.querySelector('#workersTable tbody');
            if (workers.workers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No connected workers</td></tr>';
                return;
            }

            tbody.innerHTML = workers.workers.map(worker => \`
                <tr>
                    <td>\${worker.worker_id}</td>
                    <td>\${createBadge(worker.status, worker.status)}</td>
                    <td>\${worker.capabilities?.services?.join(', ') || '-'}</td>
                    <td>
                        \${worker.capabilities?.hardware?.gpu_count || 0} GPU, 
                        \${worker.capabilities?.hardware?.ram_gb || 0}GB RAM
                    </td>
                    <td>\${worker.current_jobs?.length || 0}</td>
                    <td>\${formatTime(worker.last_heartbeat)}</td>
                </tr>
            \`).join('');
        }

        async function updateQueue() {
            const queue = await fetchData('/api/jobs?status=pending');
            if (!queue?.jobs) return;

            const tbody = document.querySelector('#queueTable tbody');
            if (queue.jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No pending jobs</td></tr>';
                return;
            }

            tbody.innerHTML = queue.jobs.slice(0, 10).map((job, index) => \`
                <tr>
                    <td>\${job.id.substring(0, 8)}...</td>
                    <td>\${job.type}</td>
                    <td>\${job.priority}</td>
                    <td>\${index + 1}</td>
                    <td>\${formatTime(job.created_at)}</td>
                    <td>\${job.requirements?.service_type || '-'}</td>
                </tr>
            \`).join('');
        }

        async function updateCompleted() {
            const completed = await fetchData('/api/jobs?status=completed&limit=20');
            if (!completed?.jobs) return;

            const tbody = document.querySelector('#completedTable tbody');
            if (completed.jobs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6">No recently completed jobs</td></tr>';
                return;
            }

            tbody.innerHTML = completed.jobs.slice(0, 20).map(job => \`
                <tr>
                    <td>\${job.id.substring(0, 8)}...</td>
                    <td>\${job.type}</td>
                    <td><span class="badge completed">Completed</span></td>
                    <td>\${job.worker_id ? job.worker_id.substring(0, 8) + '...' : '-'}</td>
                    <td>\${formatDuration(job.started_at, job.completed_at)}</td>
                    <td>\${formatTime(job.completed_at)}</td>
                </tr>
            \`).join('');
        }

        async function refreshData() {
            document.getElementById('lastUpdated').textContent = 'Refreshing...';
            
            await Promise.all([
                updateStatus(),
                updateJobs(),
                updateWorkers(),
                updateQueue(),
                updateCompleted()
            ]);
            
            document.getElementById('lastUpdated').textContent = 
                'Last updated: ' + new Date().toLocaleTimeString();
        }

        // Initialize
        refreshData();
        
        // Auto refresh every 5 seconds
        refreshInterval = setInterval(refreshData, 5000);
    </script>
</body>
</html>`;

    res.send(html);
  }

  private async handleApiStatus(req: Request, res: Response): Promise<void> {
    try {
      const [jobStats, workerStats] = await Promise.all([
        this.redisService.getJobStatistics(),
        this.redisService.getWorkerStatistics(),
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        jobs: jobStats,
        workers: workerStats,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          connections: await this.connectionManager.getConnectionStatistics(),
        },
      });
    } catch (error) {
      logger.error('Failed to get API status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  }

  private async handleApiJobs(req: Request, res: Response): Promise<void> {
    try {
      const status = req.query.status as string;
      const limit = parseInt(req.query.limit as string) || 50;

      logger.info(`Dashboard API: /api/jobs called with status=${status}, limit=${limit}`);

      let jobs = [];
      if (status?.includes('active') || status?.includes('in_progress')) {
        jobs = await this.redisService.getActiveJobs();
        logger.info(`Found ${jobs.length} active jobs`);
      } else if (status?.includes('pending')) {
        jobs = await this.redisService.getPendingJobs(limit);
        logger.info(`Found ${jobs.length} pending jobs`);
      } else if (status?.includes('completed')) {
        jobs = await this.redisService.getCompletedJobs(limit);
        logger.info(`Found ${jobs.length} completed jobs`);
      } else if (status?.includes('failed')) {
        jobs = await this.redisService.getFailedJobs(limit);
        logger.info(`Found ${jobs.length} failed jobs`);
      } else {
        // Get all pending jobs by default
        jobs = await this.redisService.getPendingJobs(limit);
        logger.info(`Found ${jobs.length} pending jobs (default)`);
      }

      logger.info(`Returning ${jobs.length} jobs for status=${status}`);
      res.json({ jobs });
    } catch (error) {
      logger.error('Failed to get API jobs:', error);
      res.status(500).json({ error: 'Failed to get jobs' });
    }
  }

  private async handleApiWorkers(req: Request, res: Response): Promise<void> {
    try {
      const workers = await this.redisService.getAllWorkers();
      res.json({ workers });
    } catch (error) {
      logger.error('Failed to get API workers:', error);
      res.status(500).json({ error: 'Failed to get workers' });
    }
  }

  private async handleApiMetrics(req: Request, res: Response): Promise<void> {
    try {
      const [jobStats, workerStats, systemMetrics] = await Promise.all([
        this.redisService.getJobStatistics(),
        this.redisService.getWorkerStatistics(),
        this.redisService.getSystemMetrics(),
      ]);

      res.json({
        timestamp: new Date().toISOString(),
        jobs: jobStats,
        workers: workerStats,
        system: systemMetrics,
      });
    } catch (error) {
      logger.error('Failed to get API metrics:', error);
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }

  getApp(): express.Express {
    return this.app;
  }
}
