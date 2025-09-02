#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src');

function fixPrismaImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = content;
  
  // First, find all Prisma imports and separate them
  const importRegex = /import\s*{\s*([^}]*)\s*}\s*from\s*['"]@emp\/database['"];?/g;
  const matches = Array.from(content.matchAll(importRegex));
  
  if (matches.length === 0) {
    return false;
  }
  
  matches.forEach(match => {
    const fullImport = match[0];
    const imports = match[1];
    
    const importList = imports.split(',').map(imp => imp.trim()).filter(Boolean);
    const typeOnlyImports = [];
    const mixedImports = [];
    
    importList.forEach(imp => {
      if (imp === 'PrismaClient') {
        // Check if PrismaClient is used as a value anywhere (not just type annotation)
        const valueUsageRegex = new RegExp(`\\b(?:new\\s+PrismaClient|PrismaClient\\s*\\(|=\\s*PrismaClient)`, 'g');
        if (valueUsageRegex.test(content)) {
          mixedImports.push(imp); // Used as value, so regular import
        } else {
          typeOnlyImports.push(imp); // Only used as type
        }
      } else if (imp.includes('social_org_enum')) {
        // Check if enum is used as value
        const enumValueUsage = new RegExp(`social_org_enum\\.(\\w+)`, 'g');
        if (enumValueUsage.test(content)) {
          mixedImports.push(imp); // Used as value
        } else {
          typeOnlyImports.push(imp); // Only used as type
        }
      } else {
        mixedImports.push(imp); // Other imports stay regular
      }
    });
    
    // Build the replacement import
    let newImport = '';
    if (typeOnlyImports.length > 0 && mixedImports.length > 0) {
      // Mixed import needed
      newImport = `import { type ${typeOnlyImports.join(', type ')}, ${mixedImports.join(', ')} } from '@emp/database';`;
    } else if (typeOnlyImports.length > 0) {
      // Only type imports
      newImport = `import { type ${typeOnlyImports.join(', type ')} } from '@emp/database';`;
    } else {
      // Only regular imports
      newImport = `import { ${mixedImports.join(', ')} } from '@emp/database';`;
    }
    
    updated = updated.replace(fullImport, newImport);
  });
  
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    console.log(`✅ Fixed ${filePath}`);
    return true;
  }
  return false;
}

function processDirectory(dir) {
  const items = fs.readdirSync(dir);
  let fixedFiles = 0;
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      fixedFiles += processDirectory(itemPath);
    } else if (item.endsWith('.ts') && !item.endsWith('.d.ts')) {
      if (fixPrismaImports(itemPath)) {
        fixedFiles++;
      }
    }
  }
  
  return fixedFiles;
}

console.log('🔧 Fixing Prisma type/value imports for ESM...');
const fixedCount = processDirectory(srcDir);
console.log(`✅ Fixed ${fixedCount} files with Prisma imports`);