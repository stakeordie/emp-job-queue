module.exports = {
  apps: [
    {
      name: 'orchestrator',
      script: 'src/orchestrator.js',
      interpreter: 'node',
      cwd: '/service-manager',
      error_file: '/workspace/logs/orchestrator-error.log',
      out_file: '/workspace/logs/orchestrator-out.log',
      log_file: '/workspace/logs/orchestrator-combined.log',
      merge_logs: true,
      max_restarts: 5,
      min_uptime: '10s',
      max_memory_restart: '1G',
      restart_delay: 5000,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        SERVICE_MANAGER_PATH: '/service-manager',
        WORKSPACE_PATH: '/workspace',
        PM2_HOME: '/workspace/.pm2'
      }
    },
    {
      name: 'health-server',
      script: 'src/services/health-server.js',
      interpreter: 'node',
      cwd: '/service-manager',
      error_file: '/workspace/logs/health-server-error.log',
      out_file: '/workspace/logs/health-server-out.log',
      log_file: '/workspace/logs/health-server-combined.log',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '5s',
      max_memory_restart: '512M',
      restart_delay: 2000,
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        SERVICE_MANAGER_PATH: '/service-manager',
        WORKSPACE_PATH: '/workspace'
      }
    }
  ]
};