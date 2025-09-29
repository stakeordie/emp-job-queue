// Main database package exports (matching EmProps API structure)
export {
  prisma,
  getPrismaClient,
  createPrismaClient,
  disconnectPrisma,
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth
} from './client.js'

// PostgreSQL pool exports
export {
  createPgPool,
  monitorPool
} from './pg-pool.js'

// Database connection monitoring
export { databaseMonitor } from './connection-monitor.js'

// Re-export Prisma types for EmProps API compatibility
export type {
  Job,
  JobHistory,
  Workflow,
  Collection,
  Project,
  Customer,
  Profile
} from './client.js'

// Export PrismaClient as both type and value for proper TypeScript compatibility
export { PrismaClient } from './client.js'

// Export all Prisma generated types for EmProps API compatibility
export type {
  // All table types with original names (lowercase)
  job,
  job_history,
  workflow,
  collection,
  collection_history,
  collection_preview,
  collection_preview_version,
  collection_remix,
  collection_reward,
  collection_reward_redemption,
  collection_sales_receiver,
  collection_sample_image,
  component,
  component_flat_file,
  credits_balance,
  credits_history,
  custom_node,
  flat_file,
  project,
  project_history,
  profile,
} from '@prisma/client'

// Export enums as values (not just types)
export { social_org_enum } from '@prisma/client'

// Re-export Prisma namespace
export { Prisma } from '@prisma/client'

// Export common database operations
export * from './operations.js'