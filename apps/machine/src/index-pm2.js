#!/usr/bin/env node
/**
 * PM2-aware entry point for Basic Machine
 * This version works with PM2 to manage all services
 */

import { createLogger } from './utils/logger.js';
import config from './config/environment.js';
import PM2ServiceManager from './lib/pm2-manager.cjs';
import { createTelemetryClient } from '@emp/telemetry';
console.log("🔥🔥🔥 TOTALLY NEW VERSION LOADED - NO CACHE 🔥🔥🔥");
import fs from 'fs';
import http from 'http';
import { URL } from 'url';
import { MachineStatusAggregator } from './services/machine-status-aggregator.js';

const logger = createLogger('main-pm2');

// PM2 manager instance
const pm2Manager = new PM2ServiceManager();
let statusAggregator = null; // Will be created after telemetry initialization
let startTime = null;
let telemetryClient = null;

/**
 * Initialize unified telemetry client for machine
 */
async function initializeTelemetry() {
  // Disable telemetry logging for debugging - requested by user to "stop logging the telemtry now"
  if (process.env.DISABLE_TELEMETRY_LOGGING === 'true') {
    console.log('🔇 Telemetry logging disabled for debugging');
    return null;
  }
  
  console.log('🚀 initializeTelemetry: Starting telemetry initialization for machine service');
  
  try {
    // Generate machine IDs using MACHINE_BASE_ID + TELEMETRY_ENV pattern (like API/webhook)
    console.log(`🔍 initializeTelemetry: Checking MACHINE_ID environment variable`);
    if (!process.env.MACHINE_ID) {
      console.log(`🔍 initializeTelemetry: MACHINE_ID not set, generating from MACHINE_BASE_ID + TELEMETRY_ENV`);
      const machineBaseId = process.env.MACHINE_BASE_ID;
      const telemetryEnv = process.env.TELEMETRY_ENV;
      
      console.log(`🔍 initializeTelemetry: MACHINE_BASE_ID: ${machineBaseId}, TELEMETRY_ENV: ${telemetryEnv}`);
      
      if (!machineBaseId) {
        console.error('❌ initializeTelemetry: MACHINE_BASE_ID environment variable missing');
        throw new Error('FATAL: MACHINE_BASE_ID environment variable is required for machine identification.');
      }
      if (!telemetryEnv) {
        console.error('❌ initializeTelemetry: TELEMETRY_ENV environment variable missing');
        throw new Error('FATAL: TELEMETRY_ENV environment variable is required for machine identification.');
      }
      
      const machineId = `${machineBaseId}-${telemetryEnv}`;
      process.env.MACHINE_ID = machineId;
      console.log(`✅ initializeTelemetry: Generated MACHINE_ID: ${machineId}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing MACHINE_ID: ${process.env.MACHINE_ID}`);
    }
    
    // Set WORKER_ID if not already set (machines can have multiple workers)
    if (!process.env.WORKER_ID) {
      console.log(`🔍 initializeTelemetry: WORKER_ID not set, using MACHINE_ID value`);
      process.env.WORKER_ID = process.env.MACHINE_ID;
      console.log(`✅ initializeTelemetry: Set WORKER_ID: ${process.env.WORKER_ID}`);
    } else {
      console.log(`✅ initializeTelemetry: Using existing WORKER_ID: ${process.env.WORKER_ID}`);
    }

    console.log('🔧 initializeTelemetry: Creating telemetry client');
    // Create and initialize telemetry client
    const client = createTelemetryClient('machine');
    
    console.log('📁 initializeTelemetry: Adding log files before telemetry startup...');
    // Monitor Winston log files (core logger writes to LOG_DIR or /workspace/logs)
    const logDir = process.env.LOG_DIR || '/workspace/logs';
    const containerName = process.env.CONTAINER_NAME || 'basic-machine';
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Add Winston logs
    await client.log.addFile(`${logDir}/error-${today}.log`, 'machine-winston-error');
    await client.log.addFile(`${logDir}/${containerName}-${today}.log`, 'machine-winston-combined');
    
    // Add PM2 service logs - we'll discover them dynamically later, but add common ones
    const commonPM2Services = ['comfyui-gpu0', 'comfyui-gpu1', 'comfyui-gpu2', 'worker'];
    for (const service of commonPM2Services) {
      try {
        await client.log.addFile(`${logDir}/${service}-error.log`, `pm2-${service}-error`);
        await client.log.addFile(`${logDir}/${service}-out.log`, `pm2-${service}-out`);
      } catch (error) {
        // PM2 logs may not exist yet - non-fatal
        console.log(`⚠️ initializeTelemetry: PM2 log file for ${service} not found (will be created when service starts)`);
      }
    }
    
    // Add ComfyUI specific logs
    try {
      await client.log.addFile('/workspace/ComfyUI/user/comfyui_8188.log', 'comfyui-server');
      await client.log.addFile('/workspace/ComfyUI/logs/output-gpu0.log', 'comfyui-output-gpu0');
      await client.log.addFile('/workspace/ComfyUI/logs/output-gpu1.log', 'comfyui-output-gpu1');
    } catch (error) {
      console.log('⚠️ initializeTelemetry: ComfyUI log files not found (will be created when ComfyUI starts)');
    }
    
    // Add machine-specific log file (legacy support)
    await client.log.addFile('/workspace/logs/machine.log', 'machine-legacy');
    
    console.log(`✅ initializeTelemetry: Log files added to monitoring (${logDir})`);
    
    console.log('🔧 initializeTelemetry: Starting telemetry client startup');
    // Initialize without connection testing to avoid startup failures
    const pipelineHealth = await client.startup({
      testConnections: false,
      logConfiguration: true,
      sendStartupPing: true,
    });
    
    if (pipelineHealth?.overall === 'failed') {
      console.warn('⚠️ initializeTelemetry: Telemetry pipeline has failures but continuing machine startup...');
    } else {
      console.log('✅ initializeTelemetry: Telemetry client startup completed successfully');
    }
    
    return client;
  } catch (error) {
    console.error('❌ initializeTelemetry: Telemetry initialization failed:', error.message);
    console.warn('⚠️ initializeTelemetry: Continuing machine startup without telemetry...');
    return null;
  }
}

