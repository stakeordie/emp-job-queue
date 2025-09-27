#!/usr/bin/env node

/**
 * Ngrok Health Check Script
 * Checks ngrok.yml configuration and ensures all defined tunnels are running.
 * Starts any missing tunnels automatically.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import yaml from 'js-yaml';
import os from 'os';
import path from 'path';

const NGROK_CONFIG_PATH = path.join(os.homedir(), 'Library/Application Support/ngrok/ngrok.yml');
const CHECK_INTERVAL = 10000; // 10 seconds

class NgrokHealthChecker {
  constructor() {
    this.config = null;
    this.runningTunnels = new Map();
    this.processes = new Map();
  }

  async loadConfig() {
    try {
      const configContent = fs.readFileSync(NGROK_CONFIG_PATH, 'utf8');
      this.config = yaml.load(configContent);
      console.log('✅ Loaded ngrok configuration');
      return true;
    } catch (error) {
      console.error('❌ Failed to load ngrok config:', error.message);
      return false;
    }
  }

  async getRunningTunnels() {
    try {
      const result = execSync('ngrok api tunnels list', { encoding: 'utf8' });
      const data = JSON.parse(result);

      const tunnels = new Map();
      data.tunnels.forEach(tunnel => {
        const hostname = new URL(tunnel.public_url).hostname;
        tunnels.set(hostname, {
          id: tunnel.id,
          forwards_to: tunnel.forwards_to,
          public_url: tunnel.public_url
        });
      });

      return tunnels;
    } catch (error) {
      console.warn('⚠️  Failed to get running tunnels:', error.message);
      return new Map();
    }
  }

  async startTunnel(tunnelName, tunnelConfig) {
    const { proto, addr, hostname } = tunnelConfig;

    console.log(`🚀 Starting tunnel: ${tunnelName} (${hostname} → ${proto}://localhost:${addr})`);

    try {
      // Start tunnel using ngrok start command
      const process = spawn('ngrok', ['start', tunnelName], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });

      this.processes.set(tunnelName, process);

      process.stdout.on('data', (data) => {
        console.log(`📡 [${tunnelName}] ${data.toString().trim()}`);
      });

      process.stderr.on('data', (data) => {
        console.error(`❌ [${tunnelName}] ${data.toString().trim()}`);
      });

      process.on('exit', (code) => {
        console.log(`🔚 Tunnel ${tunnelName} exited with code ${code}`);
        this.processes.delete(tunnelName);
      });

      // Wait a moment for tunnel to start
      await new Promise(resolve => setTimeout(resolve, 3000));

      return true;
    } catch (error) {
      console.error(`❌ Failed to start tunnel ${tunnelName}:`, error.message);
      return false;
    }
  }

  async checkAndStartMissingTunnels() {
    if (!this.config?.tunnels) {
      console.log('ℹ️  No tunnels defined in configuration');
      return;
    }

    const runningTunnels = await this.getRunningTunnels();
    const configuredTunnels = this.config.tunnels;

    console.log('\n🔍 Checking tunnel status...');

    for (const [tunnelName, tunnelConfig] of Object.entries(configuredTunnels)) {
      const { hostname, addr } = tunnelConfig;
      const isRunning = runningTunnels.has(hostname);

      if (isRunning) {
        const running = runningTunnels.get(hostname);
        const expectedAddr = `http://localhost:${addr}`;

        if (running.forwards_to === expectedAddr) {
          console.log(`✅ ${tunnelName}: ${hostname} → localhost:${addr} (running)`);
        } else {
          console.log(`⚠️  ${tunnelName}: ${hostname} → ${running.forwards_to} (wrong port, expected :${addr})`);
          // Could implement restart logic here if ports don't match
        }
      } else {
        console.log(`❌ ${tunnelName}: ${hostname} → localhost:${addr} (not running)`);
        await this.startTunnel(tunnelName, tunnelConfig);
      }
    }
  }

  async startAllTunnels() {
    console.log('🚀 Starting all configured tunnels...');

    try {
      execSync('ngrok start --all', { stdio: 'inherit' });
      console.log('✅ All tunnels started successfully');
    } catch (error) {
      console.error('❌ Failed to start all tunnels:', error.message);

      // Fallback: start tunnels individually
      console.log('🔄 Falling back to individual tunnel startup...');
      if (this.config?.tunnels) {
        for (const [tunnelName, tunnelConfig] of Object.entries(this.config.tunnels)) {
          await this.startTunnel(tunnelName, tunnelConfig);
        }
      }
    }
  }

  async stopAllTunnels() {
    console.log('🛑 Stopping all tunnel processes...');

    for (const [tunnelName, process] of this.processes) {
      console.log(`🔚 Stopping ${tunnelName}...`);
      process.kill('SIGTERM');
    }

    this.processes.clear();
  }

  async run(mode = 'check') {
    console.log('🔧 Ngrok Health Checker');
    console.log('='.repeat(50));

    if (!(await this.loadConfig())) {
      process.exit(1);
    }

    switch (mode) {
      case 'start':
        await this.startAllTunnels();
        break;

      case 'check':
        await this.checkAndStartMissingTunnels();
        break;

      case 'watch':
        console.log('👀 Starting continuous monitoring...');
        console.log('Press Ctrl+C to stop');

        // Initial check
        await this.checkAndStartMissingTunnels();

        // Set up interval checking
        const interval = setInterval(async () => {
          await this.checkAndStartMissingTunnels();
        }, CHECK_INTERVAL);

        // Graceful shutdown
        process.on('SIGINT', async () => {
          console.log('\n🛑 Shutting down...');
          clearInterval(interval);
          await this.stopAllTunnels();
          process.exit(0);
        });

        break;

      default:
        console.log('Usage: node ngrok-health-check.js [check|start|watch]');
        console.log('  check: Check and start missing tunnels (default)');
        console.log('  start: Start all tunnels');
        console.log('  watch: Continuously monitor and restart tunnels');
    }
  }
}

// Run the health checker
const mode = process.argv[2] || 'check';
const checker = new NgrokHealthChecker();
checker.run(mode).catch(console.error);