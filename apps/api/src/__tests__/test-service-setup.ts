/**
 * Test Service Setup Utility
 *
 * Checks if required services are running and starts them if needed.
 * Ensures all e2e tests run against properly configured testrunner services.
 *
 * Usage:
 *   ensureServicesRunning(['api', 'telcollect', 'webhook'])
 *   ensureServicesRunning(['api', 'telcollect', 'webhook'], 'testrunner-docker')
 *   ensureServicesRunning(['api', 'machine:ollama:3'], 'testrunner-docker')
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import fetch from 'node-fetch';

interface ServiceConfig {
  name: string;
  healthCheck: () => Promise<boolean>;
  startCommand: string;
  startArgs: string[];
  startupDelay: number;
}

// Service startup commands based on profile
function getServiceStartArgs(serviceName: string, profile: string): string[] {
  const isDocker = profile.includes('docker');

  const commands: Record<string, { local: string[], docker: string[] }> = {
    api: {
      local: ['dev:api', '--env', profile],
      docker: ['d:api:run', profile]
    },
    telcollect: {
      local: ['dev:telcollect', '--env', profile],
      docker: ['d:telcollect:run', profile]
    },
    webhook: {
      local: ['dev:webhook', '--env', profile],
      docker: ['d:webhook:run', profile]
    }
  };

  const command = commands[serviceName];
  if (!command) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  return isDocker ? command.docker : command.local;
}

const SERVICES: Record<string, ServiceConfig> = {
  api: {
    name: 'API',
    healthCheck: async () => {
      try {
        const response = await fetch('http://localhost:3331');
        return response.ok || response.status === 404;
      } catch {
        return false;
      }
    },
    startCommand: 'pnpm',
    startArgs: ['dev:api', '--env', 'testrunner'], // Default, overridden by profile
    startupDelay: 5000,
  },
  telcollect: {
    name: 'OTLP Collector',
    healthCheck: async () => {
      try {
        const response = await fetch('http://localhost:43189/v1/traces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceSpans: [] }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    startCommand: 'pnpm',
    startArgs: ['dev:telcollect', '--env', 'testrunner'], // Default, overridden by profile
    startupDelay: 5000,
  },
  webhook: {
    name: 'Webhook Service',
    healthCheck: async () => {
      try {
        const response = await fetch('http://localhost:3332/health');
        return response.ok;
      } catch {
        return false;
      }
    },
    startCommand: 'pnpm',
    startArgs: ['dev:webhook', '--env', 'testrunner'], // Default, overridden by profile
    startupDelay: 5000,
  },
};

const startedProcesses: Map<string, ChildProcess> = new Map();

// Parse machine specification like "machine:ollama:3"
function parseMachineSpec(spec: string): { type: string; count: number } | null {
  const match = spec.match(/^machine:(\w+):(\d+)$/);
  if (!match) return null;
  return {
    type: match[1],
    count: parseInt(match[2], 10)
  };
}

async function startService(serviceName: string, profile: string = 'testrunner'): Promise<ChildProcess> {
  const config = SERVICES[serviceName];
  if (!config) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  console.log(`🚀 Starting ${config.name} with profile: ${profile}...`);

  const startArgs = getServiceStartArgs(serviceName, profile);
  const process = spawn(config.startCommand, startArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: '/Users/the_dusky/code/emprops/ai_infra/emp-job-queue',
  });

  startedProcesses.set(serviceName, process);

  // Wait for startup
  await new Promise((resolve) => setTimeout(resolve, config.startupDelay));

  console.log(`✅ ${config.name} started`);
  return process;
}

async function startMachine(machineType: string, count: number, profile: string): Promise<ChildProcess[]> {
  console.log(`🚀 Starting ${count} ${machineType} machine(s) with profile: ${profile}...`);

  const isDocker = profile.includes('docker');
  const command = isDocker ? 'd:machine:run' : 'dev:machine';

  const processes: ChildProcess[] = [];

  for (let i = 0; i < count; i++) {
    const args = isDocker
      ? [command, machineType, profile]
      : [command, '--type', machineType, '--env', profile];

    const process = spawn('pnpm', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: '/Users/the_dusky/code/emprops/ai_infra/emp-job-queue',
    });

    const processKey = `machine:${machineType}:${i}`;
    startedProcesses.set(processKey, process);
    processes.push(process);
  }

  // Wait for startup
  await new Promise((resolve) => setTimeout(resolve, 10000)); // Machines take longer

  console.log(`✅ ${count} ${machineType} machine(s) started`);
  return processes;
}

// Check if Redis is running
async function isRedisRunning(): Promise<boolean> {
  try {
    const result = execSync('redis-cli -h localhost -p 6379 PING', { encoding: 'utf-8', timeout: 2000 });
    return result.trim() === 'PONG';
  } catch {
    return false;
  }
}

// Check if API is running
async function isAPIRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3331', { timeout: 2000 } as any);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// Check if Webhook service is running
async function isWebhookRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3332/health', { timeout: 2000 } as any);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if Monitor is running
async function isMonitorRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3333', { timeout: 2000 } as any);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// Check if Telemetry Collector is running
async function isTelemetryRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:43189/v1/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
      timeout: 2000
    } as any);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if Docker containers are running (API or Webhook)
function areDockerContainersRunning(): boolean {
  try {
    const result = execSync('docker ps --format "{{.Names}}" | grep -E "^(api-|webhook-)"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

// Check all 5 dashboard services
async function checkAllDashboardServices(): Promise<{
  all: boolean;
  redis: boolean;
  api: boolean;
  webhook: boolean;
  monitor: boolean;
  telemetry: boolean;
}> {
  const redis = await isRedisRunning();
  const api = await isAPIRunning();
  const webhook = await isWebhookRunning();
  const monitor = await isMonitorRunning();
  const telemetry = await isTelemetryRunning();

  return {
    all: redis && api && webhook && monitor && telemetry,
    redis,
    api,
    webhook,
    monitor,
    telemetry
  };
}

export async function ensureServicesRunning(
  serviceSpecs: string[],
  profile: string = 'testrunner'
): Promise<void> {
  console.log(`\n🔧 Checking dashboard services (profile: ${profile})...\n`);

  const isDocker = profile.includes('docker');
  const dockerRunning = areDockerContainersRunning();

  // Check for mode mismatch
  if (isDocker && !dockerRunning && (await isAPIRunning() || await isWebhookRunning())) {
    console.log(`⚠️  Mode mismatch: Profile is ${profile} (Docker) but local services are running\n`);
    console.log(`🔄 Will shutdown and restart in Docker mode\n`);
  } else if (!isDocker && dockerRunning) {
    console.log(`⚠️  Mode mismatch: Profile is ${profile} (local) but Docker containers are running\n`);
    console.log(`🔄 Will shutdown and restart in local mode\n`);
  }

  const status = await checkAllDashboardServices();

  console.log(`   Redis:     ${status.redis ? '✅' : '❌'}`);
  console.log(`   API:       ${status.api ? '✅' : '❌'}`);
  console.log(`   Webhook:   ${status.webhook ? '✅' : '❌'}`);
  console.log(`   Monitor:   ${status.monitor ? '✅' : '❌'}`);
  console.log(`   Telemetry: ${status.telemetry ? '✅' : '❌'}\n`);

  // Check for mode mismatch or incomplete services
  const modeMismatch = (isDocker && !dockerRunning && (status.api || status.webhook)) ||
                       (!isDocker && dockerRunning);
  const needsRestart = !status.all || modeMismatch;

  if (!needsRestart) {
    console.log(`✅ All dashboard services running for profile: ${profile}\n`);
  } else {
    if (modeMismatch) {
      console.log(`⚠️  Mode mismatch detected. Restarting dashboard...\n`);
    } else {
      console.log(`⚠️  Some services not running. Restarting dashboard...\n`);
    }

    // Shutdown existing services
    console.log('🛑 Running: pnpm shutdown\n');
    try {
      execSync('pnpm shutdown', {
        cwd: '/Users/the_dusky/code/emprops/ai_infra/emp-job-queue',
        stdio: 'inherit'
      });
    } catch (error) {
      console.log('   (shutdown may have failed, continuing...)\n');
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Start dashboard
    console.log(`🚀 Starting: pnpm -w dash:dev ${profile}\n`);
    const process = spawn('pnpm', ['-w', 'dash:dev', profile], {
      stdio: 'inherit',
      cwd: '/Users/the_dusky/code/emprops/ai_infra/emp-job-queue',
      detached: true,
    });

    startedProcesses.set('dashboard', process);

    // Check 3 times with increasing delays: 15s, 30s, 60s
    console.log('⏳ Checking services (will check 3 times: 15s, 30s, 60s)...\n');

    const delays = [15000, 30000, 60000]; // 15s, 30s, 60s

    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`   Check ${attempt}/3 (waiting ${delays[attempt - 1] / 1000}s)...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt - 1]));

      const currentStatus = await checkAllDashboardServices();

      console.log(`   Redis:     ${currentStatus.redis ? '✅' : '❌'}`);
      console.log(`   API:       ${currentStatus.api ? '✅' : '❌'}`);
      console.log(`   Webhook:   ${currentStatus.webhook ? '✅' : '❌'}`);
      console.log(`   Monitor:   ${currentStatus.monitor ? '✅' : '❌'}`);
      console.log(`   Telemetry: ${currentStatus.telemetry ? '✅' : '❌'}\n`);

      if (currentStatus.all) {
        console.log('✅ All dashboard services are healthy\n');
        break;
      }

      if (attempt === 3) {
        console.error('❌ Dashboard failed to start all services after 3 checks (105 seconds total)');
        throw new Error('Dashboard failed to start after 3 checks (15s + 30s + 60s = 105s)');
      }
    }
  }

  // Now handle machines if specified
  for (const spec of serviceSpecs) {
    const machineSpec = parseMachineSpec(spec);
    if (machineSpec) {
      await startMachine(machineSpec.type, machineSpec.count, profile);
    }
  }

  console.log('✅ All required services ready\n');
}

export function cleanupStartedServices(): void {
  if (startedProcesses.size > 0) {
    console.log('\n🛑 Cleaning up started services...');
    for (const [name, process] of startedProcesses.entries()) {
      console.log(`   Stopping ${name}...`);
      process.kill();
    }
    startedProcesses.clear();
  }
}
