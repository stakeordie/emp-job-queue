import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";

/**
 * Get job status endpoint
 */
export const getJobStatus = (prisma: PrismaClientType) => {
  return async (req: Request, res: Response) => {
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({
        data: null,
        error: "Job ID is required",
      });
    }

    try {
      // Get the job without its history
      const job = await prisma.job.findUnique({
        where: {
          id: jobId,
        },
      });

      if (!job) {
        return res.status(404).json({
          data: null,
          error: "Job not found",
        });
      }

      // Check if user has permission to view this job
      const userId = req.headers["user_id"] as string;
      if (userId !== job.user_id) {
        return res.status(403).json({
          data: null,
          error: "You don't have permission to view this job",
        });
      }

      return res.status(200).json({
        data: {
          id: job.id,
          name: job.name,
          description: job.description,
          status: job.status,
          progress: job.progress,
          error_message: job.error_message,
          created_at: job.created_at,
          updated_at: job.updated_at,
          started_at: job.started_at,
          completed_at: job.completed_at,
          job_type: job.job_type,
          priority: job.priority,
          data: job.data,
        },
        error: null,
      });
    } catch (error) {
      return res.status(500).json({
        data: null,
        error: `Failed to get job status: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };
};

/**
 * Get all jobs for a user
 */
export const getUserJobs = (prisma: PrismaClientType) => {
  return async (req: Request, res: Response) => {
    const userId = req.headers["user_id"] as string;

    if (!userId) {
      return res.status(400).json({
        data: null,
        error: "User ID is required",
      });
    }

    try {
      // Parse query parameters
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;
      const jobType = req.query.job_type as string;

      // Build where clause
      const where: any = { user_id: userId };
      if (status) where.status = status;
      if (jobType) where.job_type = jobType;

      // Get jobs
      const jobs = await prisma.job.findMany({
        where,
        orderBy: {
          created_at: "desc",
        },
        take: limit,
        skip: offset,
      });

      // Get total count
      const totalCount = await prisma.job.count({ where });

      return res.status(200).json({
        data: {
          jobs: jobs.map((job) => ({
            id: job.id,
            name: job.name,
            description: job.description,
            status: job.status,
            progress: job.progress,
            created_at: job.created_at,
            updated_at: job.updated_at,
            started_at: job.started_at,
            completed_at: job.completed_at,
            job_type: job.job_type,
            priority: job.priority,
          })),
          pagination: {
            total: totalCount,
            limit,
            offset,
          },
        },
        error: null,
      });
    } catch (error) {
      return res.status(500).json({
        data: null,
        error: `Failed to get user jobs: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };
};

/**
 * Get job history endpoint
 */
export const getJobHistory = (prisma: PrismaClientType) => {
  return async (req: Request, res: Response) => {
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({
        data: null,
        error: "Job ID is required",
      });
    }

    try {
      // First check if the job exists and if the user has permission
      const job = await prisma.job.findUnique({
        where: {
          id: jobId,
        },
      });

      if (!job) {
        return res.status(404).json({
          data: null,
          error: "Job not found",
        });
      }

      // Check if user has permission to view this job
      const userId = req.headers["user_id"] as string;
      if (userId !== job.user_id) {
        return res.status(403).json({
          data: null,
          error: "You don't have permission to view this job history",
        });
      }

      // Get the job history
      const jobHistory = await prisma.job_history.findMany({
        where: {
          job_id: jobId,
        },
        orderBy: {
          created_at: "asc",
        },
      });

      return res.status(200).json({
        data: jobHistory.map((history) => ({
          id: history.id,
          status: history.status,
          message: history.message,
          created_at: history.created_at,
          data: history.data,
        })),
        error: null,
      });
    } catch (error) {
      return res.status(500).json({
        data: null,
        error: `Failed to get job history: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };
};
