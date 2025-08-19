#!/usr/bin/env node
/**
 * ALTERNATE Worker-Driven PM2 Ecosystem Generator 
 * This is a completely new file to bypass Docker caching issues
 * 
 * BUILD TIMESTAMP: 2025-08-18T23:01:00.000Z
 * FILE CREATION: BRAND NEW ALTERNATE FILE
 */

import { EnhancedPM2EcosystemGenerator } from './src/config/enhanced-pm2-ecosystem-generator.js';

const BUILD_TIMESTAMP = '2025-08-18T23:01:00.000Z';
const FILE_VERSION = 'ALTERNATE-v2';

async function main() {
  try {
    console.log(`🚀🚀🚀 [EXTREME-ALT-VERIFICATION] === ALTERNATE WORKER-DRIVEN GENERATOR ACTIVE ===`);
    console.log(`🚀🚀🚀 [EXTREME-ALT-VERIFICATION] BUILD TIMESTAMP: ${BUILD_TIMESTAMP}`);
    console.log(`🚀🚀🚀 [EXTREME-ALT-VERIFICATION] FILE VERSION: ${FILE_VERSION}`);
    console.log(`🚀🚀🚀 [EXTREME-ALT-VERIFICATION] Current Time: ${new Date().toISOString()}`);
    console.log(`🚀🚀🚀 [EXTREME-ALT-VERIFICATION] THIS IS THE ALTERNATE FILE - NOT THE ORIGINAL!`);
    console.log('🚀🚀🚀 [EXTREME-ALT-VERIFICATION] Using ALTERNATE generator file...');
    console.log('🚀🚀🚀 [EXTREME-ALT-VERIFICATION] main() function is DEFINITELY executing!');
    
    // LOG THE ACTUAL FILE CONTENTS TO PROVE WHICH VERSION WE'RE USING
    console.log('🚀🚀🚀 [FILE-CONTENTS-VERIFICATION] About to read enhanced generator file...');
    const fs = await import('fs');
    const enhancedGeneratorPath = './src/config/enhanced-pm2-ecosystem-generator.js';
    try {
      const fileContents = fs.readFileSync(enhancedGeneratorPath, 'utf8');
      const firstLines = fileContents.split('\n').slice(0, 15).join('\n');
      console.log('🚀🚀🚀 [FILE-CONTENTS-VERIFICATION] Enhanced generator file first 15 lines:');
      console.log('🚀🚀🚀 [FILE-CONTENTS-VERIFICATION] ----------------------------------------');
      console.log(firstLines);
      console.log('🚀🚀🚀 [FILE-CONTENTS-VERIFICATION] ----------------------------------------');
    } catch (readError) {
      console.log('🚀🚀🚀 [FILE-CONTENTS-VERIFICATION] ERROR reading file:', readError.message);
    }
    
    // Always use enhanced generator (no legacy fallback)
    const generator = new EnhancedPM2EcosystemGenerator();
    await generator.generateEcosystem();
    
    console.log('✅ [EXTREME-ALT-VERIFICATION] PM2 ecosystem generation completed successfully');
    
  } catch (error) {
    console.error('❌ [EXTREME-ALT-VERIFICATION] PM2 ecosystem generation failed:', error);
    process.exit(1);
  }
}

// Run the main function
main();