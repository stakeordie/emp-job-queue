#!/usr/bin/env node

// This script prepares files for Docker build:
// 1. Creates package.docker.json with file: references (avoids runtime sed)
// 2. Encrypts environment variables to env.encrypted (avoids runtime encryption)
// Both optimizations preserve Docker layer caching

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get profile from environment (set by build-machine.js)
const profile = process.env.COMPOSE_PROFILES;
if (!profile) {
  throw new Error('COMPOSE_PROFILES environment variable is required');
}

// Get env file from docker-compose.yml profile
function getEnvFileFromProfile(profileName) {
  const composePath = path.join(__dirname, 'docker-compose.yml');
  if (!fs.existsSync(composePath)) {
    throw new Error(`docker-compose.yml not found at ${composePath}`);
  }
  
  const composeContent = fs.readFileSync(composePath, 'utf8');
  const composeData = yaml.load(composeContent);
  
  if (!composeData.services) {
    throw new Error('No services found in docker-compose.yml');
  }
  
  // Find the service with the matching profile
  for (const [serviceName, serviceConfig] of Object.entries(composeData.services)) {
    if (serviceConfig.profiles && serviceConfig.profiles.includes(profileName)) {
      if (!serviceConfig.env_file || serviceConfig.env_file.length === 0) {
        throw new Error(`No env_file found for profile ${profileName} in service ${serviceName}`);
      }
      return serviceConfig.env_file[0];
    }
  }
  
  throw new Error(`Profile ${profileName} not found in docker-compose.yml services`);
}

const envFile = getEnvFileFromProfile(profile);

console.log('🔧 Preparing Docker build files...\n');

// Step 0: Build workspace packages first
console.log('🏗️ Building workspace packages...');
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

const MONOREPO_ROOT = path.join(__dirname, '../..');

try {
  await runCommand('pnpm', ['--filter', '@emp/core', 'build'], MONOREPO_ROOT);
  await runCommand('pnpm', ['--filter', '@emp/service-config', 'build'], MONOREPO_ROOT);
  await runCommand('pnpm', ['--filter', '@emp/custom-nodes', 'build'], MONOREPO_ROOT);
  await runCommand('pnpm', ['--filter', '@emp/telemetry', 'build'], MONOREPO_ROOT);
  console.log('✅ All workspace packages built successfully');
} catch (error) {
  console.error('❌ Workspace package build failed:', error.message);
  console.error('💡 Fix the workspace package build errors before continuing with Docker build');
  process.exit(1);
}

// Track what changed (for final output)
let packageChanged = false;
let encryptedChanged = false;

// Step 1: Prepare package.docker.json files
console.log('📋 Creating package.docker.json files...');

// Sort all keys to ensure deterministic output (better caching)
function sortObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  
  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortObject(obj[key]);
  });
  return sorted;
}

// Process main package.json for GPU Dockerfile
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// Replace workspace references with file references (webhook pattern)
if (packageJson.dependencies) {
  Object.keys(packageJson.dependencies).forEach(key => {
    if (packageJson.dependencies[key].startsWith('workspace:')) {
      // Map workspace dependencies to .workspace-packages
      const packageName = key.replace('@emp/', '');
      packageJson.dependencies[key] = `file:.workspace-packages/${packageName}`;
    }
  });
}

const sortedPackageJson = sortObject(packageJson);
const newPackageContent = JSON.stringify(sortedPackageJson, null, 2);
const packageDockerPath = path.join(__dirname, 'package.docker.json');

// Only write if content has changed (preserves Docker cache)
if (fs.existsSync(packageDockerPath)) {
  const existingContent = fs.readFileSync(packageDockerPath, 'utf8');
  if (existingContent === newPackageContent) {
    console.log('✅ package.docker.json unchanged (preserving cache)');
  } else {
    packageChanged = true;
  }
} else {
  packageChanged = true;
}

if (packageChanged) {
  fs.writeFileSync(packageDockerPath, newPackageContent);
  console.log('✅ Created/updated package.docker.json');
}

// Process package.minimal.json for minimal Dockerfile
const minimalPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.minimal.json'), 'utf8'));

