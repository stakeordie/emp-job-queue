import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisService } from '@emp/core';
import type { JobsAPIResponse, JobWithUserInfo } from '@/types/forensics';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');

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

    // Fetch jobs from EmProps database (user job requests)
    const empropsJobs = await prisma.job.findMany({
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

    // Get unique user IDs and fetch user info from miniapp_user
    const userIds = Array.from(new Set(empropsJobs.map(job => job.user_id)));
    const users = await prisma.miniapp_user.findMany({
      where: {
        id: { in: userIds }
      },
      select: {
        id: true,
        farcaster_username: true,
        farcaster_pfp: true,
        wallet_address: true,
        created_at: true,
        updated_at: true
      }
    });

    // Fetch miniapp generations for same user IDs (these are the workflow requests from the miniapp)
    const miniappGenerations = await prisma.miniapp_generation.findMany({
      where: {
        user_id: { in: userIds }
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        user_id: true,
        collection_id: true,
        payment_id: true,
        input_data: true,
        output_url: true,
        output_data: true,
        error_message: true,
        created_at: true,
        updated_at: true,
        generated_image: true,
        job_id: true,
        status: true
      }
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

    // Create lookup maps
    const userMap = new Map(users.map((user: typeof users[0]) => [user.id, user]));
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
    const enhancedJobs: JobWithUserInfo[] = empropsJobs.map(job => ({
      ...job,
      user_info: userMap.get(job.user_id) || null,
      miniapp_data: miniappMap.get(job.id) || null,
      redis_data: redisMap.get(job.id) || null
    }));

    const total = await prisma.job.count();

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