// Comprehensive type definitions for the Job Forensics system
// These types handle cross-system data integration between Redis, EmProps, and mini-app

import type { Prisma } from '@prisma/client';
import * as React from 'react';

// ============================================================================
// Core Job Types (Enhanced from Prisma)
// ============================================================================

export type JobWithRelations = Prisma.jobGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    status: true;
    data: true;
    progress: true;
    error_message: true;
    created_at: true;
    updated_at: true;
    started_at: true;
    completed_at: true;
    user_id: true;
    job_type: true;
    priority: true;
    retry_count: true;
    max_retries: true;
    workflow_output: true;
    // Evaluation fields
    is_cleanup_evaluated: true;
    status_category: true;
    problem_type: true;
    problem_details: true;
    evaluated_at: true;
  };
}>;

export type JobRetryBackup = Prisma.job_retry_backupGetPayload<{
  select: {
    id: true;
    original_job_id: true;
    retry_attempt: true;
    original_data: true;
    original_status: true;
    original_workflow_output: true;
    backed_up_at: true;
  };
}>;

export type MiniappUser = Prisma.miniapp_userGetPayload<{
  select: {
    id: true;
    farcaster_username: true;
    farcaster_pfp: true;
    wallet_address: true;
    created_at: true;
    updated_at: true;
  };
}>;

export type MiniappPayment = Prisma.miniapp_paymentGetPayload<{
  select: {
    id: true;
    user_id: true;
    amount: true;
    currency: true;
    status: true;
    tx_hash: true;
    created_at: true;
    updated_at: true;
  };
}>;

export type MiniappGeneration = Prisma.miniapp_generationGetPayload<{
  select: {
    id: true;
    user_id: true;
    collection_id: true;
    payment_id: true;
    input_data: true;
    output_url: true;
    output_data: true;
    error_message: true;
    created_at: true;
    updated_at: true;
    generated_image: true;
    job_id: true;
    status: true;
  };
}>;

export interface RedisWorkflowData {
  workflow_id: string;
  status?: string;
  created_at?: Date | null;
  updated_at?: Date | null;
  [key: string]: unknown;
}

// ============================================================================
// Enhanced Job with Cross-System Data
// ============================================================================

export interface JobWithUserInfo extends JobWithRelations {
  user_info: MiniappUser | null;
  miniapp_data: MiniappGeneration | null; // MiniApp generation perspective
  redis_data: RedisWorkflowData | null; // Job Queue workflow perspective
  miniapp_user?: MiniappUser | null; // Alias for backward compatibility
  miniapp_payment?: MiniappPayment | null;
  retry_backups?: JobRetryBackup[]; // Retry attempt history
}

// ============================================================================
// Workflow & Output Types (from ComfyUI/Redis system)
// ============================================================================

export interface WorkflowStep {
  id: number;
  alias?: string;
  nodeName: string;
  nodeAlias?: string;
  nodeResponse?: {
    src?: string;
    mimeType?: string;
    filename?: string;
    filesize?: number;
    [key: string]: unknown;
  };
}

export interface WorkflowGeneration {
  id: number;
  hash: string;
  timestamp?: string;
  duration_ms?: number;
}

export interface WorkflowOutput {
  steps: WorkflowStep[];
  generation?: WorkflowGeneration;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Job Payload Types (Redis job data structure)
// ============================================================================

export interface JobPayload {
  _collection?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  outputs?: WorkflowOutput[];
  collectionId?: string;
  workflow?: {
    id: string;
    name: string;
    version?: string;
  };
  [key: string]: unknown; // Allow additional dynamic properties
}

// ============================================================================
// Forensics Analysis Types
// ============================================================================

export interface JobExecutionMetrics {
  success: boolean;
  processing_time?: number;
  queue_wait_time?: number;
  start_time?: string;
  end_time?: string;
  retry_attempts?: number;
  memory_usage?: number;
  gpu_utilization?: number;
}

export interface ConnectorInfo {
  type: 'comfyui' | 'ollama' | 'stable_diffusion' | 'custom';
  version?: string;
  endpoint?: string;
  model_name?: string;
  parameters?: Record<string, unknown>;
  response_time_ms?: number;
  error_details?: string;
}

export interface JobExecutionResult {
  success: boolean;
  processing_time?: number;
  connector_info?: ConnectorInfo;
  output_files?: Array<{
    filename: string;
    url: string;
    mimeType: string;
    filesize?: number;
  }>;
  metadata?: Record<string, unknown>;
  error_details?: string;
}

// ============================================================================
// Forensics Data Structure
// ============================================================================

export interface JobForensicsData {
  // Core job information
  job: {
    id: string;
    status: string;
    payload: JobPayload;
    execution_result?: JobExecutionResult;
    created_at: string;
    updated_at?: string;
    completed_at?: string;
    error_message?: string;
    retry_count?: number;
    user_id?: string;
    workflow_id?: string;
  };

  // Cross-system references
  emprops_job?: JobWithUserInfo | null;
  redis_job_data?: Record<string, unknown> | null;
  miniapp_context?: {
    user?: MiniappUser | null;
    payment?: MiniappPayment | null;
    generation_history?: Array<{
      id: string;
      status: string;
      created_at: string;
    }>;
  };

