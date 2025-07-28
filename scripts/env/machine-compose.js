#!/usr/bin/env node

/**
 * machine-compose - Docker Compose wrapper with profile support
 * 
 * Runs Docker Compose commands with optional profile specification
 * 
 * Usage:
 *   pnpm machine:up <profile>              # Start services for profile
 *   pnpm machine:up:build <profile>        # Build and start services
 *   pnpm machine:down <profile>            # Stop services
 *   pnpm machine:build <profile>           # Build services
 *   pnpm machine:pull <profile>            # Pull images
 *   pnpm machine:logs <profile>            # View logs
 * 
 * Examples:
 *   pnpm machine:up:build comfy-remote
 *   pnpm machine:down comfy-remote
 *   pnpm machine:logs openai
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MACHINE_DIR = path.join(PROJECT_ROOT, 'apps/machine');

class MachineCompose {
  constructor() {}

  /**
   * Parse command line arguments
   */
  parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      this.showHelp();
      process.exit(1);
    }

    const command = args[0];
    let profile = null;
    const flags = [];

    // Separate profile from flags
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        flags.push(arg);
      } else if (!profile) {
        profile = arg; // First non-flag arg is the profile
      } else {
        flags.push(arg); // Additional non-flag args are treated as flags
      }
    }

    return { command, profile, flags };
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(chalk.cyan('machine-compose - Docker Compose wrapper with profile support\n'));
    console.log('Usage: pnpm machine:<command> [profile] [options]\n');
    console.log('Commands:');
    console.log('  up         Start services');
    console.log('  up:build   Build and start services');
    console.log('  down       Stop services');
    console.log('  build      Build services');
    console.log('  pull       Pull images from registry');
    console.log('  push       Push images to registry');
    console.log('  logs       View service logs');
    console.log('\nExamples:');
    console.log('  pnpm machine:up:build comfy-remote');
    console.log('  pnpm machine:down comfy-remote');
    console.log('  pnpm machine:logs openai');
    console.log('  pnpm machine:pull comfy-remote');
  }

  /**
   * Build Docker Compose command
   */
  buildDockerComposeCommand(command, profile, flags) {
    const cmd = ['docker', 'compose'];
    
    // Add profile if specified
    if (profile) {
      cmd.push('--profile', profile);
    }

    // Add main command
    switch (command) {
      case 'up':
        cmd.push('up');
        if (flags.includes('--build')) {
          cmd.push('--build');
        }
        break;
      case 'down':
        cmd.push('down');
        break;
      case 'build':
        cmd.push('build');
        break;
      case 'pull':
        cmd.push('pull');
        break;
      case 'push':
        cmd.push('push');
        break;
      case 'logs':
        cmd.push('logs', '-f');
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
    }

    // Add additional flags
    flags.forEach(flag => {
      if (flag !== '--build') { // --build is handled specially
        cmd.push(flag);
      }
    });

    return cmd;
  }

  /**
   * Execute Docker Compose command
   */
  async executeCommand(cmd) {
    console.log(chalk.blue(`🐳 Running: ${cmd.join(' ')}`));
    console.log(chalk.gray(`📁 Working directory: ${MACHINE_DIR}\n`));

    return new Promise((resolve, reject) => {
      const process = spawn(cmd[0], cmd.slice(1), {
        stdio: 'inherit',
        cwd: MACHINE_DIR
      });

      process.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`\n✅ Command completed successfully`));
          resolve();
        } else {
          console.error(chalk.red(`\n❌ Command failed with exit code ${code}`));
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });

      process.on('error', (error) => {
        console.error(chalk.red('❌ Failed to start command:'), error.message);
        reject(error);
      });
    });
  }

  /**
   * Display command info
   */
  displayInfo(command, profile, flags) {
    console.log(chalk.cyan('🔧 EMP Job Queue - Machine Compose'));
    
    if (profile) {
      console.log(chalk.blue(`📋 Profile: ${profile}`));
    } else {
      console.log(chalk.yellow('⚠️  No profile specified - using all services'));
    }
    
    console.log(chalk.blue(`🎯 Action: ${command}`));
    
    if (flags.length > 0) {
      console.log(chalk.blue(`🏃 Flags: ${flags.join(' ')}`));
    }
    
    console.log(); // Empty line
  }

  /**
   * Main execution
   */
  async run() {
    try {
      const { command, profile, flags } = this.parseArgs();
      
      // Always bundle worker first for build command
      if (command === 'build') {
        console.log(chalk.blue('📦 Bundling worker...'));
        await this.executeCommand(['pnpm', '-w', 'worker:bundle']);
        console.log(chalk.green('✅ Worker bundled successfully\n'));
      }
      
      this.displayInfo(command, profile, flags);
      
      const cmd = this.buildDockerComposeCommand(command, profile, flags);
      await this.executeCommand(cmd);
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const composer = new MachineCompose();
  composer.run();
}