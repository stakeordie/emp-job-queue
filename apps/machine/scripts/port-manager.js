#!/usr/bin/env node

/**
 * Port Manager - Dynamically generates docker-compose.override.yml based on runtime port requirements
 * 
 * This script handles port mapping generation for different machine profiles and debug scenarios.
 * It reads environment variables and generates appropriate port mappings in docker-compose.override.yml
 * 
 * Environment Variables:
 * - RUNTIME_PORTS: Comma-separated list of port mappings (e.g. "3000:3000,8080:8080")
 * - DEBUG_MODE: Set to 'true' to automatically expose debug port 9229
 * - DOCKER_COMPOSE_PROFILES: Target profile for port generation
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PortManager {
  constructor() {
    this.overrideFilePath = path.join(__dirname, '..', 'docker-compose.override.yml');
  }

  /**
   * Parse runtime port mappings from environment
   */
  parseRuntimePorts() {
    const runtimePorts = process.env.RUNTIME_PORTS || '';
    if (!runtimePorts || runtimePorts === 'none') {
      return [];
    }

    return runtimePorts
      .split(',')
      .map(p => p.trim())
      .filter(p => p)
      .filter(p => p.includes(':'));
  }


  /**
   * Check if debug mode is enabled
   */
  isDebugMode() {
    return process.env.DEBUG_MODE === 'true';
  }

  /**
   * Generate port mappings for a service
   */
  generatePortMappings(serviceName, options = {}) {
    let portMappings = this.parseRuntimePorts();

    // Add debug port in debug mode
    if (options.debug || this.isDebugMode()) {
      if (!portMappings.some(p => p.includes('9229'))) {
        portMappings.push('9229:9229');
      }
    }

    return portMappings;
  }

  /**
   * Generate docker-compose override configuration
   */
  generateOverride() {
    const profile = process.env.DOCKER_COMPOSE_PROFILES;
    const isDebug = this.isDebugMode();

    console.log(`⚙️  Port Manager Configuration:`);
    console.log(`   Profile: ${profile || 'default'}`);
    console.log(`   Debug Mode: ${isDebug}`);
    console.log(`   Runtime Ports: ${process.env.RUNTIME_PORTS || 'none'}`);

    const override = {
      version: '3.8',
      services: {}
    };

    // Generate port mappings based on profile
    if (profile) {
      const serviceName = profile; // Profile name matches service name
      const portMappings = this.generatePortMappings(serviceName, { debug: isDebug });

      if (portMappings.length > 0) {
        override.services[serviceName] = {
          ports: portMappings
        };

        // Add debug environment if needed
        if (isDebug) {
          override.services[serviceName].environment = {
            DEBUG_ENTRYPOINT: 'true'
          };
        }

        console.log(`✅ Generated port mappings for ${serviceName}:`);
        portMappings.forEach(mapping => {
          console.log(`   - ${mapping}`);
        });
      }
    }

    return override;
  }

  /**
   * Write docker-compose.override.yml file
   */
  writeOverride() {
    const override = this.generateOverride();
    const yamlContent = yaml.dump(override, { lineWidth: -1 });

    fs.writeFileSync(this.overrideFilePath, yamlContent);

    const portCount = Object.keys(override.services).reduce((count, serviceName) => {
      return count + (override.services[serviceName].ports?.length || 0);
    }, 0);

    console.log(`✅ Generated docker-compose.override.yml with ${portCount} port mappings`);
    if (portCount === 0) {
      console.log('   No ports exposed');
    }

    return this.overrideFilePath;
  }
}

// Command line interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  switch (command) {
    case 'generate':
      const portManager = new PortManager();
      portManager.writeOverride();
      break;
    
    default:
      console.error('Usage: node port-manager.js generate');
      process.exit(1);
  }
}

export default PortManager;