/**
 * Add service-specific telemetry logs from service mapping configuration
 * This reads the service mapping and adds telemetry_logs for each active service
 */
async function addServiceMappingTelemetryLogs() {
  if (!telemetryClient) {
    logger.debug('No telemetry client available, skipping service mapping log discovery');
    return;
  }

  try {
    logger.info('📁 Adding service-specific telemetry logs from service mapping...');
    
    // Load service mapping
    const fs = await import('fs');
    const serviceMappingPath = './src/config/service-mapping.json';
    
    if (!fs.existsSync(serviceMappingPath)) {
      logger.warn('Service mapping not found, skipping service-specific telemetry logs');
      return;
    }
    
    const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
    const serviceMapping = JSON.parse(serviceMappingContent);
    
    // Get active services from PM2
    const activeServices = await pm2Manager.getAllServicesStatus();
    const activeServiceNames = new Set(activeServices.map(s => s.name));
    
    // Parse worker specifications to determine which services should be active
    const workerConnectors = process.env.WORKERS || process.env.WORKER_CONNECTORS || 'simulation:1';
    const workerSpecs = workerConnectors
      .split(',')
      .map(s => s.trim())
      .filter(s => s)
      .map(spec => {
        const [type, count] = spec.split(':');
        return { type, count: parseInt(count) || 1 };
      });

    // Find required services and their telemetry logs
    const requiredServices = new Set();
    for (const spec of workerSpecs) {
      const workerConfig = serviceMapping.workers?.[spec.type];
      if (workerConfig && workerConfig.services) {
        workerConfig.services.forEach(serviceName => {
          requiredServices.add(serviceName);
        });
      }
    }
    
    let logsAdded = 0;
    
    // Add telemetry logs for each required service
    for (const serviceName of requiredServices) {
      const serviceConfig = serviceMapping.services?.[serviceName];
      if (serviceConfig && serviceConfig.telemetry_logs) {
        logger.debug(`Processing telemetry logs for service: ${serviceName}`);
        
        for (const logConfig of serviceConfig.telemetry_logs) {
          // Check if path contains wildcard characters
          const isWildcardPath = logConfig.path.includes('*') || logConfig.path.includes('?');
          
          if (isWildcardPath) {
            // For wildcard paths, add directly to telemetry - Fluent Bit supports wildcards natively
            try {
              await telemetryClient.log.addFile(logConfig.path, logConfig.name);
              logsAdded++;
              logger.debug(`Added wildcard service telemetry log: ${logConfig.path} as ${logConfig.name} (${logConfig.description})`);
            } catch (error) {
              logger.warn(`Failed to add wildcard service telemetry log ${logConfig.path}: ${error.message}`);
            }
          } else {
            // For regular paths, check if file exists first
            if (fs.existsSync(logConfig.path)) {
              try {
                await telemetryClient.log.addFile(logConfig.path, logConfig.name);
                logsAdded++;
                logger.debug(`Added service telemetry log: ${logConfig.path} as ${logConfig.name} (${logConfig.description})`);
              } catch (error) {
                logger.warn(`Failed to add service telemetry log ${logConfig.path}: ${error.message}`);
              }
            } else {
              logger.debug(`Service telemetry log file does not exist yet: ${logConfig.path} (${logConfig.description})`);
            }
          }
        }
      }
    }
    
    logger.info(`✅ Added ${logsAdded} service-specific telemetry logs from service mapping`);
    
    // Send telemetry event about service log discovery
    if (telemetryClient && logsAdded > 0) {
      await telemetryClient.log.info('📁 VALIDATION: Service-specific telemetry logs added from service mapping', {
        service_logs_added: logsAdded,
        required_services: Array.from(requiredServices),
        active_pm2_services: Array.from(activeServiceNames),
        validation_type: 'service_mapping_logs',
        expected_result: 'Service-specific logs are now flowing to Dash0 based on machine configuration'
      });
    }
  } catch (error) {
    logger.error('Failed to add service mapping telemetry logs:', error);
    // Non-fatal error - continue without service-specific log monitoring
  }
}

