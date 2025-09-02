import { PrismaClient } from '@emp/database'

// Type alias to extract the instance type from PrismaClient constructor
export type PrismaClientType = InstanceType<typeof PrismaClient>

// Re-export everything else from the database package
export * from '@emp/database'