// Replace workspace references with file references (webhook pattern)
if (minimalPackageJson.dependencies) {
  Object.keys(minimalPackageJson.dependencies).forEach(key => {
    if (minimalPackageJson.dependencies[key].startsWith('workspace:')) {
      // Map workspace dependencies to .workspace-packages
      const packageName = key.replace('@emp/', '');
      minimalPackageJson.dependencies[key] = `file:.workspace-packages/${packageName}`;
    }
  });
}

const sortedMinimalPackageJson = sortObject(minimalPackageJson);
const newMinimalPackageContent = JSON.stringify(sortedMinimalPackageJson, null, 2);
const packageMinimalDockerPath = path.join(__dirname, 'package.minimal.docker.json');

// Only write if content has changed (preserves Docker cache)
if (fs.existsSync(packageMinimalDockerPath)) {
  const existingMinimalContent = fs.readFileSync(packageMinimalDockerPath, 'utf8');
  if (existingMinimalContent === newMinimalPackageContent) {
    console.log('✅ package.minimal.docker.json unchanged (preserving cache)\n');
  } else {
    packageChanged = true;
  }
} else {
  packageChanged = true;
}

if (packageChanged) {
  fs.writeFileSync(packageMinimalDockerPath, newMinimalPackageContent);
  console.log('✅ Created/updated package.minimal.docker.json\n');
}

// Step 2: Encrypt environment variables
console.log('🔐 Encrypting environment variables...');

// Parse .env files (simple parser to avoid dependencies)
function parseEnv(content) {
  const result = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        result[key.trim()] = valueParts.join('=').trim();
      }
    }
  }
  return result;
}

try {
  // Load environment files
  let regularEnv = {};
  let secretEnv = {};
  
  if (envFile.includes('.secret.')) {
    // envFile is already a secret file from docker-compose
    const secretEnvPath = path.join(__dirname, envFile);
    if (!fs.existsSync(secretEnvPath)) {
      throw new Error(`Secret environment file not found: ${secretEnvPath}`);
    }
    secretEnv = parseEnv(fs.readFileSync(secretEnvPath, 'utf8'));
    
    // Also try to load regular env file
    const envName = envFile.replace('.env.secret.', '');
    const regularEnvPath = path.join(__dirname, `.env.${envName}`);
    if (fs.existsSync(regularEnvPath)) {
      regularEnv = parseEnv(fs.readFileSync(regularEnvPath, 'utf8'));
    }
  } else {
    // envFile is a regular env file
    const regularEnvPath = path.join(__dirname, envFile);
    const secretEnvPath = path.join(__dirname, `.env.secret.${envFile.replace('.env.', '')}`);
    
    if (!fs.existsSync(regularEnvPath)) {
      throw new Error(`Environment file not found: ${regularEnvPath}`);
    }
    if (!fs.existsSync(secretEnvPath)) {
      throw new Error(`Secret environment file not found: ${secretEnvPath}`);
    }
    
    regularEnv = parseEnv(fs.readFileSync(regularEnvPath, 'utf8'));
    secretEnv = parseEnv(fs.readFileSync(secretEnvPath, 'utf8'));
  }
  
  const allEnvVars = { ...regularEnv, ...secretEnv };
  
  console.log(`  Found ${Object.keys(regularEnv).length} regular variables`);
  console.log(`  Found ${Object.keys(secretEnv).length} secret variables`);
  console.log(`  Total: ${Object.keys(allEnvVars).length} variables`);
  
  // Get encryption key from loaded env vars
  const encryptKey = allEnvVars.ENV_ENCRYPT_KEY;
  
  // Encryption key is required
  if (!encryptKey) {
    throw new Error('ENV_ENCRYPT_KEY is required for encryption. No fallback key generation.');
  }
  
  // Handle both base64 and non-base64 keys
  let encryptionKey;
  try {
    encryptionKey = Buffer.from(encryptKey, 'base64');
    if (encryptionKey.length !== 32) {
      throw new Error('Invalid key length');
    }
  } catch (e) {
    // If not valid base64, hash the key to get 32 bytes
    console.log('  Key is not base64, using SHA256 hash...');
    encryptionKey = crypto.createHash('sha256').update(encryptKey).digest();
  }
  
  // Compress and encrypt
  const jsonData = JSON.stringify(allEnvVars);
  const compressedData = zlib.gzipSync(jsonData);
  
  // Use deterministic IV based on content hash for caching
  // This is safe because we're using HMAC for authentication
  const contentHash = crypto.createHash('sha256').update(jsonData).digest();
  const iv = contentHash.slice(0, 16); // First 16 bytes of content hash as IV
  
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
  const encrypted = Buffer.concat([iv, cipher.update(compressedData), cipher.final()]);
  
  // Add HMAC for authentication
  const hmac = crypto.createHmac('sha256', encryptionKey);
  hmac.update(encrypted);
  const authTag = hmac.digest();
  
  const encryptedPayload = Buffer.concat([encrypted, authTag]);
  const encryptedBase64 = encryptedPayload.toString('base64');
  const encryptedPath = path.join(__dirname, 'env.encrypted');
  
  // Only write encrypted file if content has changed (preserves Docker cache)
  if (fs.existsSync(encryptedPath)) {
    const existingEncrypted = fs.readFileSync(encryptedPath, 'utf8');
    if (existingEncrypted === encryptedBase64) {
      console.log('\n✅ env.encrypted unchanged (preserving cache)');
    } else {
      encryptedChanged = true;
    }
  } else {
    encryptedChanged = true;
  }
  
  if (encryptedChanged) {
    fs.writeFileSync(encryptedPath, encryptedBase64);
    console.log('\n✅ Encryption complete:');
    console.log(`  Original size: ${jsonData.length} bytes`);
    console.log(`  Compressed: ${compressedData.length} bytes (${Math.round((1 - compressedData.length/jsonData.length) * 100)}% reduction)`);
    console.log(`  Encrypted: ${encryptedPayload.length} bytes`);
    console.log(`  Output: env.encrypted`);
  }
  
  // Info file for reference (always update since it has timestamp)
  const info = {
    created: new Date().toISOString(),
    environment: envFile,
    variables: Object.keys(allEnvVars).length,
    originalSize: jsonData.length,
    compressedSize: compressedData.length,
    encryptedSize: encryptedPayload.length,
    compressionRatio: `${Math.round((1 - compressedData.length/jsonData.length) * 100)}%`
  };
  
  const infoPath = path.join(__dirname, 'env.encrypted.info');
  // Don't write info file if nothing changed
  if (packageChanged || encryptedChanged) {
    fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));
  }
  
} catch (error) {
  console.error('❌ Encryption failed:', error.message);
  process.exit(1);
}