/**
 * Add custom named log files to telemetry monitoring
 * This allows flexible addition of any log files that need monitoring
 */
async function addCustomLogFiles(logFiles = []) {
  if (!telemetryClient || !Array.isArray(logFiles) || logFiles.length === 0) {
    return;
  }

  try {
    logger.info(`📁 Adding ${logFiles.length} custom log files to telemetry monitoring...`);
    const fs = await import('fs');
    
    let filesAdded = 0;
    for (const logFile of logFiles) {
      if (typeof logFile !== 'object' || !logFile.path || !logFile.name) {
        logger.warn('Invalid log file specification (must have path and name):', logFile);
        continue;
      }
      
      if (fs.existsSync(logFile.path)) {
        try {
          await telemetryClient.log.addFile(logFile.path, logFile.name);
          filesAdded++;
          logger.debug(`Added custom log file: ${logFile.path} as ${logFile.name}`);
        } catch (error) {
          logger.warn(`Failed to add custom log file ${logFile.path}: ${error.message}`);
        }
      } else {
        logger.warn(`Custom log file does not exist: ${logFile.path}`);
      }
    }
    
    logger.info(`✅ Added ${filesAdded} custom log files to telemetry monitoring`);
    
    // Send telemetry event about custom log addition
    if (telemetryClient && filesAdded > 0) {
      await telemetryClient.log.info('📁 VALIDATION: Custom log files added to monitoring', {
        custom_logs_added: filesAdded,
        custom_logs_requested: logFiles.length,
        validation_type: 'custom_log_addition',
        expected_result: 'Custom machine log files are now flowing to Dash0'
      });
    }
  } catch (error) {
    logger.error('Failed to add custom log files to telemetry:', error);
    // Non-fatal error - continue without custom log monitoring
  }
}

/**
 * Load service mapping and analyze which services need PM2 processes
 */
function analyzeServiceRequirements(workerConnectors) {
  try {
    // Load service mapping
    const serviceMappingPath = './src/config/service-mapping.json';
    const serviceMappingContent = fs.readFileSync(serviceMappingPath, 'utf8');
    const serviceMapping = JSON.parse(serviceMappingContent);
    
    // Parse worker specifications (e.g., "simulation-http:10,comfyui:2")
    const workerSpecs = workerConnectors
      .split(',')
      .map(s => s.trim())
      .filter(s => s)
      .map(spec => {
        const [type, count] = spec.split(':');
        return { type, count: parseInt(count) || 1 };
      });
    
    logger.info(`🔍 Parsing worker specifications from WORKERS="${workerConnectors}":`, workerSpecs);
    
    // Convert worker types to required services
    const requiredServices = new Set();
    const servicesNeedingPM2 = [];
    
    for (const spec of workerSpecs) {
      const workerConfig = serviceMapping.workers?.[spec.type];
      if (workerConfig && workerConfig.services) {
        logger.info(`🔄 Worker type "${spec.type}" provides services:`, workerConfig.services);
        
        workerConfig.services.forEach(serviceName => {
          requiredServices.add(serviceName);
          
          // Check if this service needs PM2 processes
          const serviceConfig = serviceMapping.services?.[serviceName];
          if (serviceConfig && serviceConfig.type === 'internal') {
            servicesNeedingPM2.push({
              serviceName,
              serviceConfig,
              workerCount: spec.count,
              workerType: spec.type
            });
            logger.info(`📋 Service "${serviceName}" needs PM2 processes: ${spec.count} instances`);
          } else if (serviceConfig && serviceConfig.type === 'external') {
            logger.info(`🌐 Service "${serviceName}" is external - no PM2 process needed`);
          } else {
            logger.warn(`⚠️  Service "${serviceName}" not found in service definitions`);
          }
        });
      } else {
        logger.warn(`⚠️  Worker type "${spec.type}" not found in service mapping`);
      }
    }
    
    const servicesArray = Array.from(requiredServices);
    logger.info(`✅ Required services from service mapping:`, servicesArray);
    logger.info(`🏗️  Services needing PM2 processes:`, servicesNeedingPM2.map(s => `${s.serviceName}:${s.workerCount}`));
    
    return {
      allServices: servicesArray,
      servicesNeedingPM2,
      serviceMapping
    };
  } catch (error) {
    logger.error('❌ Failed to load service mapping:', error);
    return { allServices: [], servicesNeedingPM2: [], serviceMapping: null };
  }
}

/**
 * Main application entry point - PM2 mode
 */
