#!/usr/bin/env node

// Machine Docker build wrapper - matches API/webhook pattern
// 1. Prepare Docker build files (workspace packages + entrypoints)
// 2. Run docker compose build with profile

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.join(__dirname, '../..');

function runCommand(cmd, args, cwd = process.cwd(), env = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(cmd, args, {
      stdio: 'inherit',
      cwd,
      shell: true,
      env: { ...process.env, ...env }
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  try {
    // Parse command - handle build:push as single command
    const args = process.argv.slice(2);
    const command = args[0] === 'build:push' ? 'build:push' : 'build';
    const remainingArgs = args[0] === 'build:push' ? args.slice(1) : args;
    
    // Get profile from args (first non-command argument)
    const profile = remainingArgs[0];
    
    console.log('🔧 Step 1: Preparing Docker build files...');
    await runCommand('node', ['prepare-docker-build.js'], __dirname, {
      COMPOSE_PROFILES: profile
    });
    
    console.log('\n🐳 Step 2: Running docker compose command...');
    await runCommand('node', ['scripts/env/machine-compose.js', command, ...remainingArgs], MONOREPO_ROOT);
    
    console.log('\n✅ Machine build complete!');
  } catch (error) {
    console.error('❌ Machine build failed:', error.message);
    process.exit(1);
  }
}

main();