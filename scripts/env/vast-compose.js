#!/usr/bin/env node
/**
 * VAST.ai development container runner
 * Usage: pnpm vast:pull:run comfyui-production
 * 
 * Uses the same environment setup as machine:run but with emprops/deploydev image
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const action = process.argv[2];
const imageTag = process.argv[3]; // e.g., comfyui-production

if (action !== 'pull:run' || !imageTag) {
  console.error('❌ Error: Invalid usage');
  console.error('Usage: node scripts/env/vast-compose.js pull:run comfyui-production');
  process.exit(1);
}

// Use the same logic as machine-compose.js to get environment from profile
const MACHINE_DIR = path.join(__dirname, '../../apps/machine');

function loadAllEnvVars(envName = 'local-dev') {
  const envPath = path.join(MACHINE_DIR, `.env.${envName}`);
  const secretPath = path.join(MACHINE_DIR, `.env.secret.${envName}`);
  
  let regularEnv = {};
  let secretEnv = {};
  
  // Load regular env file
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        regularEnv[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  
  // Load secret env file  
  if (fs.existsSync(secretPath)) {
    const content = fs.readFileSync(secretPath, 'utf8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        secretEnv[key.trim()] = valueParts.join('=').trim();
      }
    });
  }
  
  // Secret vars override regular vars
  return { ...regularEnv, ...secretEnv };
}

function getEnvironmentFromProfile(profile) {
  try {
    const composeFile = path.join(MACHINE_DIR, 'docker-compose.yml');
    if (!fs.existsSync(composeFile)) {
      console.warn(`docker-compose.yml not found, using fallback environment detection`);
      // Fallback: derive from profile name
      if (profile.includes('-')) {
        const parts = profile.split('-');
        if (parts.length >= 2) {
          return parts.slice(1).join('-'); // everything after first dash
        }
      }
      return 'local-dev';
    }

    // Simple parsing - look for env_file in the profile service
    const composeContent = fs.readFileSync(composeFile, 'utf8');
    const envFileMatch = composeContent.match(new RegExp(`${profile}:.*?env_file:.*?\\.env\\.secret\\.([^\\s]+)`, 's'));
    
    if (envFileMatch && envFileMatch[1]) {
      return envFileMatch[1];
    }
    
    // Fallback: derive from profile name
    if (profile.includes('-')) {
      const parts = profile.split('-');
      if (parts.length >= 2) {
        return parts.slice(1).join('-'); // everything after first dash
      }
    }
    
    return 'local-dev'; // default
  } catch (error) {
    console.warn(`Warning: Could not determine environment from profile: ${error.message}`);
    return 'local-dev';
  }
}

const envName = getEnvironmentFromProfile(imageTag);
const allEnvVars = loadAllEnvVars(envName);

const devImage = `emprops/deploydev:${imageTag}`;

console.log(`📥 Pulling development image: ${devImage}`);
try {
  execSync(`docker pull ${devImage}`, { stdio: 'inherit' });
} catch (error) {
  console.error(`❌ Failed to pull image: ${devImage}`);
  console.error('Make sure the image exists on Docker Hub');
  process.exit(1);
}

// Build docker run command with same environment as machine:run
const envFlags = Object.entries(allEnvVars)
  .map(([key, value]) => `-e ${key}="${value}"`)
  .join(' ');

const dockerCmd = `docker run -it --rm ${envFlags} -w /workspace --entrypoint /scripts/entrypoint-base-dev.sh ${devImage}`;

console.log(`🚀 Running development container: ${devImage}`);
console.log(`Environment: ${envName}`);
try {
  execSync(dockerCmd, { stdio: 'inherit' });
} catch (error) {
  // Container exit is normal, don't treat as error
  if (error.status !== 130) { // 130 is Ctrl+C
    process.exit(error.status || 1);
  }
}