async function main() {
  const startupTime = Date.now();
  
  logger.info('STEP 1-5: Container & Environment - Starting Basic Machine in PM2 mode...', {
    version: '0.1.0',
    nodeVersion: process.version,
    gpuCount: config.machine.gpu.count,
    pm2Mode: true
  });

  // Initialize telemetry first
  telemetryClient = await initializeTelemetry();
  
  // Demonstrate clean telemetry API (like API/webhook services)
  if (telemetryClient) {
    // Write some test logs to demonstrate the pipeline
    await telemetryClient.log.info('🔍 VALIDATION: Machine service startup initiated', {
      startup_time_ms: Date.now() - startupTime,
      environment: process.env.TELEMETRY_ENV,
      machine_id: config.machine.id,
      gpu_count: config.machine.gpu.count,
      validation_type: 'machine_startup',
      expected_pipeline: 'machine-service.log → fluent-bit → fluentd → dash0'
    });

    // Send a test metric (non-fatal if it fails)
    try {
      await telemetryClient.otel.gauge('machine.startup.phase.telemetry_complete', Date.now() - startupTime, {
        environment: process.env.TELEMETRY_ENV || 'unknown',
        machine_id: config.machine.id
      }, 'ms');
    } catch (error) {
      console.warn('⚠️ Failed to send startup metric (non-fatal):', error.message);
    }
  }

  // Initialize machine status aggregator with telemetry client
  statusAggregator = new MachineStatusAggregator(config, telemetryClient);

  // Check if health server is already running (indicates previous instance)
  await checkForExistingInstance();

  // Clean up any existing PM2 processes before starting
  await cleanupExistingPM2Processes();

  // Step 6-10: PM2 Ecosystem Generation
  logger.info('STEP 6-10: PM2 Ecosystem Generation - Starting...');
  await generatePM2EcosystemConfig();

  startTime = Date.now();

  try {
    // Initialize machine status aggregator (replaces fragmented status reporting)
    await statusAggregator.connect();

    // Check if we're running under PM2
    const isPM2 = process.env.PM2_HOME || process.env.pm_id !== undefined;
    if (!isPM2) {
      logger.warn('Not running under PM2, but PM2 mode is enabled');
    }

    // Step 11-13: Service Startup
    logger.info('STEP 11-13: Service Startup - Starting PM2 services from ecosystem config...');
    await startPM2Services();
    
    // Verify services are running and healthy  
    await verifyPM2Services();
    
    // Add discovered PM2 service logs to telemetry monitoring
    await addDiscoveredPM2LogsToTelemetry();
    
    // Add service-specific telemetry logs from service mapping
    await addServiceMappingTelemetryLogs();
    
    // Add any additional custom log files specified via environment variable (fallback)
    // Format: CUSTOM_LOG_FILES=path1:name1,path2:name2
    // Example: CUSTOM_LOG_FILES=/workspace/debug.log:debug-trace,/tmp/custom.log:custom-app
    if (process.env.CUSTOM_LOG_FILES) {
      const customLogSpecs = process.env.CUSTOM_LOG_FILES.split(',').map(spec => {
        const [path, name] = spec.trim().split(':');
        return path && name ? { path: path.trim(), name: name.trim() } : null;
      }).filter(Boolean);
      
      if (customLogSpecs.length > 0) {
        await addCustomLogFiles(customLogSpecs);
      }
    }

    // Step 12: Health Server Start
    logger.info('STEP 12: Health Server - Starting health check server...');
    await startHealthServer();
    
    // Signal to status aggregator that machine is fully ready
    await statusAggregator.machineReady();
    
    // Step 21: Machine Ready
    const totalStartupTime = Date.now() - startupTime;
    logger.info(`STEP 21: Machine Ready - Basic Machine ready in PM2 mode (${totalStartupTime}ms)`);

    // Log machine ready through telemetry
    if (telemetryClient) {
      await telemetryClient.log.info('✅ VALIDATION: Machine startup completed successfully', {
        total_startup_time_ms: totalStartupTime,
        machine_id: config.machine.id,
        gpu_count: config.machine.gpu.count,
        pm2_mode: true,
        services_count: (await pm2Manager.getAllServicesStatus()).length,
        validation_type: 'machine_ready',
        expected_result: 'Machine is now accepting jobs and telemetry is flowing to Dash0'
      });
      
      await telemetryClient.otel.gauge('machine.startup.total_duration', totalStartupTime, {
        machine_id: config.machine.id,
        gpu_count: config.machine.gpu.count.toString(),
        status: 'success'
      }, 'ms');
    }

  } catch (error) {
    logger.error('STEP 1-21: Startup FAILED - Basic Machine startup error:', error);
    
    // Log startup failure through telemetry
    if (telemetryClient) {
      await telemetryClient.log.error('Machine startup failed', {
        error: error.message,
        machine_id: config.machine.id
      });
    }
    
    // Status aggregator will automatically report machine error state
    process.exit(1);
  }
}

/**
 * Start PM2 services from ecosystem config
 */
async function startPM2Services() {
  // Use the clean sequential startup orchestrator
  const { startPM2ServicesSequentially } = await import('./services/clean-start-pm2-services.js');
  return await startPM2ServicesSequentially(pm2Manager, logger);
}

/**
 * Verify all PM2 services are running
 */
