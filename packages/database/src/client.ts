import { PrismaClient } from '@prisma/client'

// Create a singleton Prisma client with proper connection pooling (matching EmProps setup)
export const createPrismaClient = () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Parse the connection string to add pool parameters
  const url = new URL(databaseUrl);

  // Add connection pooling parameters (matching EmProps configuration)
  url.searchParams.set("connection_limit", "20"); // Maximum connections in the pool
  url.searchParams.set("pool_timeout", "10"); // Seconds to wait for a connection
  url.searchParams.set("connect_timeout", "30"); // Connection timeout in seconds
  url.searchParams.set("statement_timeout", "60000"); // Statement timeout in milliseconds
  url.searchParams.set("idle_in_transaction_session_timeout", "60000"); // Idle transaction timeout

  return new PrismaClient({
    datasources: {
      db: {
        url: url.toString(),
      },
    },
    transactionOptions: {
      maxWait: 10000, // Max time to wait for a transaction slot (ms)
      timeout: 20000, // Max time for a transaction to complete (ms)
      isolationLevel: "ReadCommitted",
    },
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

// Create singleton instance
let prismaInstance: PrismaClient;

export const getPrismaClient = () => {
  if (!prismaInstance) {
    prismaInstance = createPrismaClient();
  }

  return prismaInstance;
};

// Export default prisma instance for compatibility
export const prisma = getPrismaClient();

// Export Prisma types for use throughout the application
export type {
  job as Job,
  job_history as JobHistory,
  workflow as Workflow,
  collection as Collection,
  project as Project,
  customer as Customer,
  profile as Profile
} from '@prisma/client'

// Export PrismaClient as both type and value
export { PrismaClient } from '@prisma/client'

// Graceful shutdown helper (matching EmProps)
export const disconnectPrisma = async () => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    console.log('🔌 Database disconnected')
  }
};

// Legacy compatibility functions
export async function connectDatabase() {
  try {
    await getPrismaClient().$connect()
    console.log('✅ Database connected successfully')
  } catch (error) {
    console.error('❌ Database connection failed:', error)
    throw error
  }
}

export async function disconnectDatabase() {
  await disconnectPrisma()
}

// Health check
export async function checkDatabaseHealth() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { healthy: true, message: 'Database is responding' }
  } catch (error) {
    return { healthy: false, message: `Database health check failed: ${error}` }
  }
}