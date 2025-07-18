#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/index.js';
import chalk from 'chalk';

async function listProfiles() {
  try {
    const configDir = process.cwd();
    const builder = new EnvironmentBuilder(configDir);

    const profiles = builder.listProfiles();
    
    if (profiles.length === 0) {
      console.log(chalk.yellow('No profiles found'));
      return;
    }

    console.log(chalk.blue('Available environment profiles:\n'));
    profiles.forEach(profile => {
      console.log(chalk.green(`  ${profile.name}`));
      console.log(chalk.gray(`    ${profile.description}\n`));
    });
    
    console.log(chalk.gray('Usage:'));
    console.log(chalk.gray('  pnpm env:switch <profile-name>'));
    console.log(chalk.gray('  pnpm env:build --profile=<profile-name>'));
  } catch (error) {
    console.error(chalk.red(`❌ Error listing profiles: ${error}`));
    process.exit(1);
  }
}

listProfiles();