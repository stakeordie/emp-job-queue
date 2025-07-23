#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
import chalk from 'chalk';

const args = process.argv.slice(2);
const configDir = process.cwd();
const builder = new EnvironmentBuilder(configDir);

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

// Handle positional argument as profile name
const firstArg = args[0];
const isPositionalProfile = firstArg && !firstArg.startsWith('--');

const profile = getArgValue('profile') || (isPositionalProfile ? firstArg : null);
const redis = getArgValue('redis');
const api = getArgValue('api');
const machine = getArgValue('machine');
const monitor = getArgValue('monitor');
const comfy = getArgValue('comfy');
const output = getArgValue('output') || '.env.local';

async function buildEnvironment() {
  try {
    let result;

    if (profile) {
      console.log(chalk.blue(`Building environment from profile: ${profile}`));
      result = await builder.buildFromProfile(profile);
    } else if (redis || api || machine || monitor || comfy) {
      const components = {
        redis: redis || 'local',
        api: api || 'local', 
        machine: machine || 'local',
        monitor: monitor || 'local',
        comfy: comfy || 'local'
      };
      
      console.log(chalk.blue('Building environment from components:'));
      Object.entries(components).forEach(([comp, env]) => {
        console.log(chalk.gray(`  ${comp}: ${env}`));
      });
      
      result = await builder.buildFromComponents(components);
    } else {
      // Default to full-local profile
      console.log(chalk.blue('No profile specified, using full-local'));
      result = await builder.buildFromProfile('full-local');
    }

    if (result.success) {
      console.log(chalk.green(`✅ Environment built successfully: ${result.envPath}`));
      
      if (result.warnings) {
        result.warnings.forEach(warning => {
          console.log(chalk.yellow(`⚠️  ${warning}`));
        });
      }
    } else {
      console.error(chalk.red('❌ Failed to build environment:'));
      result.errors?.forEach(error => {
        console.error(chalk.red(`  ${error}`));
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red(`❌ Unexpected error: ${error}`));
    process.exit(1);
  }
}

buildEnvironment();