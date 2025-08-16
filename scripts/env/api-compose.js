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
   * Main entry point (exactly like machine pattern)
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      console.log(chalk.cyan('api-compose - API Docker wrapper (follows machine pattern)\n'));
      console.log('Usage:');
      console.log('  pnpm d:api:run <env>   # Production style (docker run -e)\n');
      console.log('Examples:');
      console.log('  pnpm d:api:run local-dev');
      console.log('  pnpm d:api:run production');
      console.log('\nEnvironments:');
      console.log('  local-dev     Local development with .env.local-dev');
      console.log('  production    Production deployment with .env.production');
      process.exit(0);
    }

    const envName = args[0];
    
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