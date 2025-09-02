import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Telemetry Debugging: OTEL Collector Connectivity', () => {
  const projectRoot = path.join(__dirname, '../..');
  
  describe('Environment Analysis', () => {
    it('should identify telemetry configuration', () => {
      const expectedEnvVars = [
        'OTEL_EXPORTER_OTLP_ENDPOINT',
        'OTEL_SERVICE_NAME',
        'OTEL_RESOURCE_ATTRIBUTES',
        'TELEMETRY_ENABLED',
        'MACHINE_ID',
        'WORKER_ID',
      ];
      
      console.log('📊 Current telemetry environment variables:');
      for (const envVar of expectedEnvVars) {
        const value = process.env[envVar];
        console.log(`  ${envVar}: ${value || 'NOT SET'}`);
      }
      
      // Log additional relevant env vars
      const additionalEnvVars = Object.keys(process.env)
        .filter(key => key.includes('OTEL') || key.includes('TELEMETRY'))
        .sort();
        
      if (additionalEnvVars.length > 0) {
        console.log('\n📋 Other telemetry-related environment variables:');
        for (const envVar of additionalEnvVars) {
          if (!expectedEnvVars.includes(envVar)) {
            console.log(`  ${envVar}: ${process.env[envVar]}`);
          }
        }
      }
      
      console.log('\n✅ Environment analysis completed');
    });

    it('should check for telemetry dependencies', async () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(require('fs').readFileSync(packageJsonPath, 'utf8'));
      
      const telemetryDeps = [
        '@emp/telemetry',
        '@opentelemetry/auto-instrumentations-node',
        '@opentelemetry/api',
      ];
      
      console.log('📦 Telemetry dependencies in package.json:');
      for (const dep of telemetryDeps) {
        const version = packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep];
        console.log(`  ${dep}: ${version || 'NOT FOUND'}`);
      }
      
      console.log('\n✅ Dependency check completed');
    });
  });

  describe('Network Connectivity Testing', () => {
    it('should test OTEL collector endpoint connectivity', async () => {
      const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
      
      console.log(`🌐 Testing connectivity to OTEL endpoint: ${otelEndpoint}`);
      
      try {
        // Test basic HTTP connectivity
        const response = await fetch(`${otelEndpoint}/v1/traces`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resourceSpans: []
          }),
        });
        
        console.log(`✅ OTEL endpoint responded with status: ${response.status}`);
        console.log(`   Response headers:`, Object.fromEntries(response.headers.entries()));
        
        if (response.status === 200 || response.status === 202) {
          console.log('✅ OTEL collector is accepting traces');
        } else {
          console.log(`⚠️ Unexpected status code: ${response.status}`);
        }
        
      } catch (error) {
        console.log(`❌ Failed to connect to OTEL endpoint: ${error}`);
        console.log('   This explains the "fetch failed" error in the application');
        
        // Provide debugging suggestions
        console.log('\n💡 Debugging suggestions:');
        console.log('   1. Check if OTEL collector is running');
        console.log('   2. Verify network connectivity to collector endpoint');
        console.log('   3. Check firewall/network policies');
        console.log('   4. Consider using telemetry-disabled mode for testing');
      }
    });

    it('should test basic localhost connectivity', async () => {
      const testEndpoints = [
        'http://localhost:4317', // OTEL gRPC default
        'http://localhost:4318', // OTEL HTTP default
        'http://localhost:8888', // Common OTEL collector metrics
        'http://localhost:8889', // Common OTEL collector health
      ];
      
      console.log('🔍 Testing common OTEL collector endpoints:');
      
      for (const endpoint of testEndpoints) {
        try {
          const response = await fetch(endpoint, { 
            method: 'GET',
            timeout: 2000,
          });
          console.log(`  ${endpoint}: ✅ Status ${response.status}`);
        } catch (error) {
          console.log(`  ${endpoint}: ❌ ${error.message}`);
        }
      }
    });
  });

  describe('Application Startup Testing', () => {
    it('should test application startup with telemetry disabled', async () => {
      console.log('🧪 Testing application startup with telemetry disabled...');
      
      const startupTest = new Promise<void>((resolve, reject) => {
        const serverProcess = spawn('node', ['--no-warnings', 'dist/index.js'], {
          cwd: projectRoot,
          env: {
            ...process.env,
            PORT: '0', // Let OS assign port
            NODE_ENV: 'test',
            LOG_LEVEL: 'info',
            ENABLE_AUTH: 'false',
            // Disable all telemetry for testing
            TELEMETRY_ENABLED: 'false',
            SENTRY_ENABLED: 'false',
            ERROR_TRACKING_ENABLED: 'false',
            // Minimal required env vars
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
            SERVICE_KEY: 'test-service-key',
            REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';
        let errorOutput = '';
        let serverStarted = false;
        
        const timeout = setTimeout(() => {
          if (!serverStarted) {
            serverProcess.kill('SIGTERM');
            reject(new Error(`Startup test timeout.\nOutput:\n${output}\nErrors:\n${errorOutput}`));
          }
        }, 15000);

        serverProcess.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
          
          if (text.includes('Server started at port:')) {
            serverStarted = true;
            clearTimeout(timeout);
            serverProcess.kill('SIGTERM');
            console.log('✅ Application starts successfully with telemetry disabled');
            resolve();
          }
        });

        serverProcess.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          
          if (text.includes('fetch failed') || 
              text.includes('ECONNREFUSED') ||
              text.includes('Error sending trace')) {
            // These are expected when OTEL collector is not available
            console.log('ℹ️ Telemetry connection errors detected (expected when collector unavailable)');
          }
        });

        serverProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Process error: ${error.message}`));
        });

        serverProcess.on('exit', (code) => {
          clearTimeout(timeout);
          if (serverStarted) {
            resolve();
          } else if (code !== 0) {
            reject(new Error(`Process exited with code ${code}\nOutput:\n${output}\nErrors:\n${errorOutput}`));
          }
        });
      });

      await startupTest;
    }, 20000);

    it('should test application startup with telemetry enabled but collector unavailable', async () => {
      console.log('🧪 Testing application startup with telemetry enabled but no collector...');
      
      const startupTest = new Promise<{ output: string, errors: string }>((resolve, reject) => {
        const serverProcess = spawn('node', ['--no-warnings', 'dist/index.js'], {
          cwd: projectRoot,
          env: {
            ...process.env,
            PORT: '0',
            NODE_ENV: 'test',
            LOG_LEVEL: 'info',
            ENABLE_AUTH: 'false',
            // Enable telemetry but point to non-existent collector
            TELEMETRY_ENABLED: 'true',
            SENTRY_ENABLED: 'false',
            ERROR_TRACKING_ENABLED: 'false',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:19999', // Non-existent endpoint
            // Minimal required env vars
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
            SERVICE_KEY: 'test-service-key',
            REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let output = '';
        let errorOutput = '';
        let serverStarted = false;
        let telemetryErrors: string[] = [];
        
        const timeout = setTimeout(() => {
          serverProcess.kill('SIGTERM');
          if (!serverStarted) {
            reject(new Error(`Startup test timeout.\nOutput:\n${output}\nErrors:\n${errorOutput}`));
          } else {
            resolve({ output, errors: errorOutput });
          }
        }, 15000);

        serverProcess.stdout?.on('data', (data) => {
          const text = data.toString();
          output += text;
          
          if (text.includes('Server started at port:')) {
            serverStarted = true;
            // Give it a moment to try sending telemetry
            setTimeout(() => {
              clearTimeout(timeout);
              serverProcess.kill('SIGTERM');
              resolve({ output, errors: errorOutput });
            }, 2000);
          }
        });

        serverProcess.stderr?.on('data', (data) => {
          const text = data.toString();
          errorOutput += text;
          
          if (text.includes('fetch failed') || 
              text.includes('ECONNREFUSED') ||
              text.includes('Error sending trace')) {
            telemetryErrors.push(text.trim());
          }
        });

        serverProcess.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Process error: ${error.message}`));
        });

        serverProcess.on('exit', () => {
          clearTimeout(timeout);
          if (serverStarted) {
            resolve({ output, errors: errorOutput });
          }
        });
      });

      const result = await startupTest;
      
      console.log('📊 Test results:');
      console.log(`  Server started: ${result.output.includes('Server started at port:') ? '✅' : '❌'}`);
      console.log(`  Telemetry errors detected: ${result.errors.includes('fetch failed') ? '✅ (Expected)' : '❌'}`);
      
      expect(result.output).toContain('Server started at port:');
      console.log('✅ Application gracefully handles telemetry collector unavailability');
    }, 20000);
  });

  describe('Solution Recommendations', () => {
    it('should provide telemetry troubleshooting guidance', () => {
      console.log('\n🔧 TELEMETRY TROUBLESHOOTING GUIDE');
      console.log('=====================================');
      
      console.log('\n1. 🚨 IMMEDIATE FIXES:');
      console.log('   • Set TELEMETRY_ENABLED=false for local development');
      console.log('   • Ensure OTEL collector is running before starting app');
      console.log('   • Check Docker services are up: docker-compose ps');
      
      console.log('\n2. 🔍 DEBUGGING STEPS:');
      console.log('   • Check OTEL collector logs: docker logs <otel-container>');
      console.log('   • Verify collector endpoint: curl http://localhost:4318/v1/traces');
      console.log('   • Test with telemetry disabled first, then enable incrementally');
      
      console.log('\n3. ⚙️ CONFIGURATION OPTIONS:');
      console.log('   • TELEMETRY_ENABLED=false - Completely disable telemetry');
      console.log('   • OTEL_EXPORTER_OTLP_ENDPOINT - Set correct collector URL');
      console.log('   • Consider using file exporter for local development');
      
      console.log('\n4. 🏗️ PRODUCTION CONSIDERATIONS:');
      console.log('   • Implement telemetry health checks in entrypoint');
      console.log('   • Add retry logic for telemetry collector connections');
      console.log('   • Monitor telemetry infrastructure separately');
      
      console.log('\n✅ Guidance provided - choose appropriate solution for your environment');
    });
  });
});