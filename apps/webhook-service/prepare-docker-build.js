#!/usr/bin/env node

/**
 * Prepare Docker build files for webhook service
 * Based on API's prepare-docker-build.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Preparing Docker build files for webhook service...');

// Read the current package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// Create package.docker.json with workspace references replaced
const dockerPackageJson = JSON.parse(JSON.stringify(packageJson));

// Replace workspace references with file references for Docker
if (dockerPackageJson.dependencies) {
  Object.keys(dockerPackageJson.dependencies).forEach(key => {
    if (dockerPackageJson.dependencies[key].startsWith('workspace:')) {
      // Map workspace dependencies to .workspace-packages
      const packageName = key.replace('@emp/', '');
      dockerPackageJson.dependencies[key] = `file:.workspace-packages/${packageName}`;
    }
  });
}

// Write package.docker.json
const dockerPackagePath = path.join(__dirname, 'package.docker.json');
const dockerPackageContent = JSON.stringify(dockerPackageJson, null, 2);

// Check if content has changed
let shouldWrite = true;
if (fs.existsSync(dockerPackagePath)) {
  const existingContent = fs.readFileSync(dockerPackagePath, 'utf8');
  if (existingContent === dockerPackageContent) {
    console.log('✅ package.docker.json unchanged (preserving cache)');
    shouldWrite = false;
  }
}

if (shouldWrite) {
  fs.writeFileSync(dockerPackagePath, dockerPackageContent);
  console.log('✅ package.docker.json updated');
}

// Create .workspace-packages directory structure
const workspacePackagesDir = path.join(__dirname, '.workspace-packages');
if (!fs.existsSync(workspacePackagesDir)) {
  fs.mkdirSync(workspacePackagesDir, { recursive: true });
}

// Copy core package
const coreSourceDir = path.join(__dirname, '../../packages/core');
const coreTargetDir = path.join(workspacePackagesDir, 'core');

if (fs.existsSync(coreSourceDir)) {
  // Create target directory
  if (!fs.existsSync(coreTargetDir)) {
    fs.mkdirSync(coreTargetDir, { recursive: true });
  }
  
  // Copy package.json
  const corePackageJson = JSON.parse(fs.readFileSync(path.join(coreSourceDir, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(coreTargetDir, 'package.json'), JSON.stringify(corePackageJson, null, 2));
  
  // Copy dist directory if it exists
  const coreDistDir = path.join(coreSourceDir, 'dist');
  if (fs.existsSync(coreDistDir)) {
    const copyRecursive = (src, dest) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(file => {
          copyRecursive(path.join(src, file), path.join(dest, file));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };
    
    const targetDistDir = path.join(coreTargetDir, 'dist');
    copyRecursive(coreDistDir, targetDistDir);
    console.log('✅ Copied @emp/core package');
  }
}

// Step 3: Copy pnpm-lock.yaml from monorepo root (matching API pattern)
console.log('📋 Copying pnpm-lock.yaml...');
const monorepoRoot = path.join(__dirname, '../..');
const lockfileSrc = path.join(monorepoRoot, 'pnpm-lock.yaml');
const lockfileDest = path.join(__dirname, 'pnpm-lock.yaml');

if (fs.existsSync(lockfileSrc)) {
  fs.copyFileSync(lockfileSrc, lockfileDest);
  console.log('✅ Copied pnpm-lock.yaml');
} else {
  console.log('⚠️ pnpm-lock.yaml not found in monorepo root');
}

console.log('\n🎉 Docker build preparation complete!');
console.log('  Files prepared:');
console.log('    - package.docker.json');
console.log('    - .workspace-packages/');
console.log('    - pnpm-lock.yaml');

if (shouldWrite) {
  console.log('  Docker cache will be invalidated for changed layers');
} else {
  console.log('  ✨ No files changed - Docker cache will be fully utilized!');
}