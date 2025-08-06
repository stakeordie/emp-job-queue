import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('version-service');

class VersionService {
  constructor() {
    this.versionInfo = null;
    this.loadVersionInfo();
  }

  loadVersionInfo() {
    try {
      // Try to load from .version file (created at build time)
      const versionPath = path.join(process.env.SERVICE_MANAGER_PATH || '/service-manager', '.version');
      if (fs.existsSync(versionPath)) {
        const versionContent = fs.readFileSync(versionPath, 'utf8');
        const versionData = {};
        
        versionContent.split('\n').forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            versionData[key] = value;
          }
        });
        
        this.versionInfo = versionData;
      } else {
        // Fallback to package.json
        const packagePath = path.join(process.env.SERVICE_MANAGER_PATH || '/service-manager', 'package.json');
        if (fs.existsSync(packagePath)) {
          const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
          this.versionInfo = {
            MACHINE_VERSION: packageJson.version || 'unknown',
            BUILD_DATE: 'unknown'
          };
        } else {
          this.versionInfo = {
            MACHINE_VERSION: 'unknown',
            BUILD_DATE: 'unknown'
          };
        }
      }
      
      logger.info('Version info loaded:', this.versionInfo);
    } catch (error) {
      logger.error('Failed to load version info:', error);
      this.versionInfo = {
        MACHINE_VERSION: 'error',
        BUILD_DATE: 'error'
      };
    }
  }

  getVersion() {
    return this.versionInfo?.MACHINE_VERSION || 'unknown';
  }

  getVersionInfo() {
    return {
      version: this.versionInfo?.MACHINE_VERSION || 'unknown',
      build_date: this.versionInfo?.BUILD_DATE || 'unknown',
      machine_version: this.versionInfo?.MACHINE_VERSION || 'unknown'
    };
  }
}

export const versionService = new VersionService();