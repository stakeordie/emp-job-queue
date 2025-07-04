// Redis Function types and interfaces

import { Job, JobRequirements } from '../core/types/job.js';
import { WorkerCapabilities } from '../core/types/worker.js';

export interface RedisFunction {
  name: string;
  code: string;
  description?: string;
}

export interface FunctionLibrary {
  name: string;
  engine: string;
  functions: RedisFunction[];
}

export interface MatchingResult {
  jobId: string;
  job: Job;
}

export interface FunctionCallResult {
  success: boolean;
  data?: MatchingResult;
  error?: string;
}

// Function argument types
export interface FindMatchingJobArgs {
  capabilities: WorkerCapabilities;
  maxScan?: number;
}

// Redis Function management
export interface FunctionInfo {
  name: string;
  library: string;
  description?: string;
}

export interface FunctionInstallResult {
  success: boolean;
  functionsInstalled: string[];
  error?: string;
}

// Capability matching types
export interface MatchingContext {
  worker: WorkerCapabilities;
  job: Job;
  requirements: JobRequirements;
}

export interface MatchResult {
  matches: boolean;
  reason?: string;
  score?: number;
}
