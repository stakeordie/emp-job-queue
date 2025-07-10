#!/usr/bin/env node

/**
 * Test ComfyUI connector health integration
 */

// Mock the core module imports that the connector needs
const mockCore = {
  logger: {
    info: (...args) => console.log('INFO:', ...args),
    debug: (...args) => console.log('DEBUG:', ...args),
    warn: (...args) => console.log('WARN:', ...args),
    error: (...args) => console.log('ERROR:', ...args)
  }
};

// Create a simple test version of the ComfyUI connector logic
class TestComfyUIConnector {
  constructor() {
    this.config = {
      base_url: 'http://localhost:8188'
    };
  }

  getMachineHealthEndpoint() {
    const url = new URL(this.config.base_url);
    return `http://${url.hostname}:9090`;
  }

  async checkMachineHealth() {
    const axios = (await import('axios')).default;
    
    try {
      const healthEndpoint = this.getMachineHealthEndpoint();
      const statusResponse = await axios.get(`${healthEndpoint}/status`, { timeout: 5000 });
      
      if (statusResponse.status === 200 && statusResponse.data.services) {
        const url = new URL(this.config.base_url);
        const expectedPort = parseInt(url.port);
        
        const comfyServices = Object.entries(statusResponse.data.services).filter(
          ([serviceName, serviceData]) => 
            serviceData.type === 'comfyui' && serviceData.port === expectedPort
        );
        
        if (comfyServices.length > 0) {
          const [serviceName, serviceData] = comfyServices[0];
          mockCore.logger.debug(`Found ComfyUI service ${serviceName}:`, {
            status: serviceData.status,
            health: serviceData.health,
            installed: serviceData.installed,
            message: serviceData.message
          });
          
          const isHealthy = serviceData.status === 'running' && serviceData.health === 'healthy';
          
          return {
            healthy: isHealthy,
            status: serviceData.status,
            message: serviceData.message || `ComfyUI service ${serviceName} is ${serviceData.status}`
          };
        } else {
          return {
            healthy: false,
            status: 'not_found',
            message: `No ComfyUI service found for port ${expectedPort}`
          };
        }
      }
      
      return {
        healthy: false,
        status: 'unknown',
        message: 'Unable to get machine health status'
      };
    } catch (error) {
      mockCore.logger.debug('Machine health check failed, falling back to direct check:', error.message);
      return {
        healthy: false,
        status: 'error',
        message: `Health endpoint unavailable: ${error.message}`
      };
    }
  }

  async canProcessJob(jobData) {
    // Basic job type check
    if (jobData.type !== 'comfyui' || jobData.payload?.workflow === undefined) {
      return false;
    }
    
    // Health-based job acceptance: only accept jobs if ComfyUI is healthy
    try {
      const machineHealth = await this.checkMachineHealth();
      if (!machineHealth.healthy) {
        mockCore.logger.debug(`Rejecting ComfyUI job ${jobData.id}: service not healthy (${machineHealth.status})`);
        return false;
      }
      
      return true;
    } catch (error) {
      mockCore.logger.debug(`Rejecting ComfyUI job ${jobData.id}: health check error:`, error.message);
      return false;
    }
  }

  async waitForComfyUIAvailable() {
    const maxAttempts = 10; // Reduced for testing
    const delayMs = 1000;
    
    mockCore.logger.info(`Waiting for ComfyUI to become available at ${this.config.base_url}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const machineHealth = await this.checkMachineHealth();
        
        if (machineHealth.healthy) {
          mockCore.logger.info(`ComfyUI is available after ${attempt} attempt(s)`);
          return true;
        } else {
          // Provide detailed feedback about service state
          if (machineHealth.status === 'not_installed') {
            mockCore.logger.warn(`ComfyUI is not installed: ${machineHealth.message}`);
            mockCore.logger.info('Waiting for ComfyUI installation to complete...');
          } else if (machineHealth.status === 'stopped') {
            mockCore.logger.info(`ComfyUI is installed but not running: ${machineHealth.message}`);
            mockCore.logger.info('Waiting for ComfyUI service to start...');
          } else if (machineHealth.status === 'starting') {
            mockCore.logger.info(`ComfyUI is starting up: ${machineHealth.message}`);
          } else {
            mockCore.logger.info(`ComfyUI status: ${machineHealth.status} - ${machineHealth.message}`);
          }
        }
      } catch (error) {
        mockCore.logger.debug(`ComfyUI health check attempt ${attempt}/${maxAttempts} failed:`, error.message);
      }
      
      if (attempt < maxAttempts) {
        mockCore.logger.info(`ComfyUI not ready yet, waiting ${delayMs}ms before retry (attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error(`ComfyUI did not become available after ${maxAttempts} attempts`);
  }
}

// Test the connector with the mock health server from previous test
import { createServer } from 'http';
import { URL } from 'url';

const mockHealthResponses = {
  '/status': {
    machine_id: 'basic-machine-test',
    timestamp: new Date().toISOString(),
    uptime_ms: 60000,
    services: {
      'comfyui-gpu0': {
        type: 'comfyui',
        enabled: true,
        status: 'not_installed',
        health: 'unknown',
        port: 8188,
        installed: false,
        message: 'ComfyUI not installed: /workspace/comfyui_gpu0/main.py not found'
      }
    }
  }
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const response = mockHealthResponses[url.pathname];
  
  if (response) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

async function testComfyUIConnector() {
  console.log('=== Testing ComfyUI Connector Health Integration ===\n');
  
  // Start mock health server
  const port = 9090;
  server.listen(port, () => {
    console.log(`Mock health server started on port ${port}`);
  });
  
  const connector = new TestComfyUIConnector();
  
  // Test 1: Job rejection when ComfyUI not installed
  console.log('\n--- Test 1: Job rejection when ComfyUI not installed ---');
  const testJob = {
    id: 'test-job-1',
    type: 'comfyui',
    payload: { workflow: { some: 'workflow' } }
  };
  
  let canProcess = await connector.canProcessJob(testJob);
  console.log(`Can process job: ${canProcess ? '✅ YES' : '❌ NO'}`);
  
  // Test 2: Waiting behavior when service not ready
  console.log('\n--- Test 2: Waiting behavior when service not ready ---');
  try {
    await connector.waitForComfyUIAvailable();
  } catch (error) {
    console.log(`Expected timeout: ${error.message}`);
  }
  
  // Test 3: Simulate ComfyUI becoming healthy
  console.log('\n--- Test 3: ComfyUI becomes healthy ---');
  mockHealthResponses['/status'].services['comfyui-gpu0'] = {
    type: 'comfyui',
    enabled: true,
    status: 'running',
    health: 'healthy',
    port: 8188,
    installed: true,
    message: 'ComfyUI service is healthy'
  };
  
  canProcess = await connector.canProcessJob(testJob);
  console.log(`Can process job: ${canProcess ? '✅ YES' : '❌ NO'}`);
  
  console.log('\n✅ ComfyUI connector health integration test completed');
  server.close();
  process.exit(0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping test...');
  server.close();
  process.exit(0);
});

testComfyUIConnector().catch(error => {
  console.error('Test failed:', error);
  server.close();
  process.exit(1);
});