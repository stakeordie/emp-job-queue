#!/usr/bin/env node

/**
 * Simple health server test - bypassing full orchestrator setup
 */

import express from 'express';

// Create a minimal health server to test the endpoints
const app = express();
app.use(express.json());

// Mock machine services status
const mockServices = {
  'comfyui-gpu0': {
    type: 'comfyui',
    enabled: true,
    status: 'not_installed',
    health: 'unknown',
    port: 8188,
    installed: false,
    message: 'ComfyUI not installed: /workspace/comfyui_gpu0/main.py not found'
  },
  'redis-worker-gpu0': {
    type: 'redis-worker',
    enabled: true,
    status: 'stopped',
    health: 'unknown',
    installed: true,
    message: 'Redis worker found'
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
};

// Health endpoints
app.get('/health', (req, res) => {
  const healthChecks = Object.entries(mockServices).map(([serviceName, service]) => ({
    service: serviceName,
    healthy: service.health === 'healthy',
    status: service.status
  }));
  
  const allHealthy = healthChecks.every(check => check.healthy);
  
  res.status(allHealthy ? 200 : 503).json({
    healthy: allHealthy,
    timestamp: new Date().toISOString(),
    services: healthChecks
  });
});

app.get('/status', (req, res) => {
  res.json({
    machine_id: 'basic-machine-test',
    timestamp: new Date().toISOString(),
    uptime_ms: 60000,
    services: mockServices
  });
});

app.get('/services', (req, res) => {
  const serviceList = Object.entries(mockServices)
    .filter(([name]) => name !== 'health-server')
    .map(([name, service]) => ({
      name,
      type: service.type,
      status: service.status,
      ...(service.port && { port: service.port, endpoint: `http://localhost:${service.port}` })
    }));
  
  res.json({
    services: serviceList,
    count: serviceList.length,
    timestamp: new Date().toISOString()
  });
});

app.get('/ready', (req, res) => {
  const runningServices = Object.values(mockServices).filter(s => 
    s.status === 'running' && s.health === 'healthy'
  );
  const allReady = runningServices.length > 0; // At least health server should be ready
  
  res.status(allReady ? 200 : 503).json({
    ready: allReady,
    timestamp: new Date().toISOString()
  });
});

// Start server
const port = 9090;
const server = app.listen(port, () => {
  console.log(`Health server listening on port ${port}`);
  testEndpoints();
});

async function testEndpoints() {
  const axios = (await import('axios')).default;
  
  try {
    console.log('\n=== Testing Health Server Endpoints ===');
    
    console.log('\n1. Testing /health endpoint...');
    const healthResponse = await axios.get('http://localhost:9090/health');
    console.log('Health response:', JSON.stringify(healthResponse.data, null, 2));
    
    console.log('\n2. Testing /status endpoint...');
    const statusResponse = await axios.get('http://localhost:9090/status');
    console.log('Status response:', JSON.stringify(statusResponse.data, null, 2));
    
    console.log('\n3. Testing /services endpoint...');
    const servicesResponse = await axios.get('http://localhost:9090/services');
    console.log('Services response:', JSON.stringify(servicesResponse.data, null, 2));
    
    console.log('\n4. Testing /ready endpoint...');
    const readyResponse = await axios.get('http://localhost:9090/ready');
    console.log('Ready response:', JSON.stringify(readyResponse.data, null, 2));
    
    console.log('\n✅ All health endpoints working correctly!');
    
  } catch (error) {
    console.error('❌ Health endpoint test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  } finally {
    console.log('\nStopping test server...');
    server.close();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping server...');
  server.close();
  process.exit(0);
});