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

import { spawn, ChildProcess } from 'child_process';
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
    },
    monitor: {
      local: ['dev:monitor', '--env', profile],
      docker: ['d:monitor:run', profile]
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
  monitor: {
    name: 'Monitor UI',
    healthCheck: async () => {
      try {
        const response = await fetch('http://localhost:3333');
        return response.ok || response.status === 404;
      } catch {
        return false;
      }
    },
    startCommand: 'pnpm',
    startArgs: ['dev:monitor', '--env', 'testrunner'], // Default, overridden by profile
    startupDelay: 8000, // UI takes longer to start
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

export async function ensureServicesRunning(
  serviceSpecs: string[],
  profile: string = 'testrunner'
): Promise<void> {
  console.log(`\n🔧 Checking required services (profile: ${profile})...\n`);

  for (const spec of serviceSpecs) {
    // Check if it's a machine specification
    const machineSpec = parseMachineSpec(spec);

    if (machineSpec) {
      // Start machine(s)
      await startMachine(machineSpec.type, machineSpec.count, profile);
    } else {
      // Regular service
      const config = SERVICES[spec];
      if (!config) {
        throw new Error(`Unknown service: ${spec}`);
      }

      const isRunning = await config.healthCheck();

      if (isRunning) {
        console.log(`✅ ${config.name} already running`);
      } else {
        await startService(spec, profile);
      }
    }
  }

  console.log('\n✅ All required services ready\n');
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
