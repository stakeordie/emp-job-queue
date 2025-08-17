#!/usr/bin/env node

import { EnvironmentBuilder } from '../../packages/env-management/dist/src/index.js';
// Use our working test implementations for now
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import chalk from 'chalk';

/**
 * Enhanced Environment Builder with Worker-Driven Architecture Support
 * This integrates our worker-driven machine foundation with the environment builder
 */
class WorkerDrivenEnvironmentBuilder {
  constructor(configDir) {
    this.configDir = configDir;
    this.envBuilder = new EnvironmentBuilder(configDir);
    this.workerParser = new WorkerConfigParser();
    this.serviceInstaller = new ServiceInstaller();
    this.pm2Generator = new PM2EcosystemGenerator();
  }

  /**
   * Build environment with worker-driven architecture support
   */
  async buildWorkerDrivenEnvironment(profile, options = {}) {
    console.log(chalk.blue('🚀 Building Worker-Driven Environment...'));
    console.log(chalk.gray(`Profile: ${profile}`));
    
    const result = {
      success: false,
      envFiles: [],
      dockerCompose: null,
      pm2Ecosystem: null,
      workerConfig: null,
      errors: [],
      warnings: []
    };

    try {
      // Step 1: Build standard environment files + Docker Compose
      console.log(chalk.blue('\n📦 Step 1: Building base environment...'));
      const envResult = await this.envBuilder.buildFromProfile(profile);
      
      if (!envResult.success) {
        result.errors.push(...(envResult.errors || []));
        return result;
      }
      
      result.envFiles = envResult.envPath;
      result.dockerCompose = envResult.dockerComposePath;
      
      console.log(chalk.green(`✅ Base environment built: ${envResult.envPath}`));
      
      // Step 2: Check if WORKER_CONNECTORS is specified
      const workerConnectors = process.env.WORKER_CONNECTORS || options.workerConnectors;
      
      if (!workerConnectors) {
        console.log(chalk.yellow('⚠️  No WORKER_CONNECTORS specified - using static configuration'));
        result.success = true;
        return result;
      }
      
      console.log(chalk.blue(`\n🔧 Step 2: Processing WORKER_CONNECTORS="${workerConnectors}"`));
      
      // Step 3: Parse worker configuration
      result.workerConfig = this.workerParser.parseWorkerConnectors(workerConnectors);
      console.log(chalk.green(`✅ Parsed ${result.workerConfig.totalWorkerCount} workers`));
      
      // Step 4: Detect machine resources (simulated for now)
      const machineResources = this.detectMachineResources();
      console.log(chalk.blue(`\n🖥️  Step 3: Detected machine resources:`));
      console.log(chalk.gray(`  GPUs: ${machineResources.gpuCount} (available: ${machineResources.hasGpu})`));
      console.log(chalk.gray(`  RAM: ${machineResources.ramGB}GB`));
      
      // Step 5: Generate service instances
      console.log(chalk.blue(`\n⚙️  Step 4: Generating service instances...`));
      const serviceInstances = this.workerParser.generateServiceInstances(result.workerConfig, machineResources);
      console.log(chalk.green(`✅ Generated ${serviceInstances.length} service instances`));
      
      // Step 6: Validate configuration
      const validation = this.workerParser.validateConfiguration(result.workerConfig, machineResources);
      if (!validation.valid) {
        result.errors.push(...validation.errors);
        return result;
      }
      result.warnings.push(...validation.warnings);
      
      // Step 7: Install required services (simulated)
      if (result.workerConfig.requiredServices.length > 0) {
        console.log(chalk.blue(`\n📦 Step 5: Installing required services...`));
        const installResult = await this.serviceInstaller.installRequiredServices(
          result.workerConfig.requiredServices,
          machineResources
        );
        
        if (installResult.failed.length > 0) {
          result.warnings.push(`Some services failed to install: ${installResult.failed.map(f => f.service).join(', ')}`);
        }
        
        console.log(chalk.green(`✅ Services installed: ${installResult.successful.join(', ')}`));
      }
      
      // Step 8: Generate PM2 ecosystem
      console.log(chalk.blue(`\n⚙️  Step 6: Generating PM2 ecosystem...`));
      result.pm2Ecosystem = this.pm2Generator.generateEcosystem(
        result.workerConfig,
        serviceInstances,
        machineResources,
        process.env
      );
      
      // Step 9: Write PM2 ecosystem file
      const pm2Path = `${this.configDir}/pm2-ecosystem.config.cjs`;
      await this.pm2Generator.writeEcosystemFile(result.pm2Ecosystem, pm2Path);
      console.log(chalk.green(`✅ PM2 ecosystem written: ${pm2Path}`));
      
      // Step 10: Generate process management scripts
      const scriptsPath = `${this.configDir}/scripts/pm2`;
      const scripts = this.pm2Generator.generateProcessScripts(result.pm2Ecosystem, scriptsPath);
      console.log(chalk.green(`✅ Process scripts generated: ${scriptsPath}/`));
      
      result.success = true;
      
      // Show summary
      console.log(chalk.blue('\n📊 Worker-Driven Environment Summary:'));
      console.log(this.workerParser.generateSummary(result.workerConfig, machineResources));
      
      console.log(chalk.blue('\n🚀 Ready to Start:'));
      console.log(chalk.gray(`  1. Review generated files:`));
      console.log(chalk.gray(`     - Environment: ${result.envFiles}`));
      console.log(chalk.gray(`     - Docker: ${result.dockerCompose}`));
      console.log(chalk.gray(`     - PM2: ${pm2Path}`));
      console.log(chalk.gray(`  2. Start services: ./scripts/pm2/start-services.sh`));
      console.log(chalk.gray(`  3. Monitor: pm2 monit`));
      
    } catch (error) {
      result.errors.push(error.message);
      console.log(chalk.red(`❌ Error: ${error.message}`));
    }
    
    return result;
  }
  
