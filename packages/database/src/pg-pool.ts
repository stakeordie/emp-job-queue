import { Pool } from "pg";

// Create PostgreSQL pool with proper configuration (matching EmProps setup)
export const createPgPool = () => {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Connection pool configuration
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 10000, // Return an error if connection takes longer than 10 seconds
    // Keep-alive configuration
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    // Statement timeout
    statement_timeout: 60000,
    idle_in_transaction_session_timeout: 60000,
  });
};

// Monitor pool health
export const monitorPool = (pool: Pool, name: string) => {
  pool.on("error", (err) => {
    console.error(`${name} pool error:`, err);
  });

  pool.on("connect", () => {
    console.log(`${name} pool: client connected`);
  });

  pool.on("acquire", () => {
    console.log(
      `${name} pool stats: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`,
    );
  });

  pool.on("remove", () => {
    console.log(`${name} pool: client removed`);
  });

  // Periodic health check
  setInterval(() => {
    console.log(
      `${name} pool health: ${pool.totalCount} total, ${pool.idleCount} idle, ${pool.waitingCount} waiting`,
    );
  }, 60000); // Log every minute
};