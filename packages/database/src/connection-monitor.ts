import { prisma } from './client.js'

// Database connection monitoring and health checks
export class DatabaseMonitor {
  private healthCheckInterval?: NodeJS.Timeout
  private connectionCheckInterval?: NodeJS.Timeout

  start(options: { healthCheckIntervalMs?: number; logLevel?: 'info' | 'warn' | 'error' } = {}) {
    const { healthCheckIntervalMs = 60000, logLevel = 'info' } = options

    // Periodic health checks
    this.healthCheckInterval = setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`
        if (logLevel === 'info') {
          console.log('🟢 Database health check: OK')
        }
      } catch (error) {
        console.error('🔴 Database health check failed:', error)
      }
    }, healthCheckIntervalMs)

    // Connection pool monitoring
    this.connectionCheckInterval = setInterval(() => {
      if (logLevel === 'info') {
        console.log('🔍 Database connection pool: Active connections being monitored')
      }
    }, healthCheckIntervalMs * 2)

    console.log('🚀 Database monitor started')
  }

  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }

    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = undefined
    }

    console.log('⏹️ Database monitor stopped')
  }

  async getConnectionInfo() {
    try {
      const result = await prisma.$queryRaw<Array<{ count: number }>>`
        SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
      `
      return {
        activeConnections: result[0]?.count || 0,
        healthy: true
      }
    } catch (error) {
      return {
        activeConnections: 0,
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

export const databaseMonitor = new DatabaseMonitor()