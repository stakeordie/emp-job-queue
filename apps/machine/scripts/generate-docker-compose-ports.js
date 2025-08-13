#!/usr/bin/env node
/**
 * Dynamic Docker Compose Port Generator
 * Generates port mappings based on worker configuration and ComfyUI settings
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WorkerConfigurationParser } from '../src/config/worker-config-parser.js';
import { HardwareDetector } from '../src/config/hardware-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DockerComposePortGenerator {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[Port Generator] ${msg}`),
      warn: (msg) => console.warn(`[Port Generator] ${msg}`),
      error: (msg) => console.error(`[Port Generator] ${msg}`)
    };
    
    this.workerParser = new WorkerConfigurationParser();
    this.hardwareDetector = new HardwareDetector();
  }

  async generatePorts() {
    try {
      this.logger.log('🚀 Starting Docker Compose port generation...');

      // Load environment variables
      await this.loadEnvironment();
      
      // Detect hardware if needed for auto resolution
      const hardwareResources = await this.hardwareDetector.detectResources();
      
      // Parse worker configuration
      const workerConfig = this.parseWorkerConfiguration(hardwareResources);
      
      // Generate port mappings
      const portMappings = this.generatePortMappings(workerConfig);
      
      // Update docker-compose.yml
      await this.updateDockerCompose(portMappings);
      
      this.logger.log('✅ Docker Compose port generation completed successfully');
      
    } catch (error) {
      this.logger.error(`Port generation failed: ${error.message}`);
      throw error;
    }
  }

  async loadEnvironment() {
    // Load .env file if it exists
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      for (const line of envLines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    }
  }

  parseWorkerConfiguration(hardwareResources) {
    const workersEnv = process.env.WORKERS || 'simulation:1';
    this.logger.log(`Parsing workers configuration: ${workersEnv}`);
    
    try {
      return this.workerParser.parseWorkerConnectors(workersEnv, hardwareResources);
    } catch (error) {
      this.logger.warn(`Failed to parse worker configuration: ${error.message}`);
      // Fallback to default
      return {
        workers: [{ connector: 'simulation', count: 1, binding: 'mock_gpu' }],
        gpuWorkers: [],
        cpuWorkers: [],
        sharedWorkers: []
      };
    }
  }

  generatePortMappings(workerConfig) {
    const portMappings = [];
    
    // Check if ports are disabled
    if (process.env.DISABLE_PORTS === 'true') {
      this.logger.log('All ports disabled by DISABLE_PORTS flag - NO PORTS will be exposed');
      // Return empty array - no ports at all, not even health port
      return portMappings;
    }
    
    // Legacy behavior - calculate health port based on machine instance
    const machineInstance = parseInt(process.env.MACHINE_INSTANCE || '0');
    const baseHealthPort = parseInt(process.env.MACHINE_HEALTH_PORT || '9090');
    const healthPort = process.env.EXPOSE_PORTS || (baseHealthPort + machineInstance * 10);
    
    portMappings.push(`"${healthPort}:9090"`);
    
    if (machineInstance > 0) {
      this.logger.log(`Using machine instance ${machineInstance} - health port: ${healthPort}`);
    }
    
    // Generate ComfyUI ports if enabled
    const comfyuiExposeEnabled = process.env.COMFYUI_EXPOSE_PORTS === 'true';
    if (comfyuiExposeEnabled) {
      const comfyuiPorts = this.generateComfyUIPorts(workerConfig, machineInstance);
      portMappings.push(...comfyuiPorts);
    }
    
    this.logger.log(`Generated ${portMappings.length} port mappings`);
    return portMappings;
  }

  generateComfyUIPorts(workerConfig, machineInstance = 0) {
    const ports = [];
    
    // Find ComfyUI workers only (exclude simulation workers)
    const comfyuiWorkers = workerConfig.workers.filter(w => 
      w.connector === 'comfyui' || 
      (w.connector === 'comfyui-remote') ||
      (w.binding === 'gpu' && w.connector !== 'simulation')
    );
    
    if (comfyuiWorkers.length === 0) {
      this.logger.log('No ComfyUI workers found, skipping ComfyUI port generation');
      return ports;
    }
    
    // Apply machine instance offset to avoid conflicts
    const baseHostPort = parseInt(process.env.COMFYUI_EXPOSED_HOST_PORT_BASE || '3188');
    const hostPortBase = baseHostPort + (machineInstance * 100); // Each machine gets 100 port range
    const containerPortBase = parseInt(process.env.COMFYUI_EXPOSED_CONTAINER_PORT_BASE || '8188');
    
    // Generate ports for each ComfyUI worker instance
    let totalInstances = 0;
    for (const worker of comfyuiWorkers) {
      for (let i = 0; i < worker.count; i++) {
        const hostPort = hostPortBase + totalInstances;
        const containerPort = containerPortBase + totalInstances;
        ports.push(`"${hostPort}:${containerPort}"`);
        totalInstances++;
      }
    }
    
    this.logger.log(`Generated ${ports.length} ComfyUI port mappings (${hostPortBase}-${hostPortBase + totalInstances - 1} -> ${containerPortBase}-${containerPortBase + totalInstances - 1})`);
    return ports;
  }

  async updateDockerCompose(portMappings) {
    const overridePath = path.join(__dirname, '..', 'docker-compose.override.yml');
    
    // Create override file to preserve original docker-compose.yml profiles
    let overrideContent = 'services:\n';
    
    // Handle the case where there are no port mappings
    if (portMappings.length === 0) {
      // Create minimal override that doesn't add ports
      overrideContent += '  # No additional port mappings needed\n';
      this.logger.log('✅ No port mappings needed - creating minimal override');
    } else {
      // Determine the service name from environment or use default
      const serviceName = process.env.COMPOSE_PROFILES || 'base-machine';
      
      // Create override for the specific service
      overrideContent += `  ${serviceName}:\n`;
      overrideContent += '    ports:\n';
      overrideContent += '      # Health monitoring port (always exposed)\n';
      overrideContent += '      - "9090:9090"\n';
      
      // Add generated port mappings
      portMappings.forEach(port => {
        overrideContent += `      - "${port}"\n`;
      });
      
      this.logger.log(`✅ Created override for service '${serviceName}' with ${portMappings.length} port mappings`);
    }
    
    // Write the override file (preserves original docker-compose.yml)
    fs.writeFileSync(overridePath, overrideContent, 'utf8');
    
    this.logger.log(`✅ Created docker-compose.override.yml with ${portMappings.length} port mappings`);
    this.logger.log(`Port mappings: ${portMappings.length > 0 ? portMappings.join(', ') : 'No ports'}`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new DockerComposePortGenerator();
  generator.generatePorts().catch(error => {
    console.error('Port generation failed:', error);
    process.exit(1);
  });
}

export { DockerComposePortGenerator };