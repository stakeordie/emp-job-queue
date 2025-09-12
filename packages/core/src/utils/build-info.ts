/**
 * Build Information Utilities
 * 
 * Provides functions to read build metadata and calculate ages
 * for all packages in the system
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface BuildMetadata {
  package_name: string;
  build_timestamp: string;
  build_timestamp_unix: number;
  build_date_readable: string;
  node_version: string;
  platform: string;
  arch: string;
  git: {
    hash: string;
    hash_short: string;
    branch: string;
    commit_date: string;
    commit_message: string;
  };
  builder: {
    user: string;
    host: string;
    ci: boolean;
    docker: boolean;
  };
}

export interface PackageBuildInfo extends BuildMetadata {
  age_ms: number;
  age_human: string;
  is_stale: boolean; // > 7 days
  is_very_stale: boolean; // > 30 days
}

/**
 * Calculate human-readable age from timestamp
 */
function calculateAge(buildTimestamp: string): { age_ms: number; age_human: string } {
  const buildTime = new Date(buildTimestamp).getTime();
  const now = Date.now();
  const age_ms = now - buildTime;
  
  const seconds = Math.floor(age_ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  
  let age_human: string;
  if (months > 0) {
    age_human = `${months} month${months > 1 ? 's' : ''} old`;
  } else if (weeks > 0) {
    age_human = `${weeks} week${weeks > 1 ? 's' : ''} old`;
  } else if (days > 0) {
    age_human = `${days} day${days > 1 ? 's' : ''} old`;
  } else if (hours > 0) {
    age_human = `${hours} hour${hours > 1 ? 's' : ''} old`;
  } else if (minutes > 0) {
    age_human = `${minutes} minute${minutes > 1 ? 's' : ''} old`;
  } else {
    age_human = `${seconds} second${seconds > 1 ? 's' : ''} old`;
  }
  
  return { age_ms, age_human };
}

/**
 * Read build metadata from a package directory
 */
function readBuildMetadata(packagePath: string): BuildMetadata | null {
  try {
    const metadataPath = path.join(packagePath, 'build-metadata.json');
    if (!fs.existsSync(metadataPath)) {
      return null;
    }
    
    const content = fs.readFileSync(metadataPath, 'utf8');
    return JSON.parse(content) as BuildMetadata;
  } catch (error) {
    console.warn(`⚠️ Could not read build metadata from ${packagePath}:`, error.message);
    return null;
  }
}

/**
 * Find all packages with build metadata in the monorepo
 */
function findAllPackagesWithBuildInfo(monorepoRoot?: string): PackageBuildInfo[] {
  const root = monorepoRoot || findMonorepoRoot();
  const packages: PackageBuildInfo[] = [];
  
  // Common package locations
  const searchPaths = [
    path.join(root, 'packages'),
    path.join(root, 'apps'),
    path.join(root, 'tools'),
  ];
  
  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) continue;
    
    const entries = fs.readdirSync(searchPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const packagePath = path.join(searchPath, entry.name);
        const metadata = readBuildMetadata(packagePath);
        
        if (metadata) {
          const age = calculateAge(metadata.build_timestamp);
          const buildInfo: PackageBuildInfo = {
            ...metadata,
            ...age,
            is_stale: age.age_ms > 7 * 24 * 60 * 60 * 1000, // > 7 days
            is_very_stale: age.age_ms > 30 * 24 * 60 * 60 * 1000, // > 30 days
          };
          packages.push(buildInfo);
        }
      }
    }
  }
  
  return packages.sort((a, b) => b.build_timestamp_unix - a.build_timestamp_unix); // Newest first
}

/**
 * Find the monorepo root by looking for package.json with workspaces
 */
function findMonorepoRoot(): string {
  let current = process.cwd();
  
  while (current !== path.dirname(current)) {
    try {
      const packageJsonPath = path.join(current, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.workspaces) {
          return current;
        }
      }
    } catch (error) {
      // Continue searching up
    }
    current = path.dirname(current);
  }
  
  // Fallback to current directory
  return process.cwd();
}

/**
 * Get build info for the current package
 */
function getCurrentPackageBuildInfo(): PackageBuildInfo | null {
  const metadata = readBuildMetadata(process.cwd());
  if (!metadata) return null;
  
  const age = calculateAge(metadata.build_timestamp);
  return {
    ...metadata,
    ...age,
    is_stale: age.age_ms > 7 * 24 * 60 * 60 * 1000,
    is_very_stale: age.age_ms > 30 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Format build info for console output
 */
function formatBuildInfoTable(packages: PackageBuildInfo[]): string {
  if (packages.length === 0) {
    return '📦 No packages with build metadata found';
  }
  
  const lines = ['📦 Package Build Information:', ''];
  
  const maxNameLength = Math.max(...packages.map(p => p.package_name.length));
  const maxAgeLength = Math.max(...packages.map(p => p.age_human.length));
  
  for (const pkg of packages) {
    const staleIndicator = pkg.is_very_stale ? '🔴' : pkg.is_stale ? '🟡' : '🟢';
    const name = pkg.package_name.padEnd(maxNameLength);
    const age = pkg.age_human.padEnd(maxAgeLength);
    const git = `${pkg.git.hash_short} (${pkg.git.branch})`;
    
    lines.push(`${staleIndicator} ${name} | ${age} | ${git}`);
  }
  
  lines.push('');
  lines.push('Legend: 🟢 Fresh (<7 days) | 🟡 Stale (>7 days) | 🔴 Very Stale (>30 days)');
  
  return lines.join('\n');
}

export {
  readBuildMetadata,
  findAllPackagesWithBuildInfo,
  getCurrentPackageBuildInfo,
  calculateAge,
  formatBuildInfoTable,
  findMonorepoRoot,
};