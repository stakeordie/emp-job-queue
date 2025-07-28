/**
 * Hardware Detection Module
 * Detects actual machine resources (GPU count, RAM, CPU cores, etc.)
 */

import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

export class HardwareDetector {
  constructor() {
    this.logger = {
      log: (msg) => console.log(`[HardwareDetector] ${msg}`),
      warn: (msg) => console.warn(`[HardwareDetector] ${msg}`),
      error: (msg) => console.error(`[HardwareDetector] ${msg}`)
    };
  }

  /**
   * Detect all machine resources
   */
  async detectResources() {
    try {
      this.logger.log('🔍 Detecting machine hardware resources...');

      const [gpuInfo, cpuInfo, memoryInfo, diskInfo] = await Promise.all([
        this.detectGPUs(),
        this.detectCPU(),
        this.detectMemory(),
        this.detectDisk()
      ]);

      const resources = {
        ...gpuInfo,
        ...cpuInfo,
        ...memoryInfo,
        ...diskInfo,
        platform: os.platform(),
        architecture: os.arch(),
        hostname: os.hostname(),
        detectedAt: new Date().toISOString()
      };

      this.logger.log(`✅ Hardware detection completed:`);
      this.logger.log(`   - GPUs: ${resources.gpuCount} (${resources.hasGpu ? 'available' : 'none'})`);
      this.logger.log(`   - CPU: ${resources.cpuCores} cores`);
      this.logger.log(`   - RAM: ${resources.ramGB}GB`);
      this.logger.log(`   - Disk: ${resources.diskGB}GB available`);

      return resources;

    } catch (error) {
      this.logger.error(`Hardware detection failed: ${error.message}`);
      return this.getFallbackResources();
    }
  }

  /**
   * Detect GPU information
   */
  async detectGPUs() {
    try {
      // First try nvidia-smi for NVIDIA GPUs
      const nvidiaGpus = await this.detectNvidiaGPUs();
      if (nvidiaGpus.gpuCount > 0) {
        return nvidiaGpus;
      }

      // Then try other GPU detection methods
      const otherGpus = await this.detectOtherGPUs();
      if (otherGpus.gpuCount > 0) {
        return otherGpus;
      }

      // No GPUs detected
      return {
        hasGpu: false,
        gpuCount: 0,
        gpuModel: 'none',
        gpuMemoryGB: 0,
        gpuVendor: 'none'
      };

    } catch (error) {
      this.logger.warn(`GPU detection failed: ${error.message}`);
      return this.getGPUFromEnvironment();
    }
  }

