import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisService } from '@emp/core';
import type { JobsAPIResponse, JobWithUserInfo } from '@/types/forensics';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const searchParam = url.searchParams.get('search');
  const search = searchParam ? String(searchParam) : null;

  try {
    // Check if DATABASE_URL is configured
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL not configured');
      const noDbResponse: JobsAPIResponse = {
        success: true,
        jobs: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
        warning: 'Database not configured - showing empty results'
      };
      return NextResponse.json(noDbResponse);
    }

    // Test database connection first
    try {
      await prisma.$connect();
    } catch (connectError) {
      console.error('Database connection failed:', connectError);
      const connectionFailedResponse: JobsAPIResponse = {
        success: true,
        jobs: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
        warning: 'Database connection failed - showing empty results'
      };
      return NextResponse.json(connectionFailedResponse);
    }

    // Build search conditions
    let whereCondition = {};
    let searchJobIds: string[] = [];

    let empropsJobs;

    if (search && search.trim()) {
      const searchTerm = String(search.trim());
      const searchPattern = `%${searchTerm}%`;

      // Use raw SQL with joins to search across job and user data
      empropsJobs = await prisma.$queryRaw`
        SELECT t1.id, t1.name, t1.description, t1.status, t1.created_at, t1.updated_at, t1.user_id, t1.job_type, t1.priority, t1.progress, t1.data, t1.error_message,
               t1.started_at, t1.completed_at
        FROM job t1
        LEFT JOIN miniapp_generation t2 ON t1.id::text = t2.job_id
        LEFT JOIN miniapp_user t3 ON t2.user_id = t3.id
        WHERE (
          t1.id::text = ${searchTerm} OR
          t1.user_id::text = ${searchTerm} OR
          t1.name ILIKE ${searchPattern} OR
          t1.description ILIKE ${searchPattern} OR
          t1.job_type ILIKE ${searchPattern} OR
          t1.status = ${searchTerm} OR
          t3.farcaster_username ILIKE ${searchPattern} OR
          t3.farcaster_id ILIKE ${searchPattern}
        )
        ORDER BY t1.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;
    } else {
      // Fetch jobs from EmProps database (user job requests)
      empropsJobs = await prisma.job.findMany({
        where: whereCondition,
      orderBy: { created_at: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        created_at: true,
        updated_at: true,
        user_id: true,
        job_type: true,
        priority: true,
        progress: true,
        data: true,
        error_message: true,
        started_at: true,
        completed_at: true
      }
    });
    }

    // Get unique job IDs to find related miniapp_generation records
    const jobIds = empropsJobs.map(job => job.id);

    // Fetch miniapp generations linked to these jobs (these are the workflow requests from the miniapp)
    const miniappGenerations = jobIds.length > 0 ? await prisma.miniapp_generation.findMany({
      where: {
        job_id: { in: jobIds }
      },
      include: {
        miniapp_user: {
          select: {
            id: true,
            farcaster_username: true,
            farcaster_pfp: true,
            wallet_address: true,
            created_at: true,
            updated_at: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    }) : [];

    // Fetch Redis workflow data (EmProps job.id maps to Redis job.workflow_id)
    let redisWorkflows: any[] = [];
    try {
      // Skip Redis lookup for large result sets to improve performance
      if (empropsJobs.length > 20) {
        console.log('Skipping Redis lookup for performance - too many jobs');
      } else {
        // Use NEXT_PUBLIC_DEFAULT_REDIS_URL for local dev, fallback to individual config
        const redisUrl = process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL;
        let redisConfig;

        if (redisUrl) {
          // Parse URL format: redis://[password@]host:port
          const url = new URL(redisUrl);
          redisConfig = {
            host: url.hostname,
            port: parseInt(url.port) || 6379,
            password: url.password || undefined
          };
        } else {
          redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD
          };
        }

        const redis = new RedisService(redisConfig);
        await redis.connect();

        // Directly lookup specific Redis jobs by ID instead of scanning all keys
        const empropsJobIds = empropsJobs.map(job => job.id);

        for (const jobId of empropsJobIds) {
          try {
            // Try direct job lookup first
            const directJobData = await redis.redis.hgetall(`job:${jobId}`);
            if (directJobData && Object.keys(directJobData).length > 0) {
              redisWorkflows.push({
                redis_job_key: `job:${jobId}`,
                workflow_id: directJobData.workflow_id || jobId,
                ...directJobData,
                created_at: directJobData.created_at ? new Date(directJobData.created_at) : null,
                updated_at: directJobData.updated_at ? new Date(directJobData.updated_at) : null
              });
            }

            // Also check for workflow jobs
            const workflowJobData = await redis.redis.hgetall(`job:workflow-${jobId}`);
            if (workflowJobData && Object.keys(workflowJobData).length > 0) {
              redisWorkflows.push({
                redis_job_key: `job:workflow-${jobId}`,
                workflow_id: workflowJobData.workflow_id || jobId,
                ...workflowJobData,
                created_at: workflowJobData.created_at ? new Date(workflowJobData.created_at) : null,
                updated_at: workflowJobData.updated_at ? new Date(workflowJobData.updated_at) : null
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch Redis data for job ${jobId}:`, err);
          }
        }

        await redis.disconnect();
      }
    } catch (redisError) {
      console.warn('Redis connection failed, continuing without Redis data:', redisError);
    }

    // Create lookup maps - now miniapp_user comes from miniapp_generation
    const miniappMap = new Map(miniappGenerations.map(gen => [gen.job_id, gen]));

    // Group Redis jobs by workflow_id (multiple Redis jobs can belong to one workflow)
    const redisMap = new Map();
    redisWorkflows.forEach(job => {
      if (!redisMap.has(job.workflow_id)) {
        redisMap.set(job.workflow_id, []);
      }
      redisMap.get(job.workflow_id).push(job);
    });

    // Create combined workflow data with all three perspectives
    const enhancedJobs: JobWithUserInfo[] = empropsJobs.map(job => {
      const miniappData = miniappMap.get(job.id);
      return {
        ...job,
        user_info: miniappData?.miniapp_user || null, // Get user from miniapp_generation
        miniapp_data: miniappData || null,
        redis_data: redisMap.get(job.id) || null
      };
    });

    const total = await prisma.job.count({
      where: whereCondition
    });

    const response: JobsAPIResponse = {
      success: true,
      jobs: enhancedJobs,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Error fetching jobs:', error);
    console.error('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.error('Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });

    // Return empty results instead of 500 error to prevent UI breaks
    const errorResponse: JobsAPIResponse = {
      success: true,
      jobs: [],
      total: 0,
      limit,
      offset,
      hasMore: false,
      warning: `Database error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };

    return NextResponse.json(errorResponse);
  }
}