async function verifyPM2Services() {
  logger.info('Verifying PM2 services...');

  try {
    const services = await pm2Manager.getAllServicesStatus();
    
    // Log service status
    services.forEach(service => {
      logger.info(`Service ${service.name}: ${service.status}`, {
        pid: service.pid,
        memory: service.memory,
        cpu: service.cpu,
        uptime: service.uptime
      });
    });

    // Check if any services are not online
    const offlineServices = services.filter(s => s.status !== 'online');
    if (offlineServices.length > 0) {
      logger.warn('Some services are not online:', offlineServices.map(s => s.name));
      
      // Try to start offline services
      for (const service of offlineServices) {
        logger.info(`Attempting to start ${service.name}...`);
        try {
          await pm2Manager.restartService(service.name);
        } catch (error) {
          logger.error(`Failed to start ${service.name}:`, error);
        }
      }
    }

    // Individual service notifications removed - only single startup_complete event sent

  } catch (error) {
    logger.error('Failed to verify PM2 services:', error);
    throw error;
  }
}

/**
 * Discover running PM2 services and add their log files to telemetry monitoring
 */
async function addDiscoveredPM2LogsToTelemetry() {
  if (!telemetryClient) {
    logger.debug('No telemetry client available, skipping PM2 log discovery');
    return;
  }

  try {
    logger.info('📁 Discovering PM2 service logs for telemetry monitoring...');
    const services = await pm2Manager.getAllServicesStatus();
    const logDir = process.env.LOG_DIR || '/workspace/logs';
    const fs = await import('fs');
    
    let logsAdded = 0;
    for (const service of services) {
      const serviceName = service.name;
      const errorLogPath = `${logDir}/${serviceName}-error.log`;
      const outLogPath = `${logDir}/${serviceName}-out.log`;
      
      // Check if error log exists and add it
      if (fs.existsSync(errorLogPath)) {
        try {
          await telemetryClient.log.addFile(errorLogPath, `pm2-${serviceName}-error`);
          logsAdded++;
          logger.debug(`Added PM2 error log: ${errorLogPath}`);
        } catch (error) {
          logger.warn(`Failed to add PM2 error log for ${serviceName}: ${error.message}`);
        }
      }
      
      // Check if output log exists and add it
      if (fs.existsSync(outLogPath)) {
        try {
          await telemetryClient.log.addFile(outLogPath, `pm2-${serviceName}-out`);
          logsAdded++;
          logger.debug(`Added PM2 output log: ${outLogPath}`);
        } catch (error) {
          logger.warn(`Failed to add PM2 output log for ${serviceName}: ${error.message}`);
        }
      }
    }
    
    // Also discover any additional ComfyUI logs that might exist based on GPU count
    const gpuCount = config.machine.gpu.count;
    for (let gpu = 0; gpu < gpuCount; gpu++) {
      const comfyuiOutputLog = `/workspace/ComfyUI/logs/output-gpu${gpu}.log`;
      const comfyuiErrorLog = `/workspace/logs/comfyui-gpu${gpu}-error.log`;
      
      if (fs.existsSync(comfyuiOutputLog)) {
        try {
          await telemetryClient.log.addFile(comfyuiOutputLog, `comfyui-output-gpu${gpu}`);
          logsAdded++;
          logger.debug(`Added ComfyUI output log: ${comfyuiOutputLog}`);
        } catch (error) {
          logger.warn(`Failed to add ComfyUI output log for GPU ${gpu}: ${error.message}`);
        }
      }
      
      if (fs.existsSync(comfyuiErrorLog)) {
        try {
          await telemetryClient.log.addFile(comfyuiErrorLog, `comfyui-gpu${gpu}-error`);
          logsAdded++;
          logger.debug(`Added ComfyUI error log: ${comfyuiErrorLog}`);
        } catch (error) {
          logger.warn(`Failed to add ComfyUI error log for GPU ${gpu}: ${error.message}`);
        }
      }
    }
    
    logger.info(`✅ Discovered and added ${logsAdded} additional log files to telemetry monitoring`);
    
    // Send telemetry event about log discovery
    if (telemetryClient) {
      await telemetryClient.log.info('📁 VALIDATION: PM2 and service logs discovered for monitoring', {
        discovered_logs_count: logsAdded,
        pm2_services_count: services.length,
        gpu_count: gpuCount,
        log_directory: logDir,
        validation_type: 'log_discovery',
        expected_result: 'All machine service logs are now flowing to Dash0'
      });
    }
  } catch (error) {
    logger.error('Failed to discover PM2 service logs for telemetry:', error);
    // Non-fatal error - continue without additional log monitoring
  }
}

/**
 * Generate PM2 ecosystem config based on current machine configuration
 */
