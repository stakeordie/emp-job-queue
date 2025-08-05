#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
import { DockerComposeManager } from './docker-compose-manager.js';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import * as yaml from 'js-yaml';

const PROJECT_ROOT = process.cwd();
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'apps/machine/docker-compose.yml');

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

/**
 * Flatten all YAML inheritance before environment changes
 * This converts <<: *base-machine references to full config definitions
 */
async function flattenComposeInheritance() {
  try {
    const content = await fs.readFile(COMPOSE_FILE, 'utf8');
    
    // If no inheritance exists, skip
    if (!content.includes('<<: *base-machine')) {
      console.log('ℹ️  No inheritance found, skipping flatten');
      return;
    }
    
    // Parse YAML with references intact
    const compose = yaml.load(content);
    
    // Dump with noRefs: true to flatten all inheritance
    const flattenedYaml = yaml.dump(compose, {
      indent: 2,
      lineWidth: 120,
      noRefs: true  // This expands all <<: *base-machine into full configs
    });
    
    // Write flattened version
    await fs.writeFile(COMPOSE_FILE, flattenedYaml, 'utf8');
    
    const inheritedCount = (content.match(/<<: \*base-machine/g) || []).length;
    console.log(`📋 Flattened ${inheritedCount} inherited services`);
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('ℹ️  No docker-compose.yml found, skipping flatten');
      return;
    }
    throw error;
  }
}

async function buildEnvironment() {
  try {
    // Flatten inheritance before environment change (converts <<: *base-machine to full configs)
    console.log(chalk.blue('🔧 Flattening compose inheritance before env change...'));
    await flattenComposeInheritance();
    console.log(chalk.green('✅ Inheritance flattened\n'));

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
      
      // Update Docker Compose base machine service if machine interface changed
      try {
        const composeManager = new DockerComposeManager();
        const interfaceChanged = await composeManager.hasInterfaceChanged();
        
        if (interfaceChanged) {
          console.log(chalk.blue('🐳 Updating docker-compose.yml base machine service...'));
          const composeResult = await composeManager.updateBaseMachineService(profile);
          console.log(chalk.green('✅ Docker Compose base machine service updated'));
        } else {
          console.log(chalk.gray('ℹ️  Docker Compose base machine service up to date'));
        }
      } catch (composeError) {
        console.log(chalk.yellow(`⚠️  Could not update docker-compose.yml: ${composeError.message}`));
      }
      
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