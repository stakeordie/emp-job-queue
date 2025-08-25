/**
 * Clean startPM2Services function with installation + conditional Sequential Startup Orchestrator
 */

export async function startPM2ServicesSequentially(pm2Manager, logger) {
  logger.info('🚀 Starting PM2 daemon and services...');
  
  try {
    // Start PM2 daemon
    await pm2Manager.pm2Exec('ping');
    logger.info('PM2 daemon started');
    
    // Load the ecosystem configuration
    const fs = await import('fs');
    const configPath = '/workspace/pm2-ecosystem.config.cjs';
    
    if (!fs.existsSync(configPath)) {
      throw new Error('PM2 ecosystem config not found. Ecosystem generation may have failed.');
    }
    
    // Load ecosystem config (ES modules compatible)
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    delete require.cache[require.resolve(configPath)]; // Clear cache
    const ecosystemConfig = require(configPath);
    
    // STEP 1: Run installation phase for services that need it
    await runServiceInstallers(ecosystemConfig, logger);
    
    // Check if this ecosystem has internal services that need sequential startup
    const hasInternalServices = ecosystemConfig.apps.some(app => 
      app.name && (
        app.name.includes('comfyui-gpu') || 
        app.name.includes('a1111-gpu') ||
        app.name.includes('simulation-websocket') ||
        app.name.includes('simulation-http')
      )
    );
    
    if (hasInternalServices) {
      logger.info('🔄 Detected internal services - using Sequential Startup Orchestrator...');
      logger.info(`📋 Starting ${ecosystemConfig.apps.length} services sequentially with connection validation`);
      
      // Load the Sequential Startup Orchestrator
      const { SequentialStartupOrchestrator } = await import('./sequential-startup-orchestrator.js');
      const orchestrator = new SequentialStartupOrchestrator(logger);
      
      // Use service pairs captured during ecosystem generation
      const servicePairs = ecosystemConfig.servicePairs || [];
      
      // If we have service pairs, use sequential startup
      if (servicePairs.length > 0) {
        logger.info(`🔗 Found ${servicePairs.length} explicit service pairs:`);
        servicePairs.forEach((pair, index) => {
          logger.info(`   ${index + 1}. ${pair.service} ↔ ${pair.worker} (port: ${pair.port})`);
        });
        
        // Use sequential startup for internal service pairs
        const startedServices = await orchestrator.startServicePairs(servicePairs, ecosystemConfig);
        logger.info(`✅ Sequential startup completed. Started services: ${startedServices.join(', ')}`);
      } else {
        // No service pairs but has internal services - probably external workers only
        logger.info('🔗 No service pairs found (external workers only)');
        logger.info('🚀 Using standard PM2 startup for external workers...');
        await pm2Manager.pm2Exec(`start ${configPath}`);
        logger.info('✅ External workers started with standard PM2 startup');
      }
      
    } else {
      logger.info('🚀 Detected external services only - using standard PM2 startup...');
      logger.info(`📋 Starting ${ecosystemConfig.apps.length} services with standard PM2 start`);
      
      // Use standard PM2 start for external services (OpenAI, etc.)
      await pm2Manager.pm2Exec(`start ${configPath}`);
      logger.info('✅ Standard PM2 startup completed');
    }
    
  } catch (error) {
    logger.error('Failed to start PM2 services:', error);
    throw error;
  }
}

/**
 * Run service installers before starting PM2 services
 * Restores the installation logic that was lost in the sequential refactor
 */
