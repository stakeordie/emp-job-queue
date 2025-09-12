#!/usr/bin/env node

/**
 * Generate Build Metadata
 * 
 * Creates build metadata files with timestamps and git info for each package
 * This runs during build and embeds the info into the built packages
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '..');

function getGitInfo() {
  try {
    const gitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const gitHashShort = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    const gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const gitCommitDate = execSync('git log -1 --format=%ci', { encoding: 'utf8' }).trim();
    const gitCommitMessage = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();
    
    return {
      hash: gitHash,
      hash_short: gitHashShort,
      branch: gitBranch,
      commit_date: gitCommitDate,
      commit_message: gitCommitMessage,
    };
  } catch (error) {
    console.warn('⚠️ Could not get git info:', error.message);
    return {
      hash: 'unknown',
      hash_short: 'unknown', 
      branch: 'unknown',
      commit_date: 'unknown',
      commit_message: 'unknown',
    };
  }
}

function generateBuildMetadata(packagePath, packageName) {
  const buildMetadata = {
    package_name: packageName,
    build_timestamp: new Date().toISOString(),
    build_timestamp_unix: Math.floor(Date.now() / 1000),
    build_date_readable: new Date().toLocaleString(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    git: getGitInfo(),
    builder: {
      user: process.env.USER || process.env.USERNAME || 'unknown',
      host: process.env.HOSTNAME || 'unknown',
      ci: !!process.env.CI,
      docker: fs.existsSync('/.dockerenv'),
    }
  };

  const metadataPath = path.join(packagePath, 'build-metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(buildMetadata, null, 2));
  
  console.log(`✅ Generated build metadata for ${packageName}: ${metadataPath}`);
  return buildMetadata;
}

function main() {
  const packageName = process.argv[2];
  const packagePath = process.argv[3] || process.cwd();

  if (!packageName) {
    console.error('❌ Usage: node generate-build-metadata.js <package-name> [package-path]');
    console.error('Example: node generate-build-metadata.js @emp/core packages/core');
    process.exit(1);
  }

  console.log(`🔧 Generating build metadata for ${packageName}...`);
  const metadata = generateBuildMetadata(packagePath, packageName);
  
  console.log(`📦 Package: ${metadata.package_name}`);
  console.log(`⏰ Built: ${metadata.build_date_readable}`);
  console.log(`🌿 Git: ${metadata.git.hash_short} (${metadata.git.branch})`);
  console.log(`💻 Platform: ${metadata.platform}/${metadata.arch} Node ${metadata.node_version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { generateBuildMetadata, getGitInfo };