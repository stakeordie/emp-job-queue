import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Docker Integration: Full Deployment Cascade', () => {
  const projectRoot = path.join(__dirname, '../..');
  const containerName = 'emprops-api-integration-test';
  const testPort = '3334';
  
  let dockerProcess: ChildProcess | null = null;
  let containerStarted = false;
  
  // Cleanup function
  const cleanupContainer = async () => {
    console.log('🧹 Cleaning up Docker container...');
    
    try {
      // Stop and remove container
      await new Promise<void>((resolve) => {
        const cleanup = spawn('docker', ['rm', '-f', containerName], {
          stdio: 'pipe'
        });
        
        cleanup.on('exit', () => {
          console.log('✅ Container cleanup completed');
          resolve();
        });
        
        cleanup.on('error', () => {
          // Container might not exist, that's fine
          resolve();
        });
      });
    } catch (error) {
      console.log('⚠️ Container cleanup had issues (likely container did not exist)');
    }
  };
  
  beforeAll(async () => {
    // Cleanup any existing test containers
    await cleanupContainer();
  });
  
  afterAll(async () => {
    await cleanupContainer();
  });

  describe('Docker Build Process', () => {
    it('should build Docker image successfully', async () => {
      console.log('🔨 Building Docker image...');
      
      const buildPromise = new Promise<void>((resolve, reject) => {
        const buildProcess = spawn('docker', [
          'build',
          '-t',
          containerName,
          '.',
          '--build-arg',
          `BUILD_DATE=${new Date().toISOString()}`,
        ], {
          cwd: projectRoot,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let buildOutput = '';
        let errorOutput = '';

        buildProcess.stdout?.on('data', (data) => {
          buildOutput += data.toString();
        });

        buildProcess.stderr?.on('data', (data) => {
          errorOutput += data.toString();
        });

        buildProcess.on('exit', (code) => {
          if (code === 0) {
            console.log('✅ Docker image built successfully');
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}\nOutput:\n${buildOutput}\nErrors:\n${errorOutput}`));
          }
        });

        buildProcess.on('error', (error) => {
          reject(new Error(`Docker build process error: ${error.message}`));
        });
      });

      await buildPromise;
    }, 120000); // 2 minute timeout for Docker build

    it('should start container without import errors', async () => {
      console.log('🚀 Starting Docker container...');
      
      const containerPromise = new Promise<void>((resolve, reject) => {
        dockerProcess = spawn('docker', [
          'run',
          '--rm',
          '--name',
          containerName,
          '-p',
          `${testPort}:3333`,
          '-e',
          'NODE_ENV=test',
          '-e',
          'LOG_LEVEL=info',
          '-e',
          'ENABLE_AUTH=false',
          '-e',
          'TELEMETRY_ENABLED=false',
          '-e',
          'DATABASE_URL=postgresql://test:test@host.docker.internal:5432/test',
          '-e',
          'REDIS_URL=redis://host.docker.internal:6379',
          '-e',
          'SERVICE_KEY=test-service-key',
          '-e',
          'PORT=3333',
          containerName,
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let containerOutput = '';
        let errorOutput = '';
        let startupTimeout: NodeJS.Timeout;

        const cleanup = () => {
          if (startupTimeout) clearTimeout(startupTimeout);
        };

        startupTimeout = setTimeout(() => {
          cleanup();
          reject(new Error(`Container startup timeout\nOutput:\n${containerOutput}\nErrors:\n${errorOutput}`));
        }, 60000); // 60 second timeout

        dockerProcess!.stdout?.on('data', (data) => {
          const output = data.toString();
          containerOutput += output;
          
          // Look for successful server start
          if (output.includes('Server started at port:')) {
            containerStarted = true;
            cleanup();
            console.log('✅ Container started successfully');
            resolve();
          }
        });

        dockerProcess!.stderr?.on('data', (data) => {
          const error = data.toString();
          errorOutput += error;
          
          // Check for ESM import errors
          if (error.includes('ERR_MODULE_NOT_FOUND') || 
              error.includes('ERR_UNSUPPORTED_DIR_IMPORT') ||
              error.includes('Cannot find package') ||
              error.includes('Directory import') ||
              error.includes('SyntaxError')) {
            cleanup();
            reject(new Error(`ESM Import Error in Docker container:\n${error}\n\nFull output:\n${containerOutput}`));
          }
          
          // Check for other critical startup errors
          if (error.includes('Error: ') && 
              (error.includes('Cannot find module') || 
               error.includes('MODULE_NOT_FOUND'))) {
            cleanup();
            reject(new Error(`Module loading error in Docker container:\n${error}\n\nFull output:\n${containerOutput}`));
          }
        });

        dockerProcess!.on('error', (error) => {
          cleanup();
          reject(new Error(`Docker process error: ${error.message}`));
        });

        dockerProcess!.on('exit', (code, signal) => {
          cleanup();
          if (!containerStarted) {
            reject(new Error(`Container exited unexpectedly with code ${code}, signal ${signal}\nOutput:\n${containerOutput}\nErrors:\n${errorOutput}`));
          }
        });
      });

      await containerPromise;
    }, 70000); // 70 second timeout

    it('should respond to health check', async () => {
      if (!containerStarted) {
        throw new Error('Container not started - skipping health check');
      }
      
      console.log('🏥 Testing health check endpoint...');
      
      // Give container a moment to fully initialize
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const healthCheckPromise = new Promise<void>(async (resolve, reject) => {
        try {
          const response = await fetch(`http://localhost:${testPort}/health`, {
            method: 'GET',
            timeout: 5000,
          });
          
          if (response.ok) {
            const text = await response.text();
            expect(text).toBe('OK');
            console.log('✅ Health check endpoint responding correctly');
            resolve();
          } else {
            reject(new Error(`Health check failed with status ${response.status}`));
          }
        } catch (error) {
          reject(new Error(`Health check request failed: ${error}`));
        }
      });

      await healthCheckPromise;
    }, 15000);

    it('should handle graceful container shutdown', async () => {
      if (!dockerProcess || !containerStarted) {
        console.log('⚠️ Skipping container shutdown test - container not running');
        return;
      }
      
      console.log('🛑 Testing graceful container shutdown...');
      
      const shutdownPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Container shutdown timeout'));
        }, 15000);
        
        dockerProcess!.on('exit', (code, signal) => {
          clearTimeout(timeout);
          console.log(`📦 Container exited with code ${code}, signal ${signal}`);
          
          // Exit code 0 or 143 (SIGTERM) are acceptable for graceful shutdown
          if (code === 0 || code === 143) {
            resolve();
          } else {
            reject(new Error(`Container exited with unexpected code ${code}`));
          }
        });
        
        // Send SIGTERM to container
        dockerProcess!.kill('SIGTERM');
      });

      await shutdownPromise;
      
      dockerProcess = null;
      containerStarted = false;
      
      console.log('✅ Container shutdown completed successfully');
    }, 20000);
  });

  describe('Container Environment Validation', () => {
    it('should have correct Node.js version in container', async () => {
      console.log('🔍 Checking Node.js version in container...');
      
      const versionCheckPromise = new Promise<void>((resolve, reject) => {
        const versionProcess = spawn('docker', [
          'run',
          '--rm',
          containerName,
          'node',
          '--version'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let versionOutput = '';

        versionProcess.stdout?.on('data', (data) => {
          versionOutput += data.toString();
        });

        versionProcess.on('exit', (code) => {
          if (code === 0) {
            const version = versionOutput.trim();
            console.log(`📦 Container Node.js version: ${version}`);
            
            // Should be Node.js 18.x
            if (version.startsWith('v18.')) {
              console.log('✅ Container has correct Node.js version');
              resolve();
            } else {
              reject(new Error(`Expected Node.js 18.x, got ${version}`));
            }
          } else {
            reject(new Error(`Failed to get Node.js version, exit code: ${code}`));
          }
        });
      });

      await versionCheckPromise;
    }, 30000);

    it('should have ESM support enabled in container', async () => {
      console.log('🔍 Testing ESM support in container...');
      
      const esmTestPromise = new Promise<void>((resolve, reject) => {
        const esmProcess = spawn('docker', [
          'run',
          '--rm',
          containerName,
          'node',
          '-e',
          'console.log("ESM_SUPPORT:", typeof import.meta !== "undefined")'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';

        esmProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });

        esmProcess.on('exit', (code) => {
          if (code === 0 && output.includes('ESM_SUPPORT: true')) {
            console.log('✅ Container has ESM support enabled');
            resolve();
          } else {
            reject(new Error(`ESM support test failed. Output: ${output}`));
          }
        });
      });

      await esmTestPromise;
    }, 15000);
  });

  describe('Application Structure in Container', () => {
    it('should have correct file structure in container', async () => {
      console.log('📂 Checking application file structure in container...');
      
      const structureCheckPromise = new Promise<void>((resolve, reject) => {
        const checkProcess = spawn('docker', [
          'run',
          '--rm',
          containerName,
          'ls',
          '-la',
          '/emprops-api-server/dist/'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';

        checkProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });

        checkProcess.on('exit', (code) => {
          if (code === 0) {
            console.log(`📦 Container file structure:\n${output}`);
            
            // Check for key files
            if (output.includes('index.js') && 
                output.includes('utils') && 
                output.includes('routes')) {
              console.log('✅ Container has correct application structure');
              resolve();
            } else {
              reject(new Error(`Missing key files in container structure:\n${output}`));
            }
          } else {
            reject(new Error(`Failed to check container structure, exit code: ${code}`));
          }
        });
      });

      await structureCheckPromise;
    }, 15000);

    it('should have correct package.json configuration in container', async () => {
      console.log('📋 Checking package.json in container...');
      
      const packageCheckPromise = new Promise<void>((resolve, reject) => {
        const checkProcess = spawn('docker', [
          'run',
          '--rm',
          containerName,
          'cat',
          '/emprops-api-server/package.json'
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';

        checkProcess.stdout?.on('data', (data) => {
          output += data.toString();
        });

        checkProcess.on('exit', (code) => {
          if (code === 0) {
            try {
              const packageJson = JSON.parse(output);
              
              // Verify ESM configuration
              expect(packageJson.type).toBe('module');
              expect(packageJson.main).toBe('dist/index.js');
              
              console.log('✅ Container package.json is correctly configured for ESM');
              resolve();
            } catch (error) {
              reject(new Error(`Failed to parse package.json: ${error}`));
            }
          } else {
            reject(new Error(`Failed to read package.json, exit code: ${code}`));
          }
        });
      });

      await packageCheckPromise;
    }, 15000);
  });
});