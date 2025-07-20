// Version Service - Provides machine version information
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class VersionService {
  constructor() {
    this.version = this.loadVersion();
  }

  /**
   * Load version from multiple sources
   */
  loadVersion() {
    try {
      // 1. Try to read from .version file (injected during Docker build)
      const versionFile = path.join('/service-manager', '.version');
      if (fs.existsSync(versionFile)) {
        const content = fs.readFileSync(versionFile, 'utf8');
        const versionMatch = content.match(/MACHINE_VERSION=(.+)/);
        if (versionMatch) {
          // Also extract build date if available
          const buildDateMatch = content.match(/BUILD_DATE=(.+)/);
          if (buildDateMatch) {
            this.buildDate = buildDateMatch[1].trim();
          }
          return versionMatch[1].trim();
        }
      }

      // 2. Try to read from package.json
      const packagePath = path.join('/service-manager', 'package.json');
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (pkg.version && pkg.version !== '0.1.0') {
          return pkg.version;
        }
      }

      // 3. Try environment variable
      if (process.env.MACHINE_VERSION) {
        return process.env.MACHINE_VERSION;
      }

      // 4. Fallback to Git info if available
      try {
        const { execSync } = await import('child_process');
        const gitHash = execSync('git rev-parse --short HEAD 2>/dev/null || echo "unknown"', { 
          encoding: 'utf8' 
        }).trim();
        const gitBranch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"', { 
          encoding: 'utf8' 
        }).trim();
        
        if (gitHash !== 'unknown') {
          return `dev-${gitBranch}-${gitHash}`;
        }
      } catch (error) {
        // Git not available, continue to fallback
      }

      // 5. Final fallback
      return 'unknown';
    } catch (error) {
      console.warn('Failed to load version:', error.message);
      return 'unknown';
    }
  }

  /**
   * Get version information
   */
  getVersion() {
    return this.version;
  }

  /**
   * Get detailed version info
   */
  getVersionInfo() {
    const buildDate = this.buildDate || process.env.BUILD_DATE || 'unknown';
    const nodeVersion = process.version;
    const platform = process.platform;
    const arch = process.arch;

    return {
      machine_version: this.version,
      build_date: buildDate,
      node_version: nodeVersion,
      platform,
      arch,
      container: process.env.CONTAINER_NAME || 'unknown',
      environment: process.env.NODE_ENV || 'unknown',
      is_development: this.isDevelopment(),
      is_release: this.isRelease(),
    };
  }

  /**
   * Check if this is a development version
   */
  isDevelopment() {
    return this.version.startsWith('dev-') || this.version === 'unknown' || this.version === 'latest';
  }

  /**
   * Check if this is a release version
   */
  isRelease() {
    return /^v?\d+\.\d+\.\d+/.test(this.version);
  }
}

// Export singleton instance
export const versionService = new VersionService();