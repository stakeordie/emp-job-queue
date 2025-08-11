#!/usr/bin/env node
/**
 * Worker-Driven PM2 Ecosystem Generator 
 * This is the new generator that integrates with the existing machine startup process
 * 
 * This file replaces the original generate-pm2-ecosystem.js when worker-driven mode is enabled
 */

import { EnhancedPM2EcosystemGenerator } from './src/config/enhanced-pm2-ecosystem-generator.js';

async function main() {
  try {
    console.log(`🚀🚀🚀 [BUILD-VERIFICATION] WORKER-DRIVEN GENERATOR ACTIVE - ${new Date().toISOString()}`);
    console.log('🚀 Generating PM2 ecosystem using worker-driven architecture...');
    
    // Always use enhanced generator (no legacy fallback)
    const generator = new EnhancedPM2EcosystemGenerator();
    await generator.generateEcosystem();
    
    console.log('✅ PM2 ecosystem generation completed successfully');
    
  } catch (error) {
    console.error('❌ PM2 ecosystem generation failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();