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
import path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';

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

async function symlinkEnvironmentFiles(serviceName, envName) {
  const serviceDir = path.join(process.cwd(), 'apps', serviceName);
  const sourceEnv = `.env.${envName}`;
  const sourceSecret = `.env.secret.${envName}`;
  const targetEnv = '.env';
  const targetSecret = '.env.secret';

  // Remove existing symlinks/files
  try {
    await fs.unlink(path.join(serviceDir, targetEnv));
  } catch {}
  try {
    await fs.unlink(path.join(serviceDir, targetSecret));
  } catch {}

  // Create symlinks to environment-specific files
  try {
    await fs.symlink(sourceEnv, path.join(serviceDir, targetEnv));
    console.log(chalk.blue(`🔗 Linked apps/${serviceName}/.env → .env.${envName}`));
  } catch (error) {
    console.error(chalk.red(`❌ Failed to link env file: ${error.message}`));
    process.exit(1);
  }

  // Create secret symlink if secret file exists
  try {
    await fs.access(path.join(serviceDir, sourceSecret));
    await fs.symlink(sourceSecret, path.join(serviceDir, targetSecret));
    console.log(chalk.blue(`🔗 Linked apps/${serviceName}/.env.secret → .env.secret.${envName}`));
  } catch {
    // Secret file doesn't exist, that's okay
  }
}

async function runService(serviceName) {
  console.log(chalk.cyan(`🚀 Starting ${serviceName} development server...\n`));

  const serviceDir = path.join(process.cwd(), 'apps', serviceName);
  
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['dev'], {
      cwd: serviceDir,
      stdio: 'inherit',
      shell: true
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
    await symlinkEnvironmentFiles(serviceName, envName);

    // Run the service
    await runService(serviceName);

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}