#!/usr/bin/env node

/**
 * Docker Compose Manager
 * 
 * Handles base machine service generation from machine.interface.ts
 * Works with compose:build to create complete compose files
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'apps/machine/docker-compose.yml');

export class DockerComposeManager {
  constructor() {
    this.defaultComposeStructure = {
      services: {},
      networks: {
        'default': {
          name: 'emp-job-queue'
        }
      },
      volumes: {}
    };
  }

  /**
   * Load existing docker-compose.yml file
   */
  async loadComposeFile() {
    try {
      const content = await fs.readFile(COMPOSE_FILE, 'utf8');
      return yaml.load(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { ...this.defaultComposeStructure };
      }
      throw error;
    }
  }

  /**
   * Flatten inheritance for all services that inherit from base-machine
   * This should be called when base-machine is about to change (env switch)
   */
  async flattenInheritance() {
    console.log('🔧 Flattening YAML inheritance before environment change...');
    
    const compose = await this.loadComposeFile();
    const baseMachine = compose.services?.['base-machine'];
    
    if (!baseMachine) {
      console.log('ℹ️  No base-machine found, skipping inheritance flattening');
      return;
    }

    // Find all services that use inheritance
    const inheritedServices = [];
    for (const [serviceName, serviceConfig] of Object.entries(compose.services || {})) {
      if (serviceName === 'base-machine') continue;
      
      // Check if service has minimal config (indicates inheritance)
      const hasInheritance = this.detectsInheritance(serviceConfig);
      if (hasInheritance) {
        inheritedServices.push(serviceName);
      }
    }

    if (inheritedServices.length === 0) {
      console.log('ℹ️  No inherited services found');
      return;
    }

    console.log(`📋 Flattening ${inheritedServices.length} inherited services:`, inheritedServices.join(', '));

    // Flatten each inherited service
    for (const serviceName of inheritedServices) {
      const serviceConfig = compose.services[serviceName];
      const flattenedConfig = this.mergeWithBaseMachine(baseMachine, serviceConfig);
      compose.services[serviceName] = flattenedConfig;
    }

    // Write flattened compose file
    await this.writeComposeFile(compose);
    console.log('✅ Inheritance flattened successfully');
  }

  /**
   * Detect if a service config uses inheritance (has minimal properties)
   */
  detectsInheritance(serviceConfig) {
    const hasMinimalProps = (
      serviceConfig.profiles && 
      serviceConfig.build && 
      serviceConfig.container_name &&
      serviceConfig.hostname &&
      !serviceConfig.environment && // Inherited services typically don't have full environment
      !serviceConfig.restart &&     // These are inherited from base-machine
      !serviceConfig.env_file
    );
    return hasMinimalProps;
  }

  /**
   * Merge a service config with base-machine properties
   */
  mergeWithBaseMachine(baseMachine, serviceConfig) {
    // Start with base-machine properties
    const merged = JSON.parse(JSON.stringify(baseMachine));
    
    // Override with service-specific properties
    Object.assign(merged, serviceConfig);
    
    // Merge build args if both exist
    if (baseMachine.build?.args && serviceConfig.build?.args) {
      merged.build.args = {
        ...baseMachine.build.args,
        ...serviceConfig.build.args
      };
    }

    // Merge environment if both exist
    if (baseMachine.environment && serviceConfig.environment) {
      merged.environment = {
        ...baseMachine.environment,
        ...serviceConfig.environment
      };
    }

    // Remove the base-machine profile restriction
    if (merged.profiles?.includes('never-run-directly')) {
      merged.profiles = serviceConfig.profiles || [];
    }

    return merged;
  }

  /**
   * Write compose file without YAML anchors (flattened)
   */
  async writeComposeFile(compose) {
    const yamlContent = yaml.dump(compose, {
      indent: 2,
      lineWidth: 120,
      noRefs: true // No references/anchors in flattened version
    });

    await fs.writeFile(COMPOSE_FILE, yamlContent, 'utf8');
  }

  /**
   * Load machine interface to get environment requirements
   */
  async loadMachineInterface() {
    const interfacePath = path.join(
      PROJECT_ROOT,
      'config/environments/services/machine.interface.ts'
    );
    
    // For now, we'll extract the interface data manually
    // In a real implementation, we'd import the TypeScript module
    return {
      required: [
        'HUB_REDIS_URL',
        'MACHINE_ID',
        'MACHINE_NUM_GPUS',
        'MACHINE_GPU_MEMORY_GB', 
        'MACHINE_GPU_MODEL',
        'WORKERS'
      ],
      optional: [
        'WORKER_BUNDLE_MODE',
        'MACHINE_HEALTH_PORT',
        'MACHINE_LOG_LEVEL',
        'MACHINE_TEST_MODE',
        'COMFYUI_BASE_PORT',
        'SIMULATION_PORT'
      ]
    };
  }

  /**
   * Generate base machine service configuration
   */
  generateBaseMachineService(machineInterface, profileName = null) {
    // Extract environment from profile name (e.g., "full-local" -> "local", "production" -> "production")
    let environment = 'local'; // default
    if (profileName) {
      if (profileName.includes('local')) {
        environment = 'local';
      } else if (profileName.includes('production') || profileName.includes('prod')) {
        environment = 'production';
      } else if (profileName.includes('staging')) {
        environment = 'staging';
      } else if (profileName.includes('dev')) {
        environment = 'development';
      }
      // Add more mappings as needed
    }
    return {
      'base-machine': {
        // Note: YAML anchor (&base-machine) will be added during file write
        build: {
          context: '.',
          dockerfile: 'Dockerfile',
          args: {
            'CACHE_BUST': '${CACHE_BUST:-1}',
            // Build-time secrets for custom nodes
            'AWS_ACCESS_KEY_ID': '${AWS_ACCESS_KEY_ID}',
            'AWS_SECRET_ACCESS_KEY_ENCODED': '${AWS_SECRET_ACCESS_KEY_ENCODED}',
            'AWS_DEFAULT_REGION': '${AWS_DEFAULT_REGION}',
            'HF_TOKEN': '${HF_TOKEN}',
            'CIVITAI_TOKEN': '${CIVITAI_TOKEN}',
            'OPENAI_API_KEY': '${OPENAI_API_KEY}'
          }
        },
        image: '${MACHINE_IMAGE:-base-machine:latest}',
        platform: 'linux/amd64',
        container_name: '${MACHINE_CONTAINER_NAME:-base-machine}',
        hostname: '${MACHINE_CONTAINER_NAME:-base-machine}',
        profiles: ['never-run-directly'], // Prevents base-machine from starting
        restart: 'no',
        stop_grace_period: '2s',
        stop_signal: 'SIGTERM',
        env_file: [
          '.env.secret'  // Runtime secrets injection
        ],
        environment: {
          // Docker/GPU runtime
          'NODE_ENV': 'production',
          'ENV': '${CURRENT_ENV}',
          'NVIDIA_VISIBLE_DEVICES': 'all',
          'NVIDIA_DRIVER_CAPABILITIES': 'compute,utility'
        },
        working_dir: '/workspace',
        deploy: {
          resources: {
            limits: {
              memory: '${MEMORY_LIMIT:-8G}'
            },
            reservations: {
              memory: '${MEMORY_RESERVATION:-2G}'
            }
          }
        }
      }
    };
  }

  /**
   * Load existing compose file or create new one
   */
  async loadComposeFile() {
    try {
      const content = await fs.readFile(COMPOSE_FILE, 'utf8');
      return yaml.load(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { ...this.defaultComposeStructure };
      }
      throw error;
    }
  }

  /**
   * Update or create base machine service in compose file
   */
  async updateBaseMachineService(profileName = null) {
    const machineInterface = await this.loadMachineInterface();
    const compose = await this.loadComposeFile();
    
    // Ensure services section exists
    if (!compose.services) {
      compose.services = {};
    }

    // Generate base machine service
    const baseMachineServices = this.generateBaseMachineService(machineInterface, profileName);
    
    // Only update base-machine service, leave profiles alone
    Object.assign(compose.services, baseMachineServices);

    // Ensure networks and volumes exist
    if (!compose.networks) {
      compose.networks = this.defaultComposeStructure.networks;
    }
    if (!compose.volumes) {
      compose.volumes = this.defaultComposeStructure.volumes;
    }

    // Write updated compose file with YAML anchor support
    await this.writeComposeFileWithAnchors(compose);
    
    return {
      success: true,
      updatedServices: Object.keys(baseMachineServices),
      composeFile: COMPOSE_FILE
    };
  }

  /**
   * Write compose file with YAML anchor on base-machine only
   */
  async writeComposeFileWithAnchors(compose) {
    // Generate YAML content
    let yamlContent = yaml.dump(compose, {
      indent: 2,
      lineWidth: 120,
      noRefs: true
    });

    // Only add YAML anchor to base-machine service
    yamlContent = yamlContent.replace(/^  base-machine:$/m, '  base-machine: &base-machine');

    await fs.writeFile(COMPOSE_FILE, yamlContent, 'utf8');
  }

  /**
   * Check if machine interface has changed since last update
   */
  async hasInterfaceChanged() {
    try {
      const interfacePath = path.join(
        PROJECT_ROOT,
        'config/environments/services/machine.interface.ts'
      );
      
      const stats = await fs.stat(interfacePath);
      const composeStat = await fs.stat(COMPOSE_FILE).catch(() => null);
      
      // If compose file doesn't exist or interface is newer, update needed
      return !composeStat || stats.mtime > composeStat.mtime;
    } catch (error) {
      // If we can't determine, assume update needed
      return true;
    }
  }

  /**
   * Display summary of base machine service update
   */
  displaySummary(result) {
    console.log(`✅ Updated base machine service in ${result.composeFile}`);
    console.log(`📋 Updated services: ${result.updatedServices.join(', ')}`);
    console.log(`ℹ️  Profiles created by 'pnpm compose:build' are preserved`);
  }
}

/**
 * Main function for standalone execution
 */
async function main() {
  try {
    const manager = new DockerComposeManager();
    
    console.log('🔧 Updating base machine service in docker-compose.yml...');
    
    const result = await manager.updateBaseMachineService();
    manager.displaySummary(result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Allow standalone execution
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}