// Step 3: Copy workspace packages (webhook pattern)
console.log('\n📦 Copying workspace packages...');

const workspacePackagesDir = path.join(__dirname, '.workspace-packages');
if (!fs.existsSync(workspacePackagesDir)) {
  fs.mkdirSync(workspacePackagesDir, { recursive: true });
}

const copyWorkspacePackage = (packageName) => {
  const sourceDir = path.join(__dirname, '../../packages', packageName);
  const targetDir = path.join(workspacePackagesDir, packageName);

  if (fs.existsSync(sourceDir)) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const packageJsonPath = path.join(sourceDir, 'package.json');
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
      
      fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJsonContent, null, 2));
    }
    
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

copyWorkspacePackage('core');
copyWorkspacePackage('service-config');
copyWorkspacePackage('custom-nodes');
copyWorkspacePackage('telemetry');

// Step 4: Copy entrypoint scripts (webhook pattern)
console.log('\n📋 Copying entrypoint scripts...');
const scriptsDir = path.join(__dirname, 'scripts');

if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

const entrypointScripts = ['entrypoint-base-common.sh'];
for (const script of entrypointScripts) {
  const srcPath = path.join(__dirname, '../../scripts', script);
  const destPath = path.join(scriptsDir, script);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`  Copied ${script}`);
  } else {
    console.log(`  ⚠️ ${script} not found at ${srcPath}`);
  }
}

console.log('\n🎉 Docker build preparation complete!');
if (packageChanged || encryptedChanged) {
  console.log('  Files updated:');
  if (packageChanged) {
    console.log('    - package.docker.json');
    console.log('    - package.minimal.docker.json');
  }
  if (encryptedChanged) console.log('    - env.encrypted');
  console.log('    - .workspace-packages/');
  console.log('    - scripts/entrypoint-*.sh');
  console.log('  Docker cache will be invalidated for changed layers');
} else {
  console.log('  ✨ No files changed - Docker cache will be fully utilized!');
}