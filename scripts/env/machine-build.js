#!/usr/bin/env node

/**
 * machine:build - Profile-aware Docker Compose Build
 * 
 * Uses WORKER_CONNECTORS environment variable to automatically select
 * the appropriate Docker Compose profile and build/deploy the machine.
 * 
 * Usage:
 *   WORKER_CONNECTORS=comfyui-remote:1 pnpm machine:build
 *   WORKER_CONNECTORS=openai:4,playwright:1 pnpm machine:build [--pull] [--push]
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import chalk from 'chalk';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'apps/machine/docker-compose.yml');

class MachineBuilder {
  constructor() {}

  /**
   * Parse worker connectors specification from environment
   */
  parseWorkerConnectors() {
    const workerConnectors = process.env.WORKER_CONNECTORS;
    
    if (!workerConnectors) {
      throw new Error('WORKER_CONNECTORS environment variable not set');
    }

    const connectors = workerConnectors.split(',').map(spec => {
      const [connector, count] = spec.trim().split(':');
      if (!connector || !count) {
        throw new Error(`Invalid worker spec format: ${spec}. Expected format: connector:count`);
      }
      return {
        connector: connector.trim(),
        count: parseInt(count)
        // Note: binding is now retrieved from service-mapping.json
      };
    });

    return {
      raw: workerConnectors,
      connectors,
      profileName: this.generateProfileName(connectors),
      serviceName: this.generateServiceName(connectors)
    };
  }

  /**
   * Generate profile name from worker connectors (same logic as compose:build)
   */
  generateProfileName(connectors) {
    return connectors
      .map(c => `${c.connector}-${c.count}`)
      .join('-')
      .replace(/[^a-zA-Z0-9-]/g, '-');
  }

  /**
   * Generate service name for Docker Compose
   */
  generateServiceName(connectors) {
    const shortName = connectors
      .map(c => c.connector.replace('-remote', '').replace('-api', ''))
      .join('-');
    return `machine-${shortName}`;
  }

  /**
   * Load docker-compose.yml and check if profile exists
   */
  async loadAndValidateProfile(profileName) {
    try {
      const content = await fs.readFile(COMPOSE_FILE, 'utf8');
      const compose = yaml.load(content);
      
      // Check if profile exists in profiles list
      const profileExists = compose.profiles && compose.profiles.includes(profileName);
      
      if (!profileExists) {
        throw new Error(`Profile '${profileName}' not found in docker-compose.yml. Run 'pnpm compose:build ${process.env.WORKER_CONNECTORS}' first.`);
      }

      // Find service that uses this profile
      const serviceUsingProfile = Object.entries(compose.services || {}).find(
        ([_, service]) => service.profiles && service.profiles.includes(profileName)
      );

      if (!serviceUsingProfile) {
        throw new Error(`No service found using profile '${profileName}'`);
      }

      return {
        compose,
        profileName,
        serviceName: serviceUsingProfile[0],
        serviceConfig: serviceUsingProfile[1]
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('docker-compose.yml not found. Run "pnpm env:build" first.');
      }
      throw error;
    }
  }

  /**
   * Execute Docker Compose command with profile
   */
  async executeDockerCompose(profileName, options = {}) {
    const { pull, push, build, up, down } = options;
    
    const baseCmd = ['docker', 'compose', '--profile', profileName];
    
    if (pull) {
      console.log(chalk.blue(`📥 Pulling images for profile: ${profileName}`));
      await this.runCommand([...baseCmd, 'pull']);
    }

    if (build) {
      console.log(chalk.blue(`🔨 Building images for profile: ${profileName}`));
      await this.runCommand([...baseCmd, 'build']);
      
      if (push) {
        console.log(chalk.blue(`📤 Pushing images for profile: ${profileName}`));
        await this.runCommand([...baseCmd, 'push']);
      }
    }

    if (up) {
      console.log(chalk.blue(`🚀 Starting services for profile: ${profileName}`));
      await this.runCommand([...baseCmd, 'up', '-d']);
    }

    if (down) {
      console.log(chalk.blue(`🛑 Stopping services for profile: ${profileName}`));
      await this.runCommand([...baseCmd, 'down']);
    }
  }

  /**
   * Run command with streaming output
   */
  async runCommand(cmdArray) {
    return new Promise((resolve, reject) => {
      const process = spawn(cmdArray[0], cmdArray.slice(1), {
        stdio: 'inherit',
        cwd: PROJECT_ROOT
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${cmdArray.join(' ')}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start command: ${error.message}`));
      });
    });
  }

  /**
   * Display profile information
   */
  displayProfileInfo(workerSpec, profileInfo) {
    console.log(chalk.cyan('\n📋 Machine Build Configuration:'));
    console.log(`  Worker Spec: ${chalk.bold(workerSpec.raw)}`);
    console.log(`  Profile Name: ${chalk.bold(profileInfo.profileName)}`);
    console.log(`  Service Name: ${chalk.bold(profileInfo.serviceName)}`);
    
    if (profileInfo.serviceConfig.image) {
      console.log(`  Container Image: ${chalk.bold(profileInfo.serviceConfig.image)}`);
    }
    
    console.log(chalk.cyan('\n🔧 Docker Compose Commands:'));
    console.log(`  ${chalk.dim('# Build locally:')}`);
    console.log(`  docker compose --profile ${profileInfo.profileName} build`);
    console.log(`  ${chalk.dim('# Pull from registry:')}`);
    console.log(`  docker compose --profile ${profileInfo.profileName} pull`);
    console.log(`  ${chalk.dim('# Start services:')}`);
    console.log(`  docker compose --profile ${profileInfo.profileName} up -d`);
  }

  /**
   * Display available actions
   */
  displayActions() {
    console.log(chalk.cyan('\n🚀 Available Actions:'));
    console.log('  --build    Build container images locally');
    console.log('  --pull     Pull container images from registry');
    console.log('  --push     Push container images to registry (requires --build)');
    console.log('  --up       Start services');
    console.log('  --down     Stop services');
    console.log('  --all      Build and start services');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    build: false,
    pull: false,
    push: false,
    up: false,
    down: false,
    help: false
  };

  for (const arg of args) {
    switch (arg) {
      case '--build':
        options.build = true;
        break;
      case '--pull':
        options.pull = true;
        break;
      case '--push':
        options.push = true;
        break;
      case '--up':
        options.up = true;
        break;
      case '--down':
        options.down = true;
        break;
      case '--all':
        options.build = true;
        options.up = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        console.warn(chalk.yellow(`⚠️  Unknown option: ${arg}`));
        break;
    }
  }

  return options;
}

/**
 * Display help information
 */
function displayHelp() {
  console.log(chalk.cyan('machine:build - Profile-aware Docker Compose Build\n'));
  console.log('Usage: WORKER_CONNECTORS=<spec> pnpm machine:build [options]\n');
  console.log('Options:');
  console.log('  --build    Build container images locally');
  console.log('  --pull     Pull container images from registry');
  console.log('  --push     Push container images to registry (requires --build)');
  console.log('  --up       Start services');
  console.log('  --down     Stop services');
  console.log('  --all      Build and start services');
  console.log('  --help     Show this help message');
  console.log('\nExamples:');
  console.log('  WORKER_CONNECTORS=comfyui-remote:1 pnpm machine:build --pull --up');
  console.log('  WORKER_CONNECTORS=openai:4,playwright:1 pnpm machine:build --build --push');
  console.log('  WORKER_CONNECTORS=comfyui:2 pnpm machine:build --all');
}

/**
 * Main execution
 */
async function main() {
  try {
    const options = parseArgs();
    
    if (options.help) {
      displayHelp();
      return;
    }

    console.log(chalk.cyan('🔧 EMP Job Queue - Machine Builder'));
    console.log(chalk.dim('Building machine using WORKER_CONNECTORS profile...\n'));

    const builder = new MachineBuilder();

    // Always bundle worker first (in case WORKER_BUNDLE_MODE=local)
    console.log(chalk.blue('📦 Bundling worker (in case local mode is used)...'));
    await builder.runCommand(['pnpm', 'worker:bundle']);
    console.log(chalk.green('✅ Worker bundled successfully\n'));
    
    // Parse worker specification from environment
    const workerSpec = builder.parseWorkerConnectors();
    
    // Load and validate profile exists
    const profileInfo = await builder.loadAndValidateProfile(workerSpec.profileName);
    
    // Display configuration
    builder.displayProfileInfo(workerSpec, profileInfo);
    
    // If no actions specified, just show info and available actions
    const hasActions = options.build || options.pull || options.push || options.up || options.down;
    
    if (!hasActions) {
      builder.displayActions();
      console.log(chalk.green('\n✅ Profile validated successfully!'));
      console.log(chalk.yellow('💡 Add action flags to build/deploy (e.g., --build --up)'));
      return;
    }

    // Execute requested actions
    await builder.executeDockerCompose(profileInfo.profileName, options);
    
    console.log(chalk.green('\n✅ Machine build completed successfully!'));

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}