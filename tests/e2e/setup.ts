// End-to-end test setup - full system integration
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';

let hubProcess: ChildProcess;
let workerProcess: ChildProcess;

const HUB_PORT = 3001;
const HUB_WS_PORT = 3002;

beforeAll(async () => {
  console.log('Starting E2E test environment...');
  
  // Start hub service
  hubProcess = spawn('pnpm', ['dev:hub'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HUB_PORT: HUB_PORT.toString(),
      WS_PORT: HUB_WS_PORT.toString(),
      REDIS_DB: '14' // Use different DB from integration tests
    },
    stdio: 'pipe'
  });

  // Wait for hub to be ready
  await waitForService(`http://localhost:${HUB_PORT}/health`, 30000);
  
  // Start worker
  workerProcess = spawn('pnpm', ['dev:worker'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HUB_URL: `http://localhost:${HUB_PORT}`,
      HUB_WS_URL: `ws://localhost:${HUB_WS_PORT}`,
      WORKER_ID: 'test-worker-e2e'
    },
    stdio: 'pipe'
  });

  // Wait a bit for worker to connect
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('E2E test environment ready');
}, 60000);

afterAll(async () => {
  console.log('Cleaning up E2E test environment...');
  
  if (workerProcess) {
    workerProcess.kill('SIGTERM');
  }
  
  if (hubProcess) {
    hubProcess.kill('SIGTERM');
  }
  
  // Wait for processes to exit
  await new Promise(resolve => setTimeout(resolve, 2000));
}, 30000);

async function waitForService(url: string, timeout: number): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    try {
      await axios.get(url, { timeout: 1000 });
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  throw new Error(`Service at ${url} did not become ready within ${timeout}ms`);
}

// Make test endpoints available globally
global.testEndpoints = {
  hub: `http://localhost:${HUB_PORT}`,
  hubWs: `ws://localhost:${HUB_WS_PORT}`
};