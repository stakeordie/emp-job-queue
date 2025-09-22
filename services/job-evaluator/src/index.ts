#!/usr/bin/env node

import { PrismaClient } from '../../../packages/emprops-prisma-client/generated/client';
import { createLogger } from '../../../packages/core/src/logging/logger';

const logger = createLogger('job-evaluator');
const prisma = new PrismaClient();

interface JobEvaluationResult {
  status_category: 'filed' | 'complete' | 'incomplete';
  problem_type?: string;
  problem_details?: any;
}

class JobEvaluator {
  async evaluateJobs(): Promise<void> {
    logger.info('Starting job evaluation run');

    try {
      // Get all jobs that haven't been evaluated yet
      const unevaluatedJobs = await prisma.job.findMany({
        where: {
          is_cleanup_evaluated: false,
          // Only evaluate jobs that are in a final state or have been around for a while
          OR: [
            { status: { in: ['completed', 'failed', 'canceled'] } },
            {
              created_at: {
                lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes old
              }
            }
          ]
        },
        include: {
          job_history: {
            orderBy: { created_at: 'desc' }
          },
          job_retry_backup: true
        },
        orderBy: {
          created_at: 'asc'
        },
        take: 100 // Process in batches
      });

      logger.info(`Found ${unevaluatedJobs.length} jobs to evaluate`);

      for (const job of unevaluatedJobs) {
        try {
          const evaluation = await this.evaluateJob(job);

          await prisma.job.update({
            where: { id: job.id },
            data: {
              is_cleanup_evaluated: true,
              status_category: evaluation.status_category,
              problem_type: evaluation.problem_type,
              problem_details: evaluation.problem_details,
              evaluated_at: new Date()
            }
          });

          logger.debug(`Evaluated job ${job.id}: ${evaluation.status_category}`, {
            jobId: job.id,
            category: evaluation.status_category,
            problemType: evaluation.problem_type
          });

        } catch (error) {
          logger.error(`Failed to evaluate job ${job.id}:`, error);
        }
      }

      logger.info('Job evaluation run completed');

    } catch (error) {
      logger.error('Job evaluation run failed:', error);
      throw error;
    }
  }

  private async evaluateJob(job: any): Promise<JobEvaluationResult> {
    const { status, data, workflow_output, error_message, completed_at, created_at, job_history, retry_count, max_retries } = job;

    // Check if job is properly completed
    if (status === 'completed') {
      return this.evaluateCompletedJob(job);
    }

    // Check if job failed
    if (status === 'failed') {
      return this.evaluateFailedJob(job);
    }

    // Check if job was canceled
    if (status === 'canceled') {
      return {
        status_category: 'filed',
        problem_type: 'canceled',
        problem_details: {
          reason: 'Job was explicitly canceled',
          final_status: status
        }
      };
    }

    // Check for stuck jobs
    if (this.isJobStuck(job)) {
      return this.evaluateStuckJob(job);
    }

    // Job is still in progress but seems normal
    if (['pending', 'processing', 'running'].includes(status)) {
      return {
        status_category: 'incomplete',
        problem_type: 'in_progress',
        problem_details: {
          reason: 'Job is still in progress',
          age_minutes: Math.round((Date.now() - new Date(created_at).getTime()) / (1000 * 60)),
          current_status: status
        }
      };
    }

    // Unknown status
    return {
      status_category: 'incomplete',
      problem_type: 'unknown_status',
      problem_details: {
        reason: 'Job has unknown status',
        status: status
      }
    };
  }

  private evaluateCompletedJob(job: any): JobEvaluationResult {
    const { data, workflow_output, job_history } = job;

    // Check if we have workflow output (indicates successful processing)
    if (!workflow_output) {
      return {
        status_category: 'incomplete',
        problem_type: 'missing_workflow_output',
        problem_details: {
          reason: 'Job marked as completed but has no workflow_output',
          has_data: !!data,
          latest_history: job_history?.[0]?.status
        }
      };
    }

    // Check if output indicates successful generation
    const outputs = data?.outputs;
    if (!outputs || (Array.isArray(outputs) && outputs.length === 0)) {
      return {
        status_category: 'incomplete',
        problem_type: 'missing_outputs',
        problem_details: {
          reason: 'Job completed but has no outputs in data field',
          has_workflow_output: !!workflow_output
        }
      };
    }

    // Check for base64 data bloat (should be cleaned up)
    const dataString = JSON.stringify(data);
    if (dataString.includes('data:image') || dataString.includes('base64')) {
      return {
        status_category: 'complete',
        problem_type: 'base64_bloat',
        problem_details: {
          reason: 'Job completed successfully but contains base64 data that should be cleaned',
          data_size: dataString.length
        }
      };
    }

    // Check notification status if it's a miniapp job
    if (this.isMiniappJob(job)) {
      return this.evaluateMiniappNotification(job);
    }

    // Job appears to be properly completed
    return {
      status_category: 'complete'
    };
  }