async function generatePM2EcosystemConfig() {
  try {
    logger.info('Generating PM2 ecosystem config...');
    logger.debug('Config services:', config.services);
    
    // Diagnostic: Check working directory and file existence
    const fs = await import('fs');
    logger.info(`Current working directory: ${process.cwd()}`);
    
    // Check that worker-driven generator exists
    const workerDrivenExists = fs.existsSync('/service-manager/generate-pm2-ecosystem-worker-driven.js');
    if (!workerDrivenExists) {
      throw new Error('Worker-driven PM2 generator not found at /service-manager/generate-pm2-ecosystem-worker-driven.js');
    }
    logger.info('✅ Worker-driven PM2 generator found');
    
    const { execa } = await import('execa');
    
    // Always use worker-driven PM2 ecosystem generator
    const workerConnectors = process.env.WORKERS || process.env.WORKER_CONNECTORS || 'simulation:1'; // Default fallback
    
    // Enhanced PM2 Generator handles all service detection using service mapping
    logger.info(`🔍 DEBUG: Worker connectors for Enhanced PM2 Generator: "${workerConnectors}"`);
    
    logger.info('🚀 Using worker-driven PM2 ecosystem generator');
    logger.info(`🔥🔥🔥 [INDEX-PM2-VERIFICATION] About to call generator at: ${new Date().toISOString()}`);
    logger.info(`🔥🔥🔥 [INDEX-PM2-VERIFICATION] Generator path: /service-manager/generate-pm2-ecosystem-worker-driven.js`);
    
    // LOG THE ACTUAL FILE CONTENTS TO PROVE WHICH VERSION WE'RE USING
    logger.info(`🔥🔥🔥 [INDEX-PM2-FILE-VERIFICATION] Reading generator file contents...`);
    try {
      const fs = await import('fs');
      const generatorPath = '/service-manager/generate-pm2-ecosystem-worker-driven.js';
      const fileContents = fs.readFileSync(generatorPath, 'utf8');
      const firstLines = fileContents.split('\n').slice(0, 20).join('\n');
      logger.info(`🔥🔥🔥 [INDEX-PM2-FILE-VERIFICATION] First 20 lines of generator file:`);
      logger.info(`🔥🔥🔥 [INDEX-PM2-FILE-VERIFICATION] ========================================`);
      console.log(firstLines); // Use console.log for direct output
      logger.info(`🔥🔥🔥 [INDEX-PM2-FILE-VERIFICATION] ========================================`);
    } catch (readError) {
      logger.error(`🔥🔥🔥 [INDEX-PM2-FILE-VERIFICATION] ERROR reading generator file: ${readError.message}`);
    }
    
    const generatorResult = await execa('node', ['/service-manager/generate-pm2-ecosystem-worker-driven.js'], {
      cwd: '/workspace',
      env: {
        ...process.env,
        MACHINE_NUM_GPUS: config.machine.gpu.count.toString()
      },
      stdio: 'pipe'
    });

    // Display all generator output
    if (generatorResult.stdout) {
      logger.info('🔥🔥🔥 [GENERATOR-STDOUT] Generator stdout:');
      console.log(generatorResult.stdout);
    }
    if (generatorResult.stderr) {
      logger.info('🔥🔥🔥 [GENERATOR-STDERR] Generator stderr:');
      console.log(generatorResult.stderr);
    }
    
    logger.info('PM2 ecosystem config generated successfully');
    
    // Log the generated config file contents for debugging (truncated)
    try {
      const fs = await import('fs');
      const configContent = fs.readFileSync('/workspace/pm2-ecosystem.config.cjs', 'utf8');
      
      // Parse and summarize the config instead of dumping massive env vars
      const configLines = configContent.split('\n');
      const appNames = [];
      configLines.forEach(line => {
        const nameMatch = line.match(/"name":\s*"([^"]+)"/);
        if (nameMatch) appNames.push(nameMatch[1]);
      });
      
      logger.info(`Generated ecosystem config summary: ${appNames.length} apps - ${appNames.join(', ')}`);
      
      // Only log first 50 lines and last 10 lines to avoid massive env dumps
      const truncatedConfig = [
        ...configLines.slice(0, 50),
        `... [TRUNCATED - ${configLines.length - 60} lines of env vars] ...`,
        ...configLines.slice(-10)
      ].join('\n');
      
      // Commented out to reduce log noise - was requested to comment out ENV var dumps
      // console.log(truncatedConfig);
    } catch (error) {
      logger.error('Failed to read generated ecosystem config:', error);
    }
  } catch (error) {
    logger.error('Failed to generate PM2 ecosystem config:', error);
    throw error;
  }
}

/**
 * Clean up any existing PM2 processes that might be holding ports
 */
async function cleanupExistingPM2Processes() {
  try {
    logger.info('Checking for existing PM2 processes...');
    
    // First, ensure PM2 daemon is running
    try {
      await pm2Manager.pm2Exec('ping');
      logger.debug('PM2 daemon is responsive');
    } catch (error) {
      logger.info('PM2 daemon not running, will be started automatically');
      return; // No cleanup needed if daemon isn't running
    }
    
    // Get list of PM2 processes
    const processes = await pm2Manager.list();
    
    // Check if processes is actually an array (not an error message)
    if (Array.isArray(processes) && processes.length > 0) {
      logger.warn(`Found ${processes.length} existing PM2 processes, cleaning up...`);
      
      // Stop all existing processes
      await pm2Manager.killAll();
      
      logger.info('Cleaned up existing PM2 processes');
      
      // Wait a bit for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      logger.debug('No existing PM2 processes found');
    }
  } catch (error) {
    logger.warn('Could not cleanup existing PM2 processes:', error.message || error);
    // Continue anyway - might be first run or PM2 not initialized
  }
}

/**
 * Check if there's already an instance running
 */
