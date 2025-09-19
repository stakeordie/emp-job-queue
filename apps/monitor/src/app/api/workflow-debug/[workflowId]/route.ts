import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { RedisService } from '@emp/core';

interface QueryResult {
  step: string;
  query: string;
  result: any;
  status: 'success' | 'error' | 'empty';
  timing: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  const { workflowId } = await params;
  const results: QueryResult[] = [];

  // Step 1: Check EmProps Database (job table)
  await executeStep(results, {
    step: 'EmProps Database - Job Record',
    query: `SELECT "id", "name", "description", "status", "created_at", "updated_at", "user_id", "job_type", "priority", "progress", "data", "error_message", "started_at", "completed_at" FROM "job" WHERE "id" = '${workflowId}' LIMIT 1`,
    executor: async () => {
      const job = await prisma.job.findUnique({
        where: { id: workflowId },
        include: {
          miniapp_generation: {
            include: {
              miniapp_user: true
            }
          }
        }
      });
      return job;
    }
  });

  // Step 2: Check EmProps Database (miniapp_generation table)
  await executeStep(results, {
    step: 'EmProps Database - Miniapp Generation',
    query: `SELECT "id", "job_id", "user_id", "prompt", "image_base64", "status", "generated_image", "created_at", "updated_at" FROM "miniapp_generation" WHERE "job_id" = '${workflowId}' LIMIT 1`,
    executor: async () => {
      const generation = await prisma.miniapp_generation.findFirst({
        where: { job_id: workflowId },
        include: {
          miniapp_user: true
        }
      });
      return generation;
    }
  });

  // Step 3: Check Redis - Direct job lookup
  await executeStep(results, {
    step: 'Redis - Direct Job Lookup',
    query: `HGETALL job:${workflowId}`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const jobData = await redis.redis.hgetall(`job:${workflowId}`);
        await redis.disconnect();
        return Object.keys(jobData).length > 0 ? jobData : null;
      } catch (error) {
        await redis.disconnect();
        throw error;
      }
    }
  });

  // Step 4: Check Redis - Workflow job lookup
  await executeStep(results, {
    step: 'Redis - Workflow Job Lookup',
    query: `HGETALL job:workflow-${workflowId}`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const jobData = await redis.redis.hgetall(`job:workflow-${workflowId}`);
        await redis.disconnect();
        return Object.keys(jobData).length > 0 ? jobData : null;
      } catch (error) {
        await redis.disconnect();
        throw error;
      }
    }
  });

  // Step 5: Check Redis - Job by workflow_id
  await executeStep(results, {
    step: 'Redis - Jobs with workflow_id',
    query: `KEYS "job:*"\nThen for each key: HGETALL <key>\nFilter where workflow_id = '${workflowId}'`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const keys = await redis.redis.keys('job:*');
        const jobsWithWorkflowId = [];

        for (const key of keys.slice(0, 100)) { // Limit to first 100 for performance
          try {
            const jobData = await redis.redis.hgetall(key);
            if (jobData.workflow_id === workflowId) {
              jobsWithWorkflowId.push({ key, ...jobData });
            }
          } catch (err) {
            // Skip problematic keys
          }
        }

        await redis.disconnect();
        return jobsWithWorkflowId.length > 0 ? jobsWithWorkflowId : null;
      } catch (error) {
        await redis.disconnect();
        throw error;
      }
    }
  });

  // Step 6: Check Redis - Jobs:completed
  await executeStep(results, {
    step: 'Redis - Completed Jobs',
    query: `HGET "jobs:completed" "${workflowId}"`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const completedJob = await redis.redis.hget('jobs:completed', workflowId);
        await redis.disconnect();
        return completedJob ? JSON.parse(completedJob) : null;
      } catch (error) {
        await redis.disconnect();
        if (error instanceof SyntaxError) {
          // Return raw value if JSON parsing fails
          const redis2 = await getRedisConnection();
          if (redis2) {
            const raw = await redis2.redis.hget('jobs:completed', workflowId);
            await redis2.disconnect();
            return { raw_value: raw, parsing_error: 'Invalid JSON' };
          }
        }
        throw error;
      }
    }
  });

  // Step 7: Check Redis - Jobs:active
  await executeStep(results, {
    step: 'Redis - Active Jobs',
    query: `HGET "jobs:active" "${workflowId}"`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const activeJob = await redis.redis.hget('jobs:active', workflowId);
        await redis.disconnect();
        return activeJob ? JSON.parse(activeJob) : null;
      } catch (error) {
        await redis.disconnect();
        if (error instanceof SyntaxError) {
          const redis2 = await getRedisConnection();
          if (redis2) {
            const raw = await redis2.redis.hget('jobs:active', workflowId);
            await redis2.disconnect();
            return { raw_value: raw, parsing_error: 'Invalid JSON' };
          }
        }
        throw error;
      }
    }
  });

  // Step 8: Check Redis - Jobs:pending
  await executeStep(results, {
    step: 'Redis - Pending Jobs',
    query: `LRANGE "jobs:pending" 0 -1\nCheck if "${workflowId}" is in the list`,
    executor: async () => {
      const redis = await getRedisConnection();
      if (!redis) return null;

      try {
        const pendingJobs = await redis.redis.lrange('jobs:pending', 0, -1);
        await redis.disconnect();

        const found = pendingJobs.find(job => {
          try {
            const parsed = JSON.parse(job);
            return parsed.id === workflowId || parsed.workflow_id === workflowId;
          } catch {
            return job.includes(workflowId);
          }
        });

        return found ? { found_in_pending: found, total_pending: pendingJobs.length } : null;
      } catch (error) {
        await redis.disconnect();
        throw error;
      }
    }
  });

  // Step 9: Check EmProps API
  await executeStep(results, {
    step: 'EmProps API - Job Status',
    query: `curl -H "Authorization: Bearer ${process.env.EMPROPS_API_KEY?.substring(0, 10)}..." -H "Accept: application/json" "${process.env.EMPROPS_API_URL}/jobs/${workflowId}"`,
    executor: async () => {
      const empropsApiUrl = process.env.EMPROPS_API_URL;
      const empropsApiKey = process.env.EMPROPS_API_KEY;

      if (!empropsApiUrl || !empropsApiKey) {
        return { error: 'EmProps API not configured' };
      }

      const response = await fetch(`${empropsApiUrl}/jobs/${workflowId}`, {
        headers: {
          'Authorization': `Bearer ${empropsApiKey}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return { error: `API returned ${response.status}`, status: response.status };
      }

      return await response.json();
    }
  });

  return NextResponse.json({
    success: true,
    workflowId,
    results
  });
}

async function executeStep(
  results: QueryResult[],
  config: {
    step: string;
    query: string;
    executor: () => Promise<any>;
  }
) {
  const startTime = Date.now();

  try {
    const result = await config.executor();
    const timing = Date.now() - startTime;

    results.push({
      step: config.step,
      query: config.query,
      result: result,
      status: result ? 'success' : 'empty',
      timing
    });
  } catch (error) {
    const timing = Date.now() - startTime;

    results.push({
      step: config.step,
      query: config.query,
      result: error instanceof Error ? error.message : 'Unknown error',
      status: 'error',
      timing
    });
  }
}

async function getRedisConnection() {
  try {
    const redisUrl = process.env.NEXT_PUBLIC_DEFAULT_REDIS_URL;
    let redisConfig;

    if (redisUrl) {
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
    return redis;
  } catch (error) {
    console.error('Redis connection failed:', error);
    return null;
  }
}