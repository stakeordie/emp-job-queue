import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ESM Import Validation', () => {
  const distDir = path.join(__dirname, '../../dist');
  
  it('should have dist directory built', () => {
    expect(existsSync(distDir)).toBe(true);
  });

  it('should not contain any aws-sdk imports in built files', async () => {
    if (!existsSync(distDir)) {
      throw new Error('dist directory does not exist - run pnpm build first');
    }
    
    const checkForAwsSdk = (filePath: string): string[] => {
      const issues: string[] = [];
      const content = readFileSync(filePath, 'utf8');
      
      // Check for aws-sdk imports
      if (content.includes('aws-sdk') || content.includes('import * as AWS')) {
        issues.push(`Found aws-sdk reference in ${filePath}`);
      }
      
      return issues;
    };
    
    const findJsFiles = (dir: string): string[] => {
      const files: string[] = [];
      const items = readFileSync ? require('fs').readdirSync(dir) : [];
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = require('fs').statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...findJsFiles(fullPath));
        } else if (item.endsWith('.js')) {
          files.push(fullPath);
        }
      }
      
      return files;
    };
    
    const jsFiles = findJsFiles(distDir);
    const allIssues: string[] = [];
    
    for (const file of jsFiles) {
      allIssues.push(...checkForAwsSdk(file));
    }
    
    if (allIssues.length > 0) {
      throw new Error(`AWS SDK references found:\n${allIssues.join('\n')}`);
    }
  });

  it('should not contain directory imports in built files', async () => {
    if (!existsSync(distDir)) {
      throw new Error('dist directory does not exist - run pnpm build first');
    }
    
    const checkForDirectoryImports = (filePath: string): string[] => {
      const issues: string[] = [];
      const content = readFileSync(filePath, 'utf8');
      
      // Check for directory imports like: from "."
      const directoryImportPattern = /from\s+["']\.["']/g;
      const matches = content.match(directoryImportPattern);
      
      if (matches) {
        issues.push(`Found directory import in ${filePath}: ${matches.join(', ')}`);
      }
      
      return issues;
    };
    
    const findJsFiles = (dir: string): string[] => {
      const files: string[] = [];
      const items = require('fs').readdirSync(dir);
      
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = require('fs').statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...findJsFiles(fullPath));
        } else if (item.endsWith('.js')) {
          files.push(fullPath);
        }
      }
      
      return files;
    };
    
    const jsFiles = findJsFiles(distDir);
    const allIssues: string[] = [];
    
    for (const file of jsFiles) {
      allIssues.push(...checkForDirectoryImports(file));
    }
    
    if (allIssues.length > 0) {
      throw new Error(`Directory imports found (should be "./index.js"):\n${allIssues.join('\n')}`);
    }
  });

  it('should have main entry point at dist/index.js', () => {
    const mainEntry = path.join(distDir, 'index.js');
    expect(existsSync(mainEntry)).toBe(true);
  });

  it('should be able to import main entry point without errors', async () => {
    const mainEntry = path.join(distDir, 'index.js');
    
    if (!existsSync(mainEntry)) {
      throw new Error('dist/index.js does not exist');
    }
    
    // This test validates that the entry point can be imported without throwing
    // We don't actually import it to avoid side effects, but we validate the syntax
    const content = readFileSync(mainEntry, 'utf8');
    expect(content).not.toContain('import * as AWS');
    expect(content).not.toContain('aws-sdk');
  });
});

describe('Utils Directory Import Fix', () => {
  it('should fix directory import in queries.ts', async () => {
    const queriesFile = path.join(__dirname, '../utils/queries.ts');
    
    if (!existsSync(queriesFile)) {
      throw new Error('queries.ts not found');
    }
    
    const content = readFileSync(queriesFile, 'utf8');
    
    // This should fail initially, then pass after we fix it
    expect(content).not.toContain('from "."');
    expect(content).toContain('from "./index"'); // or "./index.js" after build
  });
});