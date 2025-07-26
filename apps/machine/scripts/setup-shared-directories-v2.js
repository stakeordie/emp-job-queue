#!/usr/bin/env node

/**
 * Simple shared directory setup script
 * Creates basic directories needed for ComfyUI and machine operation
 */

import fs from 'fs-extra';
import path from 'path';

async function setupSharedDirectories() {
  console.log('Setting up shared directories...');
  
  const workspacePath = process.env.WORKSPACE_PATH || '/workspace';
  
  // Create basic directories that might be needed
  const directories = [
    path.join(workspacePath, 'models'),
    path.join(workspacePath, 'logs'), 
    path.join(workspacePath, 'configs'),
    path.join(workspacePath, 'tmp'),
    path.join(workspacePath, 'ComfyUI', 'custom_nodes'),
    path.join(workspacePath, 'ComfyUI', 'models'),
    path.join(workspacePath, 'ComfyUI', 'output'),
    path.join(workspacePath, 'ComfyUI', 'input'),
    path.join(workspacePath, 'ComfyUI', 'user')
  ];
  
  for (const dir of directories) {
    try {
      await fs.ensureDir(dir);
      console.log(`✓ Created/verified directory: ${dir}`);
    } catch (error) {
      console.warn(`⚠ Could not create directory ${dir}:`, error.message);
    }
  }
  
  console.log('✅ Shared directory setup completed');
}

export async function setupBaseSharedDirectories() {
  return setupSharedDirectories();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupSharedDirectories()
    .then(() => {
      console.log('Setup completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Setup failed:', error);
      process.exit(1);
    });
}