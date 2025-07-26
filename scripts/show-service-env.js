#!/usr/bin/env node

/**
 * Show environment variables for any service using the env-management system
 * Usage: node scripts/show-service-env.js <service-name> [profile]
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Get command line arguments
const serviceName = process.argv[2];
const profile = process.argv[3] || 'local';

if (!serviceName) {
  console.error('Usage: node scripts/show-service-env.js <service-name> [profile]');
  console.error('');
  console.error('Available services:');
  console.error('  - api');
  console.error('  - machine');
  console.error('  - monitor'); 
  console.error('  - worker');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/show-service-env.js worker');
  console.error('  node scripts/show-service-env.js api production');
  process.exit(1);
}

// Load service interfaces
const serviceInterfaces = {
  api: join(rootDir, 'config/environments/services/api.interface.ts'),
  machine: join(rootDir, 'config/environments/services/machine.interface.ts'),
  monitor: join(rootDir, 'config/environments/services/monitor.interface.ts'),
  worker: join(rootDir, 'config/environments/services/worker.interface.ts')
};

if (!serviceInterfaces[serviceName]) {
  console.error(`❌ Unknown service: ${serviceName}`);
  console.error(`Available services: ${Object.keys(serviceInterfaces).join(', ')}`);
  process.exit(1);
}

console.log(`🔍 Environment Variables for Service: ${serviceName.toUpperCase()}`);
console.log(`📋 Profile: ${profile}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

try {
  // Load service interface to get location
  const interfaceFile = serviceInterfaces[serviceName];
  const interfaceContent = readFileSync(interfaceFile, 'utf-8');
  
  // Extract location from interface (simple regex for now)
  const locationMatch = interfaceContent.match(/location:\s*"([^"]+)"/);
  const serviceLocation = locationMatch ? locationMatch[1] : `apps/${serviceName}`;
  
  // Check actual .env file in service location
  const serviceEnvPath = join(rootDir, serviceLocation, '.env');
  
  try {
    const envContent = readFileSync(serviceEnvPath, 'utf-8');
    console.log(`📁 Service .env file: ${serviceEnvPath}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Parse and display env vars with actual values
    const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const envVars = {};
    
    envLines.forEach(line => {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    // Display in a nice format
    console.log(`📊 Resolved Environment Variables (${Object.keys(envVars).length} total):`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    Object.entries(envVars).sort().forEach(([key, value]) => {
      // Truncate very long values and mask potential secrets
      let displayValue = value;
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')) {
        displayValue = value.length > 0 ? `[HIDDEN - ${value.length} chars]` : '[EMPTY]';
      } else if (value.length > 100) {
        displayValue = value.substring(0, 100) + `... [${value.length} chars total]`;
      }
      
      console.log(`${key.padEnd(35)} = ${displayValue}`);
    });
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Raw env file content:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(envContent);
    
  } catch (err) {
    console.log(`⚠️  No .env file found at: ${serviceEnvPath}`);
    console.log(`💡 The .env file may be empty or not created yet`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Fallback: show interface definition
    console.log(`📋 Service Interface Definition:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    try {
      const interfaceContent = readFileSync(serviceInterfaces[serviceName], 'utf-8');
      // Extract the interface object (simplified parsing)
      const interfaceMatch = interfaceContent.match(/export const \w+EnvInterface = ({[\s\S]*?});/);
      if (interfaceMatch) {
        console.log('Interface definition:');
        console.log(interfaceMatch[1]);
      } else {
        console.log(interfaceContent);
      }
    } catch (err) {
      console.error(`❌ Could not read interface file: ${err.message}`);
    }
  }
  
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
}