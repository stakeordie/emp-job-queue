#!/usr/bin/env node

/**
 * machine-compose - Docker Compose wrapper with profile support
 * 
 * Runs Docker Compose commands with optional profile specification
 * 
 * Usage:
 *   pnpm machine:up <profile> [instance]   # Start services for profile
 *   pnpm machine:up:build <profile> [instance] # Build and start services
 *   pnpm machine:down <profile> [instance] # Stop services
 *   pnpm machine:build <profile> [instance] # Build services
 *   pnpm machine:pull <profile> [instance] # Pull images
 *   pnpm machine:logs <profile> [instance] # View logs
 * 
 * Examples:
 *   pnpm machine:up:build comfy-remote     # Instance 0 (default)
 *   pnpm machine:up:build comfy-remote 1   # Instance 1 (ports +10)
 *   pnpm machine:down comfy-remote 2       # Instance 2 (ports +20)
 *   pnpm machine:logs openai 0             # Instance 0
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs';
import dotenv from 'dotenv';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MACHINE_DIR = path.join(PROJECT_ROOT, 'apps/machine');

class MachineCompose {
  constructor() {}

  /**
   * Load environment variables from .env.secret.{envName}
   */
  loadEnvSecret(envName = 'local-dev') {
    const envPath = path.join(MACHINE_DIR, `.env.secret.${envName}`);
    if (!fs.existsSync(envPath)) {
      console.warn(chalk.yellow(`⚠️ .env.secret.${envName} not found at ${envPath}`));
      console.warn(chalk.gray(`   Run: pnpm env:build ${envName}`));
      return {};
    }

    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error(chalk.red(`❌ Failed to parse .env.secret.${envName}:`), result.error);
      return {};
    }

    return result.parsed || {};
  }

  /**
   * Create .env symlink for Docker Compose variable substitution
   */
  async createEnvironmentSymlink(envName) {
    const envFile = `.env.${envName}`;
    const envSymlink = '.env';

    try {
      // Remove existing .env symlink/file
      if (fs.existsSync(path.join(MACHINE_DIR, envSymlink))) {
        fs.unlinkSync(path.join(MACHINE_DIR, envSymlink));
      }

      // Check if environment file exists
      const envPath = path.join(MACHINE_DIR, envFile);
      if (!fs.existsSync(envPath)) {
        throw new Error(
          `Environment file ${envFile} not found. Run: pnpm env:build ${envName}`
        );
      }

      // Create symlink
      fs.symlinkSync(envFile, path.join(MACHINE_DIR, envSymlink));
      console.log(chalk.dim(`  🔗 Linked .env → ${envFile}`));

    } catch (error) {
      throw new Error(`Failed to create environment symlink: ${error.message}`);
    }
  }

  /**
   * Get environment name from profile's env_file configuration
   */
  getEnvironmentFromProfile(profile) {
    if (!profile) {
      throw new Error('Profile name is required');
    }

    try {
      const composeFile = path.join(MACHINE_DIR, 'docker-compose.yml');
      if (!fs.existsSync(composeFile)) {
        throw new Error(`docker-compose.yml not found at ${composeFile}`);
      }

      const composeContent = fs.readFileSync(composeFile, 'utf8');
      const compose = yaml.load(composeContent);

      if (!compose.services || !compose.services[profile]) {
        throw new Error(`Profile '${profile}' not found in docker-compose.yml`);
      }

      const serviceConfig = compose.services[profile];
      if (!serviceConfig.env_file) {
        throw new Error(`Profile '${profile}' does not have env_file configured`);
      }

      const envFiles = Array.isArray(serviceConfig.env_file) ? serviceConfig.env_file : [serviceConfig.env_file];
      const secretFile = envFiles.find(f => f.includes('.env.secret.'));
      
      if (!secretFile) {
        throw new Error(`Profile '${profile}' does not have .env.secret.* file configured`);
      }

      // Extract environment name from .env.secret.{envName}
      const match = secretFile.match(/\.env\.secret\.(.+)$/);
      if (!match) {
        throw new Error(`Invalid secret file format in profile '${profile}': ${secretFile}`);
      }

      return match[1];
    } catch (error) {
      throw new Error(`Failed to get environment from profile '${profile}': ${error.message}`);
    }
  }

  /**
   * Parse command line arguments
   */
  parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      this.showHelp();
      process.exit(0);
    }

    const command = args[0];
    let profile = null;
    const flags = [];
    const portMappings = [];

    // Parse: command profile [--open port:port] [other flags]
    // Environment is automatically determined from the profile's env_file configuration
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--open' && i + 1 < args.length) {
        // Parse --open port:port
        const portMapping = args[i + 1];
        if (/^\d+:\d+$/.test(portMapping)) {
          portMappings.push(portMapping);
          i++; // Skip the port mapping argument
        } else {
          throw new Error(`Invalid port mapping format: ${portMapping}. Use --open host:container format.`);
        }
      } else if (arg.startsWith('--')) {
        flags.push(arg);
      } else if (!profile) {
        profile = arg; // First non-flag arg is the profile
      } else {
        flags.push(arg); // Additional non-flag args are treated as flags
      }
    }

    return { command, profile, portMappings, flags };
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(chalk.cyan('machine-compose - Docker Compose wrapper with environment and port control\n'));
    console.log('Usage: pnpm machine:<command> [profile] [--env envName] [--open host:container] [options]\n');
    console.log('Commands:');
    console.log('  up         Start services');
    console.log('  up:build   Build and start services');
    console.log('  down       Stop services');
    console.log('  build      Build services');
    console.log('  pull       Pull images from registry');
    console.log('  push       Push images to registry');
    console.log('  logs       View service logs');
    console.log('\nPort Control:');
    console.log('  --open host:container   Expose container port to host port');
    console.log('  Multiple --open flags can be used');
    console.log('\nExamples:');
    console.log('  pnpm machine:up comfyui-remote-local');
    console.log('  pnpm machine:up sim-prod --open 9090:9090');
    console.log('  pnpm machine:build comfyui-remote-production');
    console.log('  pnpm machine:down comfyui-remote-local');
    console.log('\nNote: Environment is automatically determined from profile configuration');
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
        // Docker Compose will automatically use env_file from the profile
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
  async executeCommand(cmd, includeEnvVars = false, portMappings = []) {
    console.log(chalk.blue(`🐳 Running: ${cmd.join(' ')}`));
    console.log(chalk.gray(`📁 Working directory: ${MACHINE_DIR}\n`));

    // Use current environment - Docker Compose will handle env_file loading
    let env = process.env;

    // Set port mappings environment variable for dynamic port generation
    if (portMappings.length > 0) {
      env = { ...env, RUNTIME_PORTS: portMappings.join(',') };
      console.log(chalk.dim(`  Set runtime port mappings: ${portMappings.join(', ')}`));
    } else {
      // Disable all ports by default in local profile
      env = { ...env, DISABLE_PORTS: 'true' };
      console.log(chalk.dim(`  Disabled all port exposures (use --open to enable specific ports)`));
    }

    return new Promise((resolve, reject) => {
      const process = spawn(cmd[0], cmd.slice(1), {
        stdio: 'inherit',
        cwd: MACHINE_DIR,
        env: env
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
  displayInfo(command, profile, envName, portMappings, flags) {
    console.log(chalk.cyan('🔧 EMP Job Queue - Machine Compose'));
    
    if (profile) {
      console.log(chalk.blue(`📋 Profile: ${profile}`));
      console.log(chalk.blue(`🌐 Environment: ${envName} (from profile config)`));
    } else {
      console.log(chalk.yellow('⚠️  No profile specified - using all services'));
    }
    
    console.log(chalk.blue(`🎯 Action: ${command}`));
    
    if (portMappings.length > 0) {
      console.log(chalk.blue(`🔌 Port Mappings: ${portMappings.join(', ')}`));
    } else {
      console.log(chalk.yellow('🔒 No ports exposed (use --open to expose ports)'));
    }
    
    if (flags.length > 0) {
      console.log(chalk.blue(`🏃 Flags: ${flags.join(' ')}`));
    }
    
    console.log(); // Empty line
  }

  /**
   * Generate port configuration using the new port manager
   */
  async generatePorts(portMappings, profile, isDebug) {
    // Set environment variables for port manager
    const env = { ...process.env };
    
    // Convert port mappings to the format expected by port manager
    if (portMappings.length > 0) {
      env.RUNTIME_PORTS = portMappings.join(',');
    } else {
      // Don't set to 'none' in debug mode - let port manager handle defaults
      if (isDebug) {
        env.RUNTIME_PORTS = '';
      } else {
        env.RUNTIME_PORTS = 'none';
      }
    }
    
    // Set debug mode
    if (isDebug) {
      env.DEBUG_MODE = 'true';
    }
    
    // Set profile
    if (profile) {
      env.DOCKER_COMPOSE_PROFILES = profile;
    }
    
    try {
      await new Promise((resolve, reject) => {
        const process = spawn('node', ['scripts/port-manager.js', 'generate'], {
          stdio: 'inherit',
          cwd: MACHINE_DIR,
          env: env
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Port configuration failed with exit code ${code}`));
          }
        });

        process.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error(chalk.red('❌ Port configuration failed:'), error.message);
      throw error;
    }
  }

  /**
   * Main execution
   */
  async run() {
    try {
      const { command, profile, portMappings, flags } = this.parseArgs();
      
      // Get environment from profile configuration
      let envName = null;
      if (profile) {
        envName = this.getEnvironmentFromProfile(profile);
        console.log(chalk.dim(`📋 Profile '${profile}' → Environment '${envName}'`));
      }
      
      // Always bundle worker first for build command
      if (command === 'build') {
        console.log(chalk.blue('📦 Bundling worker...'));
        await this.executeCommand(['pnpm', '-w', 'worker:bundle'], false, []);
        console.log(chalk.green('✅ Worker bundled successfully\n'));
      }
      
      // For both build and up commands, create symlink so Docker Compose can resolve ${VARIABLES}
      if ((command === 'build' || command === 'up') && envName) {
        await this.createEnvironmentSymlink(envName);
      }
      
      this.displayInfo(command, profile, envName, portMappings, flags);
      
      // Check if debug mode is enabled
      const isDebug = flags.includes('--debug') || process.env.DEBUG_MODE === 'true';
      
      // Generate ports before running docker-compose (for 'up' commands)
      if (command === 'up') {
        console.log(chalk.blue('⚙️  Generating port configuration...'));
        await this.generatePorts(portMappings, profile, isDebug);
      }
      
      const cmd = this.buildDockerComposeCommand(command, profile, flags);
      await this.executeCommand(cmd, false, portMappings);
      
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