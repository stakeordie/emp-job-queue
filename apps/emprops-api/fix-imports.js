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

  // Replace @/ imports with relative imports
  const importRegex = /from\s+['"]@\/([^'"]+)['"]/g;
  modifiedContent = modifiedContent.replace(importRegex, (match, importPath) => {
    hasChanges = true;
    
    // Calculate relative path from current file to src root
    const currentDir = path.dirname(filePath);
    const relativePath = path.relative(currentDir, path.join(srcDir, importPath)).replace(/\\/g, '/');
    
    // Ensure it starts with ./ or ../
    const finalPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    return `from "${finalPath}.js"`;
  });

  // Also handle import statements (not just from)
  const importStatementRegex = /import\s+([^'"]+)\s+from\s+['"]@\/([^'"]+)['"]/g;
  modifiedContent = modifiedContent.replace(importStatementRegex, (match, importName, importPath) => {
    hasChanges = true;
    
    const currentDir = path.dirname(filePath);
    const relativePath = path.relative(currentDir, path.join(srcDir, importPath)).replace(/\\/g, '/');
    
    const finalPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
    return `import ${importName} from "${finalPath}.js"`;
  });

  if (hasChanges) {
    fs.writeFileSync(filePath, modifiedContent, 'utf8');
    const relativeFilePath = path.relative(process.cwd(), filePath);
    console.log(`Fixed imports in: ${relativeFilePath}`);
    totalChanges++;
  }
});

console.log(`Import fixing complete! Fixed ${totalChanges} files.`);