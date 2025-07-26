#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const args = process.argv.slice(2);
const profileName = args[0];

if (!profileName) {
  console.error(chalk.red('❌ Error: Profile name is required'));
  console.log(chalk.gray('Usage: pnpm run <profile-name>'));
  console.log(chalk.gray('Available profiles: local, prod-test, remote-gpu, staging'));
  process.exit(1);
}

class ProfileRunner {
  constructor() {
    this.runningProcesses = new Map();
    this.configDir = process.cwd();
  }

  /**
   * Load profile with services definition
   */
  loadProfile(profileName) {
    const profilePath = join(this.configDir, 'config', 'environments', 'profiles', `${profileName}.json`);
    
    if (!existsSync(profilePath)) {
      throw new Error(`Profile '${profileName}' not found at ${profilePath}`);
    }

    return JSON.parse(readFileSync(profilePath, 'utf8'));
  }

  /**
   * Build dependency graph and return services in start order
   */
  resolveDependencies(services) {
    const resolved = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (serviceName) => {
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }
      if (visited.has(serviceName)) {
        return;
      }

      visiting.add(serviceName);
      
      const service = services[serviceName];
      if (service?.depends_on) {
        for (const dep of service.depends_on) {
          if (!services[dep]) {
            console.warn(chalk.yellow(`⚠️  Warning: Service '${serviceName}' depends on '${dep}' which is not defined`));
            continue;
          }
          visit(dep);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      resolved.push(serviceName);
    };

    // Visit all services
    for (const serviceName of Object.keys(services)) {
      visit(serviceName);
    }

    return resolved;
  }

  /**
   * Start a single service
   */
  async startService(serviceName, service) {
    console.log(chalk.blue(`🚀 Starting service: ${serviceName}`));
    
    // Build command
    const baseCommand = service.filter ? 
      `turbo run ${service.command} --filter=${service.filter}` :
      `pnpm ${service.command}`;
    
    const args = service.args ? service.args : [];
    const fullCommand = `${baseCommand} ${args.join(' ')}`.trim();

    console.log(chalk.gray(`   Command: ${fullCommand}`));

    // Spawn process
    const [cmd, ...cmdArgs] = fullCommand.split(' ');
    const env = { 
      ...process.env,
      // Disable Node.js debugger unless explicitly requested
      NODE_OPTIONS: process.env.DEBUG_MODE === 'true' ? process.env.NODE_OPTIONS : ''
    };
    
    const childProcess = spawn(cmd, cmdArgs, {
      stdio: service.background !== false ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: true,
      detached: false,
      env: env
    });

    // Store process reference
    this.runningProcesses.set(serviceName, childProcess);

    // Handle output for background services
    if (service.background !== false) {
      childProcess.stdout.on('data', (data) => {
        console.log(chalk.gray(`[${serviceName}] ${data.toString().trim()}`));
      });

      childProcess.stderr.on('data', (data) => {
        console.error(chalk.red(`[${serviceName}] ${data.toString().trim()}`));
      });
    }

    // Handle process exit
    childProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(chalk.red(`❌ Service '${serviceName}' exited with code ${code}`));
      } else {
        console.log(chalk.green(`✅ Service '${serviceName}' finished successfully`));
      }
      this.runningProcesses.delete(serviceName);
    });

    // Apply delay if specified
    if (service.delay) {
      console.log(chalk.gray(`   Waiting ${service.delay}ms before continuing...`));
      await new Promise(resolve => setTimeout(resolve, service.delay));
    }

    return childProcess;
  }

  /**
   * Start all services in dependency order
   */
  async startServices(services) {
    if (!services || Object.keys(services).length === 0) {
      console.log(chalk.yellow('ℹ️  No services defined in profile'));
      return;
    }

    console.log(chalk.blue('\n📋 Service orchestration plan:'));
    const serviceOrder = this.resolveDependencies(services);
    
    serviceOrder.forEach((serviceName, index) => {
      const service = services[serviceName];
      const deps = service.depends_on || [];
      console.log(chalk.gray(`   ${index + 1}. ${serviceName} ${deps.length > 0 ? `(depends on: ${deps.join(', ')})` : ''}`));
    });

    console.log(chalk.blue('\n🚀 Starting services...\n'));

    // Start services in order
    for (const serviceName of serviceOrder) {
      const service = services[serviceName];
      await this.startService(serviceName, service);
    }

    console.log(chalk.green(`\n✅ All services started! Running processes: ${this.runningProcesses.size}`));
    
    // Keep the process alive if there are background services
    if (this.runningProcesses.size > 0) {
      console.log(chalk.gray('\n📡 Monitoring services... Press Ctrl+C to stop all services\n'));
      
      // Wait for all processes to finish or user interrupt
      await new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.runningProcesses.size === 0) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 1000);
      });
    }
  }

  /**
   * Graceful shutdown of all services
   */
  async shutdown() {
    if (this.runningProcesses.size === 0) {
      console.log(chalk.gray('No services to stop'));
      return;
    }

    console.log(chalk.yellow(`\n🛑 Stopping ${this.runningProcesses.size} services...`));
    
    const shutdownPromises = Array.from(this.runningProcesses.entries()).map(([serviceName, childProcess]) => {
      return new Promise((resolve) => {
        console.log(chalk.gray(`   Stopping ${serviceName}...`));
        
        // Try graceful shutdown first
        childProcess.kill('SIGTERM');
        
        // Force kill after 5 seconds
        const forceKillTimeout = setTimeout(() => {
          console.log(chalk.red(`   Force killing ${serviceName}...`));
          childProcess.kill('SIGKILL');
        }, 5000);
        
        childProcess.on('close', () => {
          clearTimeout(forceKillTimeout);
          resolve();
        });
      });
    });

    await Promise.all(shutdownPromises);
    console.log(chalk.green('✅ All services stopped'));
  }

  /**
   * Main run method
   */
  async run(profileName) {
    try {
      console.log(chalk.blue(`🔧 Building environment for profile: ${profileName}`));
      
      // 1. Build environment from profile
      const builder = new EnvironmentBuilder(this.configDir);
      const result = await builder.buildFromProfile(profileName);
      
      if (!result.success) {
        console.error(chalk.red('❌ Failed to build environment:'));
        result.errors?.forEach(error => console.error(chalk.red(`  ${error}`)));
        process.exit(1);
      }

      console.log(chalk.green(`✅ Environment built: ${result.envPath}`));
      
      if (result.warnings) {
        console.log(chalk.yellow('\n⚠️  Warnings:'));
        result.warnings.forEach(warning => {
          console.log(chalk.yellow(`  ${warning}`));
        });
      }

      // 2. Load profile with services
      const profile = this.loadProfile(profileName);
      console.log(chalk.gray(`\n📄 Profile: ${profile.description}`));

      // 3. Start services
      await this.startServices(profile.services);
      
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  }
}

// Create runner instance
const runner = new ProfileRunner();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n🛑 Received interrupt signal...'));
  await runner.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n🛑 Received terminate signal...'));
  await runner.shutdown();
  process.exit(0);
});

// Run the profile
runner.run(profileName).catch((error) => {
  console.error(chalk.red(`❌ Fatal error: ${error.message}`));
  process.exit(1);
});