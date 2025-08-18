#!/usr/bin/env node

/**
 * Prepare Docker build files for webhook service
 * Based on API's prepare-docker-build.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Preparing Docker build files for webhook service...');

// Step 0: Build webhook service if needed
console.log('🏗️ Building webhook service...');

function runCommand(cmd, args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const process = spawn(cmd, args, {
      stdio: 'inherit',
      cwd,
      shell: true
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

try {
  await runCommand('pnpm', ['build'], __dirname);
  console.log('✅ Webhook service built successfully');
} catch (error) {
  console.log('⚠️ Webhook service build failed, using existing dist/');
}

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

// Copy required workspace packages (matching API pattern)
const copyWorkspacePackage = (packageName) => {
  const sourceDir = path.join(__dirname, '../../packages', packageName);
  const targetDir = path.join(workspacePackagesDir, packageName);

  if (fs.existsSync(sourceDir)) {
    // Create target directory
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // Copy package.json
    const packageJsonPath = path.join(sourceDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJsonContent, null, 2));
    }
    
    // Copy dist directory if it exists
    const distDir = path.join(sourceDir, 'dist');
    if (fs.existsSync(distDir)) {
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
      
      const targetDistDir = path.join(targetDir, 'dist');
      copyRecursive(distDir, targetDistDir);
    }
    
    console.log(`✅ Copied @emp/${packageName} package`);
  } else {
    console.warn(`⚠️ Package not found: ${sourceDir}`);
  }
};

// Copy both core and telemetry packages
copyWorkspacePackage('core');
copyWorkspacePackage('telemetry');

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

// Step 4: Copy inheritance-based entrypoint scripts
console.log('📋 Copying entrypoint scripts...');
const scriptsDir = path.join(__dirname, 'scripts');

if (fs.existsSync(scriptsDir)) {
  fs.rmSync(scriptsDir, { recursive: true, force: true });
}
fs.mkdirSync(scriptsDir, { recursive: true });

// Copy entrypoint scripts from project root
const entrypointScripts = [
  'entrypoint-base-common.sh',
  'entrypoint-apiwebhook-base.sh'
];

for (const script of entrypointScripts) {
  const srcPath = path.join(monorepoRoot, 'scripts', script);
  const destPath = path.join(scriptsDir, script);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copied ${script}`);
  } else {
    console.log(`  ⚠️ ${script} not found at ${srcPath}`);
  }
}

console.log('\n🎉 Docker build preparation complete!');
console.log('  Files prepared:');
console.log('    - package.docker.json');
console.log('    - .workspace-packages/');
console.log('    - pnpm-lock.yaml');
console.log('    - scripts/entrypoint-*.sh');

if (shouldWrite) {
  console.log('  Docker cache will be invalidated for changed layers');
} else {
  console.log('  ✨ No files changed - Docker cache will be fully utilized!');
}