  private evaluateFailedJob(job: any): JobEvaluationResult {
    const { error_message, retry_count, max_retries, job_history } = job;

    // Check if job exhausted retries
    if (retry_count >= max_retries) {
      return {
        status_category: 'filed',
        problem_type: 'max_retries_exceeded',
        problem_details: {
          reason: 'Job failed after exhausting all retry attempts',
          retry_count,
          max_retries,
          error_message,
          final_error: job_history?.[0]?.message
        }
      };
    }

    // Job failed but still has retries available
    return {
      status_category: 'incomplete',
      problem_type: 'failed_with_retries_available',
      problem_details: {
        reason: 'Job failed but still has retry attempts available',
        retry_count,
        max_retries,
        error_message
      }
    };
  }

  private evaluateStuckJob(job: any): JobEvaluationResult {
    const { status, created_at, updated_at, job_history } = job;
    const ageMinutes = Math.round((Date.now() - new Date(created_at).getTime()) / (1000 * 60));
    const lastUpdateMinutes = Math.round((Date.now() - new Date(updated_at).getTime()) / (1000 * 60));

    return {
      status_category: 'incomplete',
      problem_type: 'stuck_processing',
      problem_details: {
        reason: 'Job appears to be stuck in processing state',
        status,
        age_minutes: ageMinutes,
        last_update_minutes: lastUpdateMinutes,
        latest_history: job_history?.[0]?.status
      }
    };
  }

  private isJobStuck(job: any): boolean {
    const { status, created_at, updated_at } = job;
    const ageMinutes = Math.round((Date.now() - new Date(created_at).getTime()) / (1000 * 60));
    const lastUpdateMinutes = Math.round((Date.now() - new Date(updated_at).getTime()) / (1000 * 60));

    // Job is stuck if it's been processing for over 60 minutes
    // or hasn't been updated in over 30 minutes while in active state
    return (
      (['processing', 'running'].includes(status) && ageMinutes > 60) ||
      (['processing', 'running', 'pending'].includes(status) && lastUpdateMinutes > 30)
    );
  }

  private isMiniappJob(job: any): boolean {
    return job.job_type === 'miniapp' ||
           job.data?.collectionId ||
           job.name?.includes('miniapp');
  }

  private async evaluateMiniappNotification(job: any): Promise<JobEvaluationResult> {
    const { data } = job;
    const collectionId = data?.collectionId;

    if (!collectionId) {
      return {
        status_category: 'complete',
        problem_type: 'missing_collection_id',
        problem_details: {
          reason: 'Miniapp job completed but missing collectionId for notification check'
        }
      };
    }

    try {
      // Check if miniapp_generation record exists
      const miniappGeneration = await prisma.miniapp_generation.findFirst({
        where: {
          collection_id: collectionId
        }
      });

      if (!miniappGeneration) {
        return {
          status_category: 'incomplete',
          problem_type: 'missing_miniapp_record',
          problem_details: {
            reason: 'Job completed but no miniapp_generation record found',
            collection_id: collectionId
          }
        };
      }

      // Check if user was notified
      if (miniappGeneration.status !== 'completed') {
        return {
          status_category: 'incomplete',
          problem_type: 'miniapp_not_completed',
          problem_details: {
            reason: 'Miniapp generation record exists but not marked as completed',
            miniapp_status: miniappGeneration.status,
            collection_id: collectionId
          }
        };
      }

      return {
        status_category: 'complete'
      };

    } catch (error) {
      return {
        status_category: 'incomplete',
        problem_type: 'notification_check_failed',
        problem_details: {
          reason: 'Failed to check miniapp notification status',
          collection_id: collectionId,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  async generateSummaryReport(): Promise<void> {
    try {
      const summary = await prisma.job.groupBy({
        by: ['status_category', 'problem_type'],
        where: {
          is_cleanup_evaluated: true
        },
        _count: {
          id: true
        }
      });

      logger.info('Job Evaluation Summary:', { summary });

      // Log recent problem jobs
      const recentProblems = await prisma.job.findMany({
        where: {
          is_cleanup_evaluated: true,
          status_category: { in: ['incomplete'] },
          evaluated_at: {
            gt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        },
        select: {
          id: true,
          name: true,
          status: true,
          problem_type: true,
          problem_details: true,
          created_at: true
        },
        orderBy: {
          evaluated_at: 'desc'
        },
        take: 10
      });

      if (recentProblems.length > 0) {
        logger.warn('Recent problem jobs:', { problems: recentProblems });
      }

    } catch (error) {
      logger.error('Failed to generate summary report:', error);
    }
  }
}

async function main() {
  const evaluator = new JobEvaluator();

  try {
    await evaluator.evaluateJobs();
    await evaluator.generateSummaryReport();
  } catch (error) {
    logger.error('Job evaluation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export { JobEvaluator };