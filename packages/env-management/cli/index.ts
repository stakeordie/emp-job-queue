#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import { EnvironmentBuilder } from '../src/index.js';

const program = new Command();

program
  .name('emp-env')
  .description('EmProps environment management CLI')
  .version('1.0.0');

program
  .command('build')
  .description('Build environment from profile or components')
  .option('-p, --profile <name>', 'Profile name to use')
  .option('-r, --redis <env>', 'Redis environment (local, dev, staging, prod)')
  .option('-a, --api <env>', 'API environment (local, dev, staging, prod)')
  .option('-m, --machine <env>', 'Machine environment (local, dev, staging, prod)')
  .option('-M, --monitor <env>', 'Monitor environment (local, dev, staging, prod)')
  .option('-c, --comfy <env>', 'ComfyUI environment (local, dev, staging, prod)')
  .option('-o, --output <path>', 'Output file path', '.env.local')
  .action(async (options) => {
    const configDir = process.cwd();
    const builder = new EnvironmentBuilder(configDir, options.output);

    try {
      let result;

      if (options.profile) {
        console.log(chalk.blue(`Building environment from profile: ${options.profile}`));
        result = await builder.buildFromProfile(options.profile);
      } else if (options.redis || options.api || options.machine || options.monitor || options.comfy) {
        const components = {
          redis: options.redis || 'local',
          api: options.api || 'local',
          machine: options.machine || 'local',
          monitor: options.monitor || 'local',
          comfy: options.comfy || 'local'
        };
        
        console.log(chalk.blue('Building environment from components:'));
        Object.entries(components).forEach(([comp, env]) => {
          console.log(chalk.gray(`  ${comp}: ${env}`));
        });
        
        result = await builder.buildFromComponents(components);
      } else {
        console.error(chalk.red('Error: Must specify either --profile or individual component environments'));
        process.exit(1);
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
  });

// Validation is now handled automatically by service interfaces during build

program
  .command('list')
  .description('List available profiles')
  .action(async () => {
    const configDir = process.cwd();
    const builder = new EnvironmentBuilder(configDir);

    try {
      const profiles = builder.listProfiles();
      
      if (profiles.length === 0) {
        console.log(chalk.yellow('No profiles found'));
        return;
      }

      console.log(chalk.blue('Available profiles:'));
      profiles.forEach(profile => {
        console.log(chalk.green(`  ${profile.name}`));
        console.log(chalk.gray(`    ${profile.description}`));
      });
    } catch (error) {
      console.error(chalk.red(`❌ Error listing profiles: ${error}`));
      process.exit(1);
    }
  });

program
  .command('switch')
  .description('Switch to a different profile')
  .argument('<profile>', 'Profile name to switch to')
  .action(async (profileName) => {
    const configDir = process.cwd();
    const builder = new EnvironmentBuilder(configDir);

    try {
      console.log(chalk.blue(`Switching to profile: ${profileName}`));
      const result = await builder.buildFromProfile(profileName);

      if (result.success) {
        console.log(chalk.green(`✅ Switched to profile: ${profileName}`));
        
        if (result.warnings) {
          result.warnings.forEach(warning => {
            console.log(chalk.yellow(`⚠️  ${warning}`));
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
  });

program.parse();