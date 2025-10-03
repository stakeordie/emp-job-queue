import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@emergexyz/db';
import { getMonitorRedisConnection, safeRedisOperation } from '@/lib/redis-connection';

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
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const jobData = await redis.hgetall(`job:${workflowId}`);
        return Object.keys(jobData).length > 0 ? jobData : null;
      }, 'direct job lookup');
    }
  });

  // Step 4: Check Redis - Workflow job lookup
  await executeStep(results, {
    step: 'Redis - Workflow Job Lookup',
    query: `HGETALL job:workflow-${workflowId}`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const jobData = await redis.hgetall(`job:workflow-${workflowId}`);
        return Object.keys(jobData).length > 0 ? jobData : null;
      }, 'workflow job lookup');
    }
  });

  // Step 5: Check Redis - Job by workflow_id
  await executeStep(results, {
    step: 'Redis - Jobs with workflow_id',
    query: `KEYS "job:*"\nThen for each key: HGETALL <key>\nFilter where workflow_id = '${workflowId}'`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const keys = await redis.keys('job:*');
        const jobsWithWorkflowId = [];

        for (const key of keys.slice(0, 100)) { // Limit to first 100 for performance
          try {
            const jobData = await redis.hgetall(key);
            if (jobData.workflow_id === workflowId) {
              jobsWithWorkflowId.push({ key, ...jobData });
            }
          } catch (err) {
            // Skip problematic keys
          }
        }

        return jobsWithWorkflowId.length > 0 ? jobsWithWorkflowId : null;
      }, 'jobs with workflow_id lookup');
    }
  });

  // Step 6: Check Redis - Jobs:completed
  await executeStep(results, {
    step: 'Redis - Completed Jobs',
    query: `HGET "jobs:completed" "${workflowId}"`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const completedJob = await redis.hget('jobs:completed', workflowId);
        if (!completedJob) return null;

        try {
          return JSON.parse(completedJob);
        } catch (error) {
          if (error instanceof SyntaxError) {
            return { raw_value: completedJob, parsing_error: 'Invalid JSON' };
          }
          throw error;
        }
      }, 'completed jobs lookup');
    }
  });

  // Step 7: Check Redis - Jobs:active
  await executeStep(results, {
    step: 'Redis - Active Jobs',
    query: `HGET "jobs:active" "${workflowId}"`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const activeJob = await redis.hget('jobs:active', workflowId);
        if (!activeJob) return null;

        try {
          return JSON.parse(activeJob);
        } catch (error) {
          if (error instanceof SyntaxError) {
            return { raw_value: activeJob, parsing_error: 'Invalid JSON' };
          }
          throw error;
        }
      }, 'active jobs lookup');
    }
  });

  // Step 8: Check Redis - Jobs:pending
  await executeStep(results, {
    step: 'Redis - Pending Jobs',
    query: `LRANGE "jobs:pending" 0 -1\nCheck if "${workflowId}" is in the list`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const pendingJobs = await redis.lrange('jobs:pending', 0, -1);

        const found = pendingJobs.find(job => {
          try {
            const parsed = JSON.parse(job);
            return parsed.id === workflowId || parsed.workflow_id === workflowId;
          } catch {
            return job.includes(workflowId);
          }
        });

        return found ? { found_in_pending: found, total_pending: pendingJobs.length } : null;
      }, 'pending jobs lookup');
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

