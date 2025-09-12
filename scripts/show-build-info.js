#!/usr/bin/env node

/**
 * Show Build Information CLI
 * 
 * Displays build timestamps and ages for all packages in the monorepo
 * Usage: node scripts/show-build-info.js [--json] [--current]
 */

import { findAllPackagesWithBuildInfo, getCurrentPackageBuildInfo, formatBuildInfoTable } from '../packages/core/dist/utils/build-info.js';

function showUsage() {
  console.log(`
📦 Show Build Information

Usage:
  node scripts/show-build-info.js [options]

Options:
  --json     Output as JSON instead of formatted table
  --current  Show only current package build info
  --help     Show this help message

Examples:
  node scripts/show-build-info.js
  node scripts/show-build-info.js --json
  node scripts/show-build-info.js --current
`);
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    return;
  }
  
  const outputJson = args.includes('--json');
  const currentOnly = args.includes('--current');
  
  try {
    if (currentOnly) {
      const currentInfo = getCurrentPackageBuildInfo();
      if (currentInfo) {
        if (outputJson) {
          console.log(JSON.stringify(currentInfo, null, 2));
        } else {
          console.log(formatBuildInfoTable([currentInfo]));
        }
      } else {
        console.log('❌ No build metadata found for current package');
        console.log('💡 Run the build process to generate build metadata');
      }
    } else {
      const packages = findAllPackagesWithBuildInfo();
      
      if (outputJson) {
        console.log(JSON.stringify(packages, null, 2));
      } else {
        console.log(formatBuildInfoTable(packages));
        
        if (packages.length > 0) {
          console.log('');
          console.log('📊 Summary:');
          const fresh = packages.filter(p => !p.is_stale).length;
          const stale = packages.filter(p => p.is_stale && !p.is_very_stale).length;
          const veryStale = packages.filter(p => p.is_very_stale).length;
          
          console.log(`   🟢 Fresh: ${fresh} packages`);
          console.log(`   🟡 Stale: ${stale} packages`);
          console.log(`   🔴 Very Stale: ${veryStale} packages`);
          
          if (stale > 0 || veryStale > 0) {
            console.log('');
            console.log('💡 Consider rebuilding stale packages with: pnpm build');
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error getting build information:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}