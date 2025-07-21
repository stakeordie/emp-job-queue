import { BaseService } from './base-service.js';
import { setupBaseSharedDirectories } from '../../scripts/setup-shared-directories-v2.js';
import { execa } from 'execa';

export default class SharedSetupService extends BaseService {
  constructor(options, config) {
    super('shared-setup', options);
    this.config = config;
    this.setupComplete = false;
  }

  async onStart() {
    this.logger.info('Setting up base_machine compatible shared directories and emprops_shared...');
    
    try {
      // Run the full setup script (includes emprops_shared clone)
      await execa('node', ['/service-manager/scripts/setup-shared-directories-v2.js'], {
        stdio: 'inherit'
      });
      
      this.setupComplete = true;
      this.logger.info('Complete shared directory setup completed (including emprops_shared)');
    } catch (error) {
      this.logger.error('Failed to setup shared directories:', error);
      throw error;
    }
  }

  async onStop() {
    // Nothing to stop for setup service
    this.logger.info('Shared setup service stopped');
  }

  async onHealthCheck() {
    return this.setupComplete;
  }

  getMetadata() {
    return {
      setupComplete: this.setupComplete,
      workspaceDir: process.env.WORKSPACE_PATH || '/workspace'
    };
  }
}