import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Node.js 18+ has built-in fetch

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Integration: Deployment Pipeline Validation', () => {
  const projectRoot = path.join(__dirname, '../..');
  const distDir = path.join(projectRoot, 'dist');
  const dockerFile = path.join(projectRoot, 'Dockerfile');
  
  let serverProcess: ChildProcess | null = null;
  let serverStartupPromise: Promise<void> | null = null;
  
  // Cleanup function to stop the server if it's running
  const stopServer = async () => {
    if (serverProcess) {
      console.log('📱 Stopping test server...');
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        serverProcess!.on('exit', () => {
          console.log('✅ Test server stopped gracefully');
          resolve();
        });
        
        // Force kill if graceful shutdown takes too long
        setTimeout(() => {
          if (serverProcess && !serverProcess.killed) {
            console.log('⚠️ Force killing test server');
            serverProcess.kill('SIGKILL');
            resolve();
          }
        }, 5000);
      });
      
      serverProcess = null;
      serverStartupPromise = null;
    }
  };
  
  afterAll(async () => {
    await stopServer();
  });

  describe('Build Process Validation', () => {
    it('should have required build files', () => {
      expect(existsSync(distDir), 'dist/ directory should exist after build').toBe(true);
      expect(existsSync(path.join(distDir, 'index.js')), 'dist/index.js should exist').toBe(true);
      expect(existsSync(dockerFile), 'Dockerfile should exist').toBe(true);
      expect(existsSync(path.join(projectRoot, 'package.json')), 'package.json should exist').toBe(true);
    });

    it('should have ESM-compatible built code', () => {
      const indexJsPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexJsPath, 'utf8');
      
      // Should not contain CommonJS patterns
      expect(content).not.toContain('require(');
      expect(content).not.toContain('module.exports');
      expect(content).not.toContain('exports.');
      
      // Should contain ESM patterns
      expect(content).toMatch(/import\s+.*\s+from\s+["']/);
      
      // Should not contain directory imports (like "from '.'")
      expect(content).not.toMatch(/from\s+["']\s*\.\s*["']/);
      
      console.log('✅ Built code is ESM-compatible');
    });

    it('should have all imports with proper file extensions', () => {
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
        
        // Check for relative imports without .js extension
        const relativeImportPattern = /from\s+["'](\.[^"']*?)["']/g;
        let match;
        
        while ((match = relativeImportPattern.exec(content)) !== null) {
          const importPath = match[1];
          
          // Skip if already has extension or is external module
          if (importPath.includes('.js') || 
              importPath.includes('.json') || 
              importPath.startsWith('@') ||
              importPath.includes('node_modules')) {
            continue;
          }
          
          problematicFiles.push(`${path.relative(distDir, file)}: ${match[0]}`);
        }
      }
      
      if (problematicFiles.length > 0) {
        throw new Error(`Files with problematic imports:\n${problematicFiles.join('\n')}`);
      }
      
      console.log(`✅ Checked ${jsFiles.length} JS files - all imports have proper extensions`);
    });
  });

  describe('Docker Environment Validation', () => {
    it('should have Docker configuration for Node.js 18', () => {
      const dockerContent = readFileSync(dockerFile, 'utf8');
      
      // Should use Node.js 18 as specified in CLAUDE.md
      expect(dockerContent).toMatch(/setup_18\.x/);
      
      // Should copy dist directory
      expect(dockerContent).toContain('COPY dist/ ./dist/');
      
      console.log('✅ Docker configuration is compatible with Node.js 18 and ESM');
    });

    it('should have proper entrypoint configuration', () => {
      const entrypointPath = path.join(projectRoot, 'entrypoint-emprops-api-final.sh');
      expect(existsSync(entrypointPath), 'Entrypoint script should exist').toBe(true);
      
      const entrypointContent = readFileSync(entrypointPath, 'utf8');
      expect(entrypointContent).toContain('dist/index.js');
      expect(entrypointContent).toContain('SERVICE_DIR="/emprops-api-server"');
      
      console.log('✅ Entrypoint script properly configured');
    });
  });

  describe('Runtime Startup Validation', () => {
    it('should start server without ESM import errors', async () => {
      console.log('🚀 Starting EmProps API server for integration test...');
      
      // Start the server process (use node command available in system)
      serverStartupPromise = new Promise<void>((resolve, reject) => {
        serverProcess = spawn('node', ['--no-warnings', 'dist/index.js'], {
          cwd: projectRoot,
          env: {
            ...process.env,
            PORT: '0', // Let the OS assign a port
            NODE_ENV: 'test',
            LOG_LEVEL: 'info',
            ENABLE_AUTH: 'false',
            // Minimal required env vars for startup
            DATABASE_URL: process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
            SERVICE_KEY: 'test-service-key',
            REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
            // Disable telemetry and error tracking for test
            TELEMETRY_ENABLED: 'false',
            SENTRY_ENABLED: 'false',
            ERROR_TRACKING_ENABLED: 'false',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let startupOutput = '';
        let errorOutput = '';
        let serverStarted = false;
        
        const timeout = setTimeout(() => {
          if (!serverStarted) {
            reject(new Error(`Server startup timeout. Output:\n${startupOutput}\nErrors:\n${errorOutput}`));
          }
        }, 30000); // 30 second timeout

        serverProcess!.stdout!.on('data', (data) => {
          const output = data.toString();
          startupOutput += output;
          
          if (output.includes('Server started at port:')) {
            serverStarted = true;
            clearTimeout(timeout);
            console.log('✅ Server started successfully');
            resolve();
          }
        });

        serverProcess!.stderr!.on('data', (data) => {
          const error = data.toString();
          errorOutput += error;
          
          // Check for specific ESM import errors
          if (error.includes('ERR_MODULE_NOT_FOUND') || 
              error.includes('ERR_UNSUPPORTED_DIR_IMPORT') ||
              error.includes('Cannot find package') ||
              error.includes('Directory import')) {
            clearTimeout(timeout);
            reject(new Error(`ESM Import Error detected:\n${error}\n\nFull output:\n${startupOutput}`));
          }
        });

        serverProcess!.on('error', (error) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to start server process: ${error.message}\nOutput:\n${startupOutput}\nErrors:\n${errorOutput}`));
        });

        serverProcess!.on('exit', (code, signal) => {
          clearTimeout(timeout);
          if (!serverStarted) {
            reject(new Error(`Server exited unexpectedly with code ${code}, signal ${signal}\nOutput:\n${startupOutput}\nErrors:\n${errorOutput}`));
          }
        });
      });

      await serverStartupPromise;
      console.log('✅ Server startup validation completed successfully');
    }, 35000); // 35 second timeout for the test

    it('should have proper telemetry initialization', async () => {
      // Wait for server to be ready
      if (serverStartupPromise) {
        await serverStartupPromise;
      }
      
      // The server should have started without telemetry errors
      // We can't easily test the full telemetry stack without external dependencies
      // but we can verify that telemetry initialization doesn't prevent startup
      expect(serverProcess).toBeTruthy();
      expect(serverProcess!.killed).toBe(false);
      
      console.log('✅ Telemetry initialization did not prevent server startup');
    });

    it('should handle graceful shutdown', async () => {
      if (!serverProcess) {
        console.log('⚠️ Skipping graceful shutdown test - server not running');
        return;
      }
      
      console.log('🔄 Testing graceful shutdown...');
      
      const shutdownPromise = new Promise<void>((resolve) => {
        serverProcess!.on('exit', (code, signal) => {
          console.log(`📱 Server exited with code ${code}, signal ${signal}`);
          resolve();
        });
      });
      
      // Send SIGTERM for graceful shutdown
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown (with timeout)
      await Promise.race([
        shutdownPromise,
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('Graceful shutdown timeout')), 10000);
        })
      ]);
      
      serverProcess = null;
      serverStartupPromise = null;
      
      console.log('✅ Graceful shutdown completed successfully');
    }, 15000);
  });

  describe('Module Loading Cascade', () => {
    it('should load all critical dependencies without errors', async () => {
      const indexPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexPath, 'utf8');
      
      // Check for critical imports that must be available
      const criticalImports = [
        '@sentry/node',
        'express',
        '@emp/telemetry',
        '@emp/database',
        'socket.io',
      ];
      
      const missingImports = criticalImports.filter(importName => 
        !content.includes(`from "${importName}"`) && 
        !content.includes(`from '${importName}'`)
      );
      
      if (missingImports.length > 0) {
        throw new Error(`Critical imports missing: ${missingImports.join(', ')}`);
      }
      
      console.log('✅ All critical dependencies are imported correctly');
    });

    it('should have proper database client initialization', async () => {
      const indexPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexPath, 'utf8');
      
      // Should import database functions
      expect(content).toContain('getPrismaClient');
      expect(content).toContain('createPgPool');
      expect(content).toContain('disconnectPrisma');
      
      // Should initialize clients
      expect(content).toContain('getPrismaClient()');
      expect(content).toContain('createPgPool()');
      
      console.log('✅ Database client initialization is properly configured');
    });
  });

  describe('Environment Configuration', () => {
    it('should handle required environment variables', () => {
      const indexPath = path.join(distDir, 'index.js');
      const content = readFileSync(indexPath, 'utf8');
      
      // Should reference critical environment variables
      const envVars = [
        'PORT',
        'SERVICE_KEY',
      ];
      
      const missingEnvRefs = envVars.filter(envVar => 
        !content.includes(`process.env.${envVar}`)
      );
      
      if (missingEnvRefs.length > 0) {
        throw new Error(`Environment variable references missing: ${missingEnvRefs.join(', ')}`);
      }
      
      console.log('✅ All critical environment variables are referenced');
    });
  });
});