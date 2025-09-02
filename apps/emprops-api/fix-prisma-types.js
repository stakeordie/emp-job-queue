#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const srcDir = path.join(process.cwd(), 'src');

function fixPrismaImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let updated = content;
  
  // Fix import statements - add 'type' for Prisma types
  updated = updated.replace(
    /import\s*{\s*([^}]*PrismaClient[^}]*)\s*}\s*from\s*['"]@emp\/database['"];?/g,
    (match, imports) => {
      // Split imports and add 'type' to PrismaClient
      const importList = imports.split(',').map(imp => {
        const trimmed = imp.trim();
        if (trimmed === 'PrismaClient') {
          return 'type PrismaClient';
        }
        return trimmed;
      });
      return `import { ${importList.join(', ')} } from '@emp/database';`;
    }
  );
  
  // Fix Prisma enum imports 
  updated = updated.replace(
    /import\s*{\s*([^}]*social_org_enum[^}]*)\s*}\s*from\s*['"]@emp\/database['"];?/g,
    (match, imports) => {
      const importList = imports.split(',').map(imp => {
        const trimmed = imp.trim();
        if (trimmed.includes('social_org_enum')) {
          return `type ${trimmed}`;
        }
        return trimmed;
      });
      return `import { ${importList.join(', ')} } from '@emp/database';`;
    }
  );
  
  // Fix combined imports with both types
  updated = updated.replace(
    /import\s*{\s*([^}]*(?:PrismaClient|social_org_enum)[^}]*)\s*}\s*from\s*['"]@emp\/database['"];?/g,
    (match, imports) => {
      const importList = imports.split(',').map(imp => {
        const trimmed = imp.trim();
        if (trimmed === 'PrismaClient' || trimmed.includes('social_org_enum')) {
          return trimmed.startsWith('type ') ? trimmed : `type ${trimmed}`;
        }
        return trimmed;
      });
      return `import { ${importList.join(', ')} } from '@emp/database';`;
    }
  );
  
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

console.log('🔧 Fixing Prisma type imports for ESM...');
const fixedCount = processDirectory(srcDir);
console.log(`✅ Fixed ${fixedCount} files with Prisma type imports`);