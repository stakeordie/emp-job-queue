import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { createSafeLogger } from '../utils/safe-logger.js';

/**
 * A1111 Management Client
 * Handles installation and setup of Automatic1111 WebUI
 */
export default class A1111ManagementClient {
  constructor(config = {}) {
    this.logger = createSafeLogger('A1111ManagementClient');
    this.config = {
      branch: 'main',
      repoUrl: 'https://github.com/AUTOMATIC1111/stable-diffusion-webui.git',
      commitHash: 'cf2772fab0af5573da775e7437e6acdca424f26e',
      modelsRepoUrl: 'git@github.com:stakeordie/sd_models.git',
      installTimeout: 300,
      workspaceDir: process.env.WORKSPACE_DIR || '/workspace',
      comfyuiCheckpointsPath: process.env.COMFYUI_CHECKPOINTS_PATH || '/workspace/ComfyUI/models/checkpoints',
      ...config
    };

    this.workDir = path.join(this.config.workspaceDir, 'stable-diffusion-webui');
    this.modelsDir = path.join(this.workDir, 'models');

    this.logger.info('A1111 Management Client initialized', {
      workDir: this.workDir,
      commitHash: this.config.commitHash,
      comfyuiCheckpointsPath: this.config.comfyuiCheckpointsPath
    });
  }

