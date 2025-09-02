#!/usr/bin/env node

// Prepare EmProps API Docker build - following API pattern
// 1. Creates workspace packages
// 2. Creates optimized package.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = __dirname;
const MONOREPO_ROOT = path.resolve(__dirname, '../..');

console.log('🔧 Preparing EmProps API Docker build files...\n');

// Step 0: Build EmProps API if needed
console.log('🏗️ Building EmProps API...');
import { spawn } from 'child_process';

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
  await runCommand('pnpm', ['build'], APP_ROOT);
  console.log('✅ EmProps API built successfully');
} catch (error) {
  console.error('❌ EmProps API build failed:', error.message);
  console.error('💡 Fix the EmProps API build errors before continuing with Docker build');
  process.exit(1);
}

// Step 1: Create workspace packages directory
const workspacePackagesDir = path.join(APP_ROOT, '.workspace-packages');
console.log('📦 Creating workspace packages...');

if (fs.existsSync(workspacePackagesDir)) {
  fs.rmSync(workspacePackagesDir, { recursive: true, force: true });
}
fs.mkdirSync(workspacePackagesDir, { recursive: true });

// Step 1.5: Validate workspace packages are built
console.log('🔍 Validating workspace packages...');
const requiredPackages = ['core', 'telemetry', 'database'];
for (const pkg of requiredPackages) {
  const pkgPath = path.join(MONOREPO_ROOT, 'packages', pkg);
  const distPath = path.join(pkgPath, 'dist');
  const indexPath = path.join(distPath, 'index.js');
  
  if (!fs.existsSync(distPath)) {
    console.error(`❌ Package @emp/${pkg} dist/ directory missing at ${distPath}`);
    console.error(`💡 Run: pnpm --filter @emp/${pkg} build`);
    process.exit(1);
  }
  
  if (!fs.existsSync(indexPath)) {
    console.error(`❌ Package @emp/${pkg} missing index.js at ${indexPath}`);
    console.error(`💡 Run: pnpm --filter @emp/${pkg} build`);
    process.exit(1);
  }
  
  console.log(`  ✅ @emp/${pkg} build validated`);
}
console.log('✅ All workspace packages validated');

// Copy workspace packages with dependency conversion
const copyWorkspacePackage = (packageName) => {
  const sourceDir = path.join(MONOREPO_ROOT, 'packages', packageName);
  const targetDir = path.join(workspacePackagesDir, packageName);

  console.log(`  Copying ${packageName}: ${sourceDir} → ${targetDir}`);
  
  // Copy entire package first
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  
  // Convert workspace dependencies in package.json
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJsonContent = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Convert workspace dependencies to file references
    if (packageJsonContent.dependencies) {
      Object.keys(packageJsonContent.dependencies).forEach(key => {
        if (packageJsonContent.dependencies[key].startsWith('workspace:')) {
          const packageName = key.replace('@emp/', '');
          packageJsonContent.dependencies[key] = `file:../${packageName}`;
        }
      });
    }
    
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonContent, null, 2));
  }
};

// Copy required packages
requiredPackages.forEach(pkg => copyWorkspacePackage(pkg));

// Step 2: Create optimized package.json
console.log('📋 Creating optimized package.json...');

const originalPackage = JSON.parse(
  fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')
);

// Replace workspace references with file references and remove Docker-incompatible scripts
const optimizedPackage = { ...originalPackage };
// Convert workspace dependencies to file references
if (optimizedPackage.dependencies) {
  Object.keys(optimizedPackage.dependencies).forEach(key => {
    if (optimizedPackage.dependencies[key].startsWith('workspace:')) {
      const packageName = key.replace('@emp/', '');
      optimizedPackage.dependencies[key] = `file:.workspace-packages/${packageName}`;
      console.log(`  ✅ Converted ${key} to file reference`);
    }
  });
}

// Remove husky prepare script that fails in Docker environment
if (optimizedPackage.scripts && optimizedPackage.scripts.prepare) {
  delete optimizedPackage.scripts.prepare;
  console.log('  ⚠️ Removed husky prepare script (not available in Docker build)');
}

// Sort for deterministic output
function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObject(obj[key]);
  });
  return sorted;
}

const sortedPackage = sortObject(optimizedPackage);
const packageDockerPath = path.join(APP_ROOT, 'package.docker.json');

fs.writeFileSync(packageDockerPath, JSON.stringify(sortedPackage, null, 2));
console.log('✅ Created package.docker.json');

// Step 3: Copy pnpm-lock.yaml from monorepo root
console.log('📋 Copying pnpm-lock.yaml...');
const lockfileSrc = path.join(MONOREPO_ROOT, 'pnpm-lock.yaml');
const lockfileDest = path.join(APP_ROOT, 'pnpm-lock.yaml');

if (fs.existsSync(lockfileSrc)) {
  fs.copyFileSync(lockfileSrc, lockfileDest);
  console.log('✅ Copied pnpm-lock.yaml');
} else {
  console.log('⚠️ pnpm-lock.yaml not found in monorepo root');
}

// Step 4: Copy inheritance-based entrypoint scripts
console.log('📋 Copying entrypoint scripts...');
const scriptsDir = path.join(APP_ROOT, 'scripts');

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
  const srcPath = path.join(MONOREPO_ROOT, 'scripts', script);
  const destPath = path.join(scriptsDir, script);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copied ${script}`);
  } else {
    console.log(`  ⚠️ ${script} not found at ${srcPath}`);
  }
}

// Step 5: Ensure other required files exist
console.log('📋 Checking for required Docker build files...');

// These files should already exist in the EmProps API directory
const requiredFiles = [
  'entrypoint-emprops-api-final.sh',
  'install-telemetry-stack.sh',
  'conf/fluent-bit-emprops-api.conf.template',
  'conf/fluent-bit-emprops-api-forward.conf.template',
  'conf/otel-collector-emprops-api.yaml.template'
];

let allFilesExist = true;
for (const file of requiredFiles) {
  const filePath = path.join(APP_ROOT, file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file} exists`);
  } else {
    console.log(`  ❌ ${file} is MISSING!`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.error('\n❌ Some required files are missing! Docker build will fail.');
  process.exit(1);
}

console.log('\n🎉 EmProps API Docker build preparation complete!');
console.log('  Files created:');
console.log('    - .workspace-packages/database/');
console.log('    - package.docker.json');
console.log('    - pnpm-lock.yaml');
console.log('    - scripts/entrypoint-*.sh');
console.log('    - All required telemetry config files verified');