/**
 * Fast unit tests for ngrok health check system
 * Tests tunnel management and health monitoring functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock dependencies
vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('js-yaml');

// Mock ngrok configuration
const mockNgrokConfig = {
  version: '2',
  authtoken: 'test_token',
  tunnels: {
    api: {
      proto: 'http',
      addr: '3331',
      subdomain: 'job-queue-api'
    },
    emprops: {
      proto: 'http',
      addr: '8080',
      subdomain: 'emprops-api'
    },
    miniapp: {
      proto: 'http',
      addr: '3002',
      subdomain: 'emerge-mini-app'
    }
  }
};

// Mock ngrok API responses
const mockTunnelList = {
  tunnels: [
    {
      name: 'api',
      public_url: 'https://job-queue-api.ngrok.app',
      config: { addr: 'http://localhost:3331' }
    }
  ]
};

describe('NgrokHealthChecker', () => {
  let NgrokHealthChecker;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock yaml.load
    const yaml = await import('js-yaml');
    vi.mocked(yaml.load).mockReturnValue(mockNgrokConfig);

    // Mock fs.readFile
    vi.mocked(fs.readFile).mockResolvedValue('mock yaml content');

    // Mock exec for ngrok commands
    vi.mocked(execAsync).mockImplementation(async (command) => {
      if (command.includes('ngrok api tunnels list')) {
        return { stdout: JSON.stringify(mockTunnelList), stderr: '' };
      }
      if (command.includes('ngrok tunnel')) {
        return { stdout: 'Tunnel started', stderr: '' };
      }
      return { stdout: '', stderr: '' };
    });

    // Import after mocks are set up
    const module = await import('../ngrok-health-check.js');
    NgrokHealthChecker = module.NgrokHealthChecker;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Configuration Loading', () => {
    it('should load ngrok configuration from YAML file', async () => {
      const checker = new NgrokHealthChecker();
      const config = await checker.loadNgrokConfig();

      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('ngrok.yml'),
        'utf8'
      );
      expect(config).toEqual(mockNgrokConfig);
    });

    it('should handle missing config file gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const checker = new NgrokHealthChecker();
      const config = await checker.loadNgrokConfig();

      expect(config).toBeNull();
    });

    it('should handle invalid YAML gracefully', async () => {
      const yaml = await import('js-yaml');
      vi.mocked(yaml.load).mockImplementation(() => {
        throw new Error('Invalid YAML');
      });

      const checker = new NgrokHealthChecker();
      const config = await checker.loadNgrokConfig();

      expect(config).toBeNull();
    });
  });

  describe('Tunnel Status Checking', () => {
    it('should get list of running tunnels', async () => {
      const checker = new NgrokHealthChecker();
      const tunnels = await checker.getRunningTunnels();

      expect(execAsync).toHaveBeenCalledWith(
        'ngrok api tunnels list --log-format=json'
      );
      expect(tunnels).toEqual(mockTunnelList.tunnels);
    });

    it('should handle ngrok API errors gracefully', async () => {
      vi.mocked(execAsync).mockRejectedValue(new Error('ngrok not running'));

      const checker = new NgrokHealthChecker();
      const tunnels = await checker.getRunningTunnels();

      expect(tunnels).toEqual([]);
    });

    it('should parse tunnel names correctly', async () => {
      const checker = new NgrokHealthChecker();
      const tunnels = await checker.getRunningTunnels();

      expect(tunnels).toHaveLength(1);
      expect(tunnels[0].name).toBe('api');
      expect(tunnels[0].public_url).toBe('https://job-queue-api.ngrok.app');
    });
  });

  describe('Missing Tunnel Detection', () => {
    it('should identify missing tunnels', async () => {
      const checker = new NgrokHealthChecker();
      const missing = await checker.checkMissingTunnels();

      // Should find emprops and miniapp as missing (only api is running)
      expect(missing).toHaveLength(2);
      expect(missing).toContain('emprops');
      expect(missing).toContain('miniapp');
      expect(missing).not.toContain('api');
    });

    it('should return empty array when all tunnels are running', async () => {
      const fullTunnelList = {
        tunnels: [
          { name: 'api', public_url: 'https://job-queue-api.ngrok.app' },
          { name: 'emprops', public_url: 'https://emprops-api.ngrok.app' },
          { name: 'miniapp', public_url: 'https://emerge-mini-app.ngrok.app' }
        ]
      };

      vi.mocked(execAsync).mockImplementation(async (command) => {
        if (command.includes('ngrok api tunnels list')) {
          return { stdout: JSON.stringify(fullTunnelList), stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      const checker = new NgrokHealthChecker();
      const missing = await checker.checkMissingTunnels();

      expect(missing).toHaveLength(0);
    });

    it('should handle empty tunnel configuration', async () => {
      const yaml = await import('js-yaml');
      vi.mocked(yaml.load).mockReturnValue({ tunnels: {} });

      const checker = new NgrokHealthChecker();
      const missing = await checker.checkMissingTunnels();

      expect(missing).toHaveLength(0);
    });
  });

  describe('Tunnel Starting', () => {
    it('should start missing tunnels', async () => {
      const checker = new NgrokHealthChecker();
      await checker.startTunnel('emprops');

      expect(execAsync).toHaveBeenCalledWith(
        'ngrok tunnel --config=/Users/the_dusky/Library/Application\\ Support/ngrok/ngrok.yml emprops',
        expect.objectContaining({
          detached: true
        })
      );
    });

    it('should handle tunnel start failures gracefully', async () => {
      vi.mocked(execAsync).mockImplementation(async (command) => {
        if (command.includes('ngrok tunnel')) {
          throw new Error('Tunnel already exists');
        }
        return { stdout: '', stderr: '' };
      });

      const checker = new NgrokHealthChecker();

      // Should not throw
      await expect(checker.startTunnel('api')).resolves.toBeUndefined();
    });

    it('should escape config path correctly', async () => {
      const checker = new NgrokHealthChecker();
      await checker.startTunnel('test');

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('Application\\ Support'),
        expect.any(Object)
      );
    });
  });

  describe('Health Check Integration', () => {
    it('should start all missing tunnels automatically', async () => {
      const checker = new NgrokHealthChecker();
      await checker.checkAndStartMissingTunnels();

      // Should have tried to start emprops and miniapp
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('ngrok tunnel'),
        expect.any(Object)
      );
    });

    it('should provide status summary', async () => {
      const checker = new NgrokHealthChecker();
      const status = await checker.getHealthStatus();

      expect(status).toHaveProperty('configLoaded');
      expect(status).toHaveProperty('runningTunnels');
      expect(status).toHaveProperty('missingTunnels');
      expect(status).toHaveProperty('totalConfigured');
    });

    it('should handle complete system failure gracefully', async () => {
      // Mock all operations to fail
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No config'));
      vi.mocked(execAsync).mockRejectedValue(new Error('ngrok not installed'));

      const checker = new NgrokHealthChecker();
      const status = await checker.getHealthStatus();

      expect(status.configLoaded).toBe(false);
      expect(status.runningTunnels).toHaveLength(0);
      expect(status.missingTunnels).toHaveLength(0);
    });
  });

  describe('Port Configuration', () => {
    it('should extract port numbers from tunnel config', async () => {
      const checker = new NgrokHealthChecker();
      const config = await checker.loadNgrokConfig();

      expect(config.tunnels.api.addr).toBe('3331');
      expect(config.tunnels.emprops.addr).toBe('8080');
      expect(config.tunnels.miniapp.addr).toBe('3002');
    });

    it('should handle different address formats', async () => {
      const complexConfig = {
        tunnels: {
          test1: { addr: 'localhost:3000' },
          test2: { addr: 'http://localhost:4000' },
          test3: { addr: '5000' }
        }
      };

      const yaml = await import('js-yaml');
      vi.mocked(yaml.load).mockReturnValue(complexConfig);

      const checker = new NgrokHealthChecker();
      const config = await checker.loadNgrokConfig();

      expect(config.tunnels.test1.addr).toBe('localhost:3000');
      expect(config.tunnels.test2.addr).toBe('http://localhost:4000');
      expect(config.tunnels.test3.addr).toBe('5000');
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      vi.mocked(execAsync).mockImplementation(async (command) => {
        attempts++;
        if (command.includes('ngrok api tunnels list') && attempts <= 2) {
          throw new Error('Temporary failure');
        }
        return { stdout: JSON.stringify(mockTunnelList), stderr: '' };
      });

      const checker = new NgrokHealthChecker();
      const tunnels = await checker.getRunningTunnelsWithRetry();

      expect(tunnels).toEqual(mockTunnelList.tunnels);
      expect(attempts).toBeGreaterThan(1);
    });

    it('should stop retrying after max attempts', async () => {
      vi.mocked(execAsync).mockRejectedValue(new Error('Permanent failure'));

      const checker = new NgrokHealthChecker();
      const tunnels = await checker.getRunningTunnelsWithRetry(2, 100);

      expect(tunnels).toEqual([]);
      expect(execAsync).toHaveBeenCalledTimes(2);
    });
  });
});