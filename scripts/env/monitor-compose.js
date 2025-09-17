#!/usr/bin/env node

/**
 * monitor-compose - Monitor app deployment wrapper
 *
 * Usage:
 *   pnpm d:monitor:env_gen <env>   # Generate environment files for deployment
 *
 * Examples:
 *   pnpm d:monitor:env_gen local-dev
 *   pnpm d:monitor:env_gen production
 */

import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MONITOR_DIR = path.join(PROJECT_ROOT, 'apps/monitor');

class MonitorCompose {
  constructor() {}

  /**
   * Load and combine regular .env file + secrets for deployment
   */
  loadCombinedEnvironment(envName) {
    const envPath = path.join(MONITOR_DIR, `.env.${envName}`);
    const secretsPath = path.join(MONITOR_DIR, `.env.secret.${envName}`);

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
    console.log(chalk.cyan('🚀 Generating Monitor Deployment Files'));
    console.log(chalk.blue(`🌐 Environment: ${envName}`));
    console.log();

    // Load and combine component + secret + clerk environment variables
    const envVars = this.loadCombinedEnvironment(envName);
    const envCount = Object.keys(envVars).length;

    // Create output directory
    const deployDir = path.join(MONITOR_DIR, outputDir);
    if (!fs.existsSync(deployDir)) {
      fs.mkdirSync(deployDir, { recursive: true });
    }

    console.log(chalk.blue(`📁 Output directory: ${deployDir}`));
    console.log(chalk.blue(`🌐 Found ${envCount} environment variables`));
    console.log();

    const serviceName = 'monitor';

    // 1. Vercel .env file for deployment
    const vercelFile = path.join(deployDir, `${serviceName}-${envName}.vercel.env`);
    const vercelContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    fs.writeFileSync(vercelFile, vercelContent);
    console.log(chalk.green(`✅ Vercel env: ${vercelFile}`));

    // 2. Docker run command file
    const dockerFile = path.join(deployDir, `${serviceName}-${envName}.docker-run.sh`);
    const dockerContent = [
      '#!/bin/bash',
      '# Docker Run Command for Monitor',
      `# Environment: ${envName}`,
      `# Generated: ${new Date().toISOString()}`,
      '',
      'docker run --rm \\',
      `  --name emp-monitor \\`,
      `  -p 3333:3333 \\`,
      ...Object.entries(envVars).map(([key, value]) => `  -e ${key}="${value}" \\`),
      `  emprops/emp-job-queue-monitor:latest`
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
    console.log(chalk.green(`✅ Railway env: ${railwayFile}`));

    // 4. Environment variables summary
    const summaryFile = path.join(deployDir, `${serviceName}-${envName}.summary.txt`);
    const summaryContent = [
      `Monitor Deployment Summary - ${envName}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Environment Variables:',
      ...Object.entries(envVars).map(([key, value]) => {
        // Mask sensitive values
        const maskedValue = key.toLowerCase().includes('secret') ||
                           key.toLowerCase().includes('key') ||
                           key.toLowerCase().includes('password') ||
                           key.toLowerCase().includes('token')
          ? '*'.repeat(Math.min(value.length, 8))
          : value;
        return `  ${key}=${maskedValue}`;
      }),
      '',
      'Deployment Files:',
      `  Vercel: ${serviceName}-${envName}.vercel.env`,
      `  Docker: ${serviceName}-${envName}.docker-run.sh`,
      `  Railway: ${serviceName}-${envName}.railway.env`,
      '',
      'Next Steps:',
      '  Vercel: Copy variables to Vercel dashboard or use vercel env',
      '  Docker: Execute .docker-run.sh script',
      '  Railway: Upload .railway.env to Railway environment variables'
    ].join('\n');
    fs.writeFileSync(summaryFile, summaryContent);
    console.log(chalk.green(`✅ Summary: ${summaryFile}`));

    console.log('\n📋 Monitor Deployment Files Summary:');
    console.log('  Vercel:     Copy from .vercel.env to Vercel dashboard');
    console.log('  Docker:     Execute .docker-run.sh locally');
    console.log('  Railway:    Upload .railway.env to Railway environment variables');
    console.log('  Manual:     Check .summary.txt for masked variable list');

    // Special note for Clerk
    if (Object.keys(envVars).some(key => key.includes('CLERK'))) {
      console.log(chalk.cyan('\n🔑 Clerk Setup Notes:'));
      console.log('  1. Create Clerk app at https://dashboard.clerk.com');
      console.log('  2. Update .env.clerk with your actual keys');
      console.log('  3. Re-run env_gen after updating Clerk keys');
    }
  }

  /**
   * Main entry point
   */
  async run() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help' || args[0] === 'help') {
      console.log(chalk.cyan('monitor-compose - Monitor app deployment wrapper\n'));
      console.log('Usage:');
      console.log('  pnpm d:monitor:env_gen <env>     # Generate deployment files\n');
      console.log('Examples:');
      console.log('  pnpm d:monitor:env_gen local-dev');
      console.log('  pnpm d:monitor:env_gen production');
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
        console.log('Usage: pnpm d:monitor:env_gen <env>');
        process.exit(1);
      }
      this.generateDeploymentArgs(envName);
      process.exit(0);
    }

    // Default to generate_args
    const envName = command;
    console.log(chalk.blue(`🎯 Monitor Environment: ${envName}`));
    console.log(chalk.green(`🏗️  Mode: Deployment file generation`));
    console.log(); // Empty line

    this.generateDeploymentArgs(envName);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitorCompose = new MonitorCompose();
  monitorCompose.run().catch((error) => {
    console.error(chalk.red(`❌ Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export default MonitorCompose;