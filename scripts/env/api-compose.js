#!/usr/bin/env node

/**
 * api-compose - API Docker wrapper (follows machine pattern exactly)
 * 
 * Usage:
 *   pnpm d:api:run <env>   # Production style (docker run -e) 
 * 
 * Examples:
 *   pnpm d:api:run local-dev
 *   pnpm d:api:run production
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
const API_DIR = path.join(PROJECT_ROOT, 'apps/api');

class ApiCompose {
  constructor() {}

  /**
   * Load environment variables from .env.{envName} (exactly like machine pattern)
   */
  loadEnvironment(envName) {
    const envPath = path.join(API_DIR, `.env.${envName}`);
    if (!fs.existsSync(envPath)) {
      console.warn(chalk.yellow(`⚠️  .env.${envName} not found at ${envPath}`));
      console.warn(chalk.gray(`   Available env files:`));
      const envFiles = fs.readdirSync(API_DIR).filter(f => f.startsWith('.env.'));
      envFiles.forEach(f => console.warn(chalk.gray(`   - ${f}`)));
      throw new Error(`Environment file not found: .env.${envName}`);
    }

    const result = dotenv.config({ path: envPath });
    if (result.error) {
      throw new Error(`Failed to load environment: ${result.error.message}`);
    }

    console.log(chalk.green(`✅ Loaded environment: ${envName}`));
    console.log(chalk.dim(`   ENV file: .env.${envName}`));
    console.log(chalk.dim(`   Variables: ${Object.keys(result.parsed || {}).length}`));

    return result.parsed || {};
  }

  /**
   * Load and combine regular .env file + secrets for deployment
   */
  loadCombinedEnvironment(envName) {
    const envPath = path.join(API_DIR, `.env.${envName}`);
    const secretsPath = path.join(API_DIR, `.env.secret.${envName}`);
    
    console.log(chalk.blue(`📋 Loading regular env: ${path.relative(PROJECT_ROOT, envPath)}`));
    console.log(chalk.blue(`🔐 Loading secrets: ${path.relative(PROJECT_ROOT, secretsPath)}`));

    // Load regular .env file
    let envVars = {};
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envVars = dotenv.parse(envContent);
      console.log(chalk.green(`✅ Loaded ${Object.keys(envVars).length} regular variables`));
    } else {
      console.warn(chalk.yellow(`⚠️  Env file not found: ${envPath}`));
    }

    // Load secrets (flat .env format)
    let secretVars = {};
    if (fs.existsSync(secretsPath)) {
      const secretContent = fs.readFileSync(secretsPath, 'utf8');
      secretVars = dotenv.parse(secretContent);
      console.log(chalk.green(`✅ Loaded ${Object.keys(secretVars).length} secret variables`));
    } else {
      console.warn(chalk.yellow(`⚠️  Secrets file not found: ${secretsPath}`));
    }

    // Combine (secrets override regular vars)
    const combined = { ...envVars, ...secretVars };
    console.log(chalk.blue(`📦 Combined total: ${Object.keys(combined).length} variables`));
    
    return combined;
  }

  /**
   * Build Docker Run command (production-style with -e flags, exactly like machine)
   */
  buildDockerRunCommand(envName) {
    const containerName = `emp-api-${envName}`;
    const imageName = `api-api:latest`;
    
    const cmd = ['docker', 'run'];
    
    // Add common docker run flags (like machine)
    cmd.push('--rm'); // Remove container when it exits
    cmd.push('--name', containerName);
    cmd.push('--hostname', containerName);
    
    // Add port mappings (API specific)
    cmd.push('-p', '3331:3331'); // API server port
    cmd.push('-p', '4317:4317'); // OTLP gRPC
    cmd.push('-p', '4318:4318'); // OTLP HTTP
    cmd.push('-p', '13133:13133'); // OTel health check
    
    // Add environment variables as -e flags (exactly like machine pattern)
    const envVars = this.loadEnvironment(envName);
    Object.entries(envVars).forEach(([key, value]) => {
      cmd.push('-e', `${key}=${value}`);
    });
    
    console.log(chalk.blue(`🌐 Added ${Object.keys(envVars).length} environment variables as -e flags`));
    console.log(chalk.dim(`   Environment variables: ${Object.keys(envVars).join(', ')}`));
    
    // Add the image
    cmd.push(imageName);
    
    return cmd;
  }

  /**
   * Build image using Docker Compose if needed
   */
  async buildImageIfNeeded(envName) {
    return new Promise((resolve, reject) => {
      // Set ENV for container naming during build
      process.env.ENV = envName;

      const cmd = ['docker', 'compose', 'build'];
      console.log(chalk.dim(`   Running: ${cmd.join(' ')}`));

      const child = spawn(cmd[0], cmd.slice(1), {
        cwd: API_DIR,
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
   * Execute Docker Run command (Railway/production style, exactly like machine)
   */
  async executeRunCommand(envName) {
    try {
      // First, ensure the image is built using docker compose
      console.log(chalk.blue(`🔨 Building API image for ${envName}...`));
      await this.buildImageIfNeeded(envName);
      
      // Build docker run command with -e flags (exactly like machine)
      const cmd = this.buildDockerRunCommand(envName);

      console.log(chalk.blue(`🚀 Running: ${cmd.join(' ')}`));
      console.log(chalk.dim(`   Container: emp-api-${envName}`));
      console.log(chalk.dim(`   Image: api-api:latest`));
      console.log(chalk.dim(`   Ports: 3331:3331, 4317:4317, 4318:4318, 13133:13133`));
      console.log(chalk.green(`🏗️  Mode: Production hosting emulation (docker run with -e flags)`));

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
   * Generate deployment arguments for hosting platforms
   */
  generateDeploymentArgs(envName, outputDir = 'deployment-files') {
    console.log(chalk.cyan('🚀 Generating API Deployment Files'));
    console.log(chalk.blue(`🌐 Environment: ${envName}`));
    console.log();

    // Load and combine component + secret environment variables
    const envVars = this.loadCombinedEnvironment(envName);
    const envCount = Object.keys(envVars).length;

    // Create output directory
    const deployDir = path.join(API_DIR, outputDir);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }

    console.log(chalk.blue(`📁 Output directory: ${deployDir}`));
    console.log(chalk.blue(`🌐 Found ${envCount} environment variables`));
    console.log();

    const serviceName = 'api';

    // 1. Unified deployment file (.deploy.env format)
    const deployFile = path.join(deployDir, `${serviceName}-${envName}.deploy.env`);
    const deployContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(deployFile, deployContent);
    console.log(chalk.green(`✅ Deploy file: ${deployFile}`));

    // 2. Docker run command file
    const dockerFile = path.join(deployDir, `${serviceName}-${envName}.docker-run.sh`);
    const dockerContent = [
      '#!/bin/bash',
      '# Docker Run Command for API',
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'docker run --rm \\',
      `  --name emp-api \\`,
      `  -p 3333:3333 \\`,
      ...Object.entries(envVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      `  emprops/emp-job-queue-api:latest`
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
      `  name: api-config-${envName}`,
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
   * Main entry point (exactly like machine pattern)
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      console.log(chalk.cyan('api-compose - API Docker wrapper (follows machine pattern)\n'));
      console.log('Usage:');
      console.log('  pnpm d:api:run <env>         # Production style (docker run -e)');
      console.log('  pnpm d:api:env_gen <env>     # Generate deployment files\n');
      console.log('Examples:');
      console.log('  pnpm d:api:run local-dev');
      console.log('  pnpm d:api:run production');
      console.log('  pnpm d:api:env_gen production');
      console.log('\nEnvironments:');
      console.log('  local-dev     Local development with .env.local-dev');
      console.log('  production    Production deployment with .env.production');
      process.exit(0);
    }

    const command = args[0];
    
    // Handle generate_args command
    if (command === 'generate_args') {
      const envName = args[1];
      if (!envName) {
        console.error(chalk.red('❌ Environment name required for generate_args'));
        console.log('Usage: pnpm d:api:env_gen <env>');
        process.exit(1);
      }
      this.generateDeploymentArgs(envName);
      process.exit(0);
    }
    
    // Default to run command
    const envName = command;
    console.log(chalk.blue(`🎯 API Environment: ${envName}`));
    console.log(chalk.green(`🏗️  Mode: Production hosting emulation (docker run with -e flags)`));
    console.log(); // Empty line
    
    await this.executeRunCommand(envName);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const apiCompose = new ApiCompose();
  apiCompose.run().catch((error) => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default ApiCompose;