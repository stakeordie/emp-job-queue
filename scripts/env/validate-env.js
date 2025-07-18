#!/usr/bin/env node

import { EnvironmentValidator } from '../../packages/env-management/dist/index.js';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

// Parse arguments
const getArgValue = (flag) => {
  const index = args.findIndex(arg => arg.startsWith(`--${flag}`));
  if (index === -1) return null;
  
  const arg = args[index];
  if (arg.includes('=')) {
    return arg.split('=')[1];
  }
  return args[index + 1];
};

const envFile = getArgValue('env') || '.env.local';
const profileName = getArgValue('profile');

async function validateEnvironment() {
  try {
    const validator = new EnvironmentValidator();
    
    let profile;
    if (profileName) {
      const profilePath = path.join(process.cwd(), 'config', 'environments', 'profiles', `${profileName}.json`);
      if (fs.existsSync(profilePath)) {
        profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      } else {
        console.error(chalk.red(`❌ Profile not found: ${profileName}`));
        process.exit(1);
      }
    }

    console.log(chalk.blue(`Validating environment: ${envFile}`));
    const result = await validator.validateEnvironment(envFile, profile);

    if (result.success) {
      console.log(chalk.green('✅ Environment validation passed'));
    } else {
      console.log(chalk.red('❌ Environment validation failed'));
    }

    // Show check results
    const checks = [
      { name: 'Variables', status: result.checks.variables },
      { name: 'Services', status: result.checks.services },
      { name: 'Ports', status: result.checks.ports },
      { name: 'Network', status: result.checks.network }
    ];

    checks.forEach(check => {
      const icon = check.status ? '✅' : '❌';
      console.log(`  ${icon} ${check.name}`);
    });

    // Show errors
    if (result.errors.length > 0) {
      console.log(chalk.red('\nErrors:'));
      result.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });
    }

    // Show warnings
    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\nWarnings:'));
      result.warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    if (!result.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`❌ Validation error: ${error}`));
    process.exit(1);
  }
}

validateEnvironment();