async function checkForExistingInstance() {
  const healthPort = parseInt(process.env.MACHINE_HEALTH_PORT || '9090');
  
  try {
    const response = await fetch(`http://localhost:${healthPort}/health`, {
      method: 'GET',
      timeout: 2000
    });
    
    if (response.ok) {
      const health = await response.json();
      logger.warn('Found existing instance running:', health);
      logger.warn('This might indicate the entrypoint script is being run multiple times');
      logger.warn('Continuing anyway, but this may cause port conflicts...');
    }
  } catch (error) {
    // No existing instance found or not responding - this is good
    logger.debug('No existing instance detected on health port');
  }
}

/**
 * Start health check HTTP server
 */
async function startHealthServer() {
  const port = parseInt(process.env.MACHINE_HEALTH_PORT || '9090');
  
  // Check if port is in use and cleanup if needed
  try {
    await cleanupHealthPort(port);
  } catch (error) {
    logger.error(`Failed to cleanup health server port ${port}:`, error);
    throw error;
  }
  
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.statusCode = 200;
      res.end();
      return;
    }

    try {
      switch (url.pathname) {
        case '/health':
          const health = await checkSystemHealth();
          res.statusCode = health.healthy ? 200 : 503;
          res.end(JSON.stringify(health, null, 2));
          break;

        case '/status':
          const status = await getSystemStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(status, null, 2));
          break;

        case '/ready':
          const ready = startTime !== null;
          res.statusCode = ready ? 200 : 503;
          res.end(JSON.stringify({ ready }));
          break;

        case '/pm2/list':
          const services = await pm2Manager.getAllServicesStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(services, null, 2));
          break;

        case '/pm2/logs':
          const serviceName = url.searchParams.get('service');
          const lines = parseInt(url.searchParams.get('lines') || '50');
          if (serviceName) {
            const logs = await pm2Manager.getServiceLogs(serviceName, lines);
            res.statusCode = 200;
            res.end(logs);
          } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Service name required' }));
          }
          break;

        case '/comfyui/logs':
          const gpu = url.searchParams.get('gpu') || '0';
          const logType = url.searchParams.get('type') || 'server';
          const logLines = parseInt(url.searchParams.get('lines') || '100');
          
          try {
            let logPath;
            switch (logType) {
              case 'server':
                logPath = `/workspace/ComfyUI/user/comfyui_8188.log`;
                break;
              case 'output':
                logPath = `/workspace/ComfyUI/logs/output-gpu${gpu}.log`;
                break;
              case 'error':
                logPath = `/workspace/logs/comfyui-gpu${gpu}-error.log`;
                break;
              default:
                logPath = `/workspace/ComfyUI/user/comfyui_8188.log`;
            }
            
            const { spawn } = await import('child_process');
            const tail = spawn('tail', ['-n', logLines.toString(), '-f', logPath]);
            
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/plain');
            res.setHeader('Transfer-Encoding', 'chunked');
            
            tail.stdout.on('data', (data) => {
              res.write(data);
            });
            
            tail.stderr.on('data', (data) => {
              res.write(`Error: ${data}`);
            });
            
            tail.on('error', (error) => {
              res.write(`Tail error: ${error.message}\n`);
              res.end();
            });
            
            req.on('close', () => {
              tail.kill();
            });
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: `Failed to read ComfyUI logs: ${error.message}` }));
          }
          break;

        case '/restart/machine':
          if (req.method === 'POST') {
            logger.info('🔄 Machine restart requested via API');
            res.statusCode = 200;
            res.end(JSON.stringify({ message: 'Machine restart initiated' }));
            
            // Schedule restart after response is sent
            setTimeout(async () => {
              try {
                logger.info('🔄 Executing machine restart...');
                
                // Send shutdown event to Redis first
                await statusAggregator.shutdown();
                
                // Exit container - Docker/PM2 will handle restart
                process.exit(0);
              } catch (error) {
                logger.error('❌ Error during machine restart:', error);
                process.exit(1);
              }
            }, 100);
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          break;

        case '/restart/service':
          if (req.method === 'POST') {
            const serviceToRestart = url.searchParams.get('service');
            if (serviceToRestart) {
              try {
                logger.info(`🔄 Restarting PM2 service: ${serviceToRestart}`);
                await pm2Manager.restartService(serviceToRestart);
                res.statusCode = 200;
                res.end(JSON.stringify({ message: `Service ${serviceToRestart} restarted successfully` }));
              } catch (error) {
                logger.error(`❌ Error restarting service ${serviceToRestart}:`, error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: `Failed to restart service: ${error.message}` }));
              }
            } else {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Service name required' }));
            }
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          break;

        case '/refresh-status':
          if (req.method === 'POST' || req.method === 'GET') {
            logger.info('📊 Status refresh requested via API');
            try {
              // Trigger immediate status collection and broadcast
              await statusAggregator.collectAndPublishStatus();
              res.statusCode = 200;
              res.end(JSON.stringify({ 
                message: 'Status update triggered',
                machine_id: config.machine.id,
                timestamp: Date.now()
              }));
            } catch (error) {
              logger.error('Failed to trigger status update:', error);
              res.statusCode = 500;
              res.end(JSON.stringify({ 
                error: 'Failed to trigger status update',
                details: error.message
              }));
            }
          } else {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'Method not allowed' }));
          }
          break;

        default:
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      logger.error('Health check error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

  server.on('error', (error) => {
    logger.error('Health server error:', error);
    if (error.code === 'EADDRINUSE') {
      logger.error(`Port ${port} is already in use. This might indicate a previous instance is still running.`);
      process.exit(1);
    }
  });
}

