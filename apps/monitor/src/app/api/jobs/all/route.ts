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

    if (search && search.trim()) {
      const searchTerm = String(search.trim());

      // Simple OR search across key fields - just make it work
      whereCondition = {
        OR: [
          { id: { startsWith: searchTerm } },
          { name: { startsWith: searchTerm } },
          { user_id: { startsWith: searchTerm } },
          { status: { equals: searchTerm } }
        ]
      };
    }

    // Fetch jobs from EmProps database (user job requests)
    const empropsJobs = await prisma.job.findMany({
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

    // Get unique job IDs to find related miniapp_generation records
    const jobIds = empropsJobs.map(job => job.id);

    // Fetch miniapp generations linked to these jobs (these are the workflow requests from the miniapp)
    const miniappGenerations = await prisma.miniapp_generation.findMany({
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
    });

    // Fetch Redis workflow data (EmProps job.id maps to Redis job.workflow_id)
    let redisWorkflows: any[] = [];
    try {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD
      };

      const redis = new RedisService(redisConfig);
      await redis.connect();

      // Get all Redis job keys and find ones with workflow_id matching our EmProps jobs
      const jobKeys = await redis.redis.keys('job:*');
      const empropsJobIds = new Set(empropsJobs.map(job => job.id));

      for (const jobKey of jobKeys) {
        try {
          const workflowId = await redis.redis.hget(jobKey, 'workflow_id');
          if (workflowId && empropsJobIds.has(workflowId)) {
            // This Redis job belongs to one of our EmProps workflows
            const jobData = await redis.redis.hgetall(jobKey);
            redisWorkflows.push({
              redis_job_key: jobKey,
              workflow_id: workflowId,
              ...jobData,
              created_at: jobData.created_at ? new Date(jobData.created_at) : null,
              updated_at: jobData.updated_at ? new Date(jobData.updated_at) : null
            });
          }
        } catch (err) {
          console.warn(`Failed to fetch Redis data for ${jobKey}:`, err);
        }
      }

      await redis.disconnect();
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