  /**
   * Detect NVIDIA GPUs using nvidia-smi
   */
  async detectNvidiaGPUs() {
    return new Promise((resolve) => {
      const nvidia = spawn('nvidia-smi', ['--query-gpu=count,name,memory.total', '--format=csv,noheader,nounits']);
      let stdout = '';
      let stderr = '';

      nvidia.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      nvidia.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      nvidia.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const lines = stdout.trim().split('\n');
            const gpuCount = lines.length;
            
            if (gpuCount > 0) {
              const firstGpu = lines[0].split(',').map(s => s.trim());
              const gpuModel = firstGpu[1] || 'NVIDIA GPU';
              const gpuMemoryMB = parseInt(firstGpu[2]) || 0;
              const gpuMemoryGB = Math.round(gpuMemoryMB / 1024);

              resolve({
                hasGpu: true,
                gpuCount,
                gpuModel,
                gpuMemoryGB,
                gpuVendor: 'NVIDIA'
              });
              return;
            }
          } catch (parseError) {
            this.logger.warn(`Failed to parse nvidia-smi output: ${parseError.message}`);
          }
        }
        
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });

      nvidia.on('error', () => {
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });
    });
  }

  /**
   * Detect other GPUs (AMD, Intel, etc.)
   */
  async detectOtherGPUs() {
    try {
      // Try lspci on Linux
      if (os.platform() === 'linux') {
        return await this.detectGPUsLspci();
      }
      
      // Try system_profiler on macOS
      if (os.platform() === 'darwin') {
        return await this.detectGPUsMacOS();
      }
      
      // Try wmic on Windows
      if (os.platform() === 'win32') {
        return await this.detectGPUsWindows();
      }

      return {
        hasGpu: false,
        gpuCount: 0,
        gpuModel: 'none',
        gpuMemoryGB: 0,
        gpuVendor: 'none'
      };

    } catch (error) {
      this.logger.warn(`Other GPU detection failed: ${error.message}`);
      return {
        hasGpu: false,
        gpuCount: 0,
        gpuModel: 'none',
        gpuMemoryGB: 0,
        gpuVendor: 'none'
      };
    }
  }

  /**
   * Detect GPUs using lspci (Linux)
   */
  async detectGPUsLspci() {
    return new Promise((resolve) => {
      const lspci = spawn('lspci', ['-v']);
      let stdout = '';

      lspci.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      lspci.on('close', (code) => {
        if (code === 0) {
          const gpuLines = stdout.split('\n').filter(line => 
            line.toLowerCase().includes('vga') || 
            line.toLowerCase().includes('display') ||
            line.toLowerCase().includes('3d')
          );

          if (gpuLines.length > 0) {
            const firstGpu = gpuLines[0];
            let vendor = 'Unknown';
            if (firstGpu.toLowerCase().includes('nvidia')) vendor = 'NVIDIA';
            else if (firstGpu.toLowerCase().includes('amd')) vendor = 'AMD';
            else if (firstGpu.toLowerCase().includes('intel')) vendor = 'Intel';

            resolve({
              hasGpu: true,
              gpuCount: gpuLines.length,
              gpuModel: firstGpu.split(':').slice(-1)[0].trim(),
              gpuMemoryGB: 4, // Estimate
              gpuVendor: vendor
            });
            return;
          }
        }
        
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });

      lspci.on('error', () => {
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });
    });
  }

  /**
   * Detect GPUs on macOS
   */
  async detectGPUsMacOS() {
    return new Promise((resolve) => {
      const profiler = spawn('system_profiler', ['SPDisplaysDataType']);
      let stdout = '';

      profiler.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      profiler.on('close', (code) => {
        if (code === 0) {
          const gpuCount = (stdout.match(/Chipset Model:/g) || []).length;
          if (gpuCount > 0) {
            const modelMatch = stdout.match(/Chipset Model:\s*(.+)/);
            const model = modelMatch ? modelMatch[1].trim() : 'Unknown GPU';
            
            resolve({
              hasGpu: true,
              gpuCount,
              gpuModel: model,
              gpuMemoryGB: 8, // Estimate for Apple Silicon
              gpuVendor: model.includes('Apple') ? 'Apple' : 'Unknown'
            });
            return;
          }
        }
        
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });

      profiler.on('error', () => {
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });
    });
  }

  /**
   * Detect GPUs on Windows
   */
  async detectGPUsWindows() {
    return new Promise((resolve) => {
      const wmic = spawn('wmic', ['path', 'win32_VideoController', 'get', 'name']);
      let stdout = '';

      wmic.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      wmic.on('close', (code) => {
        if (code === 0) {
          const lines = stdout.split('\n').filter(line => line.trim() && !line.includes('Name'));
          if (lines.length > 0) {
            const model = lines[0].trim();
            let vendor = 'Unknown';
            if (model.toLowerCase().includes('nvidia')) vendor = 'NVIDIA';
            else if (model.toLowerCase().includes('amd')) vendor = 'AMD';
            else if (model.toLowerCase().includes('intel')) vendor = 'Intel';

            resolve({
              hasGpu: true,
              gpuCount: lines.length,
              gpuModel: model,
              gpuMemoryGB: 4, // Estimate
              gpuVendor: vendor
            });
            return;
          }
        }
        
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });

      wmic.on('error', () => {
        resolve({
          hasGpu: false,
          gpuCount: 0,
          gpuModel: 'none',
          gpuMemoryGB: 0,
          gpuVendor: 'none'
        });
      });
    });
  }

  /**
   * Get GPU info from environment variables as fallback
   */
  getGPUFromEnvironment() {
    const gpuCount = parseInt(process.env.MACHINE_NUM_GPUS || '0');
    const hasGpu = process.env.MACHINE_HAS_GPU !== 'false' && gpuCount > 0;
    
    return {
      hasGpu,
      gpuCount,
      gpuModel: process.env.MACHINE_GPU_MODEL || 'Simulated GPU',
      gpuMemoryGB: parseInt(process.env.MACHINE_GPU_MEMORY_GB || '16'),
      gpuVendor: 'Environment'
    };
  }

  /**
   * Detect CPU information
   */
  async detectCPU() {
    try {
      const cpus = os.cpus();
      const cpuCores = cpus.length;
      const cpuModel = cpus[0] ? cpus[0].model : 'Unknown CPU';
      const cpuSpeed = cpus[0] ? cpus[0].speed : 0;

      return {
        cpuCores,
        cpuModel: cpuModel.trim(),
        cpuSpeedMHz: cpuSpeed,
        cpuThreads: cpuCores // Simplified, could detect hyperthreading
      };

    } catch (error) {
      this.logger.warn(`CPU detection failed: ${error.message}`);
      return {
        cpuCores: parseInt(process.env.MACHINE_CPU_CORES || '8'),
        cpuModel: 'Unknown CPU',
        cpuSpeedMHz: 0,
        cpuThreads: parseInt(process.env.MACHINE_CPU_CORES || '8')
      };
    }
  }

  /**
   * Detect memory information
   */
  async detectMemory() {
    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const ramGB = Math.round(totalMemory / (1024 * 1024 * 1024));
      const freeRamGB = Math.round(freeMemory / (1024 * 1024 * 1024));

      return {
        ramGB,
        freeRamGB,
        ramBytes: totalMemory,
        freeRamBytes: freeMemory
      };

    } catch (error) {
      this.logger.warn(`Memory detection failed: ${error.message}`);
      return {
        ramGB: parseInt(process.env.MACHINE_RAM_GB || '32'),
        freeRamGB: parseInt(process.env.MACHINE_RAM_GB || '32'),
        ramBytes: 0,
        freeRamBytes: 0
      };
    }
  }

  /**
   * Detect disk information
   */
  async detectDisk() {
    try {
      // Try to get disk usage for current directory
      const diskInfo = await this.getDiskUsage('/workspace');
      
      return {
        diskGB: Math.round(diskInfo.total / (1024 * 1024 * 1024)),
        freeDiskGB: Math.round(diskInfo.free / (1024 * 1024 * 1024)),
        diskUsedGB: Math.round(diskInfo.used / (1024 * 1024 * 1024))
      };

    } catch (error) {
      this.logger.warn(`Disk detection failed: ${error.message}`);
      return {
        diskGB: parseInt(process.env.MACHINE_DISK_GB || '100'),
        freeDiskGB: parseInt(process.env.MACHINE_DISK_GB || '100'),
        diskUsedGB: 0
      };
    }
  }

  /**
   * Get disk usage for a path
   */
  async getDiskUsage(path) {
    return new Promise((resolve, reject) => {
      const df = spawn('df', ['-B1', path]);
      let stdout = '';

      df.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      df.on('close', (code) => {
        if (code === 0) {
          try {
            const lines = stdout.trim().split('\n');
            if (lines.length >= 2) {
              const parts = lines[1].split(/\s+/);
              const total = parseInt(parts[1]) || 0;
              const used = parseInt(parts[2]) || 0;
              const free = parseInt(parts[3]) || 0;

              resolve({ total, used, free });
              return;
            }
          } catch (parseError) {
            // Fall through to reject
          }
        }
        
        reject(new Error('Failed to parse df output'));
      });

      df.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Get fallback resources if detection fails
   */
  getFallbackResources() {
    this.logger.warn('Using fallback hardware resources from environment');
    
    return {
      hasGpu: process.env.MACHINE_HAS_GPU !== 'false',
      gpuCount: parseInt(process.env.MACHINE_NUM_GPUS || '0'),
      gpuModel: process.env.MACHINE_GPU_MODEL || 'Unknown GPU',
      gpuMemoryGB: parseInt(process.env.MACHINE_GPU_MEMORY_GB || '16'),
      gpuVendor: 'Environment',
      cpuCores: parseInt(process.env.MACHINE_CPU_CORES || '8'),
      cpuModel: 'Unknown CPU',
      cpuSpeedMHz: 0,
      cpuThreads: parseInt(process.env.MACHINE_CPU_CORES || '8'),
      ramGB: parseInt(process.env.MACHINE_RAM_GB || '32'),
      freeRamGB: parseInt(process.env.MACHINE_RAM_GB || '32'),
      ramBytes: 0,
      freeRamBytes: 0,
      diskGB: parseInt(process.env.MACHINE_DISK_GB || '100'),
      freeDiskGB: parseInt(process.env.MACHINE_DISK_GB || '100'),
      diskUsedGB: 0,
      platform: os.platform(),
      architecture: os.arch(),
      hostname: os.hostname(),
      detectedAt: new Date().toISOString()
    };
  }
}

/**
 * Export convenience function
 */
export async function detectHardwareResources() {
  const detector = new HardwareDetector();
  return await detector.detectResources();
}