// Re-export core worker types for consistency
export type {
  WorkerCapabilities,
  WorkerInfo as Worker,
  WorkerInfo,
} from '@emp/core';

// Re-export enum as value for runtime use
export { WorkerStatus } from '@emp/core';