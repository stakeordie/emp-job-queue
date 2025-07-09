#!/usr/bin/env node

import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Available log files
const logFiles = {
  api: 'apps/api/logs/dev.log',
  worker: 'apps/worker/logs/dev.log',
  monitor: 'apps/monitor/logs/dev.log',
  docs: 'apps/docs/logs/dev.log',
  machines: 'logs/machines/dev.log',
  'local-redis': 'logs/local-redis.log'
};

// Colors for different components
const colors = {
  api: '\x1b[32m',      // Green
  worker: '\x1b[34m',   // Blue
  monitor: '\x1b[35m',  // Magenta
  docs: '\x1b[36m',     // Cyan
  machines: '\x1b[33m', // Yellow
  'local-redis': '\x1b[31m', // Red
  reset: '\x1b[0m'
};

function createLogDirs() {
  Object.values(logFiles).forEach(logPath => {
    const fullPath = join(rootDir, logPath);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });
}

function printUsage() {
  console.log(`
📋 Log Viewer - Monitor development logs

Usage:
  node scripts/log-viewer.js [component]

Available components:
${Object.keys(logFiles).map(name => `  • ${colors[name] || colors.reset}${name}${colors.reset}`).join('\n')}

Commands:
  all     - Show all logs with colored prefixes
  clear   - Clear all log files
  help    - Show this help message

Examples:
  node scripts/log-viewer.js api        # Tail API logs
  node scripts/log-viewer.js all        # Tail all logs
  node scripts/log-viewer.js clear      # Clear all logs
`);
}

function clearLogs() {
  console.log('🧹 Clearing all log files...');
  Object.entries(logFiles).forEach(([name, path]) => {
    const fullPath = join(rootDir, path);
    if (existsSync(fullPath)) {
      spawn('truncate', ['-s', '0', fullPath]);
      console.log(`  ✅ Cleared ${name} log`);
    }
  });
}

function tailLog(component) {
  const logPath = logFiles[component];
  if (!logPath) {
    console.error(`❌ Unknown component: ${component}`);
    printUsage();
    process.exit(1);
  }

  const fullPath = join(rootDir, logPath);
  
  // Check if log file exists, if not create the directory structure
  if (!existsSync(fullPath)) {
    console.log(`📝 Log file not found, will be created when component starts: ${fullPath}`);
    createLogDirs();
    // Create empty file so tail doesn't fail
    spawn('touch', [fullPath]);
  }

  console.log(`📖 Tailing ${colors[component] || colors.reset}${component}${colors.reset} logs: ${fullPath}`);
  console.log('💡 Start the component with: pnpm dev:' + component);
  console.log('Press Ctrl+C to stop\n');

  const tail = spawn('tail', ['-f', fullPath], { stdio: 'inherit' });
  
  process.on('SIGINT', () => {
    tail.kill();
    process.exit(0);
  });
}

function tailAllLogs() {
  console.log('📖 Tailing all logs with colored prefixes...');
  console.log('Press Ctrl+C to stop\n');

  createLogDirs();

  const tailProcesses = Object.entries(logFiles).map(([name, path]) => {
    const fullPath = join(rootDir, path);
    const color = colors[name] || colors.reset;
    
    const tail = spawn('tail', ['-f', fullPath]);
    
    tail.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        console.log(`${color}[${name.toUpperCase()}]${colors.reset} ${line}`);
      });
    });

    tail.stderr.on('data', (data) => {
      console.error(`${color}[${name.toUpperCase()}:ERR]${colors.reset} ${data}`);
    });

    return { name, tail };
  });

  process.on('SIGINT', () => {
    tailProcesses.forEach(({ tail }) => tail.kill());
    process.exit(0);
  });
}

// Main execution
const command = process.argv[2];

createLogDirs();

switch (command) {
  case 'help':
  case '--help':
  case '-h':
    printUsage();
    break;
    
  case 'clear':
    clearLogs();
    break;
    
  case 'all':
    tailAllLogs();
    break;
    
  case undefined:
    printUsage();
    break;
    
  default:
    tailLog(command);
    break;
}