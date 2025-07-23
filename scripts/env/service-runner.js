#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

const args = process.argv.slice(2);
const serviceName = args[0];
const profileName = args[1];

if (!serviceName || !profileName) {
  console.error(chalk.red('❌ Error: Service name and profile name are required'));
  console.log(chalk.gray('Usage: pnpm -w run run-service <service> <profile>'));
  console.log(chalk.gray('Example: pnpm -w run run-service redis full-local'));
  process.exit(1);
}

class ServiceRunner {
  constructor() {
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
      stdio: 'inherit', // Show output directly in terminal
      shell: true,
      detached: false,
      env: env
    });

    // Handle process exit
    childProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(chalk.red(`❌ Service '${serviceName}' exited with code ${code}`));
        process.exit(code);
      } else {
        console.log(chalk.green(`✅ Service '${serviceName}' finished successfully`));
      }
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Stopping service...'));
      childProcess.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      console.log(chalk.yellow('\n🛑 Terminating service...'));
      childProcess.kill('SIGTERM');
    });

    return childProcess;
  }

  /**
   * Main run method
   */
  async run(serviceName, profileName) {
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

      // 2. Load profile with services
      const profile = this.loadProfile(profileName);
      
      // 3. Find the requested service
      if (!profile.services || !profile.services[serviceName]) {
        console.error(chalk.red(`❌ Service '${serviceName}' not found in profile '${profileName}'`));
        
        if (profile.services) {
          console.log(chalk.gray('Available services:'));
          Object.keys(profile.services).forEach(name => {
            console.log(chalk.gray(`  - ${name}`));
          });
        } else {
          console.log(chalk.gray('No services defined in this profile'));
        }
        process.exit(1);
      }

      const service = profile.services[serviceName];
      console.log(chalk.gray(`📄 Profile: ${profile.description}`));
      console.log(chalk.blue(`🎯 Running service: ${serviceName}\n`));

      // 4. Start the specific service
      await this.startService(serviceName, service);
      
    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  }
}

// Create runner instance
const runner = new ServiceRunner();

// Run the service
runner.run(serviceName, profileName).catch((error) => {
  console.error(chalk.red(`❌ Fatal error: ${error.message}`));
  process.exit(1);
});