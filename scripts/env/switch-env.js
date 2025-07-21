#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
import chalk from 'chalk';

const args = process.argv.slice(2);
const profileName = args[0];

if (!profileName) {
  console.error(chalk.red('❌ Error: Profile name is required'));
  console.log(chalk.gray('Usage: pnpm env:switch <profile-name>'));
  console.log(chalk.gray('       pnpm env:list    # to see available profiles'));
  process.exit(1);
}

async function switchEnvironment() {
  try {
    const configDir = process.cwd();
    const builder = new EnvironmentBuilder(configDir);

    console.log(chalk.blue(`Switching to profile: ${profileName}`));
    const result = await builder.buildFromProfile(profileName);

    if (result.success) {
      console.log(chalk.green(`✅ Switched to profile: ${profileName}`));
      
      if (result.profile) {
        console.log(chalk.gray(`   ${result.profile.description}`));
        console.log(chalk.gray('\n   Components:'));
        Object.entries(result.profile.components).forEach(([comp, env]) => {
          console.log(chalk.gray(`     ${comp}: ${env}`));
        });
      }
      
      if (result.warnings) {
        console.log(chalk.yellow('\n   Warnings:'));
        result.warnings.forEach(warning => {
          console.log(chalk.yellow(`     • ${warning}`));
        });
      }
    } else {
      console.error(chalk.red(`❌ Failed to switch to profile: ${profileName}`));
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

switchEnvironment();