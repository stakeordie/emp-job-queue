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
 * Flags:
 *   --test-decryption                       # Test mode: Only pass decryption key to test env.encrypted
 *   --env-var=KEY=VALUE                    # Pass specific environment variables only
 *
 * Examples:
 *   pnpm machine:up:build comfy-remote     # Instance 0 (default)
 *   pnpm machine:up:build comfy-remote 1   # Instance 1 (ports +10)
 *   pnpm machine:down comfy-remote 2       # Instance 2 (ports +20)
 *   pnpm machine:logs openai 0             # Instance 0
 *   pnpm d:machine:run comfyui --test-decryption # Test environment decryption
 *   pnpm d:machine:run comfyui-production --env-var="ENV_ENCRYPT_KEY=rjI76MTrJEW2pfqb4f92g/NCrMoVX5zKX4OdTZ+nVOM=" # Test with specific encryption key
 *   pnpm d:machine:pull:run comfyui-production --env-var="ENV_ENCRYPT_KEY=xyz" --env-var="DEBUG=true" # Multiple env vars
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
   * Load regular environment variables from .env.{envName}
   */
  loadEnvRegular(envName = 'local-dev') {
    const envPath = path.join(MACHINE_DIR, `.env.${envName}`);
    if (!fs.existsSync(envPath)) {
      console.warn(chalk.yellow(`⚠️ .env.${envName} not found at ${envPath}`));
      console.warn(chalk.gray(`   Run: pnpm env:build ${envName}`));
      return {};
    }

    const result = dotenv.config({ path: envPath });
    if (result.error) {
      console.error(chalk.red(`❌ Failed to parse .env.${envName}:`), result.error);
      return {};
    }

    return result.parsed || {};
  }

  /**
   * Load all environment variables (regular + secret) for runtime injection
   */
  loadAllEnvVars(envName = 'local-dev') {
    const regularEnv = this.loadEnvRegular(envName);
    const secretEnv = this.loadEnvSecret(envName);
    
    // Secret vars override regular vars (secrets have priority)
    return { ...regularEnv, ...secretEnv };
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
   * Remove .env symlink after Docker operation
   */
  cleanupEnvironmentSymlink() {
    const envSymlink = path.join(MACHINE_DIR, '.env');
    try {
      if (fs.existsSync(envSymlink)) {
        fs.unlinkSync(envSymlink);
        console.log(chalk.dim(`  🗑️  Removed .env symlink`));
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Failed to remove .env symlink: ${error.message}`));
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
    let numInstances = 1; // Default to 1 instance

    // Parse: command profile [containerName] [--open port:port] [--num N] [other flags]
    // Environment is automatically determined from the profile's env_file configuration
    let containerName = null;
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
      } else if (arg === '--num' && i + 1 < args.length) {
        // Parse --num N
        const num = parseInt(args[i + 1], 10);
        if (isNaN(num) || num < 1) {
          throw new Error(`Invalid --num value: ${args[i + 1]}. Must be a positive integer.`);
        }
        numInstances = num;
        i++; // Skip the number argument
      } else if (arg === '--reset') {
        // Parse --reset flag (stop existing containers before starting new ones)
        flags.push('--reset');
      } else if (arg.startsWith('--')) {
        flags.push(arg);
      } else if (!profile) {
        profile = arg; // First non-flag arg is the profile
      } else if (!containerName) {
        containerName = arg; // Second non-flag arg is the container name (for stop command)
      } else {
        flags.push(arg); // Additional non-flag args are treated as flags
      }
    }

    return { command, profile, containerName, portMappings, flags, numInstances };
  }

  /**
   * Parse EXPOSED_PORTS from environment and add to port mappings
   */
  parseExposedPorts(envName) {
    if (!envName) return [];
    
    const allEnvVars = this.loadAllEnvVars(envName);
    const exposedPorts = allEnvVars.EXPOSED_PORTS;
    
    if (!exposedPorts || exposedPorts.trim() === '') {
      return []; // No EXPOSED_PORTS - ignore completely
    }
    
    const portMappings = exposedPorts
      .split(',')
      .map(p => p.trim())
      .filter(p => p && /^\d+:\d+$/.test(p));
    
    if (portMappings.length > 0) {
      console.log(chalk.blue(`🔌 Found EXPOSED_PORTS in environment: ${portMappings.join(', ')}`));
    }
    
    return portMappings;
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
    console.log('  build:push Build and push images to registry');
    console.log('  pull       Pull images from registry');
    console.log('  push       Push images to registry');
    console.log('  pull:run   Pull latest images and run (hosted env simulation)');
    console.log('  logs       View service logs');
    console.log('  run        Run single container with docker run (production-style)');
    console.log('  stop       Stop running containers by profile name');
    console.log('  generate_args  Generate deployment files for hosting platforms');
    console.log('\nPort Control:');
    console.log('  --open host:container   Expose container port to host port');
    console.log('  Multiple --open flags can be used');
    console.log('\nMultiple Instances:');
    console.log('  --num N                 Start N containers with unique names');
    console.log('  --reset                 Stop existing containers before starting new ones');
    console.log('\nLogging:');
    console.log('  All containers log to: logs/machines/<container-name>.log');
    console.log('  View logs: docker logs <container-name>');
    console.log('  Or use: tail -f logs/machines/<container-name>.log');
    console.log('\nExamples:');
    console.log('  pnpm machine:up comfyui-remote-local');
    console.log('  pnpm machine:up sim-prod --open 9090:9090');
    console.log('  pnpm machine:build comfyui-remote-production');
    console.log('  pnpm machine:down comfyui-remote-local');
    console.log('  pnpm d:machine:pull:run ollama-mock --num 3');
    console.log('  pnpm d:machine:run ollama-mock --num 5 --reset');
    console.log('  pnpm d:machine:stop ollama-mock           # Stop all ollama-mock containers');
    console.log('  pnpm d:machine:stop ollama-mock ollama-mock-1  # Stop specific container');
    console.log('  pnpm d:machine:stop all                   # Stop all containers');
    console.log('  pnpm machine:generate_args comfyui-remote-production');
    console.log('\nNote: Environment is automatically determined from profile configuration');
    console.log('\nProduction Emulation:');
    console.log('  run command uses docker run with -e flags (true production hosting style)');
  }

  /**
   * Build Docker Run command (production-style with -e flags)
   * @param {string} containerName - Optional unique container name (for multiple instances)
   * @param {boolean} detached - Run in detached mode (for multiple containers)
   */
  buildDockerRunCommand(profile, flags, envName, portMappings, containerName = null, detached = false) {
    if (!profile) {
      throw new Error('Profile is required for docker run command');
    }

    const finalContainerName = containerName || profile;
    const cmd = ['docker', 'run'];

    // Add common docker run flags
    cmd.push('--platform', 'linux/amd64'); // Force x86_64 architecture

    // Only run detached if explicitly requested (for multiple containers)
    if (detached) {
      cmd.push('-d'); // Run in detached mode (background)
    }

    cmd.push('--rm'); // Remove container when it exits
    cmd.push('--name', finalContainerName); // Container name
    cmd.push('--hostname', finalContainerName); // Hostname

    // Store log file path for later use in executeCommand
    const logsDir = process.env.MACHINE_LOGS_DIR || path.join(PROJECT_ROOT, 'logs', 'machines');
    const logFile = path.join(logsDir, `${finalContainerName}.log`);

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      console.log(chalk.dim(`📁 Created logs directory: ${logsDir}`));
    }

    console.log(chalk.dim(`📋 Container logs: ${logFile}`));

    // Store logFile in command metadata for executeCommand to use
    this._currentLogFile = logFile;
    
    // Add port mappings
    portMappings.forEach(mapping => {
      cmd.push('-p', mapping);
    });
    
    // Check for custom --env-var flags FIRST
    const envVarFlags = flags.filter(flag => flag.startsWith('--env-var='));
    const hasCustomEnvVars = envVarFlags.length > 0;

    if (hasCustomEnvVars) {
      // Custom env vars mode: Only pass specified environment variables
      envVarFlags.forEach(flag => {
        const envVar = flag.substring('--env-var='.length);
        cmd.push('-e', envVar);
        const [key] = envVar.split('=');
        console.log(chalk.yellow(`🔐 Custom env mode: Passing ${key}`));
      });
      console.log(chalk.dim(`  Only the specified environment variables will be available`));
      console.log(chalk.dim(`  Perfect for testing encryption/decryption flow`));
    } else if (envName) {
      // Add environment variables as -e flags (production hosting style)
      // Check for decryption test mode
      const testDecryption = flags.includes('--test-decryption');

      if (testDecryption) {
        // Test mode: Only pass the decryption key to test encrypted environment
        const allEnvVars = this.loadAllEnvVars(envName);
        const decryptKey = allEnvVars.ENV_ENCRYPT_KEY;

        if (decryptKey) {
          cmd.push('-e', `EMP_ENV_DECRYPT_KEY=${decryptKey}`);
          console.log(chalk.yellow(`🔐 DECRYPTION TEST MODE: Only passing EMP_ENV_DECRYPT_KEY`));
          console.log(chalk.dim(`  Container will attempt to decrypt env.encrypted file`));
          console.log(chalk.dim(`  This tests the production decryption flow`));
        } else {
          console.log(chalk.red(`❌ No ENV_ENCRYPT_KEY found in ${envName} environment`));
          process.exit(1);
        }
      } else {
        // DEFAULT MODE: Pass all environment variables (restored original behavior)
        const allEnvVars = this.loadAllEnvVars(envName);
        Object.entries(allEnvVars).forEach(([key, value]) => {
          cmd.push('-e', `${key}=${value}`);
        });

        console.log(chalk.blue(`🌐 Added ${Object.keys(allEnvVars).length} environment variables as -e flags`));
        console.log(chalk.dim(`  Environment variables: ${Object.keys(allEnvVars).join(', ')}`));
      }
    }
    
    // Add additional flags (BEFORE image name)
    // Filter out --env-var and --test-decryption flags as they've been processed
    const additionalFlags = flags.filter(flag =>
      !flag.startsWith('--env-var=') &&
      flag !== '--test-decryption'
    );
    additionalFlags.forEach(flag => {
      if (!flag.startsWith('--')) {
        cmd.push(flag);
      }
    });
    
    // Add working directory
    cmd.push('-w', '/workspace');
    
    // Add image name (based on profile)
    cmd.push(`emprops/machine:${profile}`);
    
    return cmd;
  }

  /**
   * Build Docker Compose command
   */
  buildDockerComposeCommand(command, profile, flags, envName) {
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
        
        // Add build timestamp and date
        const buildDate = new Date().toISOString(); // ISO format: 2025-08-19T22:53:07Z
        const buildTimestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
        cmd.push('--build-arg', `BUILD_DATE=${buildDate}`);
        cmd.push('--build-arg', `BUILD_TIMESTAMP=${buildTimestamp}`);
        
        // Add machine version from git
        try {
          const { execSync } = require('child_process');
          const gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
          const machineVersion = `v${gitHash}`;
          cmd.push('--build-arg', `MACHINE_VERSION=${machineVersion}`);
        } catch (e) {
          // If git fails, use a default version
          cmd.push('--build-arg', `MACHINE_VERSION=local`);
        }
        
        // For build command, inject environment variables as build args
        if (envName) {
          const secretEnv = this.loadEnvSecret(envName);
          Object.entries(secretEnv).forEach(([key, value]) => {
            cmd.push('--build-arg', `${key}=${value}`);
          });
        }
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
      case 'run':
        // Special case: handled by buildDockerRunCommand instead
        break;
      case 'stop':
        // Special case: handled by stopContainersByProfile instead
        break;
      case 'generate_args':
        // Special case: handled by generateDeploymentArgs instead
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
  async executeCommand(cmd, includeEnvVars = false, portMappings = [], envName = null) {
    console.log(chalk.blue(`🐳 Running: ${cmd.join(' ')}`));
    console.log(chalk.gray(`📁 Working directory: ${MACHINE_DIR}\n`));

    // Check if we need to redirect logs to file (for docker run commands)
    const isDockerRun = cmd[0] === 'docker' && cmd[1] === 'run';
    const logFile = this._currentLogFile;

    // Use current environment - Docker Compose will handle env_file loading
    let env = process.env;

    // Set port mappings environment variable for dynamic port generation
    if (portMappings.length > 0) {
      env = { ...env, RUNTIME_PORTS: portMappings.join(',') };
      console.log(chalk.dim(`  Set runtime port mappings: ${portMappings.join(', ')}`));
    } else {
      // No ports by default
      console.log(chalk.dim(`  No ports exposed (use --open to enable specific ports)`));
    }

    // PRODUCTION-STYLE: Inject environment variables into process environment (for 'up' commands)
    if (includeEnvVars && envName && (cmd.includes('up') || cmd.includes('run'))) {
      const allEnvVars = this.loadAllEnvVars(envName);
      const envCount = Object.keys(allEnvVars).length;
      
      if (envCount > 0) {
        console.log(chalk.blue(`🌐 Injecting ${envCount} environment variables into process environment (production-style)`));
        
        // Merge environment variables into the process environment
        // This mimics how production hosts provide env vars to Docker Compose
        env = { ...env, ...allEnvVars };
        
        console.log(chalk.dim(`  Environment variables: ${Object.keys(allEnvVars).join(', ')}`));
        console.log(chalk.dim(`  Docker Compose will inherit these from the host environment`));
      }
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
    
    if (command === 'run') {
      console.log(chalk.green(`🏗️  Mode: Production hosting emulation (docker run with -e flags)`));
    } else if (command === 'pull:run') {
      console.log(chalk.green(`🏗️  Mode: VAST.ai/Railway simulation (docker rmi → docker pull → docker run)`));
    } else if (command === 'build:push') {
      console.log(chalk.green(`🏗️  Mode: Build with timestamp → Push to registry (one-step deployment)`));
    }
    
    if (portMappings.length > 0) {
      console.log(chalk.blue(`🔌 Port Mappings: ${portMappings.join(', ')}`));
    } else {
      if (command === 'run') {
        console.log(chalk.yellow('🔒 No ports exposed (use --open to expose ports)'));
      } else {
        console.log(chalk.yellow('🔒 No ports exposed (use --open to expose ports)'));
      }
    }
    
    if (flags.length > 0) {
      console.log(chalk.blue(`🏃 Flags: ${flags.join(' ')}`));
    }
    
    console.log(); // Empty line
  }

  /**
   * Clean up override file for build commands (not needed during build)
   */
  cleanupOverrideFile() {
    const overridePath = path.join(MACHINE_DIR, 'docker-compose.override.yml');
    if (fs.existsSync(overridePath)) {
      console.log(chalk.gray('🧹 Removing docker-compose.override.yml (not needed for build)'));
      fs.unlinkSync(overridePath);
    }
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
   * Get existing container indices for a profile
   */
  async getExistingContainerIndices(profile) {
    try {
      const { execSync } = await import('child_process');
      const output = execSync(`docker ps --filter "name=${profile}" --format "{{.Names}}"`, {
        encoding: 'utf-8'
      }).trim();

      if (!output) {
        return [];
      }

      const containerNames = output.split('\n').filter(name => name);
      const indices = [];

      for (const name of containerNames) {
        // Match patterns like: ollama-mock-0, ollama-mock-1, ollama-mock
        if (name === profile) {
          indices.push(0); // Single container without index
        } else {
          const match = name.match(new RegExp(`^${profile}-(\\d+)$`));
          if (match) {
            indices.push(parseInt(match[1], 10));
          }
        }
      }

      return indices.sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  /**
   * Stop running containers by profile name, specific container, or all containers
   * @param {string} profile - Machine type (e.g., 'ollama-mock') or 'all'
   * @param {string} specificContainer - Optional specific container name (e.g., 'ollama-mock-1')
   */
  async stopContainersByProfile(profile, specificContainer = null) {
    const { execSync } = await import('child_process');

    try {
      // Case 1: Stop specific container by name
      if (specificContainer) {
        console.log(chalk.blue(`🛑 Stopping specific container: ${specificContainer}`));

        // Check if container exists and is running
        try {
          const output = execSync(`docker ps --filter "name=^${specificContainer}$" --format "{{.Names}}"`, {
            encoding: 'utf-8'
          }).trim();

          if (!output) {
            console.log(chalk.yellow(`⚠️  Container not found or not running: ${specificContainer}`));
            return 0;
          }

          console.log(chalk.dim(`   Stopping ${specificContainer}...`));
          execSync(`docker stop ${specificContainer}`, { encoding: 'utf-8' });
          console.log(chalk.green(`   ✓ Stopped ${specificContainer}`));
          console.log(chalk.green(`\n✅ Stopped 1 container`));
          return 1;
        } catch (error) {
          throw new Error(`Failed to stop container ${specificContainer}: ${error.message}`);
        }
      }

      // Case 2: Stop all containers
      if (profile === 'all' || !profile) {
        console.log(chalk.blue(`🛑 Stopping ALL running containers`));

        const output = execSync(`docker ps --format "{{.Names}}"`, {
          encoding: 'utf-8'
        }).trim();

        if (!output) {
          console.log(chalk.yellow(`⚠️  No running containers found`));
          return 0;
        }

        const containerNames = output.split('\n').filter(name => name);
        console.log(chalk.blue(`📋 Found ${containerNames.length} container(s) to stop:`));
        containerNames.forEach(name => console.log(chalk.dim(`   - ${name}`)));

        for (const containerName of containerNames) {
          console.log(chalk.dim(`   Stopping ${containerName}...`));
          execSync(`docker stop ${containerName}`, { encoding: 'utf-8' });
          console.log(chalk.green(`   ✓ Stopped ${containerName}`));
        }

        console.log(chalk.green(`\n✅ Stopped ${containerNames.length} container(s)`));
        return containerNames.length;
      }

      // Case 3: Stop all containers for a specific machine type
      console.log(chalk.blue(`🛑 Stopping containers matching machine type: ${profile}`));

      const output = execSync(`docker ps --filter "name=${profile}" --format "{{.Names}}"`, {
        encoding: 'utf-8'
      }).trim();

      if (!output) {
        console.log(chalk.yellow(`⚠️  No running containers found for machine type: ${profile}`));
        return 0;
      }

      const containerNames = output.split('\n').filter(name => name);
      console.log(chalk.blue(`📋 Found ${containerNames.length} container(s) to stop:`));
      containerNames.forEach(name => console.log(chalk.dim(`   - ${name}`)));

      for (const containerName of containerNames) {
        console.log(chalk.dim(`   Stopping ${containerName}...`));
        execSync(`docker stop ${containerName}`, { encoding: 'utf-8' });
        console.log(chalk.green(`   ✓ Stopped ${containerName}`));
      }

      console.log(chalk.green(`\n✅ Stopped ${containerNames.length} container(s)`));
      return containerNames.length;
    } catch (error) {
      throw new Error(`Failed to stop containers: ${error.message}`);
    }
  }

  /**
   * Generate deployment arguments for hosting platforms
   */
  generateDeploymentArgs(profile, envName, outputDir = 'deployment-files') {
    if (!profile) {
      throw new Error('Profile is required for generating deployment args');
    }

    console.log(chalk.cyan('🚀 Generating Deployment Files'));
    console.log(chalk.blue(`📋 Profile: ${profile}`));
    console.log(chalk.blue(`🌐 Environment: ${envName}`));
    console.log();

    const allEnvVars = this.loadAllEnvVars(envName);
    const envCount = Object.keys(allEnvVars).length;

    // Create output directory
    const deployDir = path.join(MACHINE_DIR, outputDir);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }

    console.log(chalk.blue(`📁 Output directory: ${deployDir}`));
    console.log(chalk.blue(`🌐 Found ${envCount} environment variables`));
    console.log();

    // Generate different formats for different platforms

    // 1. Railway deployment file (.env format)
    const railwayFile = path.join(deployDir, `${profile}.railway.env`);
    const railwayContent = Object.entries(allEnvVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(railwayFile, railwayContent);
    console.log(chalk.green(`✅ Railway: ${railwayFile}`));

    // 2. Vast.ai deployment file (bash export format)
    const vastFile = path.join(deployDir, `${profile}.vast.sh`);
    const vastContent = [
      '#!/bin/bash',
      '# Vast.ai Environment Variables',
      `# Profile: ${profile}`,
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      ...Object.entries(allEnvVars).map(([key, value]) => `export ${key}="${value}"`),
      '',
      '# Run the container',
      `docker run --rm --name ${profile} \\`,
      ...Object.entries(allEnvVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      `  -w /workspace \\`,
      `  emprops/machine:${profile}`
    ].join('\n');
    fs.writeFileSync(vastFile, vastContent);
    fs.chmodSync(vastFile, '755'); // Make executable
    console.log(chalk.green(`✅ Vast.ai: ${vastFile}`));

    // 3. Docker run command file
    const dockerFile = path.join(deployDir, `${profile}.docker-run.sh`);
    const dockerContent = [
      '#!/bin/bash',
      '# Docker Run Command',
      `# Profile: ${profile}`,
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'docker run --rm \\',
      `  --name ${profile} \\`,
      `  --hostname ${profile} \\`,
      ...Object.entries(allEnvVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      '  -w /workspace \\',
      `  emprops/machine:${profile}`
    ].join('\n');
    fs.writeFileSync(dockerFile, dockerContent);
    fs.chmodSync(dockerFile, '755'); // Make executable
    console.log(chalk.green(`✅ Docker Run: ${dockerFile}`));

    // 4. Kubernetes ConfigMap/Secret YAML
    const k8sFile = path.join(deployDir, `${profile}.k8s.yaml`);
    const k8sContent = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      `  name: ${profile}-config`,
      'data:',
      ...Object.entries(allEnvVars).map(([key, value]) => `  ${key}: "${value}"`),
      '---',
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      `  name: ${profile}`,
      'spec:',
      '  replicas: 1',
      '  selector:',
      '    matchLabels:',
      `      app: ${profile}`,
      '  template:',
      '    metadata:',
      '      labels:',
      `        app: ${profile}`,
      '    spec:',
      '      containers:',
      `      - name: ${profile}`,
      `        image: emprops/machine:${profile}`,
      '        workingDir: /workspace',
      '        envFrom:',
      '        - configMapRef:',
      `            name: ${profile}-config`
    ].join('\n');
    fs.writeFileSync(k8sFile, k8sContent);
    console.log(chalk.green(`✅ Kubernetes: ${k8sFile}`));

    // 5. Environment variables list (for copying/pasting)
    const envListFile = path.join(deployDir, `${profile}.env-list.txt`);
    const envListContent = [
      `# Environment Variables for ${profile}`,
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Total variables: ${envCount}`,
      '',
      '# Variable names (for UI forms):',
      ...Object.keys(allEnvVars).map(key => `# ${key}`),
      '',
      '# Key=Value pairs:',
      ...Object.entries(allEnvVars).map(([key, value]) => `${key}=${value}`)
    ].join('\n');
    fs.writeFileSync(envListFile, envListContent);
    console.log(chalk.green(`✅ Environment List: ${envListFile}`));

    console.log();
    console.log(chalk.cyan('📋 Deployment Files Summary:'));
    console.log(chalk.dim(`  Railway:    Upload ${profile}.railway.env to Railway environment variables`));
    console.log(chalk.dim(`  Vast.ai:    Run ${profile}.vast.sh on Vast.ai instance`));
    console.log(chalk.dim(`  Docker:     Execute ${profile}.docker-run.sh locally`));
    console.log(chalk.dim(`  Kubernetes: kubectl apply -f ${profile}.k8s.yaml`));
    console.log(chalk.dim(`  Manual:     Copy variables from ${profile}.env-list.txt`));
    console.log();
    console.log(chalk.green(`🎉 Generated deployment files for ${envCount} environment variables`));
  }

  /**
   * Main execution
   */
  async run() {
    let symlinkCreated = false;
    try {
      const { command, profile, containerName, portMappings: cmdLinePortMappings, flags, numInstances } = this.parseArgs();
      
      // Get environment from profile configuration
      let envName = null;
      if (profile) {
        envName = this.getEnvironmentFromProfile(profile);
        console.log(chalk.dim(`📋 Profile '${profile}' → Environment '${envName}'`));
      }
      
      // Combine command line --open flags with EXPOSED_PORTS from environment
      const exposedPortMappings = this.parseExposedPorts(envName);
      const portMappings = [...cmdLinePortMappings, ...exposedPortMappings];
      
      if (exposedPortMappings.length > 0) {
        console.log(chalk.dim(`🔌 Combined ports: ${cmdLinePortMappings.length} from --open + ${exposedPortMappings.length} from EXPOSED_PORTS`));
      }
      
      // Bundle worker for build command (workspace packages already built by prepare-docker-build.js)
      if (command === 'build' || command === 'build:push') {
        console.log(chalk.blue('📦 Bundling worker...'));
        await this.executeCommand(['pnpm', '-w', 'worker:bundle'], false, [], null);
        console.log(chalk.green('✅ Worker bundled successfully\n'));
      }
      
      // For both build and up commands, create symlink so Docker Compose can resolve ${VARIABLES}
      if ((command === 'build' || command === 'build:push' || command === 'up') && envName) {
        await this.createEnvironmentSymlink(envName);
        symlinkCreated = true;
      }
      
      this.displayInfo(command, profile, envName, portMappings, flags);
      
      // Check if debug mode is enabled
      const isDebug = flags.includes('--debug') || process.env.DEBUG_MODE === 'true';
      
      // Generate ports before running docker-compose (for 'up' commands only)
      if (command === 'up') {
        console.log(chalk.blue('⚙️  Generating port configuration...'));
        await this.generatePorts(portMappings, profile, isDebug);
      } else if (command === 'build' || command === 'build:push') {
        // Remove any existing override file for build commands (not needed)
        this.cleanupOverrideFile();
      }
      
      let cmd;
      let injectEnvVars = false;
      
      if (command === 'generate_args') {
        // Generate deployment files for hosting platforms
        if (!profile) {
          throw new Error('Profile is required for generating deployment args');
        }
        
        this.generateDeploymentArgs(profile, envName);
        if (symlinkCreated) {
          this.cleanupEnvironmentSymlink();
        }
        return; // Don't execute docker commands
        
      } else if (command === 'build:push') {
        // Build and push in one step
        if (!profile) {
          throw new Error('Profile is required for build:push command');
        }
        
        console.log(chalk.blue('🔨 Step 1: Building image with timestamp...'));
        const buildCmd = this.buildDockerComposeCommand('build', profile, flags, envName);
        await this.executeCommand(buildCmd, false, [], envName);
        
        console.log(chalk.blue('📤 Step 2: Pushing image to registry...'));
        const pushCmd = this.buildDockerComposeCommand('push', profile, [], envName);
        await this.executeCommand(pushCmd, false, [], envName);
        
        console.log(chalk.green('✅ Build and push completed successfully!'));
        if (symlinkCreated) {
          this.cleanupEnvironmentSymlink();
        }
        return; // Done
        
      } else if (command === 'pull:run') {
        // Pull latest images then run (hosted environment simulation - like VAST.ai/Railway)
        if (!profile) {
          throw new Error('Profile is required for pull:run command');
        }

        // Get the image name for this profile
        const composeConfig = yaml.load(fs.readFileSync(path.join(MACHINE_DIR, 'docker-compose.yml'), 'utf8'));
        const profileService = Object.entries(composeConfig.services || {})
          .find(([, service]) => !service.profiles || service.profiles.includes(profile));

        if (!profileService || !profileService[1].image) {
          throw new Error(`No image found for profile ${profile}`);
        }

        const imageName = profileService[1].image;
        console.log(chalk.cyan(`📦 Image: ${imageName}`));

        // Step 1: Remove local image to force fresh pull (mimics fresh machine)
        console.log(chalk.yellow('🗑️  Step 1: Removing local image (simulating fresh machine)...'));
        try {
          await this.executeCommand(['docker', 'rmi', imageName], false, [], null);
          console.log(chalk.green('   ✓ Local image removed'));
        } catch (err) {
          console.log(chalk.gray('   Image not found locally (already clean)'));
        }

        // Step 2: Pull image directly (like VAST.ai/Railway would)
        console.log(chalk.blue('📥 Step 2: Pulling image from registry (like hosted platforms)...'));
        await this.executeCommand(['docker', 'pull', imageName], false, [], null);

        // Step 3: Docker run with environment injection (exactly like hosted platforms)
        const isReset = flags.includes('--reset');

        if (isReset) {
          console.log(chalk.yellow('🔄 Reset mode: Stopping existing containers first...'));
          await this.stopContainersByProfile(profile, null);
        }

        if (numInstances > 1) {
          console.log(chalk.blue(`🏗️  Step 3: Running ${numInstances} containers (hosted platform simulation)...`));

          // Get existing container indices to continue numbering
          const startIndex = isReset ? 0 : (await this.getExistingContainerIndices(profile)).length;

          for (let i = 0; i < numInstances; i++) {
            const containerIndex = startIndex + i;
            const containerName = `${profile}-${containerIndex}`;
            console.log(chalk.dim(`   Starting container ${i + 1}/${numInstances}: ${containerName}`));
            cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings, containerName, true); // detached mode
            await this.executeCommand(cmd, false, portMappings, envName);
          }
          // Clean up symlink after all containers started
          if (symlinkCreated) {
            this.cleanupEnvironmentSymlink();
          }
          return; // Done
        } else {
          console.log(chalk.blue('🏗️  Step 3: Running container (hosted platform simulation)...'));
          cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings);
          // Environment variables are already injected as -e flags in buildDockerRunCommand
          injectEnvVars = false;
        }
      } else if (command === 'run') {
        // Use docker run command (production hosting style)
        if (!profile) {
          throw new Error('Profile is required for docker run command');
        }

        const isReset = flags.includes('--reset');

        if (isReset) {
          console.log(chalk.yellow('🔄 Reset mode: Stopping existing containers first...'));
          await this.stopContainersByProfile(profile, null);
        }

        if (numInstances > 1) {
          console.log(chalk.blue(`🏗️  Starting ${numInstances} containers (production hosting emulation)`));

          // Get existing container indices to continue numbering
          const startIndex = isReset ? 0 : (await this.getExistingContainerIndices(profile)).length;

          for (let i = 0; i < numInstances; i++) {
            const containerIndex = startIndex + i;
            const containerName = `${profile}-${containerIndex}`;
            console.log(chalk.dim(`   Starting container ${i + 1}/${numInstances}: ${containerName}`));
            cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings, containerName, true); // detached mode
            await this.executeCommand(cmd, false, portMappings, envName);
          }
          // Clean up symlink after all containers started
          if (symlinkCreated) {
            this.cleanupEnvironmentSymlink();
          }
          return; // Done
        } else {
          console.log(chalk.blue('🏗️  Using docker run (production hosting emulation)'));
          cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings);
          // Environment variables are already injected as -e flags in buildDockerRunCommand
          injectEnvVars = false;
        }
      } else if (command === 'stop') {
        // Stop running containers by profile name, specific container, or all
        await this.stopContainersByProfile(profile || 'all', containerName);

        // Clean up symlink after stopping
        if (symlinkCreated) {
          this.cleanupEnvironmentSymlink();
        }
        return; // Done
      } else {
        // Use docker compose command
        cmd = this.buildDockerComposeCommand(command, profile, flags, envName);
        // Enable runtime env injection for 'up' commands to emulate production
        injectEnvVars = (command === 'up');
      }

      await this.executeCommand(cmd, injectEnvVars, portMappings, envName);
      
      // Clean up symlink after successful execution
      if (symlinkCreated) {
        this.cleanupEnvironmentSymlink();
      }
      
    } catch (error) {
      // Clean up symlink on error too
      if (symlinkCreated) {
        this.cleanupEnvironmentSymlink();
      }
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  }
}

// Export for testing
export default MachineCompose;

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const composer = new MachineCompose();
  composer.run();
}