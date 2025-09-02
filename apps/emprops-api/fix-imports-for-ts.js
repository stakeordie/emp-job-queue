#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Recursively find TypeScript files
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      findTsFiles(fullPath, files);
    } else if (entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

const srcDir = path.join(process.cwd(), 'src');
const files = findTsFiles(srcDir);

console.log(`Found ${files.length} TypeScript files to process`);

let totalChanges = 0;

files.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  
  let modifiedContent = content;
  let hasChanges = false;

  // Remove .js extensions from relative imports (for TypeScript compilation)
  const jsImportRegex = /from\s+['"](\.\.[^'"]+)\.js['"]/g;
  modifiedContent = modifiedContent.replace(jsImportRegex, (match, importPath) => {
    hasChanges = true;
    return `from "${importPath}"`;
  });

  if (hasChanges) {
    fs.writeFileSync(filePath, modifiedContent, 'utf8');
    const relativeFilePath = path.relative(process.cwd(), filePath);
    console.log(`Fixed imports in: ${relativeFilePath}`);
    totalChanges++;
  }
});

console.log(`Import fixing complete! Fixed ${totalChanges} files.`);