async function runServiceInstallers(ecosystemConfig, logger) {
  logger.info('📦 Checking for services that need installation...');
  
  // Clean worker cache first
  try {
    const { execa } = await import('execa');
    await execa('sh', ['-c', 'rm -rf /tmp/worker_gpu*']);
    logger.info('Worker cache cleaned successfully');
  } catch (error) {
    logger.warn('Failed to clean worker cache:', error.message);
  }
  
  // Find unique services that need installation
  const servicesNeedingInstall = new Set();
  
  for (const app of ecosystemConfig.apps) {
    // Check for ComfyUI services
    if (app.name && app.name.includes('comfyui-gpu')) {
      servicesNeedingInstall.add('comfyui');
    }
    // Check for A1111 services
    else if (app.name && app.name.includes('a1111')) {
      servicesNeedingInstall.add('a1111');
    }
    // Add other services as needed
  }
  
  // Run installers for each service type
  for (const serviceName of servicesNeedingInstall) {
    logger.info(`🔧 Running installer for ${serviceName}...`);
    
    try {
      if (serviceName === 'comfyui') {
        // Run ComfyUI installation
        logger.info('📦 Running ComfyUI Management Client installation...');
        const { createComfyUIManagementClient } = await import('./comfyui-management-client.js');
        
        const comfyuiClient = createComfyUIManagementClient({
          machine: { id: process.env.MACHINE_ID || 'unknown' },
          services: { comfyui: { enabled: true } }
        }, {
          installMode: 'runtime-only', // Fast runtime installation for containers
          skipValidation: false
        });
        
        const result = await comfyuiClient.installRuntime();
        
        if (result.success) {
          logger.info('✅ ComfyUI installation completed successfully');
        } else {
          throw new Error(`ComfyUI installation failed: ${result.errors.join(', ')}`);
        }
        
      } else if (serviceName === 'a1111') {
        // Run A1111 installation (when implemented)
        logger.info('📦 Running A1111 installer...');
        // TODO: Add A1111 installer when ready
        logger.warn('A1111 installer not yet implemented');
        
      } else {
        logger.warn(`No installer found for service: ${serviceName}`);
      }
      
    } catch (error) {
      logger.error(`❌ Failed to install ${serviceName}:`, error);
      // Decide whether to continue or fail based on criticality
      if (serviceName === 'comfyui' || serviceName === 'a1111') {
        throw error; // Critical services must install successfully
      }
      // Non-critical services can continue
    }
  }
  
  if (servicesNeedingInstall.size === 0) {
    logger.info('No services require installation');
  } else {
    logger.info(`✅ Installation phase completed for ${servicesNeedingInstall.size} service(s)`);
  }
}

/**
 * Generate explicit service pairs from ecosystem config
 * @param {Object} ecosystemConfig - PM2 ecosystem configuration
 * @returns {Array} Array of {service, worker} pairs
 */
function generateServicePairs(ecosystemConfig) {
  const pairs = [];
  
  // Find all internal services (ComfyUI, A1111, Simulation)
  const services = ecosystemConfig.apps.filter(app => 
    app.name && (
      app.name.includes('comfyui-gpu') ||
      app.name.includes('a1111-gpu') ||
      app.name.includes('simulation-websocket') ||
      app.name.includes('simulation-http')
    )
  );
  
  // Find all Redis workers
  const workers = ecosystemConfig.apps.filter(app =>
    app.name && app.name.includes('redis-worker')
  );
  
  // Match services with their corresponding workers
  for (const service of services) {
    let matchingWorker = null;
    
    // ComfyUI service matching
    if (service.name.includes('comfyui-gpu')) {
      const gpuMatch = service.name.match(/comfyui-gpu(\d+)/);
      if (gpuMatch) {
        const gpuIndex = gpuMatch[1];
        matchingWorker = workers.find(w => 
          w.name.includes(`redis-worker-comfyui-gpu${gpuIndex}`)
        );
      }
    }
    // A1111 service matching
    else if (service.name.includes('a1111-gpu')) {
      const gpuMatch = service.name.match(/a1111-gpu(\d+)/);
      if (gpuMatch) {
        const gpuIndex = gpuMatch[1];
        matchingWorker = workers.find(w => 
          w.name.includes(`redis-worker-a1111-gpu${gpuIndex}`)
        );
      }
    }
    // Simulation service matching
    else if (service.name.includes('simulation-websocket')) {
      const instanceMatch = service.name.match(/simulation-websocket-(\d+)/);
      if (instanceMatch) {
        const instanceIndex = instanceMatch[1];
        matchingWorker = workers.find(w => 
          w.name.includes(`redis-worker-simulation-websocket-${instanceIndex}`)
        );
      } else {
        // Handle single simulation-websocket case
        matchingWorker = workers.find(w => 
          w.name.includes('redis-worker-simulation-websocket') &&
          !w.name.match(/simulation-websocket-\d+/)
        );
      }
    }
    else if (service.name.includes('simulation-http')) {
      const instanceMatch = service.name.match(/simulation-http-(\d+)/);
      if (instanceMatch) {
        const instanceIndex = instanceMatch[1];
        matchingWorker = workers.find(w => 
          w.name.includes(`redis-worker-simulation-http-${instanceIndex}`)
        );
      } else {
        // Handle single simulation-http case
        matchingWorker = workers.find(w => 
          w.name.includes('redis-worker-simulation-http') &&
          !w.name.match(/simulation-http-\d+/)
        );
      }
    }
    
    if (matchingWorker) {
      pairs.push({
        service: service.name,
        worker: matchingWorker.name
      });
    } else {
      // Log warning but don't fail - some services might not need workers
      console.warn(`⚠️  No matching Redis worker found for service: ${service.name}`);
    }
  }
  
  return pairs;
}