#!/usr/bin/env node
// PM2 Service Manager for Basic Machine
// Provides programmatic control over PM2 services

const { exec } = require('child_process');
console.log("🚀🚀🚀 PM2 MANAGER LOADED - NEW CJS VERSION 🚀🚀🚀");
const { promisify } = require('util');
const execAsync = promisify(exec);
const fs = require('fs/promises');
const path = require('path');

class PM2ServiceManager {
  constructor() {
    this.pm2Home = process.env.PM2_HOME || '/workspace/.pm2';
    this.logDir = '/workspace/logs';
  }

  // Execute PM2 command
  async pm2Exec(command) {
    try {
      const { stdout, stderr } = await execAsync(`pm2 ${command}`);
      if (stderr && !stderr.includes('[PM2]')) {
        console.error(`PM2 stderr: ${stderr}`);
      }
      return stdout;
    } catch (error) {
      console.error(`PM2 command failed: ${command}`, error);
      throw error;
    }
  }

  // Start a service
  async startService(name, config) {
    console.log(`Starting service: ${name}`);
    
    // Check if service already exists
    const list = await this.pm2Exec('jlist');
    const processes = JSON.parse(list);
    const exists = processes.some(p => p.name === name);
    
    if (exists) {
      console.log(`Service ${name} already exists, restarting...`);
      return await this.restartService(name);
    }

    // Start new service
    const args = [
      `--name ${name}`,
      config.instances ? `--instances ${config.instances}` : '',
      config.max_memory_restart ? `--max-memory-restart ${config.max_memory_restart}` : '',
      config.cwd ? `--cwd ${config.cwd}` : '',
      config.error_file ? `--error ${config.error_file}` : '',
      config.out_file ? `--output ${config.out_file}` : '',
      config.merge_logs ? '--merge-logs' : '',
      config.time ? '--time' : '',
      config.watch ? '--watch' : '',
      config.autorestart !== false ? '' : '--no-autorestart'
    ].filter(Boolean).join(' ');

    const envArgs = Object.entries(config.env || {})
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');

    const command = `start ${config.script} ${args} ${envArgs ? `-- ${envArgs}` : ''}`;
    await this.pm2Exec(command);
    
    console.log(`Service ${name} started successfully`);
    return await this.getServiceStatus(name);
  }

  // Stop a service
  async stopService(name) {
    console.log(`Stopping service: ${name}`);
    await this.pm2Exec(`stop ${name}`);
    console.log(`Service ${name} stopped`);
  }

  // Restart a service
  async restartService(name) {
    console.log(`Restarting service: ${name}`);
    await this.pm2Exec(`restart ${name}`);
    console.log(`Service ${name} restarted`);
    return await this.getServiceStatus(name);
  }

  // Delete a service
  async deleteService(name) {
    console.log(`Deleting service: ${name}`);
    await this.pm2Exec(`delete ${name}`);
    console.log(`Service ${name} deleted`);
  }

  // Get service status
  async getServiceStatus(name) {
    const list = await this.pm2Exec('jlist');
    const processes = JSON.parse(list);
    const service = processes.find(p => p.name === name);
    
    if (!service) {
      return { status: 'not_found', name };
    }

    return {
      name: service.name,
      status: service.pm2_env.status,
      pid: service.pid,
      cpu: service.monit.cpu,
      memory: service.monit.memory,
      uptime: service.pm2_env.pm_uptime,
      restarts: service.pm2_env.restart_time,
      created_at: service.pm2_env.created_at
    };
  }

  // Get all services status
  async getAllServicesStatus() {
    const list = await this.pm2Exec('jlist');
    const processes = JSON.parse(list);
    
    return processes.map(service => ({
      name: service.name,
      status: service.pm2_env.status,
      pid: service.pid,
      cpu: service.monit.cpu,
      memory: service.monit.memory,
      uptime: service.pm2_env.pm_uptime,
      restarts: service.pm2_env.restart_time
    }));
  }

  // Monitor services
  async monitorServices() {
    console.log('Starting PM2 monitor...');
    // This will open the PM2 monitor in the terminal
    const { spawn } = await import('child_process');
    const monitor = spawn('pm2', ['monit'], {
      stdio: 'inherit'
    });
    
    monitor.on('exit', (code) => {
      console.log(`PM2 monitor exited with code ${code}`);
    });
  }

  // Get logs for a service
  async getServiceLogs(name, lines = 50) {
    const output = await this.pm2Exec(`logs ${name} --lines ${lines} --nostream`);
    return output;
  }

  // Save PM2 process list
  async save() {
    console.log('Saving PM2 process list...');
    await this.pm2Exec('save');
    console.log('PM2 process list saved');
  }

  // Resurrect saved processes
  async resurrect() {
    console.log('Resurrecting PM2 processes...');
    await this.pm2Exec('resurrect');
    console.log('PM2 processes resurrected');
  }

  // Setup PM2 startup script
  async setupStartup() {
    console.log('Setting up PM2 startup script...');
    const platform = process.platform;
    let startupCommand = 'startup';
    
    if (platform === 'linux') {
      // Try to detect init system
      try {
        await fs.access('/run/systemd/system');
        startupCommand = 'startup systemd';
      } catch {
        startupCommand = 'startup';
      }
    }
    
    const output = await this.pm2Exec(startupCommand);
    console.log('PM2 startup script generated:', output);
    return output;
  }

  // Flush logs
  async flushLogs(name = null) {
    const target = name || 'all';
    console.log(`Flushing logs for: ${target}`);
    await this.pm2Exec(`flush ${target}`);
    console.log('Logs flushed');
  }

  // Reload service with 0-downtime
  async reloadService(name) {
    console.log(`Reloading service with 0-downtime: ${name}`);
    await this.pm2Exec(`reload ${name}`);
    console.log(`Service ${name} reloaded`);
  }

  // Scale service
  async scaleService(name, instances) {
    console.log(`Scaling service ${name} to ${instances} instances`);
    await this.pm2Exec(`scale ${name} ${instances}`);
    console.log(`Service ${name} scaled to ${instances} instances`);
  }
}

// Export for CommonJS
module.exports = PM2ServiceManager;