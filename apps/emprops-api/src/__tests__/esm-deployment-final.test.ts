import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Final ESM Deployment Validation', () => {
  const projectRoot = path.join(__dirname, '../..');
  const distDir = path.join(projectRoot, 'dist');
  
  describe('Build Artifacts Validation', () => {
    it('should have clean dist directory with ESM-compliant code', () => {
      expect(existsSync(distDir), 'dist/ directory should exist').toBe(true);
      expect(existsSync(path.join(distDir, 'index.js')), 'dist/index.js should exist').toBe(true);
      
      const indexContent = readFileSync(path.join(distDir, 'index.js'), 'utf8');
      
      // Should be ESM format
      expect(indexContent).toMatch(/import\s+.*\s+from/);
      expect(indexContent).not.toContain('require(');
      expect(indexContent).not.toContain('module.exports');
      
      // Should not contain any problematic imports
      expect(indexContent).not.toMatch(/from\s+["']\s*\.\s*["']/); // directory imports
      expect(indexContent).not.toContain('from "./routes/collections/metadata"');
      expect(indexContent).not.toContain('from "./routes/collections/tezos/tokens/metadata"');
      expect(indexContent).not.toContain('from "../clients/ipfs-client"');
      
      console.log('✅ ESM build artifacts are clean and compliant');
    });

    it('should have all relative imports with .js extensions', () => {
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
      const problematicFiles: string[] = [];
      
      for (const file of jsFiles) {
        const content = readFileSync(file, 'utf8');
        
        // Check for relative imports that should have .js extension but don't
        const relativeImportPattern = /from\s+["'](\.[^"']*?)["']/g;
        let match;
        
        while ((match = relativeImportPattern.exec(content)) !== null) {
          const importPath = match[1];
          
          // Skip if already has proper extension or is external
          if (importPath.endsWith('.js') || 
              importPath.endsWith('.json') || 
              importPath.startsWith('@') ||
              importPath.includes('node_modules')) {
            continue;
          }
          
          // These are problematic - should have .js extension
          problematicFiles.push(`${path.relative(distDir, file)}: "${importPath}"`);
        }
      }
      
      expect(problematicFiles).toHaveLength(0);
      console.log(`✅ Verified ${jsFiles.length} JS files - all imports have proper extensions`);
    });
  });

  describe('Configuration Validation', () => {
    it('should have ESM package configuration', () => {
      const packagePath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
      
      expect(packageJson.type).toBe('module');
      expect(packageJson.main).toBe('dist/index.js');
      
      console.log('✅ Package.json is configured for ESM');
    });

    it('should have proper TypeScript ESM configuration', () => {
      const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
      
      expect(tsconfig.compilerOptions.module).toBe('ESNext');
      expect(tsconfig.compilerOptions.moduleResolution).toBe('node');
      
      console.log('✅ TypeScript configuration supports ESM');
    });

    it('should have Docker configuration ready for Node.js 18', () => {
      const dockerfilePath = path.join(projectRoot, 'Dockerfile');
      const dockerContent = readFileSync(dockerfilePath, 'utf8');
      
      expect(dockerContent).toMatch(/setup_18\.x/);
      expect(dockerContent).toContain('COPY dist/ ./dist/');
      
      console.log('✅ Docker configuration is ESM-ready');
    });

    it('should have proper entrypoint configuration', () => {
      const entrypointPath = path.join(projectRoot, 'entrypoint-emprops-api-final.sh');
      const entrypointContent = readFileSync(entrypointPath, 'utf8');
      
      expect(entrypointContent).toContain('dist/index.js');
      
      console.log('✅ Entrypoint script references correct ESM entry point');
    });
  });

  describe('Import Resolution Validation', () => {
    it('should resolve all critical workspace dependencies', () => {
      const indexPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexPath, 'utf8');
      
      const workspaceDeps = [
        '@emp/telemetry',
        '@emp/database',
      ];
      
      for (const dep of workspaceDeps) {
        expect(content).toContain(`from '${dep}'`);
      }
      
      console.log('✅ All workspace dependencies are properly imported');
    });

    it('should have error tracking conditionally loaded', () => {
      const indexPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexPath, 'utf8');
      
      // Should import error tracking utilities
      expect(content).toContain('isErrorTrackingEnabled');
      
      // Should have conditional Sentry initialization
      expect(content).toContain('if (isErrorTrackingEnabled())');
      
      console.log('✅ Error tracking is conditionally loaded');
    });
  });

  describe('Deployment Pipeline Readiness', () => {
    it('should be ready for production deployment', () => {
      // All the checks above validate deployment readiness
      const checks = [
        existsSync(path.join(distDir, 'index.js')),
        existsSync(path.join(projectRoot, 'Dockerfile')),
        existsSync(path.join(projectRoot, 'package.json')),
        existsSync(path.join(projectRoot, 'entrypoint-emprops-api-final.sh')),
      ];
      
      expect(checks.every(check => check)).toBe(true);
      
      console.log('✅ EmProps API is ready for ESM deployment pipeline');
    });
  });
});