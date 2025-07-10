#!/usr/bin/env node

/**
 * Test worker health integration without requiring full machine setup
 */

// Mock a simple HTTP server that simulates our health endpoints
import { createServer } from 'http';
import { URL } from 'url';

// Mock health server responses
const mockHealthResponses = {
  '/health': {
    healthy: false,
    timestamp: new Date().toISOString(),
    services: [
      { service: 'comfyui-gpu0', healthy: false, status: 'not_installed' },
      { service: 'health-server', healthy: true, status: 'running' }
    ]
  },
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
      },
      'health-server': {
        type: 'health-server',
        enabled: true,
        status: 'running',
        health: 'healthy',
        port: 9090,
        installed: true,
        message: 'Health server is built-in'
      }
    }
  },
  '/services': {
    services: [
      {
        name: 'comfyui-gpu0',
        type: 'comfyui',
        status: 'not_installed',
        port: 8188,
        endpoint: 'http://localhost:8188'
      }
    ],
    count: 1,
    timestamp: new Date().toISOString()
  },
  '/ready': {
    ready: false,
    timestamp: new Date().toISOString()
  }
};

// Create mock health server
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

async function testWorkerHealthIntegration() {
  console.log('=== Testing Worker Health Integration ===\n');
  
  // Start mock health server
  const port = 9090;
  server.listen(port, () => {
    console.log(`Mock health server started on port ${port}`);
  });
  
  // Test the health endpoint integration logic
  await testHealthEndpointLogic();
  
  // Update mock to show ComfyUI as starting
  console.log('\n--- Simulating ComfyUI installation progress ---');
  mockHealthResponses['/status'].services['comfyui-gpu0'].status = 'starting';
  mockHealthResponses['/status'].services['comfyui-gpu0'].message = 'ComfyUI is starting up';
  await testHealthEndpointLogic();
  
  // Update mock to show ComfyUI as healthy
  console.log('\n--- Simulating ComfyUI startup completion ---');
  mockHealthResponses['/status'].services['comfyui-gpu0'].status = 'running';
  mockHealthResponses['/status'].services['comfyui-gpu0'].health = 'healthy';
  mockHealthResponses['/status'].services['comfyui-gpu0'].message = 'ComfyUI service is healthy';
  mockHealthResponses['/health'].services[0].healthy = true;
  mockHealthResponses['/health'].services[0].status = 'running';
  mockHealthResponses['/health'].healthy = true;
  mockHealthResponses['/ready'].ready = true;
  await testHealthEndpointLogic();
  
  console.log('\n✅ Worker health integration test completed');
  server.close();
  process.exit(0);
}

async function testHealthEndpointLogic() {
  const axios = (await import('axios')).default;
  
  try {
    // Simulate the health check logic from ComfyUI connector
    console.log('Testing machine health check...');
    
    const statusResponse = await axios.get('http://localhost:9090/status', { timeout: 5000 });
    
    if (statusResponse.status === 200 && statusResponse.data.services) {
      const expectedPort = 8188;
      const comfyServices = Object.entries(statusResponse.data.services).filter(
        ([serviceName, serviceData]) => 
          serviceData.type === 'comfyui' && serviceData.port === expectedPort
      );
      
      if (comfyServices.length > 0) {
        const [serviceName, serviceData] = comfyServices[0];
        console.log(`Found ComfyUI service ${serviceName}:`, {
          status: serviceData.status,
          health: serviceData.health,
          installed: serviceData.installed,
          message: serviceData.message
        });
        
        const isHealthy = serviceData.status === 'running' && serviceData.health === 'healthy';
        
        console.log(`Health Result: ${isHealthy ? '✅ HEALTHY' : '❌ NOT HEALTHY'}`);
        
        if (!isHealthy) {
          if (serviceData.status === 'not_installed') {
            console.log(`⚠️  ComfyUI is not installed: ${serviceData.message}`);
          } else if (serviceData.status === 'stopped') {
            console.log(`ℹ️  ComfyUI is installed but not running: ${serviceData.message}`);
          } else if (serviceData.status === 'starting') {
            console.log(`🔄 ComfyUI is starting up: ${serviceData.message}`);
          } else {
            console.log(`❓ ComfyUI status: ${serviceData.status} - ${serviceData.message}`);
          }
        }
        
        return { healthy: isHealthy, status: serviceData.status, message: serviceData.message };
      } else {
        console.log('❌ No matching ComfyUI service found');
        return { healthy: false, status: 'not_found', message: 'No ComfyUI service found' };
      }
    }
    
  } catch (error) {
    console.log(`❌ Health check failed: ${error.message}`);
    return { healthy: false, status: 'error', message: error.message };
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping test...');
  server.close();
  process.exit(0);
});

testWorkerHealthIntegration().catch(error => {
  console.error('Test failed:', error);
  server.close();
  process.exit(1);
});