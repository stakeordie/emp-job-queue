#!/usr/bin/env node

// This script prepares a modified package.json for Docker builds
// It replaces workspace:* references with file: references to avoid
// needing to modify package.json inside the Docker build (which breaks caching)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

// Replace workspace references with file references
if (packageJson.dependencies && packageJson.dependencies['@emp/service-config']) {
  packageJson.dependencies['@emp/service-config'] = 'file:.workspace-packages/service-config';
}

// Write the modified package.json
fs.writeFileSync(
  path.join(__dirname, 'package.docker.json'),
  JSON.stringify(packageJson, null, 2)
);

console.log('✅ Created package.docker.json with file: references for Docker build');