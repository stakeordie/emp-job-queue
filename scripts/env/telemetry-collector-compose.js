#!/usr/bin/env node

/**
 * telemetry-collector-compose - Telemetry Collector Docker wrapper
 *
 * Usage:
 *   pnpm d:telcollect:env_gen <env>   # Generate deployment files
 *
 * Examples:
 *   pnpm d:telcollect:env_gen production
 */

import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const TELEMETRY_DIR = path.join(PROJECT_ROOT, 'apps/telemetry-collector');

class TelemetryCollectorCompose {
  constructor() {}

  /**
   * Load and combine regular .env file + secrets for deployment
   */
  loadCombinedEnvironment(envName) {
    const envPath = path.join(TELEMETRY_DIR, `.env.${envName}`);
    const secretsPath = path.join(TELEMETRY_DIR, `.env.secret.${envName}`);

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
   * Generate deployment arguments for hosting platforms
   */
  generateDeploymentArgs(envName, outputDir = 'deployment-files') {
    console.log(chalk.cyan('🚀 Generating Telemetry Collector Deployment Files'));
    console.log(chalk.blue(`🌐 Environment: ${envName}`));
    console.log();

    // Load and combine component + secret environment variables
    const envVars = this.loadCombinedEnvironment(envName);
    const envCount = Object.keys(envVars).length;

    // Create output directory
    const deployDir = path.join(TELEMETRY_DIR, outputDir);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }

    console.log(chalk.blue(`📁 Output directory: ${deployDir}`));
    console.log(chalk.blue(`🌐 Found ${envCount} environment variables`));
    console.log();

    const serviceName = 'telemetry-collector';

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
      '# Docker Run Command for Telemetry Collector',
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'docker run --rm \\',
      `  --name telemetry-collector \\`,
      `  -p 4317:4317 \\`,
      `  -p 4318:4318 \\`,
      `  -p 13133:13133 \\`,
      ...Object.entries(envVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      `  emprops/telemetry-collector:latest`
    ].join('\n');
    fs.writeFileSync(dockerFile, dockerContent);
    fs.chmodSync(dockerFile, '755');
    console.log(chalk.green(`✅ Docker Run: ${dockerFile}`));

    // 3. Railway deployment file
    const railwayFile = path.join(deployDir, `${serviceName}-${envName}.railway.env`);
    const railwayContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(railwayFile, railwayContent);
    console.log(chalk.green(`✅ Railway: ${railwayFile}`));

    // 4. Environment list with validation
    const envListFile = path.join(deployDir, `${serviceName}-${envName}.env-list.txt`);
    const envListLines = [
      '# Telemetry Collector Environment Variables',
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      '# Required Variables:',
      '# - OTLP_HTTP_PORT: OTLP HTTP receiver port (default: 4318)',
      '# - OTLP_GRPC_PORT: OTLP gRPC receiver port (default: 4317)',
      '# - DASH0_ENDPOINT: Dash0 ingress endpoint (format: host:port)',
      '# - DASH0_DATASET: Dash0 dataset name',
      '# - DASH0_AUTH_TOKEN: Dash0 authentication token',
      '# - CURRENT_ENV: Current environment name',
      '',
      ...Object.entries(envVars).map(([key, value]) => `${key}="${value}"`)
    ];
    fs.writeFileSync(envListFile, envListLines.join('\n'));
    console.log(chalk.green(`✅ Environment List: ${envListFile}`));

    console.log('\n📋 Deployment Files Summary:');
    console.log('  Railway:    Upload .railway.env to Railway environment variables');
    console.log('  Docker:     Execute .docker-run.sh locally');
    console.log('  Manual:     Copy variables from .env-list.txt');
    console.log();

    // Validate required variables
    console.log(chalk.cyan('🔍 Validating Required Variables:'));
    const required = [
      'OTLP_HTTP_PORT',
      'OTLP_GRPC_PORT',
      'DASH0_ENDPOINT',
      'DASH0_DATASET',
      'DASH0_AUTH_TOKEN',
      'CURRENT_ENV'
    ];

    const missing = required.filter(key => !envVars[key]);
    if (missing.length > 0) {
      console.log(chalk.red(`❌ Missing required variables: ${missing.join(', ')}`));
      process.exit(1);
    } else {
      console.log(chalk.green('✅ All required variables present'));
    }
  }

  /**
   * Main entry point
   */
  async run() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      console.log(chalk.cyan('telemetry-collector-compose - Telemetry Collector Docker wrapper\n'));
      console.log('Usage:');
      console.log('  pnpm d:telcollect:env_gen <env>     # Generate deployment files\n');
      console.log('Examples:');
      console.log('  pnpm d:telcollect:env_gen production');
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
        console.log('Usage: pnpm d:telcollect:env_gen <env>');
        process.exit(1);
      }
      this.generateDeploymentArgs(envName);
      process.exit(0);
    }

    // Default to generate_args for first argument
    const envName = command;
    this.generateDeploymentArgs(envName);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const telemetryCompose = new TelemetryCollectorCompose();
  telemetryCompose.run().catch((error) => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default TelemetryCollectorCompose;
