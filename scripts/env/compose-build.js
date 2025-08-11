#!/usr/bin/env node

/**
 * compose:profile - Dynamic Docker Compose Profile Generator
 * 
 * Creates or updates Docker Compose profiles for specific worker configurations
 * with container tagging support for distributed deployment.
 * 
 * Usage:
 *   pnpm compose:profile <worker-spec> [options]
 *   
 * Examples:
 *   pnpm compose:profile comfyui-remote:1
 *   pnpm compose:profile comfyui-remote:1 --tag emprops/machines:comfy-remote-latest
 *   pnpm compose:profile comfyui:2,openai:4 --tag emprops/machines:mixed-workload-v1.2.3 --build --push
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import * as yaml from 'js-yaml';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const COMPOSE_FILE = path.join(PROJECT_ROOT, 'apps/machine/docker-compose.yml');
const SERVICE_MAPPING_FILE = path.join(PROJECT_ROOT, 'apps/machine/src/config/service-mapping.json');

// Load environment variables from apps/machine/.env
config({ path: path.join(PROJECT_ROOT, 'apps/machine/.env') });

class ComposeBuilder {
  constructor() {
    this.defaultComposeStructure = {
      services: {},
      networks: {
        default: {
          name: 'emp-job-queue'
        }
      },
      volumes: {}
    };
    this.serviceMapping = null;
  }

  /**
   * Load service mapping configuration
   */
  async loadServiceMapping() {
    if (!this.serviceMapping) {
      try {
        const content = await fs.readFile(SERVICE_MAPPING_FILE, 'utf8');
        this.serviceMapping = JSON.parse(content);
      } catch (error) {
        console.warn(chalk.yellow('⚠️  Could not load service mapping:', error.message));
        this.serviceMapping = { connectors: {} };
      }
    }
    return this.serviceMapping;
  }

  /**
   * Parse worker connector specification
   * Format: "connector:count" or "connector:count,connector2:count2"
   */
  async parseWorkerSpec(workerSpec, options = {}) {
    const serviceMapping = await this.loadServiceMapping();
    
    const connectors = workerSpec.split(',').map(spec => {
      const [connector, count] = spec.trim().split(':');
      if (!connector || !count) {
        throw new Error(`Invalid worker spec format: ${spec}. Expected format: connector:count`);
      }
      
      // Get resource binding from service mapping
      const workerConfig = serviceMapping.workers[connector];
      if (!workerConfig) {
        throw new Error(`Unknown worker type: ${connector}. Check service-mapping.json`);
      }
      
      return {
        connector: connector.trim(),
        count: parseInt(count),
        binding: workerConfig.resource_binding
      };
    });

    const { tag } = options;
    
    return {
      raw: workerSpec,
      connectors,
      profileName: this.generateProfileName(connectors, tag),
      serviceName: this.generateServiceName(connectors, tag),
      dockerTarget: await this.generateDockerTarget(connectors)
    };
  }

  /**
   * Extract profile/service name from tag
   * Example: emprops/machines:comfy-remote -> "comfy-remote"
   */
  extractNameFromTag(tag) {
    if (!tag) return null;
    const parts = tag.split(':');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }

  /**
   * Generate profile name - use tag if provided, otherwise generate from connectors
   */
  generateProfileName(connectors, tag = null) {
    const tagName = this.extractNameFromTag(tag);
    if (tagName) {
      return tagName;
    }
    
    // Fallback to connector-based naming if no tag
    return connectors
      .map(c => `${c.connector}-${c.count}`)
      .join('-')
      .replace(/[^a-zA-Z0-9-]/g, '-');
  }

  /**
   * Generate service name for Docker Compose (same as profile name)
   */
  generateServiceName(connectors, tag = null) {
    return this.generateProfileName(connectors, tag);
  }

  /**
   * Generate environment variables for worker specification based on service mapping
   */
  async generateEnvironmentForWorkerSpec(workerSpec) {
    const serviceMapping = await this.loadServiceMapping();
    const environment = {
      'WORKERS': workerSpec.raw,
      'MACHINE_ID': workerSpec.profileName
    };

    // Collect all required and optional environment variables for all workers
    for (const connector of workerSpec.connectors) {
      const workerConfig = serviceMapping.workers[connector.connector];
      if (!workerConfig) continue;

      // Add required environment variables
      if (workerConfig.required_env) {
        for (const envVar of workerConfig.required_env) {
          // Check if envVar already has substitution syntax
          if (envVar.startsWith('${') && envVar.endsWith('}')) {
            // Extract the actual variable name and use it as the key
            const match = envVar.match(/\$\{([^:}]+).*\}/);
            if (match) {
              const actualVar = match[1];
              environment[actualVar] = `\${${actualVar}}`;
            }
          } else {
            // Simple variable name, use directly
            environment[envVar] = `\${${envVar}}`;
          }
        }
      }

      // Add optional environment variables
      if (workerConfig.optional_env) {
        for (const envVar of workerConfig.optional_env) {
          if (envVar.startsWith('${') && envVar.endsWith('}')) {
            const match = envVar.match(/\$\{([^:}]+).*\}/);
            if (match) {
              const actualVar = match[1];
              environment[actualVar] = `\${${actualVar}}`;
            }
          } else {
            environment[envVar] = `\${${envVar}}`;
          }
        }
      }
    }

    return environment;
  }

  /**
   * Generate Docker target stage name
   */
  async generateDockerTarget(connectors) {
    const serviceMapping = await this.loadServiceMapping();
    
    // Map connector names to build stages from service mapping
    const stageNames = connectors.map(c => {
      const workerConfig = serviceMapping.workers[c.connector];
      
      // Get the first service from the worker config
      if (workerConfig && workerConfig.services && workerConfig.services.length > 0) {
        const firstServiceName = workerConfig.services[0];
        const serviceConfig = serviceMapping.services[firstServiceName];
        
        if (serviceConfig && serviceConfig.build_stage) {
          return serviceConfig.build_stage;
        }
      }
      
      // Fallback for unmapped connectors
      console.warn(chalk.yellow(`⚠️  No build_stage found for connector: ${c.connector}, using 'base'`));
      return 'base';
    });
    
    // Remove duplicates and sort for deterministic order
    const uniqueStages = [...new Set(stageNames)].sort();
    
    // Docker stage selection logic:
    // - If only 'base' stages, use 'base'
    // - If 'simulation' is present, use 'simulation' (it includes everything)
    // - If 'comfyui' is present (without simulation), use 'comfyui'
    // - If 'playwright' is present (without others), use 'playwright'
    // - Otherwise, try to find the most specific stage
    
    if (uniqueStages.includes('simulation')) {
      return 'simulation'; // Simulation includes ComfyUI
    }
    if (uniqueStages.includes('comfyui')) {
      return 'comfyui';
    }
    if (uniqueStages.includes('playwright')) {
      return 'playwright';
    }
    
    // If all are base, return base
    if (uniqueStages.length === 1 && uniqueStages[0] === 'base') {
      return 'base';
    }
    
    // For other combinations, log a warning and use the most specific
    console.warn(chalk.yellow(`⚠️  Complex stage combination: ${uniqueStages.join(', ')}. Using most specific.`));
    return uniqueStages[uniqueStages.length - 1];
  }

  /**
   * Load existing docker-compose.yml or create new structure
   */
  async loadComposeFile() {
    try {
      const content = await fs.readFile(COMPOSE_FILE, 'utf8');
      return yaml.load(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(chalk.yellow('📝 Creating new docker-compose.yml'));
        return { ...this.defaultComposeStructure };
      }
      throw error;
    }
  }

  /**
   * Create service configuration for worker specification
   * Inherits from base-machine using YAML anchors
   */
  async createServiceConfig(workerSpec, options = {}) {
    const { tag } = options;
    
    // Create config that inherits from base-machine
    const baseConfig = {
      profiles: [workerSpec.profileName],
      build: {
        context: '.',
        dockerfile: 'Dockerfile',
        target: workerSpec.dockerTarget,
        args: {
          WORKER_SPEC: workerSpec.raw,
          WORKERS: workerSpec.raw,
          MACHINE_ID: workerSpec.profileName,
          CACHE_BUST: '${CACHE_BUST:-1}',
          // Add all environment variables as build args
          ...(await this.generateEnvironmentForWorkerSpec(workerSpec))
        }
      },
      container_name: workerSpec.profileName,
      hostname: workerSpec.profileName
    };
    
    // Only add ports if there are any to add
    const ports = this.generatePortsForWorkerSpec(workerSpec);
    if (ports.length > 0) {
      baseConfig.ports = ports;
    }


    // Add image tag if specified
    if (tag) {
      baseConfig.image = tag;
    }

    return baseConfig;
  }

  /**
   * Generate port mappings for worker specification
   */
  generatePortsForWorkerSpec(workerSpec) {
    // Check if ports are disabled - if so, return no ports at all
    if (process.env.DISABLE_PORTS === 'true') {
      return []; // No ports when DISABLE_PORTS=true
    }
        
    const ports = [];
    
    // Always include health monitoring port
    ports.push('${EXPOSE_PORTS:-9090}:9090');
    
    // Only add ComfyUI ports if COMFYUI_EXPOSE_PORTS is true
    if (process.env.COMFYUI_EXPOSE_PORTS === 'true') {
      // Generate ComfyUI ports for actual ComfyUI workers (not simulation)
      let totalComfyUIInstances = 0;
      for (const connector of workerSpec.connectors) {
        if (connector.connector === 'comfyui' || connector.connector === 'comfyui-remote') {
          totalComfyUIInstances += connector.count;
        }
      }
      
      // Generate port mappings for each ComfyUI instance
      const comfyUIPortMappings = [
        '3188:8188', '3189:8189', '3190:8190', '3191:8191', '3192:8192',
        '3193:8193', '3194:8194', '3195:8195', '3196:8196', '3197:8197'
      ];
      
      for (let i = 0; i < totalComfyUIInstances && i < comfyUIPortMappings.length; i++) {
        ports.push(comfyUIPortMappings[i]);
      }
    }
    
    return ports;
  }

  /**
   * Update docker-compose.yml with new profile
   */
  async updateComposeFile(workerSpec, options = {}) {
    const compose = await this.loadComposeFile();
    
    // Ensure services section exists
    if (!compose.services) {
      compose.services = {};
    }

    // Ensure base-machine has the YAML anchor for inheritance
    if (compose.services['base-machine']) {
      // If base-machine exists but doesn't have the anchor, we need to preserve its content
      // and add the anchor. This is complex with js-yaml, so we'll read and modify manually.
    }

    // Create or update service
    const serviceName = workerSpec.serviceName;
    compose.services[serviceName] = await this.createServiceConfig(workerSpec, options);

    // Write updated compose file with special handling for YAML anchors
    await this.writeComposeFileWithAnchors(compose, serviceName);
    console.log(chalk.green('✅ Updated docker-compose.yml'));
  }

  /**
   * Write compose file with proper YAML anchor support
   */
  async writeComposeFileWithAnchors(compose, newServiceName = null) {
    // Generate YAML content
    let yamlContent = yaml.dump(compose, {
      indent: 2,
      lineWidth: 120,
      noRefs: false
    });

    // Ensure base-machine has the anchor
    yamlContent = yamlContent.replace(/^  base-machine:$/m, '  base-machine: &base-machine');

    // Add inheritance to the new service if specified
    if (newServiceName && newServiceName !== 'base-machine') {
      // Find the service line and add inheritance right after it
      const servicePattern = new RegExp(`^  ${newServiceName}:$`, 'm');
      yamlContent = yamlContent.replace(servicePattern, `  ${newServiceName}:\n    <<: *base-machine`);
    }

    await fs.writeFile(COMPOSE_FILE, yamlContent, 'utf8');
  }


  /**
   * Build and optionally push the container
   */
  async buildContainer(workerSpec, options = {}) {
    const { tag, push, platform } = options;
    
    if (!tag) {
      console.log(chalk.blue('ℹ️  No tag specified, skipping container build'));
      return;
    }

    console.log(chalk.blue(`🔨 Building container: ${tag}`));
    
    const buildArgs = [
      'docker', 'build',
      '--file', './apps/machine/Dockerfile',
      '--target', workerSpec.dockerTarget,
      '--tag', tag
    ];

    if (platform) {
      buildArgs.push('--platform', platform);
    }

    buildArgs.push('./apps/machine');

    try {
      const { spawn } = await import('child_process');
      
      await new Promise((resolve, reject) => {
        const process = spawn(buildArgs[0], buildArgs.slice(1), {
          stdio: 'inherit',
          cwd: PROJECT_ROOT
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });
      });

      console.log(chalk.green(`✅ Built: ${tag}`));

      // Push if requested
      if (push) {
        console.log(chalk.blue(`📤 Pushing: ${tag}`));
        
        await new Promise((resolve, reject) => {
          const pushProcess = spawn('docker', ['push', tag], {
            stdio: 'inherit',
            cwd: PROJECT_ROOT
          });

          pushProcess.on('close', (code) => {
            if (code === 0) {
              console.log(chalk.green(`✅ Pushed: ${tag}`));
              resolve();
            } else {
              reject(new Error(`Docker push failed with code ${code}`));
            }
          });
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Build failed:'), error.message);
      throw error;
    }
  }

  /**
   * Display summary of created/updated profile
   */
  displaySummary(workerSpec, options = {}) {
    console.log(chalk.cyan('\n📋 Profile Summary:'));
    console.log(`  Worker Spec: ${chalk.bold(workerSpec.raw)}`);
    console.log(`  Profile Name: ${chalk.bold(workerSpec.profileName)}`);
    console.log(`  Service Name: ${chalk.bold(workerSpec.serviceName)}`);
    console.log(`  Docker Target: ${chalk.bold(workerSpec.dockerTarget)}`);
    
    if (options.tag) {
      console.log(`  Container Tag: ${chalk.bold(options.tag)}`);
    }

    console.log(chalk.cyan('\n🚀 Usage:'));
    console.log(`  ${chalk.dim('# Deploy this configuration:')}`);
    console.log(`  WORKERS="${workerSpec.raw}" pnpm machine:build`);
    
    if (options.tag) {
      console.log(`  ${chalk.dim('# Pull and run on different machine:')}`);
      console.log(`  docker compose --profile ${workerSpec.profileName} up`);
    }
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  // Check for help first
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(chalk.cyan('compose:profile - Dynamic Docker Compose Profile Generator\n'));
    console.log('Usage: pnpm compose:profile <worker-spec> [options]\n');
    console.log('Options:');
    console.log('  --tag <name>      Container tag for registry push/pull');
    console.log('  --build           Build container image (skipped by default)');
    console.log('  --push            Push container to registry after build');
    console.log('  --platform <arch> Target platform (e.g., linux/amd64)');
    console.log('\nExamples:');
    console.log('  pnpm compose:profile comfyui-remote:1');
    console.log('  pnpm compose:profile comfyui:2 --tag emprops/machines:comfy-latest');
    console.log('  pnpm compose:profile comfyui:2,openai:4 --tag emprops/machines:mixed-v1.0.0 --build --push');
    process.exit(0);
  }

  const workerSpec = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--tag':
        options.tag = args[++i];
        break;
      case '--build':
        options.build = true;
        break;
      case '--push':
        options.push = true;
        break;
      case '--platform':
        options.platform = args[++i];
        break;
      default:
        console.warn(chalk.yellow(`⚠️  Unknown option: ${args[i]}`));
        break;
    }
  }

  return { workerSpec, options };
}

/**
 * Main execution
 */
async function main() {
  try {
    const { workerSpec: workerSpecRaw, options } = parseArgs();
    
    console.log(chalk.cyan('🔧 EMP Job Queue - Compose Builder'));
    console.log(chalk.dim('Creating Docker Compose profile for worker specification...\n'));

    const builder = new ComposeBuilder();
    const workerSpec = await builder.parseWorkerSpec(workerSpecRaw, options);

    // Update compose file with new profile
    await builder.updateComposeFile(workerSpec, options);

    // Build container only if --build flag specified
    if (options.build && options.tag) {
      await builder.buildContainer(workerSpec, options);
    } else if (options.build && !options.tag) {
      console.log(chalk.yellow('⚠️  --build requires --tag to be specified'));
    }

    // Display summary
    builder.displaySummary(workerSpec, options);

    console.log(chalk.green('\n✅ Profile created successfully!'));

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    process.exit(1);
  }
}

// Script entry point

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}