#!/usr/bin/env node

import { EnvironmentBuilder } from './packages/env-management/dist/src/index.js';
import fs from 'fs';

async function testRemoteComfyUI() {
  console.log('🧪 Testing Remote ComfyUI Configuration\n');
  
  const configDir = process.cwd();
  const builder = new EnvironmentBuilder(configDir);

  try {
    // List all profiles
    console.log('📋 Available profiles:');
    const profiles = builder.listProfiles();
    profiles.forEach(profile => {
      console.log(`  ✅ ${profile.name}: ${profile.description}`);
    });
    
    // Test building remote-comfyui profile
    console.log('\n🔧 Building remote-comfyui profile...');
    const result = await builder.buildFromProfile('remote-comfyui');
    
    if (result.success) {
      console.log(`✅ Successfully built environment: ${result.envPath}`);
      
      // Read and show relevant ComfyUI variables
      console.log('\n🔍 ComfyUI connector configuration:');
      const envContent = fs.readFileSync(result.envPath, 'utf8');
      const comfyuiVars = envContent.split('\n').filter(line => 
        line.includes('WORKER_COMFYUI') || line.includes('REMOTE_COMFYUI')
      );
      
      comfyuiVars.forEach(line => {
        if (line.trim() && !line.startsWith('#')) {
          console.log(`  ${line}`);
        }
      });
      
      if (result.warnings) {
        console.log('\n⚠️  Warnings:');
        result.warnings.forEach(warning => {
          console.log(`  • ${warning}`);
        });
      }
    } else {
      console.error('❌ Failed to build environment:');
      result.errors?.forEach(error => {
        console.error(`  ${error}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testRemoteComfyUI();