  // Analysis results
  forensics: {
    execution_metrics?: JobExecutionMetrics;
    failure_analysis?: {
      category:
        | 'user_error'
        | 'system_error'
        | 'timeout'
        | 'resource_limit'
        | 'network'
        | 'unknown';
      root_cause?: string;
      confidence: 'high' | 'medium' | 'low';
      technical_details?: Record<string, unknown>;
    };
    performance_metrics?: {
      queue_position?: number;
      estimated_completion_time?: string;
      actual_completion_time?: string;
      variance_from_estimate?: number;
    };
    retry_analysis?: {
      total_attempts: number;
      max_retries: number;
      retry_pattern: 'escalating' | 'consistent' | 'random';
      retry_intervals: number[]; // Seconds between retries
      state_changes: Array<{
        attempt: number;
        status_before: string;
        status_after: string;
        data_changed: boolean;
        workflow_output_changed: boolean;
        backed_up_at: string;
      }>;
      success_probability?: number; // Based on historical data
    };
  };

  // Related data for context
  similar_failures: Array<{
    job_id: string;
    failure_reason: string;
    occurred_at: string;
    resolution?: string;
    similarity_score: number;
  }>;

  recovery_suggestions: Array<{
    type: 'retry' | 'modify_params' | 'change_workflow' | 'contact_support';
    description: string;
    confidence: 'high' | 'medium' | 'low';
    estimated_success_rate?: number;
    automated_action_available?: boolean;
    action_details?: Record<string, unknown>;
  }>;
}

// ============================================================================
// Component Props & State Types
// ============================================================================

export interface JobForensicsProps {
  initialJobId?: string;
  onJobChange?: (jobId: string) => void;
  showAdvancedMetrics?: boolean;
}

export interface JobSearchResult {
  id: string;
  name: string;
  status: string;
  created_at: string;
  user_info?: {
    farcaster_username?: string;
    wallet_address?: string;
  };
}

// ============================================================================
// API Response Types
// ============================================================================

export interface JobsAPIResponse {
  success: boolean;
  jobs: JobWithUserInfo[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  warning?: string;
  error?: string;
  debug?: {
    message: string;
    name: string;
    code: string;
    databaseUrl: string;
    nodeEnv?: string;
    currentEnv?: string;
    vercelEnv?: string;
  };
}

export interface FailedJobsAnalysis {
  total_failed: number;
  failure_categories: Record<string, number>;
  common_patterns: Array<{
    pattern: string;
    frequency: number;
    examples: string[];
  }>;
  trend_analysis: {
    last_24h: number;
    last_7d: number;
    failure_rate_trend: 'increasing' | 'decreasing' | 'stable';
  };
}

// ============================================================================
// Error Types
// ============================================================================

export interface ForensicsError {
  code: 'NOT_FOUND' | 'DATABASE_ERROR' | 'REDIS_ERROR' | 'VALIDATION_ERROR' | 'UNKNOWN';
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  job_id?: string;
}

// ============================================================================
// File Types
// ============================================================================

export interface FlatFile {
  name?: string;
  url?: string;
  mimeType?: string;
  filesize?: number;
  [key: string]: unknown;
}

// ============================================================================
// Utility Types
// ============================================================================

export type JobStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type DataSource = 'redis' | 'emprops' | 'miniapp' | 'combined';

export interface ForensicsOptions {
  includeHistory?: boolean;
  includeCrossSystemRefs?: boolean;
  includeRecoverySuggestions?: boolean;
  maxSimilarFailures?: number;
  dataSource?: DataSource;
  timeRange?: {
    start: Date;
    end: Date;
  };
}

// ============================================================================
// React Component Types
// ============================================================================

export type SetStateAction<T> = T | ((prev: T) => T);

export interface ComponentState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Type guards for runtime type checking
export const isJobForensicsData = (data: unknown): data is JobForensicsData => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'job' in data &&
    'forensics' in data &&
    'similar_failures' in data &&
    'recovery_suggestions' in data
  );
};

export const isJobWithUserInfo = (data: unknown): data is JobWithUserInfo => {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'status' in data &&
    'created_at' in data
  );
};

// ============================================================================
// Utility Types for Dynamic Data Access
// ============================================================================

// Safe property access for dynamic objects
export type SafeObject = Record<string, unknown>;

// Helper for safe property access
export const safeGet = <T = unknown>(obj: SafeObject, key: string): T | undefined => {
  return obj?.[key] as T;
};

// Helper for safe nested property access
export const safeGetNested = <T = unknown>(obj: SafeObject, path: string): T | undefined => {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as SafeObject)[key];
    } else {
      return undefined;
    }
  }

  return current as T;
};

// Type guard for objects with specific properties
export const hasProperty = <K extends string>(obj: unknown, key: K): obj is Record<K, unknown> => {
  return typeof obj === 'object' && obj !== null && key in obj;
};

// Safe string conversion for display
export const safeString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

// Safe array conversion
export const safeArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  return [];
};

// React Node safe conversion
export const safeReactNode = (value: unknown): React.ReactNode => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (React.isValidElement(value)) return value;
  return JSON.stringify(value);
};