/**
 * Cleanup health server port if it's in use
 */
async function cleanupHealthPort(port) {
  const net = await import('net');
  const { execa } = await import('execa');
  
  // Check if port is in use
  const isInUse = await new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(false));
    });
    server.on('error', () => resolve(true));
  });
  
  if (!isInUse) {
    logger.debug(`Health server port ${port} is available`);
    return;
  }
  
  logger.warn(`Health server port ${port} is in use, attempting cleanup...`);
  
  try {
    // Find process using the port
    const { stdout } = await execa('lsof', ['-ti', `:${port}`]);
    const pid = parseInt(stdout.trim());
    
    if (pid) {
      logger.info(`Killing process ${pid} using port ${port}`);
      
      // Try graceful shutdown first
      try {
        process.kill(pid, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if still running
        try {
          process.kill(pid, 0);
          logger.info(`Process ${pid} still alive, force killing...`);
          process.kill(pid, 'SIGKILL');
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch {
          // Process is dead
        }
      } catch (error) {
        logger.debug(`Error killing process ${pid}:`, error.message);
      }
      
      // Verify port is now free
      const stillInUse = await new Promise((resolve) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.close(() => resolve(false));
        });
        server.on('error', () => resolve(true));
      });
      
      if (stillInUse) {
        logger.error(`Port ${port} is still in use after cleanup. Manual intervention may be required.`);
        throw new Error(`Unable to free port ${port}`);
      } else {
        logger.info(`Successfully freed health server port ${port}`);
      }
    }
  } catch (error) {
    if (error.message.includes('Unable to free port')) {
      throw error;
    }
    logger.warn(`Could not find process using port ${port}, but port appears in use:`, error.message);
    // Continue anyway - might be a networking issue
  }
}

/**
 * Check overall system health
 */
async function checkSystemHealth() {
  const health = {
    healthy: true,
    services: {},
    uptime: startTime ? Date.now() - startTime : 0
  };

  try {
    // Get PM2 service status
    const services = await pm2Manager.getAllServicesStatus();
    
    for (const service of services) {
      const isHealthy = service.status === 'online';
      health.services[service.name] = {
        healthy: isHealthy,
        status: service.status,
        pid: service.pid,
        restarts: service.restarts
      };
      
      if (!isHealthy) {
        health.healthy = false;
      }
    }

    // Check status aggregator Redis connection
    health.services['status-aggregator'] = {
      healthy: statusAggregator.isConnected,
      error: statusAggregator.isConnected ? null : 'Not connected to Redis'
    };
    
    if (!statusAggregator.isConnected) {
      health.healthy = false;
    }

  } catch (error) {
    logger.error('Health check failed:', error);
    health.healthy = false;
    health.error = error.message;
  }

  return health;
}

/**
 * Get system status
 */
async function getSystemStatus() {
  const status = {
    version: '0.1.0',
    uptime: startTime ? Date.now() - startTime : 0,
    pm2Mode: true,
    services: {}
  };

  try {
    const services = await pm2Manager.getAllServicesStatus();
    services.forEach(service => {
      status.services[service.name] = service;
    });
  } catch (error) {
    logger.error('Failed to get service status:', error);
    status.error = error.message;
  }

  return status;
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  logger.info(`🔴 Received ${signal}, IMMEDIATELY sending shutdown event to Redis...`);
  
  const shutdownReason = signal === 'SIGTERM' 
    ? 'Docker container shutdown' 
    : 'Manual interruption';
  
  // Set shutdown reason for child processes to inherit
  process.env.SHUTDOWN_REASON = shutdownReason;

  try {
    // CRITICAL: Send shutdown event to Redis FIRST, before anything else
    logger.info(`🚨 PRIORITY: Sending shutdown event to Redis before any other shutdown actions`);
    await statusAggregator.shutdown();
    logger.info(`✅ Shutdown event sent to Redis successfully`);
    
    // Small delay to ensure the event is transmitted
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // For elastic scaling: Return jobs to queue immediately, don't wait
    logger.info('🔄 Returning active jobs to queue for redistribution...');
    
    // Stop PM2 services quickly
    logger.info('🛑 Stopping PM2 services...');
    try {
      // Just kill everything quickly - we're ephemeral
      await pm2Manager.pm2Exec('kill');
      logger.info('✅ PM2 daemon killed');
    } catch (error) {
      logger.warn('⚠️ Error stopping PM2:', error.message);
      // Don't wait, just exit
    }
    
    // Now exit gracefully
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during shutdown:', error);
    // Even if shutdown notification fails, we should still exit
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start application
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});