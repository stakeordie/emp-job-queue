#!/usr/bin/env node

/**
 * Service restart script with switch statement
 *
 * Usage:
 *   node scripts/restart-service.js <service>
 *
 * Examples:
 *   node scripts/restart-service.js mini-app
 *   node scripts/restart-service.js emprops-ui
 *   node scripts/restart-service.js api
 *   node scripts/restart-service.js webhook-service
 */

import { spawn, exec } from 'child_process';
import chalk from 'chalk';
import util from 'util';

const execAsync = util.promisify(exec);


function log(message, color = 'white') {
  console.log(chalk[color](`🔄 ${message}`));
}

function error(message) {
  console.error(chalk.red(`❌ ${message}`));
}

function success(message) {
  console.log(chalk.green(`✅ ${message}`));
}

async function restartService(serviceName) {
  log(`Restarting ${serviceName}...`, 'blue');

  switch (serviceName) {
    case 'mini-app':
      // Restart mini-app service in "Development" tab
      try {
        log('Restarting mini-app in Development tab...', 'yellow');

        // Get active sessions and find one with Development tab
        const sessionsOutput = await execAsync('zellij list-sessions');
        const activeSessions = sessionsOutput.stdout.split('\n')
          .filter(line => line.includes('Created') && !line.includes('EXITED'))
          .map(line => {
            // Clean up ANSI color codes and extract session name
            const cleaned = line.replace(/\x1B\[[0-9;]*[mGK]/g, '');
            return cleaned.split(' ')[0];
          });

        if (activeSessions.length === 0) {
          throw new Error('No active zellij sessions found');
        }

        // Try the most recent session first
        const sessionName = activeSessions[0];
        log(`Using session: ${sessionName}`, 'cyan');

        // Go to Development tab
        await execAsync(`zellij -s ${sessionName} action go-to-tab-name "Development"`);

        // The mini-app is in the bottom-right pane according to kdl
        // Navigate to right column, then to bottom pane (Emerge MiniApp)
        await execAsync(`zellij -s ${sessionName} action move-focus down`);
        await execAsync(`zellij -s ${sessionName} action move-focus right`);
        await execAsync(`zellij -s ${sessionName} action move-focus right`);

        // Stop current process
        await execAsync(`zellij -s ${sessionName} action write 3`); // Ctrl+C

        // Start new process
        await execAsync(`zellij -s ${sessionName} action write-chars "PORT=3002 pnpm dev"`);
        await execAsync(`zellij -s ${sessionName} action write 10`); // Enter

        success('Mini-app restarted in dashboard pane');
      } catch (err) {
        error(`Failed to restart mini-app: ${err.message}`);
      }
      break;

    case 'emprops-ui':
      // Restart emprops-ui service (from dashboard pane)
      try {
        log('Stopping emprops-ui processes...', 'yellow');
        await execAsync('pkill -f "emprops-open-interface.*yarn dev:local:dev" || true');

        log('Starting emprops-ui...', 'yellow');
        await execAsync('cd ~/code/emprops/core-services/emprops-open-interface && yarn dev:local:dev &');

        success('EmProps UI restarted successfully');
      } catch (err) {
        error(`Failed to restart emprops-ui: ${err.message}`);
      }
      break;

    case 'emprops-api':
      // Restart emprops API server (from dashboard pane)
      try {
        log('Stopping emprops API processes...', 'yellow');
        await execAsync('pkill -f "emprops-open-api.*yarn dev:local:dev" || true');

        log('Starting emprops API...', 'yellow');
        await execAsync('cd ~/code/emprops/emprops-open-api && yarn dev:local:dev &');

        success('EmProps API restarted successfully');
      } catch (err) {
        error(`Failed to restart emprops API: ${err.message}`);
      }
      break;

    case 'api':
    case 'job-queue-api':
      // Restart job queue API service (from dashboard pane)
      try {
        log('Stopping job queue API processes...', 'yellow');
        await execAsync('pkill -f "pnpm d:api:run local-dev" || true');

        log('Starting job queue API...', 'yellow');
        await execAsync('cd ~/code/emprops/ai_infra/emp-job-queue && pnpm d:api:run local-dev &');

        success('Job queue API restarted successfully');
      } catch (err) {
        error(`Failed to restart job queue API: ${err.message}`);
      }
      break;

    case 'webhook-service':
    case 'webhook':
      // Restart webhook service (from dashboard pane)
      try {
        log('Stopping webhook service processes...', 'yellow');
        await execAsync('pkill -f "pnpm d:webhook:run local-dev" || true');

        log('Starting webhook service...', 'yellow');
        await execAsync('cd ~/code/emprops/ai_infra/emp-job-queue && pnpm d:webhook:run local-dev &');

        success('Webhook service restarted successfully');
      } catch (err) {
        error(`Failed to restart webhook service: ${err.message}`);
      }
      break;

    case 'monitor':
    case 'job-monitor':
      // Restart monitor service (from dashboard pane)
      try {
        log('Stopping monitor processes...', 'yellow');
        await execAsync('pkill -f "pnpm dev:monitor.*local-dev" || true');

        log('Starting monitor...', 'yellow');
        await execAsync('cd ~/code/emprops/ai_infra/emp-job-queue && pnpm dev:monitor --env local-dev &');

        success('Monitor restarted successfully');
      } catch (err) {
        error(`Failed to restart monitor: ${err.message}`);
      }
      break;

    case 'redis':
      // Restart Redis service (from dashboard pane)
      try {
        log('Stopping Redis processes...', 'yellow');
        await execAsync('pkill -f "pnpm dev:redis" || true');

        log('Starting Redis...', 'yellow');
        await execAsync('cd ~/code/emprops/ai_infra/emp-job-queue && pnpm dev:redis &');

        success('Redis restarted successfully');
      } catch (err) {
        error(`Failed to restart Redis: ${err.message}`);
      }
      break;

    case 'worker':
      // Restart worker service
      try {
        log('Stopping worker processes...', 'yellow');
        await execAsync('pkill -f "emp-job-queue.*worker" || true');

        log('Starting worker...', 'yellow');
        spawn('pnpm', ['dev:worker'], {
          stdio: 'inherit',
          detached: true,
          cwd: process.cwd()
        });

        success('Worker restarted successfully');
      } catch (err) {
        error(`Failed to restart worker: ${err.message}`);
      }
      break;

    case 'cleanup':
    case 'shutdown':
      // Clean up all exited zellij sessions
      try {
        log('Cleaning up exited zellij sessions...', 'yellow');

        // Kill all exited sessions
        await execAsync('zellij delete-all-sessions --force --yes 2>/dev/null || true');

        success('All exited zellij sessions cleaned up');
      } catch (err) {
        error(`Failed to cleanup sessions: ${err.message}`);
      }
      break;

    default:
      error(`Unknown service: ${serviceName}`);
      console.log(chalk.cyan('\nAvailable services:'));
      console.log(chalk.cyan('  • mini-app'));
      console.log(chalk.cyan('  • emprops-ui'));
      console.log(chalk.cyan('  • emprops-api'));
      console.log(chalk.cyan('  • api (job-queue-api)'));
      console.log(chalk.cyan('  • webhook'));
      console.log(chalk.cyan('  • monitor'));
      console.log(chalk.cyan('  • redis'));
      console.log(chalk.cyan('  • worker'));
      console.log(chalk.cyan(''));
      console.log(chalk.cyan('Special commands:'));
      console.log(chalk.cyan('  • cleanup - Delete all exited zellij sessions'));
      console.log(chalk.cyan('  • shutdown - Same as cleanup'));
      process.exit(1);
  }
}

// Get service name from command line arguments
const serviceName = process.argv[2];

if (!serviceName) {
  error('Please specify a service to restart');
  console.log(chalk.cyan('\nUsage: node scripts/restart-service.js <service>'));
  console.log(chalk.cyan('\nAvailable services:'));
  console.log(chalk.cyan('  • mini-app'));
  console.log(chalk.cyan('  • emprops-ui'));
  console.log(chalk.cyan('  • api'));
  console.log(chalk.cyan('  • webhook-service'));
  console.log(chalk.cyan('  • monitor'));
  console.log(chalk.cyan('  • worker'));
  process.exit(1);
}

restartService(serviceName);