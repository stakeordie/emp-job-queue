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
  console.log('🚀 initializeTelemetry: Starting telemetry initialization for machine service');
  
  try {
    // Generate machine IDs - MACHINE_ID should already be set by environment
    console.log(`🔍 initializeTelemetry: Checking MACHINE_ID environment variable`);
    if (!process.env.MACHINE_ID) {
      console.error('❌ initializeTelemetry: MACHINE_ID environment variable missing');
      throw new Error('FATAL: MACHINE_ID environment variable is required for machine identification.');
    }
    
    console.log(`✅ initializeTelemetry: Using MACHINE_ID: ${process.env.MACHINE_ID}`);
    
    // Set WORKER_ID if not already set (machines can have multiple workers)
    if (!process.env.WORKER_ID) {
      console.log(`🔍 initializeTelemetry: WORKER_ID not set, using MACHINE_ID value`);
      process.env.WORKER_ID = process.env.MACHINE_ID;
      console.log(`✅ initializeTelemetry: Set WORKER_ID: ${process.env.WORKER_ID}`);
    }

    console.log('🔧 initializeTelemetry: Creating telemetry client');
    // Create and initialize telemetry client
    const client = createTelemetryClient('machine');
    
    // Set machine-specific log file path
    client.setLogFile('/workspace/logs/machine.log');
    
    console.log('🔧 initializeTelemetry: Starting telemetry client startup');
    // Initialize with full pipeline testing
    const pipelineHealth = await client.startup({
      testConnections: true,
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
  logger.info('STEP 1-5: Container & Environment - Starting Basic Machine in PM2 mode...', {
    version: '0.1.0',
    nodeVersion: process.version,
    gpuCount: config.machine.gpu.count,
    pm2Mode: true
  });

  // Initialize telemetry first
  telemetryClient = await initializeTelemetry();

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

    // Step 12: Health Server Start
    logger.info('STEP 12: Health Server - Starting health check server...');
    await startHealthServer();
    
    // Signal to status aggregator that machine is fully ready
    await statusAggregator.machineReady();
    
    // Step 21: Machine Ready
    const startupTime = Date.now() - startTime;
    logger.info(`STEP 21: Machine Ready - Basic Machine ready in PM2 mode (${startupTime}ms)`);

    // Log machine ready through telemetry
    if (telemetryClient) {
      await telemetryClient.log.info('✅ VALIDATION: Machine startup completed successfully', {
        total_startup_time_ms: startupTime,
        machine_id: config.machine.id,
        gpu_count: config.machine.gpu.count,
        pm2_mode: true,
        services_count: (await pm2Manager.getAllServicesStatus()).length,
        validation_type: 'machine_ready',
        expected_result: 'Machine is now accepting jobs and telemetry is flowing to Dash0'
      });
      
      await telemetryClient.otel.gauge('machine.startup.total_duration', startupTime, {
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
  logger.info('Starting PM2 daemon and services...');
  
  try {
    // Start PM2 daemon
    await pm2Manager.pm2Exec('ping');
    logger.info('PM2 daemon started');
    
    // Check if shared-setup exists in the ecosystem config (removed from enhanced generator)
    const fs = await import('fs');
    const configPath = '/workspace/pm2-ecosystem.config.cjs';
    let hasSharedSetup = false;
    
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      hasSharedSetup = configContent.includes('"name": "shared-setup"');
    }
    
    if (hasSharedSetup) {
      logger.info('Starting shared-setup service...');
      await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only shared-setup');
      logger.info('Shared setup service started');
      
      // Wait for shared setup to complete
      await new Promise(resolve => setTimeout(resolve, 3000));
    } else {
      logger.info('No shared-setup service needed (enhanced generator)');
    }
    
    // Clear any existing worker downloads to ensure fresh packages
    logger.info('Cleaning worker cache to prevent stale package downloads...');
    try {
      const { execa } = await import('execa');
      await execa('sh', ['-c', 'rm -rf /tmp/worker_gpu*']);
      logger.info('Worker cache cleaned successfully');
    } catch (error) {
      logger.warn('Failed to clean worker cache:', error.message);
      // Continue anyway - not critical for startup
    }
    
    // 🚨 FIXED: Use service mapping definitions instead of hardcoded service logic
    const workerConnectors = process.env.WORKERS || '';
    const serviceAnalysis = analyzeServiceRequirements(workerConnectors);
    
    logger.info(`🔍 Service analysis for WORKERS="${workerConnectors}":`, {
      allServices: serviceAnalysis.allServices,
      servicesNeedingPM2: serviceAnalysis.servicesNeedingPM2.map(s => `${s.serviceName}:${s.workerCount}`)
    });
    
    // Start all internal services that need PM2 processes
    for (const serviceInfo of serviceAnalysis.servicesNeedingPM2) {
      const { serviceName, serviceConfig, workerCount } = serviceInfo;
      
      logger.info(`🏗️  Starting ${serviceName} service (${workerCount} workers requested)`);
      
      // Check if service has an installer that needs to run first
      if (serviceConfig.installer) {
        logger.info(`📦 Running installer service: ${serviceConfig.installer}`);
        try {
          // Use exact installer file path from service mapping
          const { default: InstallerService } = await import(serviceConfig.installer_filename);
          
          // Create and run the installer
          const installer = new InstallerService({}, {
            machine: { id: process.env.MACHINE_ID || 'unknown' },
            services: { [serviceName]: { enabled: true } }
          });
          
          // Run the installer's onStart method
          await installer.onStart();
          logger.info(`✅ Installer ${serviceConfig.installer} completed successfully`);
          
        } catch (error) {
          logger.error(`❌ Failed to run installer ${serviceConfig.installer}:`, error);
          throw error;
        }
      }
      
      // Handle special ComfyUI setup process (after installer)
      if (serviceName === 'comfyui') {
        await pm2Manager.pm2Exec('start /workspace/pm2-ecosystem.config.cjs --only comfyui-env-creator');
        logger.info('ComfyUI env creator service started');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Build service instance names based on resource binding
      const serviceInstances = [];
      const resourceBinding = serviceConfig.resource_binding;
      let instanceCount = workerCount;
      
      // Adjust instance count based on resource binding and actual hardware
      if (resourceBinding === 'gpu') {
        // Real GPU mode - limit by actual GPU count
        const actualGpuCount = parseInt(process.env.MACHINE_NUM_GPUS || '0');
        if (actualGpuCount > 0 && instanceCount > actualGpuCount) {
          logger.warn(`Requested ${instanceCount} ${serviceName} workers but only ${actualGpuCount} GPUs available. Starting ${actualGpuCount} instances.`);
          instanceCount = actualGpuCount;
        }
      } else if (resourceBinding === 'mock_gpu') {
        // Mock GPU mode - use requested count directly
        logger.info(`Mock GPU mode: Starting ${instanceCount} ${serviceName} instances as requested`);
      }
      
      // Generate instance names
      if (resourceBinding === 'gpu' || resourceBinding === 'mock_gpu') {
        // GPU-bound services: servicename-gpu0, servicename-gpu1, etc.
        for (let gpu = 0; gpu < instanceCount; gpu++) {
          serviceInstances.push(`${serviceName}-gpu${gpu}`);
        }
      } else if (resourceBinding === 'shared' || resourceBinding === 'cpu') {
        // Shared/CPU services: use service_instances_per_machine setting
        const perMachineInstances = parseInt(serviceConfig.service_instances_per_machine) || 1;
        for (let i = 0; i < perMachineInstances; i++) {
          if (perMachineInstances === 1) {
            serviceInstances.push(serviceName);
          } else {
            serviceInstances.push(`${serviceName}-${i}`);
          }
        }
      }
      
      // Start the service instances
      if (serviceInstances.length > 0) {
        logger.info(`STEP 19: ComfyUI Server - Starting ${serviceName} service instances: ${serviceInstances.join(', ')}`);
        await pm2Manager.pm2Exec(`start /workspace/pm2-ecosystem.config.cjs --only ${serviceInstances.join(',')}`);
        logger.info(`STEP 19: ComfyUI Server - ${serviceName} service instances started successfully`);
        
        // Wait for services to initialize (ComfyUI needs more time)
        const waitTime = serviceName.includes('comfyui') ? 5000 : 3000;
        logger.info(`⏳ Waiting ${waitTime/1000}s for ${serviceName} services to initialize...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    if (serviceAnalysis.servicesNeedingPM2.length === 0) {
      logger.info(`ℹ️  No internal services need PM2 processes. WORKERS: ${workerConnectors}`);
    }
    
    // Worker-driven mode: Start all worker processes from the ecosystem config
    logger.info('STEP 20: Worker Connection - Starting worker processes from ecosystem config...');
    try {
      // Parse ecosystem config to find worker processes
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const configMatch = configContent.match(/module\.exports\s*=\s*(\{[\s\S]*\})/);
        
        if (configMatch) {
          const ecosystemConfig = eval(`(${configMatch[1]})`);
          
          // Find all worker processes (redis-worker-* pattern)
          const workerProcesses = ecosystemConfig.apps
            .filter(app => app.name.startsWith('redis-worker-'))
            .map(app => app.name);
          
          if (workerProcesses.length > 0) {
            logger.info(`STEP 20: Worker Connection - Found ${workerProcesses.length} worker processes: ${workerProcesses.join(', ')}`);
            
            // Start all worker processes
            await pm2Manager.pm2Exec(`start ${configPath} --only ${workerProcesses.join(',')}`);
            logger.info(`STEP 20: Worker Connection - Started ${workerProcesses.length} worker processes successfully`);
          } else {
            logger.warn('No worker processes found in ecosystem config');
          }
        } else {
          logger.error('Could not parse ecosystem config format');
        }
      } else {
        logger.error('Ecosystem config file not found');
      }
    } catch (error) {
      logger.error('Failed to start worker processes:', error);
      // Continue anyway - some deployments might not have workers
    }
    
    // Save process list
    await pm2Manager.pm2Exec('save');
    logger.info('PM2 process list saved');
    
    // Wait a moment for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error) {
    logger.error('Failed to start PM2 services:', error);
    throw error;
  }
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
    
    // Worker-driven mode: determine services from WORKERS
    const detectEnableComfyUI = workerConnectors.includes('comfyui:') && !workerConnectors.includes('comfyui-remote:');
    const detectEnableSimulation = workerConnectors.includes('simulation:');
    
    logger.info('Worker-driven service detection:', {
      workerConnectors,
      enableComfyUI: detectEnableComfyUI,
      enableSimulation: detectEnableSimulation
    });
    
    logger.info('🚀 Using worker-driven PM2 ecosystem generator');
    await execa('node', ['/service-manager/generate-pm2-ecosystem-worker-driven.js'], {
      cwd: '/workspace',
      env: {
        ...process.env,
        MACHINE_NUM_GPUS: config.machine.gpu.count.toString()
      }
    });
    
    logger.info('PM2 ecosystem config generated successfully');
    
    // Log the generated config file contents for debugging
    try {
      const fs = await import('fs');
      const configContent = fs.readFileSync('/workspace/pm2-ecosystem.config.cjs', 'utf8');
      logger.info('Generated ecosystem config contents:');
      console.log(configContent);
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