/**
 * Service Type Definitions for EMP Job Queue
 *
 * This file defines the standardized service and worker types used throughout
 * the system, replacing the ambiguous "internal" type with specific, descriptive types.
 */

/**
 * Service Types - How services are deployed and managed
 */
export const SERVICE_TYPES = {
  // Services we run and manage locally
  PM2_SERVICE: 'pm2_service',          // PM2-managed processes (ComfyUI, simulation services)
  DAEMON_SERVICE: 'daemon_service',     // Binary daemons (Ollama, vLLM, Redis, PostgreSQL)
  MANAGED_SERVICE: 'managed_service',   // Legacy: being phased out

  // Services we connect to but don't manage
  EXTERNAL_API: 'external_api',        // External APIs (OpenAI, Anthropic)
  EXTERNAL_SERVICE: 'external_service', // Remote services (remote ComfyUI, remote databases)
};

/**
 * Worker Types - How workers interact with services
 */
export const WORKER_TYPES = {
  DIRECT_WORKER: 'direct_worker',      // Worker directly executes workload (current pattern)
  SERVICE_CLIENT: 'service_client',    // Worker connects to local/remote service (legacy)
  DAEMON_CLIENT: 'daemon_client',      // Worker connects to local daemon service
};

/**
 * Service Subtypes - Implementation details for managed services
 */
export const SERVICE_SUBTYPES = {
  BINARY: 'binary',      // Standalone binary executable (ollama serve)
  DOCKER: 'docker',      // Docker container service
  SYSTEMD: 'systemd',    // System service managed by systemd
  PM2: 'pm2',           // PM2-managed process (for compatibility)
};

/**
 * Scaling Strategies - How to determine instance counts
 */
export const SCALING_STRATEGIES = {
  GPU_BOUND: 'gpu_bound',         // Scale based on GPU count (ComfyUI pattern)
  CONCURRENCY: 'concurrency',     // Scale based on desired concurrency (Ollama pattern)
  SINGLETON: 'singleton',         // Only one instance per machine (databases)
};

/**
 * Validation helpers
 */
export function isValidServiceType(type) {
  return Object.values(SERVICE_TYPES).includes(type);
}

export function isValidWorkerType(type) {
  return Object.values(WORKER_TYPES).includes(type);
}

export function isValidServiceSubtype(subtype) {
  return Object.values(SERVICE_SUBTYPES).includes(subtype);
}

export function isValidScalingStrategy(strategy) {
  return Object.values(SCALING_STRATEGIES).includes(strategy);
}

/**
 * Migration helpers - for transitioning from old "internal" type
 */
export function migrateFromInternalType(serviceConfig) {
  if (serviceConfig.type === 'internal') {
    // Default internal services to pm2_service
    return {
      ...serviceConfig,
      type: SERVICE_TYPES.PM2_SERVICE
    };
  }
  return serviceConfig;
}

/**
 * Type compatibility matrix - which combinations are valid
 */
export const TYPE_COMPATIBILITY = {
  [SERVICE_TYPES.PM2_SERVICE]: {
    validSubtypes: [SERVICE_SUBTYPES.PM2],
    validWorkerTypes: [WORKER_TYPES.DIRECT_WORKER],
    validScalingStrategies: [SCALING_STRATEGIES.GPU_BOUND, SCALING_STRATEGIES.CONCURRENCY]
  },
  [SERVICE_TYPES.MANAGED_SERVICE]: {
    validSubtypes: [SERVICE_SUBTYPES.BINARY, SERVICE_SUBTYPES.DOCKER, SERVICE_SUBTYPES.SYSTEMD],
    validWorkerTypes: [WORKER_TYPES.SERVICE_CLIENT],
    validScalingStrategies: [SCALING_STRATEGIES.SINGLETON, SCALING_STRATEGIES.CONCURRENCY]
  },
  [SERVICE_TYPES.EXTERNAL_API]: {
    validSubtypes: [],
    validWorkerTypes: [WORKER_TYPES.SERVICE_CLIENT],
    validScalingStrategies: [SCALING_STRATEGIES.CONCURRENCY]
  },
  [SERVICE_TYPES.EXTERNAL_SERVICE]: {
    validSubtypes: [],
    validWorkerTypes: [WORKER_TYPES.SERVICE_CLIENT],
    validScalingStrategies: [SCALING_STRATEGIES.CONCURRENCY]
  }
};