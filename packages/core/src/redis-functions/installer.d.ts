import { FunctionInstallResult, FunctionInfo } from './types.js';
export declare class RedisFunctionInstaller {
  private redis;
  private functionDir;
  private libraryName;
  constructor(redisUrl: string, functionDir?: string);
  /**
   * Install or update Redis functions
   */
  installOrUpdate(): Promise<FunctionInstallResult>;
  /**
   * Load function code from files
   */
  private loadFunctionCode;
  /**
   * Calculate checksum of function code
   */
  private calculateChecksum;
  /**
   * Check if functions need to be updated
   */
  private checkIfNeedsUpdate;
  /**
   * Install function to Redis
   */
  private installFunction;
  /**
   * Save checksum for version tracking
   */
  private saveChecksum;
  /**
   * List all installed functions
   */
  listFunctions(): Promise<unknown[]>;
  /**
   * List functions from our library
   */
  listInstalledFunctions(): Promise<FunctionInfo[]>;
  /**
   * Delete installed functions
   */
  deleteFunction(): Promise<void>;
  /**
   * Test function with sample data
   */
  testFunction(): Promise<void>;
  /**
   * Close Redis connection
   */
  close(): Promise<void>;
}
//# sourceMappingURL=installer.d.ts.map
