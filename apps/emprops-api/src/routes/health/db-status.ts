import { Request, Response } from "express";
import { Pool } from "pg";
import { getPrismaClient } from '@emp/database';

export const dbHealthCheck =
  (pool: Pool) => async (req: Request, res: Response) => {
    const prisma = getPrismaClient();
    const healthStatus = {
      status: "ok",
      timestamp: new Date().toISOString(),
      checks: {
        prisma: {
          status: "unknown",
          responseTime: 0,
          error: null as string | null,
        },
        pgPool: {
          status: "unknown",
          totalConnections: pool.totalCount,
          idleConnections: pool.idleCount,
          waitingRequests: pool.waitingCount,
          responseTime: 0,
          error: null as string | null,
        },
      },
    };

    // Test Prisma connection
    const prismaStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthStatus.checks.prisma.status = "healthy";
      healthStatus.checks.prisma.responseTime = Date.now() - prismaStart;
    } catch (error) {
      healthStatus.checks.prisma.status = "unhealthy";
      healthStatus.checks.prisma.error = (error as Error).message;
      healthStatus.status = "degraded";
    }

    // Test PG Pool connection
    const pgStart = Date.now();
    try {
      const client = await pool.connect();
      await client.query("SELECT NOW()");
      client.release();
      healthStatus.checks.pgPool.status = "healthy";
      healthStatus.checks.pgPool.responseTime = Date.now() - pgStart;
    } catch (error) {
      healthStatus.checks.pgPool.status = "unhealthy";
      healthStatus.checks.pgPool.error = (error as Error).message;
      healthStatus.status = "degraded";
    }

    // Set overall status
    if (
      healthStatus.checks.prisma.status === "unhealthy" &&
      healthStatus.checks.pgPool.status === "unhealthy"
    ) {
      healthStatus.status = "unhealthy";
    }

    res.status(healthStatus.status === "ok" ? 200 : 503).json(healthStatus);
  };
