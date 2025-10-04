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

  // Step 2: Check EmProps Database (step table - steps belonging to this job)
  await executeStep(results, {
    step: 'EmProps Database - Job Steps',
    query: `SELECT "id", "job_id", "step_name", "step_type", "status", "started_at", "completed_at", "step_order", "retry_attempt", "error_message" FROM "step" WHERE "job_id" = '${workflowId}' ORDER BY "step_order" ASC`,
    executor: async () => {
      const steps = await prisma.step.findMany({
        where: { job_id: workflowId },
        select: {
          id: true,
          job_id: true,
          step_name: true,
          step_type: true,
          status: true,
          started_at: true,
          completed_at: true,
          input_data: true,
          output_data: true,
          error_message: true,
          step_order: true,
          retry_attempt: true
        },
        orderBy: { step_order: 'asc' }
      });
      return steps.length > 0 ? steps : null;
    }
  });

  // Step 3: Check if workflowId is actually a step ID
  await executeStep(results, {
    step: 'EmProps Database - Step Record (if ID is a step)',
    query: `SELECT "id", "job_id", "step_name", "step_type", "status", "started_at", "completed_at", "step_order", "retry_attempt", "error_message" FROM "step" WHERE "id" = '${workflowId}' LIMIT 1`,
    executor: async () => {
      const step = await prisma.step.findUnique({
        where: { id: workflowId },
        select: {
          id: true,
          job_id: true,
          step_name: true,
          step_type: true,
          status: true,
          started_at: true,
          completed_at: true,
          input_data: true,
          output_data: true,
          error_message: true,
          step_order: true,
          retry_attempt: true,
          job: {
            select: {
              id: true,
              name: true,
              status: true
            }
          }
        }
      });
      return step;
    }
  });

  // Step 4: Check EmProps Database (miniapp_generation table)
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

  // Step 5: Check Redis - Direct job lookup
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

  // Step 6: Check Redis - Workflow job lookup
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

  // Step 8: Check Redis - Jobs:completed
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

  // Step 9: Check Redis - Jobs:active
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

  // Step 10: Check Redis - Jobs:pending
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

  // Step 11: Check EmProps API
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

  // Step 12: Check Worker Attestations - Worker Failures
  await executeStep(results, {
    step: 'Redis - Worker Failure Attestations',
    query: `KEYS worker:failure:*step-id:${workflowId}*\nKEYS worker:failure:*job-id:${workflowId}*\nThen HGETALL for each key`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const stepId = workflowId.startsWith('step-') ? workflowId.substring(5) : workflowId;
        const patterns = [
          `worker:failure:*step-id:${stepId}*`,
          `worker:failure:*job-id:${workflowId}*`,
          `worker:failure:job-id:${workflowId}*`,
        ];

        const attestations = [];
        for (const pattern of patterns) {
          const keys = await redis.keys(pattern);
          for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
              attestations.push({ key, data: JSON.parse(data) });
            }
          }
        }

        return attestations.length > 0 ? attestations : null;
      }, 'worker failure attestations');
    }
  });

  // Step 13: Check Worker Attestations - Worker Completions
  await executeStep(results, {
    step: 'Redis - Worker Completion Attestations',
    query: `KEYS worker:completion:*step-id:${workflowId}*\nKEYS worker:completion:*job-id:${workflowId}*\nThen HGETALL for each key`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const stepId = workflowId.startsWith('step-') ? workflowId.substring(5) : workflowId;
        const patterns = [
          `worker:completion:*step-id:${stepId}*`,
          `worker:completion:*job-id:${workflowId}*`,
          `worker:completion:job-id:${workflowId}*`,
        ];

        const attestations = [];
        for (const pattern of patterns) {
          const keys = await redis.keys(pattern);
          for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
              attestations.push({ key, data: JSON.parse(data) });
            }
          }
        }

        return attestations.length > 0 ? attestations : null;
      }, 'worker completion attestations');
    }
  });

  // Step 14: Check API Workflow Attestations
  await executeStep(results, {
    step: 'Redis - API Workflow Attestations',
    query: `KEYS api:workflow:failure:${workflowId}*\nKEYS api:workflow:completion:${workflowId}*`,
    executor: async () => {
      return await safeRedisOperation(async () => {
        const { redis } = await getMonitorRedisConnection();
        const patterns = [
          `api:workflow:failure:${workflowId}*`,
          `api:workflow:completion:${workflowId}*`,
        ];

        const attestations = [];
        for (const pattern of patterns) {
          const keys = await redis.keys(pattern);
          for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
              attestations.push({ key, data: JSON.parse(data) });
            }
          }
        }

        return attestations.length > 0 ? attestations : null;
      }, 'API workflow attestations');
    }
  });

  // Step 15: Check Flat Files (Generated Images)
  await executeStep(results, {
    step: 'EmProps Database - Flat Files',
    query: `SELECT "id", "url", "name", "mime_type", "rel_type", "rel_id", "created_at" FROM "flat_file" WHERE "rel_id" = '${workflowId}' AND "rel_type" IN ('component_test', 'workflow_test', 'preview', 'collection_generation') ORDER BY "created_at" DESC`,
    executor: async () => {
      const flatFiles = await prisma.flat_file.findMany({
        where: {
          rel_id: workflowId,
          rel_type: {
            in: ['component_test', 'workflow_test', 'preview', 'collection_generation'],
          },
        },
        select: {
          id: true,
          url: true,
          name: true,
          mime_type: true,
          rel_type: true,
          rel_id: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
      });
      return flatFiles.length > 0 ? flatFiles : null;
    }
  });

  // Step 16: Check Job Retry Backups
  await executeStep(results, {
    step: 'EmProps Database - Job Retry Backups',
    query: `SELECT "id", "original_job_id", "retry_attempt", "original_status", "backed_up_at" FROM "job_retry_backup" WHERE "original_job_id" = '${workflowId}' ORDER BY "retry_attempt" ASC`,
    executor: async () => {
      const retryBackups = await prisma.job_retry_backup.findMany({
        where: { original_job_id: workflowId },
        select: {
          id: true,
          original_job_id: true,
          retry_attempt: true,
          original_status: true,
          original_data: true,
          original_workflow_output: true,
          backed_up_at: true,
        },
        orderBy: { retry_attempt: 'asc' },
      });
      return retryBackups.length > 0 ? retryBackups : null;
    }
  });

  // Step 17: Check Job History
  await executeStep(results, {
    step: 'EmProps Database - Job History',
    query: `SELECT "id", "job_id", "status", "message", "created_at" FROM "job_history" WHERE "job_id" = '${workflowId}' ORDER BY "created_at" DESC LIMIT 20`,
    executor: async () => {
      const history = await prisma.job_history.findMany({
        where: { job_id: workflowId },
        select: {
          id: true,
          job_id: true,
          status: true,
          message: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        take: 20,
      });
      return history.length > 0 ? history : null;
    }
  });

  // Step 18: Check Collection Data
  await executeStep(results, {
    step: 'EmProps Database - Collection',
    query: `SELECT "id", "title", "description", "status", "data" FROM "collection" WHERE "data"->>'workflow_id' = '${workflowId}' LIMIT 1`,
    executor: async () => {
      const collection = await prisma.collection.findFirst({
        where: {
          data: {
            path: ['workflow_id'],
            equals: workflowId,
          },
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          data: true,
        },
      });
      return collection;
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

