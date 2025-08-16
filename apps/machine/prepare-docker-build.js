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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const envFile = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || '.env.production';
const encryptKey = args.find(arg => arg.startsWith('--key='))?.split('=')[1] || process.env.ENV_ENCRYPT_KEY;

console.log('🔧 Preparing Docker build files...\n');

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

// Replace workspace references with file references
if (packageJson.dependencies && packageJson.dependencies['@emp/service-config']) {
  packageJson.dependencies['@emp/service-config'] = 'file:.workspace-packages/service-config';
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

// Replace workspace references with file references
if (minimalPackageJson.dependencies && minimalPackageJson.dependencies['@emp/service-config']) {
  minimalPackageJson.dependencies['@emp/service-config'] = 'file:.workspace-packages/service-config';
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
  const regularEnvPath = path.join(__dirname, envFile);
  const secretEnvPath = path.join(__dirname, `.env.secret.${envFile.replace('.env.', '')}`);
  
  if (!fs.existsSync(regularEnvPath)) {
    throw new Error(`Environment file not found: ${regularEnvPath}`);
  }
  if (!fs.existsSync(secretEnvPath)) {
    throw new Error(`Secret environment file not found: ${secretEnvPath}`);
  }
  
  const regularEnv = parseEnv(fs.readFileSync(regularEnvPath, 'utf8'));
  const secretEnv = parseEnv(fs.readFileSync(secretEnvPath, 'utf8'));
  const allEnvVars = { ...regularEnv, ...secretEnv };
  
  console.log(`  Found ${Object.keys(regularEnv).length} regular variables`);
  console.log(`  Found ${Object.keys(secretEnv).length} secret variables`);
  console.log(`  Total: ${Object.keys(allEnvVars).length} variables`);
  
  // Generate or use provided encryption key
  let encryptionKey;
  if (!encryptKey) {
    encryptionKey = crypto.randomBytes(32);
    const keyBase64 = encryptionKey.toString('base64');
    console.log('\n⚠️  No encryption key provided. Generated new key:');
    console.log(`  ENV_ENCRYPT_KEY=${keyBase64}`);
    console.log('  Save this key for decryption!\n');
  } else {
    // Handle both base64 and non-base64 keys
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

console.log('\n🎉 Docker build preparation complete!');
if (packageChanged || encryptedChanged) {
  console.log('  Files updated:');
  if (packageChanged) {
    console.log('    - package.docker.json');
    console.log('    - package.minimal.docker.json');
  }
  if (encryptedChanged) console.log('    - env.encrypted');
  console.log('  Docker cache will be invalidated for changed layers');
} else {
  console.log('  ✨ No files changed - Docker cache will be fully utilized!');
}