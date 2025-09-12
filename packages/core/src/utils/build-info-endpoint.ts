/**
 * Build Information HTTP Endpoint
 * 
 * Express middleware to expose build metadata via HTTP endpoint
 * Add to any service to show build information at /build-info
 */

import { Request, Response } from 'express';
import { findAllPackagesWithBuildInfo, getCurrentPackageBuildInfo, PackageBuildInfo } from './build-info.js';

export interface BuildInfoResponse {
  service_name: string;
  current_package?: PackageBuildInfo;
  all_packages: PackageBuildInfo[];
  summary: {
    total_packages: number;
    fresh_packages: number;
    stale_packages: number;
    very_stale_packages: number;
  };
  request_timestamp: string;
}

/**
 * Express middleware to serve build information
 */
export function buildInfoEndpoint(serviceName: string) {
  return (req: Request, res: Response) => {
    try {
      const allPackages = findAllPackagesWithBuildInfo();
      const currentPackage = getCurrentPackageBuildInfo();
      
      const summary = {
        total_packages: allPackages.length,
        fresh_packages: allPackages.filter(p => !p.is_stale).length,
        stale_packages: allPackages.filter(p => p.is_stale && !p.is_very_stale).length,
        very_stale_packages: allPackages.filter(p => p.is_very_stale).length,
      };
      
      const response: BuildInfoResponse = {
        service_name: serviceName,
        current_package: currentPackage || undefined,
        all_packages: allPackages,
        summary,
        request_timestamp: new Date().toISOString(),
      };
      
      res.json(response);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to get build information',
        message: error instanceof Error ? error.message : String(error),
        service_name: serviceName,
        request_timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Express middleware for a simple health check with basic build info
 */
export function buildInfoHealthCheck(serviceName: string) {
  return (req: Request, res: Response) => {
    try {
      const currentPackage = getCurrentPackageBuildInfo();
      
      res.json({
        status: 'healthy',
        service: serviceName,
        build_info: currentPackage ? {
          package_name: currentPackage.package_name,
          build_timestamp: currentPackage.build_timestamp,
          age_human: currentPackage.age_human,
          git_hash: currentPackage.git.hash_short,
          git_branch: currentPackage.git.branch,
          is_stale: currentPackage.is_stale,
        } : null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        service: serviceName,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
    }
  };
}