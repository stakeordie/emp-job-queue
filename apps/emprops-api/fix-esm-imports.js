#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

console.log('🔧 Fixing ESM imports in dist directory...');

function fixImportsInFile(filePath) {
  if (!filePath.endsWith('.js')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Fix relative imports to add .js extension
  content = content.replace(
    /(\bimport\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]*})|(?:\w+))?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+["'])([^"']+)(["'])/g,
    (match, prefix, importPath, suffix) => {
      // Skip external modules and already fixed imports
      if (importPath.startsWith('@') || 
          importPath.includes('node_modules') || 
          !importPath.startsWith('./') && !importPath.startsWith('../') ||
          importPath.endsWith('.js') ||
          importPath.endsWith('.json')) {
        return match;
      }
      
      // Check if it's a directory with index.js
      const fromDir = path.dirname(filePath);
      const resolvedPath = path.resolve(fromDir, importPath);
      const indexPath = path.join(resolvedPath, 'index.js');
      
      if (importPath === '.') {
        // Handle current directory import
        if (fs.existsSync(path.join(fromDir, 'index.js'))) {
          modified = true;
          return `${prefix}./index.js${suffix}`;
        }
      } else if (fs.existsSync(indexPath)) {
        modified = true;
        return `${prefix}${importPath}/index.js${suffix}`;
      } else if (fs.existsSync(resolvedPath + '.js')) {
        modified = true;
        return `${prefix}${importPath}.js${suffix}`;
      }
      
      return match;
    }
  );
  
  // Fix bare directory imports like: from "."
  content = content.replace(
    /(\bimport\s+(?:(?:\*\s+as\s+\w+)|(?:{[^}]*})|(?:\w+))?\s*(?:,\s*(?:{[^}]*}|\w+))?\s*from\s+["'])(\.)(\s*["'])/g,
    (match, prefix, dot, suffix) => {
      modified = true;
      return `${prefix}${dot}/index.js${suffix}`;
    }
  );
  
  // Fix export from statements
  content = content.replace(
    /(\bexport\s+(?:\*|{[^}]*})\s+from\s+["'])([^"']+)(["'])/g,
    (match, prefix, importPath, suffix) => {
      if (importPath.startsWith('@') || 
          importPath.includes('node_modules') || 
          !importPath.startsWith('./') && !importPath.startsWith('../') ||
          importPath.endsWith('.js') ||
          importPath.endsWith('.json')) {
        return match;
      }
      
      const fromDir = path.dirname(filePath);
      const resolvedPath = path.resolve(fromDir, importPath);
      const indexPath = path.join(resolvedPath, 'index.js');
      
      if (importPath === '.') {
        // Handle current directory import
        if (fs.existsSync(path.join(fromDir, 'index.js'))) {
          modified = true;
          return `${prefix}./index.js${suffix}`;
        }
      } else if (fs.existsSync(indexPath)) {
        modified = true;
        return `${prefix}${importPath}/index.js${suffix}`;
      } else if (fs.existsSync(resolvedPath + '.js')) {
        modified = true;
        return `${prefix}${importPath}.js${suffix}`;
      }
      
      return match;
    }
  );
  
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`  ✅ Fixed ${path.relative(distDir, filePath)}`);
  }
}

function processDirectory(dir) {
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    
    try {
      const stat = fs.statSync(itemPath);
      
      if (stat.isDirectory()) {
        processDirectory(itemPath);
      } else if (item.endsWith('.js')) {
        fixImportsInFile(itemPath);
      }
    } catch (error) {
      // Skip broken symlinks or inaccessible files
      if (error.code === 'ENOENT') {
        console.log(`  ⚠️ Skipping broken symlink or missing file: ${path.relative(dir, itemPath)}`);
        continue;
      }
      throw error;
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('❌ dist/ directory not found. Run pnpm build first.');
  process.exit(1);
}

processDirectory(distDir);
console.log('✨ ESM imports fixed successfully!');