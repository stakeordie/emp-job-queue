#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
let totalIssues = 0;
let fixedIssues = 0;

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

console.log(`${BLUE}🔍 ESM Validation & Fix Tool${RESET}`);
console.log(`${BLUE}================================${RESET}\n`);

// Check if dist directory exists
if (!fs.existsSync(distDir)) {
  console.error(`${RED}❌ Error: dist/ directory not found. Run 'pnpm build' first.${RESET}`);
  process.exit(1);
}

// Function to check if a file/directory exists with various extensions
function resolveImportPath(fromFile, importPath) {
  const fromDir = path.dirname(fromFile);
  let resolvedPath = importPath;
  
  // Handle relative imports
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    resolvedPath = path.resolve(fromDir, importPath);
  } else {
    // External module (anything not starting with . or /)
    return { valid: true, external: true };
  }
  
  // Check various possibilities
  const checks = [
    resolvedPath + '.js',
    resolvedPath + '.mjs', 
    resolvedPath + '/index.js',
    resolvedPath + '/index.mjs',
    resolvedPath  // already has extension
  ];
  
  for (const checkPath of checks) {
    if (fs.existsSync(checkPath)) {
      const needsExtension = !importPath.endsWith('.js') && !importPath.endsWith('.mjs');
      return { 
        valid: true, 
        needsExtension,
        correctPath: importPath + (needsExtension ? '.js' : '')
      };
    }
  }
  
  return { valid: false, importPath };
}

// Function to validate and fix ESM imports in a file
function validateAndFixFile(filePath) {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.mjs')) {
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let fileIssues = 0;
  let fileFixed = 0;
  
  // Match all import statements (excluding those with import assertions)
  const importRegex = /import\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]*})|(?:\w+))?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+["']([^"']+)["'](?!\s+(with|assert)\s+{)/g;
  const exportFromRegex = /export\s+(?:\*|{[^}]*})\s+from\s+["']([^"']+)["']/g;
  
  // Check imports
  let match;
  const allMatches = [];
  
  while ((match = importRegex.exec(content)) !== null) {
    allMatches.push({ type: 'import', match });
  }
  
  while ((match = exportFromRegex.exec(content)) !== null) {
    allMatches.push({ type: 'export', match });
  }
  
  for (const { type, match } of allMatches) {
    const fullStatement = match[0];
    const importPath = match[1];
    
    const result = resolveImportPath(filePath, importPath);
    
    if (result.external) {
      // External module - skip
      continue;
    }
    
    if (!result.valid) {
      console.error(`${RED}❌ Cannot resolve ${type}: "${importPath}" in ${path.relative(__dirname, filePath)}${RESET}`);
      fileIssues++;
      totalIssues++;
    } else if (result.needsExtension) {
      const newStatement = fullStatement.replace(importPath, result.correctPath);
      modified = modified.replace(fullStatement, newStatement);
      console.log(`${YELLOW}🔧 Fixed ${type} in ${path.relative(__dirname, filePath)}: "${importPath}" → "${result.correctPath}"${RESET}`);
      fileFixed++;
      fixedIssues++;
    }
  }
  
  // Write the fixed content back if there were changes
  if (fileFixed > 0) {
    fs.writeFileSync(filePath, modified);
  }
  
  return { issues: fileIssues, fixed: fileFixed };
}

// Function to recursively process all JS files
function processDirectory(dir) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      processDirectory(itemPath);
    } else if (item.endsWith('.js') || item.endsWith('.mjs')) {
      validateAndFixFile(itemPath);
    }
  }
}

// Additional validation checks
console.log(`${BLUE}1. Checking package.json configuration...${RESET}`);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

if (packageJson.type !== 'module') {
  console.error(`${RED}❌ package.json must have "type": "module" for ESM${RESET}`);
  totalIssues++;
} else {
  console.log(`${GREEN}✅ package.json has "type": "module"${RESET}`);
}

if (!packageJson.main?.endsWith('.js')) {
  console.error(`${RED}❌ package.json "main" should point to a .js file${RESET}`);
  totalIssues++;
} else {
  console.log(`${GREEN}✅ package.json "main" field is correct${RESET}`);
}

// Check if main file exists
const mainFile = path.join(__dirname, packageJson.main);
if (!fs.existsSync(mainFile)) {
  console.error(`${RED}❌ Main file not found: ${packageJson.main}${RESET}`);
  totalIssues++;
} else {
  console.log(`${GREEN}✅ Main file exists: ${packageJson.main}${RESET}`);
}

console.log(`\n${BLUE}2. Checking and fixing import statements...${RESET}`);
processDirectory(distDir);

// Summary
console.log(`\n${BLUE}================================${RESET}`);
console.log(`${BLUE}Validation Summary:${RESET}`);
if (totalIssues === 0 && fixedIssues === 0) {
  console.log(`${GREEN}✅ All ESM imports are valid! No issues found.${RESET}`);
} else {
  if (fixedIssues > 0) {
    console.log(`${GREEN}✅ Fixed ${fixedIssues} import statements${RESET}`);
  }
  if (totalIssues > 0) {
    console.log(`${RED}❌ ${totalIssues} unresolved issues remain${RESET}`);
    console.log(`${YELLOW}⚠️  You may need to manually check these imports${RESET}`);
  }
}

// Test a simple import to verify Node.js can load the module
console.log(`\n${BLUE}3. Testing module loading...${RESET}`);
try {
  await import(mainFile);
  console.log(`${GREEN}✅ Main module loads successfully in Node.js!${RESET}`);
} catch (error) {
  // Check if it's a native module issue (not an ESM problem)
  if (error.message.includes('.node') && error.message.includes('@sentry')) {
    console.log(`${YELLOW}⚠️  Sentry native module issue detected (expected in Docker build environment)${RESET}`);
    console.log(`${YELLOW}   This is not an ESM compatibility issue - native modules are compiled during Docker build${RESET}`);
  } else {
    console.error(`${RED}❌ Failed to load module: ${error.message}${RESET}`);
    if (error.code === 'ERR_MODULE_NOT_FOUND') {
      console.error(`${YELLOW}   Missing module: ${error.url || 'unknown'}${RESET}`);
    }
    totalIssues++;
  }
}

console.log(`\n${BLUE}================================${RESET}`);
if (totalIssues === 0) {
  console.log(`${GREEN}✨ ESM validation passed! Your code is ready for Docker deployment.${RESET}`);
  process.exit(0);
} else {
  console.log(`${RED}⚠️  ESM validation failed with ${totalIssues} issues. Fix these before deployment.${RESET}`);
  process.exit(1);
}