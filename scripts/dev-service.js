#!/usr/bin/env node

/**
 * Development service runner with environment file selection
 * 
 * Usage:
 *   node scripts/dev-service.js <service> --env <environment>
 * 
 * Examples:
 *   node scripts/dev-service.js monitor --env local-dev
 *   node scripts/dev-service.js api --env production
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import dotenv from 'dotenv';

function loadEnvFile(filePath) {
  try {
    if (!fsSync.existsSync(filePath)) {
      return {};
    }
    const result = dotenv.config({ path: filePath });
    return result.parsed || {};
  } catch (error) {
    console.warn(`Failed to load env file ${filePath}:`, error.message);
    return {};
  }
}

const args = process.argv.slice(2);

function parseArgs() {
  const serviceName = args[0];
  
  if (!serviceName || args.includes('--help') || args.includes('-h')) {
    console.log(chalk.cyan('dev-service - Development Service Runner with Environment Selection\n'));
    console.log('Usage: node scripts/dev-service.js <service> --env <environment>\n');
    console.log('Options:');
    console.log('  --env <name>      Environment name (required)');
    console.log('\nExamples:');
    console.log('  node scripts/dev-service.js monitor --env local-dev');
    console.log('  node scripts/dev-service.js api --env production');
    process.exit(0);
  }

  const envIndex = args.indexOf('--env');
  const envName = envIndex !== -1 ? args[envIndex + 1] : null;

  if (!envName) {
    console.error(chalk.red('❌ Error: --env parameter is required'));
    console.error(chalk.gray('   Usage: node scripts/dev-service.js <service> --env <environment>'));
    process.exit(1);
  }

  return { serviceName, envName };
}

async function checkEnvironmentFiles(serviceName, envName) {
  const serviceDir = path.join(process.cwd(), 'apps', serviceName);
  const envFile = path.join(serviceDir, `.env.${envName}`);
  const secretFile = path.join(serviceDir, `.env.secret.${envName}`);

  try {
    await fs.access(envFile);
    console.log(chalk.green(`✅ Found env file: apps/${serviceName}/.env.${envName}`));
  } catch {
    console.error(chalk.red(`❌ Missing env file: apps/${serviceName}/.env.${envName}`));
    console.error(chalk.gray(`   Run: pnpm env:build ${envName}`));
    process.exit(1);
  }

  try {
    await fs.access(secretFile);
    console.log(chalk.green(`✅ Found secret file: apps/${serviceName}/.env.secret.${envName}`));
  } catch {
    console.log(chalk.yellow(`⚠️  No secret file: apps/${serviceName}/.env.secret.${envName} (optional)`));
  }

  return { envFile, secretFile };
}

// Removed symlink creation - services should load profile-specific env files directly

async function runService(serviceName, envName) {
  console.log(chalk.cyan(`🚀 Starting ${serviceName} development server...\n`));

  const serviceDir = path.join(process.cwd(), 'apps', serviceName);
  
  return new Promise((resolve, reject) => {
    // Load environment variables from the specific env file
    const envFile = path.join(serviceDir, `.env.${envName}`);
    const secretFile = path.join(serviceDir, `.env.secret.${envName}`);
    
    // Load both public and secret environment variables
    const publicVars = loadEnvFile(envFile);
    const secretVars = loadEnvFile(secretFile);
    const envVars = {
      ...process.env,
      ...publicVars,
      ...secretVars,
      EMP_PROFILE: envName  // Set EMP_PROFILE to match the environment name
    };
    
    console.log(chalk.blue(`📁 Loading environment from: .env.${envName}`));
    console.log(chalk.dim(`   Variables loaded: ${Object.keys(publicVars).length} public, ${Object.keys(secretVars).length} secret`));
    if (Object.keys(publicVars).length > 0) {
      console.log(chalk.dim(`   Public vars: ${Object.keys(publicVars).join(', ')}`));
    }
    console.log('');
    
    const child = spawn('pnpm', ['dev'], {
      cwd: serviceDir,
      stdio: 'inherit',
      shell: true,
      env: envVars
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Service ${serviceName} exited with code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n🛑 Stopping development server...'));
      child.kill('SIGINT');
    });
  });
}

async function main() {
  try {
    const { serviceName, envName } = parseArgs();

    console.log(chalk.cyan('🔧 EMP Job Queue - Development Service Runner'));
    console.log(chalk.dim(`Starting ${serviceName} with environment: ${envName}\n`));

    // Check if environment files exist
    await checkEnvironmentFiles(serviceName, envName);

    // Create symlinks to the correct environment files
    // Services load profile-specific env files directly - no symlinks needed

    // Run the service
    await runService(serviceName, envName);

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}