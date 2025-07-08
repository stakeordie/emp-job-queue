// Re-export core worker types for consistency
export type {
  WorkerCapabilities,
  WorkerInfo as Worker,
  WorkerInfo,
} from '@emp/core/dist/types/worker.js';

// Re-export enum as value for runtime use
export { WorkerStatus } from '@emp/core/dist/types/worker.js';