  /**
   * Detect machine resources (simulated - would use actual detection in production)
   */
  detectMachineResources() {
    // Import env helpers at runtime to avoid import issues
    const { getRequiredEnvInt, getRequiredEnvBool } = require('../../packages/core/src/utils/env.js');
    
    // In production, this would detect actual hardware
    // For now, require explicit configuration - no fallbacks for hardware specs
    return {
      gpuCount: getRequiredEnvInt('MACHINE_GPU_COUNT', 'Number of GPUs available on this machine'),
      ramGB: getRequiredEnvInt('MACHINE_RAM_GB', 'Total RAM in GB available on this machine'),
      hasGpu: getRequiredEnvBool('MACHINE_HAS_GPU', 'Whether this machine has GPU hardware available'),
      cpuCores: getRequiredEnvInt('MACHINE_CPU_CORES', 'Number of CPU cores available on this machine')
    };
  }
}

// CLI Interface
const args = process.argv.slice(2);
const getArgValue = (flag) => {
  const index = args.findIndex(arg => arg.startsWith(`--${flag}`));
  if (index === -1) return null;
  
  const arg = args[index];
  if (arg.includes('=')) {
    return arg.split('=')[1];
  }
  return args[index + 1];
};

const firstArg = args[0];
const isPositionalProfile = firstArg && !firstArg.startsWith('--');
const profile = getArgValue('profile') || (isPositionalProfile ? firstArg : 'full-local');
const workerConnectors = getArgValue('workers') || process.env.WORKER_CONNECTORS;

async function main() {
  console.log(chalk.blue('🌟 Worker-Driven Environment Builder'));
  console.log(chalk.gray('=' .repeat(50)));
  
  const builder = new WorkerDrivenEnvironmentBuilder(process.cwd());
  
  const result = await builder.buildWorkerDrivenEnvironment(profile, {
    workerConnectors
  });
  
  if (result.success) {
    console.log(chalk.green('\n🎉 Worker-driven environment built successfully!'));
    
    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\n⚠️  Warnings:'));
      result.warnings.forEach(warning => {
        console.log(chalk.yellow(`  ${warning}`));
      });
    }
  } else {
    console.log(chalk.red('\n❌ Failed to build worker-driven environment:'));
    result.errors.forEach(error => {
      console.log(chalk.red(`  ${error}`));
    });
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { WorkerDrivenEnvironmentBuilder };