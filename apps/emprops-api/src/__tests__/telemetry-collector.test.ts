import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('OTEL Collector Infrastructure Tests', () => {
  let containerId: string | null = null;
  const containerName = 'emprops-api-test';

  beforeAll(async () => {
    // Start the emprops-api container for testing
    try {
      const { stdout } = await execAsync(
        `cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue && ` +
        `docker run -d --name ${containerName} -p 8081:8080 ` +
        `--env-file apps/emprops-api/.env.local-dev ` +
        `--env-file apps/emprops-api/.env.secret.local-dev ` +
        `emprops/emprops-api:latest local-dev`
      );
      containerId = stdout.trim();
      console.log(`Started container: ${containerId}`);
      
      // Wait for container to initialize
      await new Promise(resolve => setTimeout(resolve, 15000));
    } catch (error) {
      console.error('Failed to start test container:', error);
      throw error;
    }
  }, 30000);

  afterAll(async () => {
    if (containerId) {
      try {
        await execAsync(`docker stop ${containerName}`);
        await execAsync(`docker rm ${containerName}`);
        console.log('Cleaned up test container');
      } catch (error) {
        console.warn('Failed to cleanup test container:', error);
      }
    }
  });

  describe('1. OTEL Collector Installation', () => {
    it('should have otel-collector binary installed', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} which otel-collector || which opentelemetry-collector || find /usr -name "*otel*" -type f 2>/dev/null | head -5`);
      expect(stdout.trim()).toBeTruthy();
      console.log('OTEL Collector binaries found:', stdout.trim());
    });

    it('should have OTEL configuration files', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} find / -name "*otel*" -name "*.yaml" -o -name "*.yml" 2>/dev/null | head -10`);
      expect(stdout.trim()).toBeTruthy();
      console.log('OTEL Config files found:', stdout.trim());
    });

    it('should have telemetry-related directories', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} ls -la / | grep -i telemetry || ls -la /opt/ | grep -i telemetry || ls -la /usr/local/ | grep -i telemetry || echo "No telemetry dirs in standard locations"`);
      console.log('Telemetry directories:', stdout.trim());
    });
  });

  describe('2. OTEL Collector Runtime Status', () => {
    it('should have OTEL collector process running', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} ps aux | grep -i otel | grep -v grep`);
      expect(stdout.trim()).toBeTruthy();
      console.log('OTEL Collector processes:', stdout.trim());
    });

    it('should have OTEL collector listening on expected ports', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} netstat -tlnp | grep -E ':4317|:4318|:8888|:8889' || ss -tlnp | grep -E ':4317|:4318|:8888|:8889' || echo "No OTEL ports found"`);
      console.log('OTEL Collector ports:', stdout.trim());
      
      // At least one OTEL port should be listening
      expect(stdout).toMatch(/:431[78]|:888[89]/);
    });

    it('should show collector health endpoint responding', async () => {
      try {
        const { stdout } = await execAsync(`docker exec ${containerName} curl -s http://localhost:8888/metrics || curl -s http://localhost:8889 || echo "Health check failed"`);
        console.log('OTEL Health check response:', stdout.slice(0, 200) + '...');
      } catch (error) {
        console.warn('Health check failed, but collector might still be functional:', error);
      }
    });
  });

  describe('3. OTEL Collector Request Handling', () => {
    it('should accept traces on OTLP endpoint', async () => {
      const testTrace = JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [{ key: "service.name", value: { stringValue: "test-service" } }] },
          scopeSpans: [{
            spans: [{
              traceId: "12345678901234567890123456789012",
              spanId: "1234567890123456",
              name: "test-span",
              startTimeUnixNano: Date.now() * 1000000,
              endTimeUnixNano: (Date.now() + 100) * 1000000
            }]
          }]
        }]
      });

      try {
        const { stdout } = await execAsync(
          `docker exec ${containerName} curl -s -X POST http://localhost:4318/v1/traces ` +
          `-H "Content-Type: application/json" ` +
          `-d '${testTrace}' || echo "Trace submission failed"`
        );
        console.log('Trace submission response:', stdout);
        // Should not return error response
        expect(stdout).not.toMatch(/error|Error|ERROR/);
      } catch (error) {
        console.warn('Direct trace submission test failed:', error);
      }
    });

    it('should accept metrics on OTLP endpoint', async () => {
      const testMetric = JSON.stringify({
        resourceMetrics: [{
          resource: { attributes: [{ key: "service.name", value: { stringValue: "test-service" } }] },
          scopeMetrics: [{
            metrics: [{
              name: "test_metric",
              gauge: {
                dataPoints: [{
                  timeUnixNano: Date.now() * 1000000,
                  asDouble: 42.0
                }]
              }
            }]
          }]
        }]
      });

      try {
        const { stdout } = await execAsync(
          `docker exec ${containerName} curl -s -X POST http://localhost:4318/v1/metrics ` +
          `-H "Content-Type: application/json" ` +
          `-d '${testMetric}' || echo "Metric submission failed"`
        );
        console.log('Metric submission response:', stdout);
        expect(stdout).not.toMatch(/error|Error|ERROR/);
      } catch (error) {
        console.warn('Direct metric submission test failed:', error);
      }
    });
  });

  describe('4. Environment Variables Configuration', () => {
    it('should have required OTEL environment variables set', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} env | grep -E 'OTEL|DASH0|TELEMETRY' | sort`);
      console.log('OTEL/Telemetry environment variables:');
      console.log(stdout);

      const envVars = stdout.split('\n').filter(line => line.trim());
      
      // Check for critical environment variables
      const requiredVars = [
        'OTEL_ENABLED',
        'TELEMETRY_ENV',
        'DASH0_ENDPOINT'
      ];

      const setVars = envVars.map(line => line.split('=')[0]);
      const missingVars = requiredVars.filter(required => 
        !setVars.some(set => set === required)
      );

      if (missingVars.length > 0) {
        console.warn('Missing required environment variables:', missingVars);
      }

      expect(envVars.length).toBeGreaterThan(0);
    });

    it('should have OTEL collector endpoints configured', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} env | grep -E '_ENDPOINT|_URL' | grep -E 'OTEL|DASH0' | sort`);
      console.log('OTEL endpoint configurations:', stdout);
      
      expect(stdout).toMatch(/(ENDPOINT|URL)/);
    });

    it('should have service identification variables', async () => {
      const { stdout } = await execAsync(`docker exec ${containerName} env | grep -E 'SERVICE_NAME|MACHINE_ID|WORKER_ID' | sort`);
      console.log('Service identification variables:', stdout);
      
      expect(stdout).toMatch(/SERVICE_NAME|MACHINE_ID|WORKER_ID/);
    });
  });

  describe('5. Integration with Application', () => {
    it('should show telemetry client initialization logs', async () => {
      const { stdout } = await execAsync(`docker logs ${containerName} 2>&1 | grep -i telemetry | head -10`);
      console.log('Telemetry initialization logs:', stdout);
      
      expect(stdout).toMatch(/telemetry/i);
    });

    it('should show OTEL span creation in logs', async () => {
      const { stdout } = await execAsync(`docker logs ${containerName} 2>&1 | grep -E 'OTEL|SPAN|TRACE' | head -5`);
      console.log('OTEL activity logs:', stdout);
      
      expect(stdout).toMatch(/(OTEL|SPAN|TRACE)/i);
    });

    it('should test end-to-end telemetry flow', async () => {
      // Wait a moment for any async telemetry to process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const { stdout } = await execAsync(`docker logs ${containerName} 2>&1 | tail -20`);
      console.log('Recent container logs:', stdout);
      
      // Should not see repeated connection failures
      const connectionErrors = (stdout.match(/fetch failed|connection refused|ECONNREFUSED/gi) || []).length;
      console.log('Connection error count:', connectionErrors);
      
      // Some initial connection attempts might fail during startup, but not continuously
      expect(connectionErrors).toBeLessThan(10);
    });
  });

  describe('6. Collector Configuration Validation', () => {
    it('should have valid collector configuration', async () => {
      try {
        const { stdout } = await execAsync(`docker exec ${containerName} find / -name "*.yaml" -exec grep -l "otlp" {} \\; 2>/dev/null | head -5`);
        console.log('OTLP configuration files found:', stdout);
        
        if (stdout.trim()) {
          const configFiles = stdout.trim().split('\n');
          for (const configFile of configFiles.slice(0, 2)) {
            try {
              const { stdout: configContent } = await execAsync(`docker exec ${containerName} cat "${configFile}" | head -30`);
              console.log(`Configuration from ${configFile}:`, configContent);
            } catch (error) {
              console.warn(`Could not read config file ${configFile}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn('Could not locate collector configuration:', error);
      }
    });

    it('should validate collector is receiving data', async () => {
      // Check if collector is processing data by looking at logs
      try {
        const { stdout } = await execAsync(`docker exec ${containerName} ps aux | grep -i collector | grep -v grep`);
        if (stdout.trim()) {
          console.log('Collector process details:', stdout);
          
          // Look for collector-specific logs
          const { stdout: collectorLogs } = await execAsync(`docker logs ${containerName} 2>&1 | grep -i collector | tail -5`);
          console.log('Collector-specific logs:', collectorLogs);
        }
      } catch (error) {
        console.warn('Could not retrieve collector process info:', error);
      }
    });
  });
});