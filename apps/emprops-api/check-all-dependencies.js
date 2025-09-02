#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

console.log('🔍 Comprehensive Dependency Check');
console.log('================================\n');

// Read package.json to get current dependencies
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const currentDeps = new Set([
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {})
]);

// Built-in Node.js modules that don't need to be installed
const builtinModules = new Set([
  'fs', 'path', 'url', 'http', 'https', 'crypto', 'events', 'util', 
  'stream', 'buffer', 'os', 'child_process', 'cluster', 'net', 'tls',
  'querystring', 'zlib', 'readline', 'timers', 'worker_threads'
]);

// Extract all import statements from JS files
function extractImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = new Set();
  
  // Match import statements
  const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]*})|(?:\w+))?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+["']([^"']+)["']/g;
  let match;
  
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];
    
    // Skip relative imports and built-in modules
    if (!importPath.startsWith('./') && !importPath.startsWith('../') && !builtinModules.has(importPath)) {
      // Extract package name (handle scoped packages)
      const packageName = importPath.startsWith('@') 
        ? importPath.split('/').slice(0, 2).join('/')
        : importPath.split('/')[0];
      imports.add(packageName);
    }
  }
  
  return imports;
}

// Recursively scan all JS files
function scanDirectory(dir) {
  const allImports = new Set();
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      const subImports = scanDirectory(itemPath);
      subImports.forEach(imp => allImports.add(imp));
    } else if (item.endsWith('.js')) {
      const fileImports = extractImports(itemPath);
      fileImports.forEach(imp => allImports.add(imp));
    }
  }
  
  return allImports;
}

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Run pnpm build first.');
  process.exit(1);
}

console.log('📦 Scanning all imports in dist/ directory...');
const allImports = scanDirectory(distDir);

console.log(`\n📋 Found ${allImports.size} unique package imports:`);
const sortedImports = Array.from(allImports).sort();
sortedImports.forEach(imp => console.log(`   - ${imp}`));

console.log(`\n🔍 Checking against current dependencies...`);
const missingDeps = [];
const presentDeps = [];

for (const importName of allImports) {
  if (currentDeps.has(importName)) {
    presentDeps.push(importName);
  } else {
    missingDeps.push(importName);
  }
}

if (missingDeps.length === 0) {
  console.log('✅ All dependencies are present in package.json!');
} else {
  console.log(`\n❌ Missing ${missingDeps.length} dependencies:`);
  missingDeps.forEach(dep => console.log(`   - ${dep}`));
  
  console.log(`\n💡 To fix, add these to package.json dependencies:`);
  missingDeps.forEach(dep => console.log(`   "${dep}": "^<version>",`));
  
  console.log(`\n🚀 Quick fix command:`);
  console.log(`pnpm add ${missingDeps.join(' ')}`);
}

console.log(`\n✅ Present dependencies (${presentDeps.length}):`);
presentDeps.forEach(dep => console.log(`   ✓ ${dep}`));

console.log('\n================================');
if (missingDeps.length === 0) {
  console.log('🎉 All dependencies satisfied! Ready for deployment.');
  process.exit(0);
} else {
  console.log(`⚠️  ${missingDeps.length} missing dependencies found. Fix before deployment.`);
  process.exit(1);
}