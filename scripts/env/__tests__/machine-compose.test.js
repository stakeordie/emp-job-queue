import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    symlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    chmodSync: vi.fn(),
  },
}));

describe('MachineCompose', () => {
  let MachineCompose;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Dynamically import the module
    const module = await import('../machine-compose.js');
    MachineCompose = module.default;
  });

  describe('parseArgs', () => {
    it('should parse --num flag correctly', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'run', 'ollama-mock', '--num', '3'];

      const result = composer.parseArgs();

      expect(result.command).toBe('run');
      expect(result.profile).toBe('ollama-mock');
      expect(result.numInstances).toBe(3);
    });

    it('should parse --reset flag correctly', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'run', 'ollama-mock', '--reset'];

      const result = composer.parseArgs();

      expect(result.command).toBe('run');
      expect(result.profile).toBe('ollama-mock');
      expect(result.flags).toContain('--reset');
    });

    it('should parse containerName for stop command', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'stop', 'ollama-mock', 'ollama-mock-1'];

      const result = composer.parseArgs();

      expect(result.command).toBe('stop');
      expect(result.profile).toBe('ollama-mock');
      expect(result.containerName).toBe('ollama-mock-1');
    });

    it('should parse --open port mappings', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'run', 'ollama-mock', '--open', '8080:8080'];

      const result = composer.parseArgs();

      expect(result.portMappings).toContain('8080:8080');
    });

    it('should combine --num and --reset flags', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'run', 'ollama-mock', '--num', '5', '--reset'];

      const result = composer.parseArgs();

      expect(result.numInstances).toBe(5);
      expect(result.flags).toContain('--reset');
    });

    it('should throw error for invalid --num value', () => {
      const composer = new MachineCompose();
      process.argv = ['node', 'machine-compose.js', 'run', 'ollama-mock', '--num', 'invalid'];

      expect(() => composer.parseArgs()).toThrow('Invalid --num value');
    });
  });

  describe('getExistingContainerIndices', () => {
    it('should return empty array when no containers exist', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue('');

      const indices = await composer.getExistingContainerIndices('ollama-mock');

      expect(indices).toEqual([]);
    });

    it('should extract indices from container names', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue('ollama-mock-0\nollama-mock-1\nollama-mock-2\n');

      const indices = await composer.getExistingContainerIndices('ollama-mock');

      expect(indices).toEqual([0, 1, 2]);
    });

    it('should handle single container without index', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue('ollama-mock\n');

      const indices = await composer.getExistingContainerIndices('ollama-mock');

      expect(indices).toEqual([0]);
    });

    it('should sort indices correctly', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue('ollama-mock-5\nollama-mock-1\nollama-mock-3\n');

      const indices = await composer.getExistingContainerIndices('ollama-mock');

      expect(indices).toEqual([1, 3, 5]);
    });

    it('should handle execSync errors gracefully', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockImplementation(() => {
        throw new Error('Docker not running');
      });

      const indices = await composer.getExistingContainerIndices('ollama-mock');

      expect(indices).toEqual([]);
    });
  });

  describe('stopContainersByProfile', () => {
    it('should stop specific container when containerName provided', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValueOnce('ollama-mock-1\n'); // ps check
      execSync.mockReturnValueOnce(''); // stop command

      const result = await composer.stopContainersByProfile('ollama-mock', 'ollama-mock-1');

      expect(result).toBe(1);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('docker ps --filter "name=^ollama-mock-1$"'),
        expect.any(Object)
      );
      expect(execSync).toHaveBeenCalledWith(
        'docker stop ollama-mock-1',
        expect.any(Object)
      );
    });

    it('should stop all containers when profile is "all"', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValueOnce('container1\ncontainer2\ncontainer3\n');
      execSync.mockReturnValue(''); // stop commands

      const result = await composer.stopContainersByProfile('all');

      expect(result).toBe(3);
      expect(execSync).toHaveBeenCalledWith('docker ps --format "{{.Names}}"', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith('docker stop container1', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith('docker stop container2', expect.any(Object));
      expect(execSync).toHaveBeenCalledWith('docker stop container3', expect.any(Object));
    });

    it('should stop all containers for specific machine type', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValueOnce('ollama-mock-0\nollama-mock-1\n');
      execSync.mockReturnValue(''); // stop commands

      const result = await composer.stopContainersByProfile('ollama-mock');

      expect(result).toBe(2);
      expect(execSync).toHaveBeenCalledWith(
        'docker ps --filter "name=ollama-mock" --format "{{.Names}}"',
        expect.any(Object)
      );
    });

    it('should return 0 when no containers found', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue('');

      const result = await composer.stopContainersByProfile('ollama-mock');

      expect(result).toBe(0);
    });

    it('should handle container not found for specific container', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      execSync.mockReturnValue(''); // Container not found

      const result = await composer.stopContainersByProfile('ollama-mock', 'ollama-mock-99');

      expect(result).toBe(0);
    });
  });

  describe('buildDockerRunCommand', () => {
    it('should build command with default container name', () => {
      const composer = new MachineCompose();

      const cmd = composer.buildDockerRunCommand('ollama-mock', [], 'testrunner-docker', []);

      expect(cmd).toContain('docker');
      expect(cmd).toContain('run');
      expect(cmd).toContain('--name');
      expect(cmd).toContain('ollama-mock');
    });

    it('should add log driver configuration', () => {
      const composer = new MachineCompose();

      const cmd = composer.buildDockerRunCommand('ollama-mock', [], 'testrunner-docker', []);

      expect(cmd).toContain('--log-driver');
      expect(cmd).toContain('json-file');
      expect(cmd).toContain('--log-opt');
      expect(cmd).toContain('max-size=10m');
      expect(cmd).toContain('max-file=3');
    });

    it('should build command with custom container name', () => {
      const composer = new MachineCompose();

      const cmd = composer.buildDockerRunCommand('ollama-mock', [], 'testrunner-docker', [], 'ollama-mock-5');

      expect(cmd).toContain('--name');
      expect(cmd).toContain('ollama-mock-5');
      expect(cmd).toContain('--hostname');
      expect(cmd).toContain('ollama-mock-5');
    });

    it('should add port mappings', () => {
      const composer = new MachineCompose();

      const cmd = composer.buildDockerRunCommand('ollama-mock', [], 'testrunner-docker', ['8080:8080', '9090:9090']);

      expect(cmd).toContain('-p');
      expect(cmd).toContain('8080:8080');
      expect(cmd).toContain('9090:9090');
    });

    it('should include image name', () => {
      const composer = new MachineCompose();

      const cmd = composer.buildDockerRunCommand('ollama-mock', [], 'testrunner-docker', []);

      expect(cmd).toContain('emprops/machine:ollama-mock');
    });
  });

  describe('Smart numbering integration', () => {
    it('should start from next available index', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      // Simulate existing containers: ollama-mock-0, ollama-mock-1, ollama-mock-2
      execSync.mockReturnValue('ollama-mock-0\nollama-mock-1\nollama-mock-2\n');

      const existingIndices = await composer.getExistingContainerIndices('ollama-mock');
      const startIndex = existingIndices.length;

      expect(startIndex).toBe(3);

      // Next containers should be ollama-mock-3, ollama-mock-4, etc.
      const nextContainerName = `ollama-mock-${startIndex}`;
      expect(nextContainerName).toBe('ollama-mock-3');
    });

    it('should reset to index 0 after stop all', async () => {
      const composer = new MachineCompose();
      const { execSync } = await import('child_process');

      // Simulate stopping all containers
      execSync.mockReturnValueOnce('ollama-mock-0\nollama-mock-1\n'); // ps check
      execSync.mockReturnValue(''); // stop commands

      await composer.stopContainersByProfile('ollama-mock');

      // After stopping, should start from 0
      execSync.mockReturnValue(''); // No containers
      const existingIndices = await composer.getExistingContainerIndices('ollama-mock');

      expect(existingIndices.length).toBe(0);
    });
  });
});