  /**
   * Install A1111 WebUI
   */
  async install() {
    try {
      this.logger.info('Starting A1111 installation...');

      // Ensure workspace directory exists
      await fs.ensureDir(this.config.workspaceDir);

      // Check if already installed
      if (await this.isInstalled()) {
        this.logger.info('A1111 already installed, skipping installation');
        return { success: true, message: 'A1111 already installed' };
      }

      // Clone A1111 repository
      await this.cloneRepository();

      // Install Python dependencies
      await this.installDependencies();

      // Setup models
      await this.setupModels();

      this.logger.info('A1111 installation completed successfully');
      return { success: true, message: 'A1111 installation completed' };

    } catch (error) {
      this.logger.error('A1111 installation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if A1111 is already installed
   */
  async isInstalled() {
    try {
      const webUIPath = path.join(this.workDir, 'webui.py');
      const launchPath = path.join(this.workDir, 'launch.py');
      
      // Check for main files
      const webUIExists = await fs.pathExists(webUIPath);
      const launchExists = await fs.pathExists(launchPath);
      
      if (webUIExists || launchExists) {
        // Verify it's the correct commit
        try {
          const { stdout } = await execa('git', ['rev-parse', 'HEAD'], {
            cwd: this.workDir
          });
          
          const currentCommit = stdout.trim();
          if (currentCommit === this.config.commitHash) {
            this.logger.info('A1111 installation found with correct commit hash');
            return true;
          } else {
            this.logger.info(`A1111 found but wrong commit (${currentCommit} vs ${this.config.commitHash}), will reinstall`);
            await fs.remove(this.workDir);
            return false;
          }
        } catch (gitError) {
          this.logger.warn('Could not verify git commit, assuming installation is incomplete');
          return false;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.debug('Installation check failed:', error.message);
      return false;
    }
  }

  /**
   * Clone A1111 repository
   */
  async cloneRepository() {
    try {
      this.logger.info('Cloning A1111 repository...');

      // Remove existing directory if present
      if (await fs.pathExists(this.workDir)) {
        await fs.remove(this.workDir);
      }

      // Clone repository
      await execa('git', ['clone', this.config.repoUrl, this.workDir], {
        timeout: this.config.installTimeout * 1000
      });

      // Reset to specific commit
      this.logger.info(`Resetting to commit hash: ${this.config.commitHash}`);
      await execa('git', ['reset', '--hard', this.config.commitHash], {
        cwd: this.workDir
      });

      this.logger.info('Repository cloned successfully');
    } catch (error) {
      throw new Error(`Failed to clone A1111 repository: ${error.message}`);
    }
  }

  /**
   * Install Python dependencies
   */
  async installDependencies() {
    try {
      this.logger.info('Installing Python dependencies...');

      // Check if requirements file exists
      const requirementsPath = path.join(this.workDir, 'requirements_versions.txt');
      const fallbackRequirementsPath = path.join(this.workDir, 'requirements.txt');

      let requirementsFile;
      if (await fs.pathExists(requirementsPath)) {
        requirementsFile = requirementsPath;
      } else if (await fs.pathExists(fallbackRequirementsPath)) {
        requirementsFile = fallbackRequirementsPath;
      } else {
        this.logger.warn('No requirements file found, skipping dependency installation');
        return;
      }

      // Install requirements
      await execa('pip', ['install', '-r', path.basename(requirementsFile)], {
        cwd: this.workDir,
        timeout: this.config.installTimeout * 1000
      });

      this.logger.info('Python dependencies installed successfully');
    } catch (error) {
      // Don't fail the entire installation if dependencies fail
      this.logger.error('Failed to install dependencies, continuing anyway:', error.message);
    }
  }

  /**
   * Setup models directory from sd_models repository
   */
  async setupModels() {
    try {
      this.logger.info('Setting up A1111 models...');

      // Check if models directory already exists and has content
      if (await fs.pathExists(this.modelsDir)) {
        const entries = await fs.readdir(this.modelsDir);
        if (entries.length > 0 && !entries.every(entry => entry.startsWith('.'))) {
          this.logger.info('Models directory already exists with content, skipping model setup');
          return;
        }
        // Remove empty or git-only directory
        await fs.remove(this.modelsDir);
      }

      // Clone sd_models repository to models directory
      this.logger.info('Cloning sd_models repository...');
      await execa('git', ['clone', this.config.modelsRepoUrl, this.modelsDir], {
        env: {
          ...process.env,
          GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=no'
        },
        timeout: this.config.installTimeout * 1000
      });

      // Remove .git directory to save space
      const gitDir = path.join(this.modelsDir, '.git');
      if (await fs.pathExists(gitDir)) {
        await fs.remove(gitDir);
      }

      // Verify models directory structure
      await this.verifyModelsSetup();

      this.logger.info('Models setup completed successfully');
    } catch (error) {
      this.logger.error('Failed to setup models:', error.message);
      // Don't fail installation if models setup fails - A1111 can still work
      this.logger.warn('Continuing without custom models - A1111 will use default paths');
    }
  }

  /**
   * Verify models directory has expected structure
   */
  async verifyModelsSetup() {
    try {
      const expectedDirs = ['loras', 'vae', 'embeddings', 'upscalers'];
      const existingDirs = [];

      for (const dir of expectedDirs) {
        const dirPath = path.join(this.modelsDir, dir);
        if (await fs.pathExists(dirPath)) {
          existingDirs.push(dir);
        }
      }

      this.logger.info(`Models directory setup verified. Found: ${existingDirs.join(', ')}`);
      
      if (existingDirs.length === 0) {
        this.logger.warn('No expected model directories found in sd_models repo');
      }
    } catch (error) {
      this.logger.debug('Could not verify models setup:', error.message);
    }
  }

  /**
   * Get installation status
   */
  async getStatus() {
    try {
      const installed = await this.isInstalled();
      const modelsSetup = await fs.pathExists(this.modelsDir);
      
      const status = {
        installed,
        modelsSetup,
        workDir: this.workDir,
        modelsDir: this.modelsDir,
        commitHash: this.config.commitHash,
        comfyuiCheckpointsPath: this.config.comfyuiCheckpointsPath
      };

      if (installed) {
        try {
          // Get current commit if installed
          const { stdout } = await execa('git', ['rev-parse', 'HEAD'], {
            cwd: this.workDir
          });
          status.currentCommit = stdout.trim();
          status.commitMatch = status.currentCommit === this.config.commitHash;
        } catch (error) {
          status.currentCommit = 'unknown';
          status.commitMatch = false;
        }
      }

      return status;
    } catch (error) {
      return {
        installed: false,
        modelsSetup: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up installation (for testing or reinstallation)
   */
  async cleanup() {
    try {
      this.logger.info('Cleaning up A1111 installation...');
      
      if (await fs.pathExists(this.workDir)) {
        await fs.remove(this.workDir);
      }
      
      this.logger.info('Cleanup completed');
      return { success: true, message: 'Cleanup completed' };
    } catch (error) {
      this.logger.error('Cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update models from repository
   */
  async updateModels() {
    try {
      this.logger.info('Updating A1111 models...');

      // Remove existing models directory
      if (await fs.pathExists(this.modelsDir)) {
        await fs.remove(this.modelsDir);
      }

      // Re-setup models
      await this.setupModels();

      this.logger.info('Models updated successfully');
      return { success: true, message: 'Models updated' };
    } catch (error) {
      this.logger.error('Model update failed:', error);
      return { success: false, error: error.message };
    }
  }
}