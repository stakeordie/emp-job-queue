#!/usr/bin/env node

import { prisma } from '@emergexyz/db';
import { logger } from '@emp/core';

interface JobEvaluationResult {
  status_category: 'complete' | 'incomplete' | 'data_structure_issue';
  problem_type?: string;
  problem_details?: any;
  resolution_needed?: string;
}

class JobEvaluator {
  async evaluateJobs(): Promise<void> {
    logger.info('Starting job evaluation run');

    try {
      // Get jobs based on IGNORE_IS_CLEANUP_EVALUATED setting
      const ignoreEvaluated = process.env.IGNORE_IS_CLEANUP_EVALUATED === 'TRUE';
      logger.info(`Evaluation mode: ${ignoreEvaluated ? 'RE-EVALUATING ALL JOBS' : 'ONLY UNEVALUATED JOBS'}`);

      const whereClause: any = {
        // Only evaluate jobs that are in a final state or have been around for a while
        OR: [
          { status: { in: ['completed', 'failed', 'canceled'] } },
          {
            created_at: {
              lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes old
            }
          }
        ]
      };

      // Only add is_cleanup_evaluated filter if we're not ignoring it
      if (!ignoreEvaluated) {
        whereClause.is_cleanup_evaluated = false;
      }

      const unevaluatedJobs = await prisma.job.findMany({
        where: whereClause,
        include: {
          job_history: {
            orderBy: { created_at: 'desc' }
          },
          job_retry_backup: true
        },
        orderBy: {
          created_at: 'asc'
        },
        take: 150 // Process in batches
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
              resolution_needed: evaluation.resolution_needed,
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
    /*
     * ✅ COMPLETE JOB CHECKLIST:
     * [ ] Has status = 'completed'
     * [ ] Has workflow_output populated (not null/empty) → data_structure_issue if missing
     * [ ] Has miniapp_generation record with status = 'completed'
     * [ ] Has notification attestation record
     *
     * ❌ INCOMPLETE JOB:
     * Jobs that don't have status='completed' or missing miniapp/notification
     *
     * 🔧 DATA_STRUCTURE_ISSUE:
     * Jobs with status='completed' but missing workflow_output (webhook timing issue)
     */

    const { status, workflow_output } = job;

    // First check: Must have status = 'completed'
    if (status !== 'completed') {
      return {
        status_category: 'incomplete',
        problem_type: 'job_status_not_completed',
        problem_details: {
          reason: 'Job status is not completed',
          status: job.status
        },
        resolution_needed: 'unknown'
      };
    }

    // Second check: Must have workflow_output
    if (!workflow_output) {
      // Check if there's output data available to extract
      const hasExtractableOutput = this.hasExtractableOutput(job.data);

      if (hasExtractableOutput) {
        return {
          status_category: 'data_structure_issue',
          problem_type: 'workflow_output_missing',
          problem_details: {
            reason: 'Job has status=completed but missing workflow_output, but output data is available',
            status: job.status
          },
          resolution_needed: 'workflow_output_extraction'
        };
      } else {
        return {
          status_category: 'incomplete',
          problem_type: 'no_output_data_available',
          problem_details: {
            reason: 'Job has status=completed but no workflow_output and no extractable output data',
            status: job.status
          },
          resolution_needed: 'unknown'
        };
      }
    }

    // Third & Fourth checks: Must have miniapp_generation and notification attestation
    return await this.checkMiniappCompletion(job);
  }

  private hasExtractableOutput(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check for outputs[0].steps structure
    if (data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
      const firstOutput = data.outputs[0];
      if (firstOutput?.steps && Array.isArray(firstOutput.steps) && firstOutput.steps.length > 0) {
        const lastStep = firstOutput.steps[firstOutput.steps.length - 1];
        if (lastStep?.nodeResponse?.src && typeof lastStep.nodeResponse.src === 'string') {
          return true;
        }
      }
    }

    // Check for direct steps structure
    if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
      const lastStep = data.steps[data.steps.length - 1];
      if (lastStep?.nodeResponse?.src && typeof lastStep.nodeResponse.src === 'string') {
        return true;
      }
    }

    // Check other output patterns
    if (data.output) {
      if (typeof data.output === 'string') return true;
      if (data.output.src && typeof data.output.src === 'string') return true;
    }

    if (data.result) {
      if (typeof data.result === 'string') return true;
      if (data.result.src && typeof data.result.src === 'string') return true;
    }

    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
      const lastImage = data.images[data.images.length - 1];
      if (typeof lastImage === 'string') return true;
      if (lastImage.src && typeof lastImage.src === 'string') return true;
    }

    return false;
  }

  private async checkMiniappCompletion(job: any): Promise<JobEvaluationResult> {
    /*
     * ✅ COMPLETE JOB CHECKLIST (checks 3 & 4):
     * [ ] Has miniapp_generation record with status = 'completed'
     * [ ] Has notification attestation record
     */

    const { id: jobId, data } = job;
    const collectionId = data?.collectionId;

    // All jobs must have miniapp records for our workflow
    try {
      // Third check: Must have miniapp_generation record with status 'completed'
      const miniappGeneration = await prisma.miniapp_generation.findFirst({
        where: {
          job_id: jobId
        }
      });

      if (!miniappGeneration) {
        return {
          status_category: 'incomplete',
          problem_type: 'missing_miniapp_generation',
          problem_details: {
            reason: 'Job has status=completed and workflow_output but no miniapp_generation record',
            job_id: jobId,
            collection_id: collectionId
          },
          resolution_needed: 'unknown'
        };
      }

      if (miniappGeneration.status !== 'completed') {
        return {
          status_category: 'incomplete',
          problem_type: 'miniapp_generation_not_completed',
          problem_details: {
            reason: 'Miniapp generation record exists but not marked as completed',
            miniapp_status: miniappGeneration.status,
            job_id: jobId
          },
          resolution_needed: 'unknown'
        };
      }

      // Fourth check: Must have notification attestation
      // TODO: Add notification attestation check when that table/logic is implemented
      // For now, if miniapp_generation is completed, we assume notification was sent

      // All checks passed - job is COMPLETE! ✅
      return {
        status_category: 'complete'
      };

    } catch (error) {
      return {
        status_category: 'incomplete',
        problem_type: 'evaluation_error',
        problem_details: {
          reason: 'Error checking miniapp completion status',
          job_id: jobId,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }


  async resolveDataStructureIssues(): Promise<void> {
    logger.info('Starting data structure issue resolution');
    let retriesTriggered = 0;
    const MAX_RETRIES_PER_RUN = 10;

    try {
      // Get jobs that need resolution (only evaluated jobs)
      const jobsNeedingResolution = await prisma.job.findMany({
        where: {
          is_cleanup_evaluated: true,
          resolution_needed: { not: null }
        },
        select: {
          id: true,
          status_category: true,
          problem_type: true,
          problem_details: true,
          resolution_needed: true,
          data: true,
          workflow_output: true
        }
      });

      logger.info(`Found ${jobsNeedingResolution.length} jobs needing resolution`);

      for (const job of jobsNeedingResolution) {
        try {
          switch (job.resolution_needed) {
            case 'workflow_output_extraction':
              await this.resolveWorkflowOutputMissing(job);
              break;
            case 'job_retry':
              if (retriesTriggered < MAX_RETRIES_PER_RUN) {
                await this.scheduleJobRetry(job);
                retriesTriggered++;
                logger.info(`Triggered retry ${retriesTriggered}/${MAX_RETRIES_PER_RUN} for job ${job.id}`);
              } else {
                // Skip retry - hit limit for this run
                await prisma.job.update({
                  where: { id: job.id },
                  data: {
                    is_cleanup_evaluated: false
                  }
                });
                logger.warn(`Skipped retry for job ${job.id} - hit limit (${MAX_RETRIES_PER_RUN}) for this run`);
              }
              break;
            case 'unknown':
            default:
              // Reset evaluation flag for unknown resolutions - manual review needed
              await prisma.job.update({
                where: { id: job.id },
                data: {
                  is_cleanup_evaluated: false
                }
              });
              logger.info(`Job ${job.id} marked for manual review - resolution: ${job.resolution_needed}`);
              break;
          }

        } catch (error) {
          logger.error(`Failed to resolve job ${job.id}:`, error);
        }
      }

      logger.info(`Resolution completed - triggered ${retriesTriggered} retries`);

      logger.info('Data structure issue resolution completed');

    } catch (error) {
      logger.error('Data structure issue resolution failed:', error);
      throw error;
    }
  }

  private async checkCompleteJobDataIntegrity(job: any): Promise<void> {
    try {
      const data = job.data;
      let problemDetails: any = {};

      // Check if data object exists and is properly formed
      if (!data || typeof data !== 'object') {
        problemDetails = {
          reason: 'Complete job has null workflow_output and malformed/missing data object',
          data_issue: 'missing_or_invalid_data_object',
          job_id: job.id
        };
      } else {
        // Look for output in data object structure and check for issues
        let lastStepOutput = null;
        let dataIssues = [];

        if (data.output) {
          lastStepOutput = data.output;
        } else if (data.result) {
          lastStepOutput = data.result;
        } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          lastStepOutput = data.images[data.images.length - 1];
        } else if (data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
          lastStepOutput = data.outputs[data.outputs.length - 1];
        } else if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
          const lastStep = data.steps[data.steps.length - 1];
          if (lastStep && lastStep.nodeResponse) {
            lastStepOutput = lastStep.nodeResponse;
          } else {
            dataIssues.push('last_step_missing_output');
          }
        } else {
          dataIssues.push('no_recognizable_output_structure');
        }

        // Check for .bin file issues in output
        if (lastStepOutput && typeof lastStepOutput === 'object') {
          if (lastStepOutput.src && typeof lastStepOutput.src === 'string') {
            if (lastStepOutput.src.includes('.bin')) {
              dataIssues.push('output_contains_bin_file_instead_of_png');
            }
          }
        }

        // Check if last step has no output
        if (!lastStepOutput) {
          dataIssues.push('last_step_no_output');
        }

        problemDetails = {
          reason: 'Complete job has null workflow_output with data field issues',
          data_issues: dataIssues,
          job_id: job.id,
          data_structure: data ? Object.keys(data) : 'null'
        };
      }

      // Update job to mark it as having data field issues
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status_category: 'incomplete',
          problem_type: 'data_field_incomplete',
          problem_details: problemDetails,
          resolution_needed: job.retry_count === 0 ? 'job_retry' : 'unknown',
          is_cleanup_evaluated: false
        }
      });

      logger.warn(`Complete job ${job.id} has data field issues:`, problemDetails);

    } catch (error) {
      logger.error(`Failed to check data integrity for job ${job.id}:`, error);
      // Reset evaluation flag even if check failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          is_cleanup_evaluated: false
        }
      });
    }
  }

  private async scheduleJobRetry(job: any): Promise<void> {
    try {
      // For now, just reset the evaluation flag and log - actual retry logic would go here
      await prisma.job.update({
        where: { id: job.id },
        data: {
          resolution_needed: null,
          status_category: null,
          problem_type: null,
          problem_details: null as any,
          is_cleanup_evaluated: false
        }
      });

      logger.info(`Scheduled job retry for ${job.id} - problem: ${job.problem_type}`);

      // TODO: Implement actual job retry logic here
      // This might involve:
      // - Creating a new job with the same data
      // - Resetting job status to 'pending'
      // - Incrementing retry count
      // - etc.

    } catch (error) {
      logger.error(`Failed to schedule retry for job ${job.id}:`, error);
      // Reset evaluation flag even if retry scheduling failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          is_cleanup_evaluated: false
        }
      });
    }
  }

  private async resolveWorkflowOutputMissing(job: any): Promise<void> {
    try {
      // Extract last step output image from data object
      const data = job.data;
      let lastStepOutputUrl: string | null = null;

      // Look for output in data object structure
      if (data && typeof data === 'object') {
        // Common patterns for output images in job data
        // Extract just the URL string from various data structures
        if (data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
          // Get steps from first output
          const firstOutput = data.outputs[0];
          if (firstOutput?.steps && Array.isArray(firstOutput.steps) && firstOutput.steps.length > 0) {
            const lastStep = firstOutput.steps[firstOutput.steps.length - 1];
            if (lastStep?.nodeResponse?.src && typeof lastStep.nodeResponse.src === 'string') {
              lastStepOutputUrl = lastStep.nodeResponse.src;
            }
          }
        } else if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
          // Get the last step and extract just the URL string
          const lastStep = data.steps[data.steps.length - 1];
          if (lastStep?.nodeResponse?.src && typeof lastStep.nodeResponse.src === 'string') {
            lastStepOutputUrl = lastStep.nodeResponse.src;
          }
        } else if (data.output) {
          if (typeof data.output === 'string') {
            lastStepOutputUrl = data.output;
          } else if (data.output.src && typeof data.output.src === 'string') {
            lastStepOutputUrl = data.output.src;
          }
        } else if (data.result) {
          if (typeof data.result === 'string') {
            lastStepOutputUrl = data.result;
          } else if (data.result.src && typeof data.result.src === 'string') {
            lastStepOutputUrl = data.result.src;
          }
        } else if (data.images && Array.isArray(data.images) && data.images.length > 0) {
          const lastImage = data.images[data.images.length - 1];
          if (typeof lastImage === 'string') {
            lastStepOutputUrl = lastImage;
          } else if (lastImage.src && typeof lastImage.src === 'string') {
            lastStepOutputUrl = lastImage.src;
          }
        } else if (data.outputs && Array.isArray(data.outputs) && data.outputs.length > 0) {
          const lastOutput = data.outputs[data.outputs.length - 1];
          if (typeof lastOutput === 'string') {
            lastStepOutputUrl = lastOutput;
          } else if (lastOutput.src && typeof lastOutput.src === 'string') {
            lastStepOutputUrl = lastOutput.src;
          }
        }
      }

      if (lastStepOutputUrl && typeof lastStepOutputUrl === 'string') {
        // Update job with extracted workflow_output and clear evaluation fields
        await prisma.job.update({
          where: { id: job.id },
          data: {
            workflow_output: lastStepOutputUrl,
            resolution_needed: null,
            status_category: null,
            problem_type: null,
            problem_details: null as any,
            is_cleanup_evaluated: false
          }
        });

        logger.info(`Resolved workflow_output for job ${job.id}: ${lastStepOutputUrl}`);
      } else {
        // No output found in data object, just reset evaluation flag
        await prisma.job.update({
          where: { id: job.id },
          data: {
            is_cleanup_evaluated: false
          }
        });

        logger.warn(`No output found in data object for job ${job.id}`);
      }

    } catch (error) {
      logger.error(`Failed to resolve workflow_output for job ${job.id}:`, error);
      // Reset evaluation flag even if resolution failed
      await prisma.job.update({
        where: { id: job.id },
        data: {
          is_cleanup_evaluated: false
        }
      });
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

      // Log recent incomplete jobs
      const recentIncomplete = await prisma.job.findMany({
        where: {
          is_cleanup_evaluated: true,
          status_category: 'incomplete',
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

      if (recentIncomplete.length > 0) {
        logger.warn('Recent incomplete jobs:', { incomplete: recentIncomplete });
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