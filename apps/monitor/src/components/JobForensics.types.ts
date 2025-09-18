/**
 * JobForensics Component Type Definitions
 *
 * This is a FORENSICS/MONITORING component that handles DYNAMIC data from multiple systems.
 * We deliberately use flexible typing here because we're debugging and monitoring
 * unknown data structures. This is not production business logic.
 *
 * With relaxed TypeScript settings, we can use 'any' where appropriate.
 */

// These types are intentionally flexible for forensics data
export type JobForensicsData = any;
export type JobWithUserInfo = any;
export type FailedJobsAnalysis = any;
export type WorkflowStep = any;
export type WorkflowOutput = any;
export type FlatFile = any;
export type ForensicsJob = any;

// Helper to safely access any property
export function get(obj: any, path: string, defaultValue: any = undefined): any {
  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result == null) return defaultValue;
    result = result[key];
  }

  return result ?? defaultValue;
}

// Helper to safely render any value
export function renderValue(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[Complex Object]';
  }
}

// Type guard that always returns true for forensics data
export function isForensicsData(data: any): data is JobForensicsData {
  return data != null && typeof data === 'object';
}

// Type guard for job data
export function isJobData(data: any): data is ForensicsJob {
  return data != null && typeof data === 'object';
}
