#!/usr/bin/env node

/**
 * fluentd-compose - Docker Compose wrapper with environment injection
 * 
 * Runs Fluentd Docker Compose commands with automatic environment loading
 * Similar to machine-compose.js but for Fluentd service
 * 
 * Usage:
 *   pnpm fluentd:run <env> <command> [args...]
 * 
 * Examples:
 *   pnpm fluentd:run local-dev up --build
 *   pnpm fluentd:run production up -d
 *   pnpm fluentd:run local-dev down
 *   pnpm fluentd:run local-dev logs -f
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const FLUENTD_DIR = path.join(PROJECT_ROOT, 'apps/fluentd');

class FluentdCompose {
  constructor() {}

  /**
   * Load environment variables from .env.{envName}
   */
  loadEnvironment(envName = 'local-dev') {
    const envPath = path.join(FLUENTD_DIR, `.env.${envName}`);
    if (!fs.existsSync(envPath)) {
      console.warn(chalk.yellow(`⚠️  .env.${envName} not found at ${envPath}`));
      console.warn(chalk.gray(`   Available env files:`));
      const envFiles = fs.readdirSync(FLUENTD_DIR).filter(f => f.startsWith('.env.'));
      envFiles.forEach(f => console.warn(chalk.gray(`   - ${f}`)));
      throw new Error(`Environment file not found: .env.${envName}`);
    }

    const result = dotenv.config({ path: envPath });
    if (result.error) {
      throw new Error(`Failed to load environment: ${result.error.message}`);
    }

    console.log(chalk.green(`✅ Loaded environment: ${envName}`));
    console.log(chalk.dim(`   ENV: ${process.env.ENV || envName}`));
    console.log(chalk.dim(`   DASH0_DATASET: ${process.env.DASH0_DATASET}`));
    console.log(chalk.dim(`   DASH0_LOGS_ENDPOINT: ${process.env.DASH0_LOGS_ENDPOINT}`));
    console.log(chalk.dim(`   DASH0_API_KEY: ${process.env.DASH0_API_KEY ? process.env.DASH0_API_KEY.substring(0, 8) + '...' : 'NOT SET'}`));

    return result.parsed || {};
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

    // Check for generate_args command
    if (args[0] === 'generate_args') {
      const envName = args[1];
      if (!envName) {
        console.error(chalk.red('❌ Environment name required for generate_args'));
        console.log('Usage: pnpm d:fluentd:env_gen <env>');
        process.exit(1);
      }
      return { mode: 'generate_args', envName };
    }

    // Check if we're in compose mode via --compose-mode flag
    const isComposeMode = args.includes('--compose-mode');
    if (isComposeMode) {
      // Remove the --compose-mode flag from args
      const flagIndex = args.indexOf('--compose-mode');
      args.splice(flagIndex, 1);
    }
    
    if (isComposeMode) {
      // Docker compose mode: fluentd:compose <env> <command> [args...]
      if (args.length < 2) {
        console.error(chalk.red('❌ Error: Environment and command are required for compose mode'));
        this.showHelp();
        process.exit(1);
      }
      const envName = args[0];
      const command = args[1];
      const dockerArgs = args.slice(2);
      return { mode: 'compose', envName, command, dockerArgs };
    } else {
      // Docker run mode: fluentd:run <env> [args...]
      if (args.length < 1) {
        console.error(chalk.red('❌ Error: Environment is required'));
        this.showHelp();
        process.exit(1);
      }
      const envName = args[0];
      const dockerArgs = args.slice(1);
      return { mode: 'run', envName, dockerArgs };
    }
  }

  /**
   * Generate deployment arguments for hosting platforms
   */
  generateDeploymentArgs(envName, outputDir = 'deployment-files') {
    console.log(chalk.cyan('🚀 Generating Fluentd Deployment Files'));
    console.log(chalk.blue(`🌐 Environment: ${envName}`));
    console.log();

    // Load environment variables
    const envPath = path.join(FLUENTD_DIR, `.env.${envName}`);
    if (!fs.existsSync(envPath)) {
      throw new Error(`Environment file not found: .env.${envName}`);
    }

    const envVars = dotenv.parse(fs.readFileSync(envPath));
    const envCount = Object.keys(envVars).length;

    // Create output directory
    const deployDir = path.join(FLUENTD_DIR, outputDir);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }

    console.log(chalk.blue(`📁 Output directory: ${deployDir}`));
    console.log(chalk.blue(`🌐 Found ${envCount} environment variables`));
    console.log();

    const serviceName = 'fluentd';

    // 1. Railway deployment file (.env format)
    const railwayFile = path.join(deployDir, `${serviceName}-${envName}.railway.env`);
    const railwayContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(railwayFile, railwayContent);
    console.log(chalk.green(`✅ Railway: ${railwayFile}`));

    // 2. Docker run command file
    const dockerFile = path.join(deployDir, `${serviceName}-${envName}.docker-run.sh`);
    const dockerContent = [
      '#!/bin/bash',
      '# Docker Run Command for Fluentd',
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'docker run --rm \\',
      `  --name emp-fluentd \\`,
      `  -p 8888:8888 \\`,  // HTTP input
      `  -p 24220:24220 \\`, // Monitoring
      `  -p 24224:24224 \\`, // Forward input
      ...Object.entries(envVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      `  emprops/fluentd:latest`
    ].join('\n');
    fs.writeFileSync(dockerFile, dockerContent);
    fs.chmodSync(dockerFile, '755');
    console.log(chalk.green(`✅ Docker Run: ${dockerFile}`));

    // 3. Kubernetes ConfigMap
    const k8sFile = path.join(deployDir, `${serviceName}-${envName}.k8s.yaml`);
    const k8sContent = [
      'apiVersion: v1',
      'kind: ConfigMap',
      'metadata:',
      `  name: fluentd-config-${envName}`,
      'data:',
      ...Object.entries(envVars).map(([key, value]) => `  ${key}: "${value}"`)
    ].join('\n');
    fs.writeFileSync(k8sFile, k8sContent);
    console.log(chalk.green(`✅ Kubernetes: ${k8sFile}`));

    // 4. Environment list
    const envListFile = path.join(deployDir, `${serviceName}-${envName}.env-list.txt`);
    const envListContent = Object.entries(envVars)
      .map(([key, value]) => `${key}="${value}"`)
      .join('\n');
    fs.writeFileSync(envListFile, envListContent);
    console.log(chalk.green(`✅ Environment List: ${envListFile}`));

    console.log('\n📋 Deployment Files Summary:');
    console.log('  Railway:    Upload .railway.env to Railway environment variables');
    console.log('  Docker:     Execute .docker-run.sh locally');
    console.log('  Kubernetes: kubectl apply -f .k8s.yaml');
    console.log('  Manual:     Copy variables from .env-list.txt');
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(chalk.cyan('fluentd-compose - Fluentd Docker wrapper with environment injection\n'));
    console.log('Usage:');
    console.log('  pnpm fluentd:run <env> [docker-run-args...]     # Production style (docker run -e)');
    console.log('  pnpm fluentd:compose <env> <command> [args...]  # Development style (docker compose)');
    console.log('  pnpm d:fluentd:env_gen <env>                    # Generate deployment files\n');
    console.log('Docker Run Mode (Production/Railway style):');
    console.log('  Runs single container with -e environment flags');
    console.log('  Examples:');
    console.log('    pnpm fluentd:run local-dev');
    console.log('    pnpm fluentd:run production -d');
    console.log('\nDocker Compose Mode (Development):');
    console.log('  Commands: up, down, build, logs, restart, pull, ps');
    console.log('  Examples:');
    console.log('    pnpm fluentd:compose local-dev up --build');
    console.log('    pnpm fluentd:compose local-dev down');
    console.log('    pnpm fluentd:compose local-dev logs -f');
    console.log('\nDeployment File Generation:');
    console.log('  pnpm d:fluentd:env_gen production');
    console.log('\nEnvironments:');
    console.log('  local-dev     Local development');
    console.log('  production    Production deployment');
    console.log('  staging       Staging environment');
  }

  /**
   * Build Docker Run command (production-style with -e flags)
   */
  buildDockerRunCommand(envName, args) {
    const containerName = `fluentd-${envName}`;
    // Use the image name that Docker Compose would create: {directory}-{service}
    const imageName = `fluentd-fluentd:latest`;
    
    const cmd = ['docker', 'run'];
    
    // Add common docker run flags
    cmd.push('--rm'); // Remove container when it exits
    cmd.push('--name', containerName);
    cmd.push('-p', '8888:8888'); // HTTP input port
    cmd.push('-p', '24220:24220'); // Monitoring port
    
    // Add environment variables as -e flags (Railway style)
    const envVars = this.loadEnvironment(envName);
    Object.keys(envVars).forEach(key => {
      cmd.push('-e', `${key}=${envVars[key]}`);
    });
    
    // Add ENV for container logic
    cmd.push('-e', `ENV=${envName}`);
    
    // Add the image
    cmd.push(imageName);
    
    // Add any additional args
    cmd.push(...args);
    
    return cmd;
  }

  /**
   * Execute Docker Compose command with environment injection
   */
  async executeComposeCommand(envName, command, args = []) {
    try {
      // Load environment variables
      this.loadEnvironment(envName);

      // Ensure ENV is set for container naming
      process.env.ENV = envName;

      // Build docker compose command
      const cmd = ['docker', 'compose'];
      cmd.push(command);
      cmd.push(...args);

      console.log(chalk.blue(`🚀 Running: ${cmd.join(' ')}`));
      console.log(chalk.dim(`   Working directory: ${FLUENTD_DIR}`));
      console.log(chalk.dim(`   Container name: fluentd-${envName}`));

      // Execute command in Fluentd directory
      const child = spawn(cmd[0], cmd.slice(1), {
        cwd: FLUENTD_DIR,
        stdio: 'inherit',
        env: { ...process.env }
      });

      // Handle process completion
      child.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ Command completed successfully`));
        } else {
          console.error(chalk.red(`❌ Command failed with exit code ${code}`));
          process.exit(code);
        }
      });

      child.on('error', (error) => {
        console.error(chalk.red(`❌ Failed to execute docker compose: ${error.message}`));
        process.exit(1);
      });

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Build image using Docker Compose if needed
   */
  async buildImageIfNeeded(envName) {
    return new Promise((resolve, reject) => {
      // Load environment variables
      this.loadEnvironment(envName);
      process.env.ENV = envName;

      const cmd = ['docker', 'compose', 'build'];
      console.log(chalk.dim(`   Running: ${cmd.join(' ')}`));

      const child = spawn(cmd[0], cmd.slice(1), {
        cwd: FLUENTD_DIR,
        stdio: 'inherit',
        env: { ...process.env }
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ Image built successfully`));
          resolve();
        } else {
          reject(new Error(`Image build failed with exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to build image: ${error.message}`));
      });
    });
  }

  /**
   * Execute Docker Run command with environment injection (Railway style)
   */
  async executeRunCommand(envName, args = []) {
    try {
      // First, ensure the image is built using docker compose
      console.log(chalk.blue(`🔨 Building Fluentd image for ${envName}...`));
      await this.buildImageIfNeeded(envName);
      
      // Build docker run command with -e flags
      const cmd = this.buildDockerRunCommand(envName, args);

      console.log(chalk.blue(`🚀 Running: ${cmd.join(' ')}`));
      console.log(chalk.dim(`   Container: fluentd-${envName}`));
      console.log(chalk.dim(`   Image: fluentd-fluentd:latest`));
      console.log(chalk.dim(`   Ports: 8888:8888, 24220:24220`));

      // Execute docker run command
      const child = spawn(cmd[0], cmd.slice(1), {
        stdio: 'inherit',
        env: { ...process.env }
      });

      // Handle process completion
      child.on('close', (code) => {
        if (code === 0) {
          console.log(chalk.green(`✅ Container exited successfully`));
        } else {
          console.error(chalk.red(`❌ Container failed with exit code ${code}`));
          process.exit(code);
        }
      });

      child.on('error', (error) => {
        console.error(chalk.red(`❌ Failed to execute docker run: ${error.message}`));
        process.exit(1);
      });

    } catch (error) {
      console.error(chalk.red(`❌ Error: ${error.message}`));
      process.exit(1);
    }
  }

  /**
   * Main entry point
   */
  async run() {
    const parsed = this.parseArgs();
    
    if (parsed.mode === 'generate_args') {
      this.generateDeploymentArgs(parsed.envName);
      process.exit(0);
    } else if (parsed.mode === 'compose') {
      await this.executeComposeCommand(parsed.envName, parsed.command, parsed.dockerArgs);
    } else {
      await this.executeRunCommand(parsed.envName, parsed.dockerArgs);
    }
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const fluentdCompose = new FluentdCompose();
  fluentdCompose.run().catch((error) => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default FluentdCompose;