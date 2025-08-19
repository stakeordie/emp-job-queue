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
    console.log('  generate_args  Generate deployment files for hosting platforms');
    console.log('\nPort Control:');
    console.log('  --open host:container   Expose container port to host port');
    console.log('  Multiple --open flags can be used');
    console.log('\nExamples:');
    console.log('  pnpm machine:up comfyui-remote-local');
    console.log('  pnpm machine:up sim-prod --open 9090:9090');
    console.log('  pnpm machine:build comfyui-remote-production');
    console.log('  pnpm machine:down comfyui-remote-local');
    console.log('  pnpm machine:pull:run comfyui-remote-production --open 9090:9090');
    console.log('  pnpm machine:run comfyui-remote-production --open 9090:9090');
    console.log('  pnpm machine:generate_args comfyui-remote-production');
    console.log('\nNote: Environment is automatically determined from profile configuration');
    console.log('\nProduction Emulation:');
    console.log('  run command uses docker run with -e flags (true production hosting style)');
  }

  /**
   * Build Docker Run command (production-style with -e flags)
   */
  buildDockerRunCommand(profile, flags, envName, portMappings) {
    if (!profile) {
      throw new Error('Profile is required for docker run command');
    }

    const cmd = ['docker', 'run'];
    
    // Add common docker run flags
    cmd.push('--platform', 'linux/amd64'); // Force x86_64 architecture
    cmd.push('--rm'); // Remove container when it exits
    cmd.push('--name', profile); // Container name
    cmd.push('--hostname', profile); // Hostname
    
    // Add port mappings
    portMappings.forEach(mapping => {
      cmd.push('-p', mapping);
    });
    
    // Add environment variables as -e flags (production hosting style)
    if (envName) {
      const allEnvVars = this.loadAllEnvVars(envName);
      Object.entries(allEnvVars).forEach(([key, value]) => {
        cmd.push('-e', `${key}=${value}`);
      });
      
      console.log(chalk.blue(`🌐 Added ${Object.keys(allEnvVars).length} environment variables as -e flags`));
      console.log(chalk.dim(`  Environment variables: ${Object.keys(allEnvVars).join(', ')}`));
    }
    
    // Add additional flags (BEFORE image name)
    flags.forEach(flag => {
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
        
        // Add build timestamp
        const buildTimestamp = new Date().toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
        cmd.push('--build-arg', `BUILD_TIMESTAMP=${buildTimestamp}`);
        
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
      const { command, profile, portMappings: cmdLinePortMappings, flags } = this.parseArgs();
      
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
      
      // Always build workspace packages and bundle worker first for build command
      if (command === 'build' || command === 'build:push') {
        console.log(chalk.blue('📦 Building workspace packages...'));
        await this.executeCommand(['bash', '../../scripts/build-workspace-packages.sh'], false, [], null);
        
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
          .find(([name, service]) => !service.profiles || service.profiles.includes(profile));
        
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
        console.log(chalk.blue('🏗️  Step 3: Running container (hosted platform simulation)...'));
        cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings);
        // Environment variables are already injected as -e flags in buildDockerRunCommand
        injectEnvVars = false;
      } else if (command === 'run') {
        // Use docker run command (production hosting style)
        if (!profile) {
          throw new Error('Profile is required for docker run command');
        }
        
        console.log(chalk.blue('🏗️  Using docker run (production hosting emulation)'));
        cmd = this.buildDockerRunCommand(profile, flags, envName, portMappings);
        // Environment variables are already injected as -e flags in buildDockerRunCommand
        injectEnvVars = false;
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

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const composer = new MachineCompose();
  composer.run();
}