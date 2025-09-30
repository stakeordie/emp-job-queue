import { prisma } from '@emp/database';
import Redis from 'ioredis';
import type { Job, JobForensics } from '@emp/core';
import { JobStatus } from '@emp/core';
// Forensics service - using flexible typing for dynamic data
// @ts-nocheck

interface RecoverySuggestion {
  type: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
  estimated_success_rate?: number;
  automated_action_available?: boolean;
}

interface ForensicsOptions {
  includeHistory?: boolean;
  includeCrossSystemRefs?: boolean;
  includeRecoverySuggestions?: boolean;
  maxSimilarFailures?: number;
}

export class JobForensicsService {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  /**
   * Get comprehensive forensics data for a job across all systems
   */
  async getJobForensics(jobId: string, options: ForensicsOptions = {}): Promise<any> {
    const {
      includeHistory = true,
      includeCrossSystemRefs = true,
      includeRecoverySuggestions = true,
      maxSimilarFailures = 5,
    } = options;

    try {
      // 1. Get job from Redis (authoritative source for job status)
      let job = await this.getRedisJob(jobId);

      // 2. Get EmProps job data for additional workflow context
      const empropsJob = await this.getEmpropsJob(jobId);

      if (job && empropsJob) {
        // Both sources exist - merge data but prioritize Redis status
        const redisStatus = job.status;
        job = { ...empropsJob, ...job, status: redisStatus };
        console.log(`📊 [FORENSICS] Merged job data - Redis status: ${redisStatus}, EmProps status: ${empropsJob.status}`);
      } else if (!job && empropsJob) {
        // Only EmProps has data
        job = empropsJob;
      } else if (!job && !empropsJob) {
        return null;
      }

      // 3. Get forensics data
      const forensics = await this.buildForensicsData(job, {
        includeHistory,
        includeCrossSystemRefs,
      }, empropsJob);

      // 4. Find similar failures
      const similarFailures = await this.findSimilarFailures(job, maxSimilarFailures);

      // 5. Generate recovery suggestions
      const recoverySuggestions = includeRecoverySuggestions
        ? await this.generateRecoverySuggestions(job, forensics)
        : [];

      return {
        job,
        forensics,
        similar_failures: similarFailures,
        recovery_suggestions: recoverySuggestions,
      };
    } catch (error) {
      console.error(`Error getting job forensics for ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get job data from Redis
   */
  private async getRedisJob(jobId: string): Promise<Job | null> {
    const jobData = await this.redis.hgetall(`job:${jobId}`);
    if (!jobData.id) return null;

    return {
      id: jobData.id,
      service_required: jobData.service_required,
      priority: parseInt(jobData.priority || '50'),
      payload: JSON.parse(jobData.payload || '{}'),
      requirements: jobData.requirements ? JSON.parse(jobData.requirements) : undefined,
      customer_id: jobData.customer_id || undefined,
      created_at: jobData.created_at,
      assigned_at: jobData.assigned_at || undefined,
      started_at: jobData.started_at || undefined,
      completed_at: jobData.completed_at || undefined,
      failed_at: jobData.failed_at || undefined,
      worker_id: jobData.worker_id || undefined,
      status: jobData.status as JobStatus,
      retry_count: parseInt(jobData.retry_count || '0'),
      max_retries: parseInt(jobData.max_retries || '3'),
      last_failed_worker: jobData.last_failed_worker || undefined,
      processing_time: jobData.processing_time ? parseInt(jobData.processing_time) : undefined,
      estimated_completion: jobData.estimated_completion || undefined,
      workflow_id: jobData.workflow_id || undefined,
      workflow_priority: jobData.workflow_priority
        ? parseInt(jobData.workflow_priority)
        : undefined,
      workflow_datetime: jobData.workflow_datetime
        ? parseInt(jobData.workflow_datetime)
        : undefined,
      current_step: jobData.current_step ? parseInt(jobData.current_step) : undefined,
      total_steps: jobData.total_steps ? parseInt(jobData.total_steps) : undefined,
    };
  }

  /**
   * Get job data from EmProps database (workflows)
   */
  private async getEmpropsJob(jobId: string): Promise<Job | null> {
    try {
      const empropsJob = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
          created_at: true,
          updated_at: true,
          started_at: true,
          completed_at: true,
          user_id: true,
          job_type: true,
          priority: true,
          progress: true,
          data: true,
          error_message: true,
          retry_count: true,
          max_retries: true,
          workflow_output: true,
          is_cleanup_evaluated: true,
          status_category: true,
          problem_type: true,
          problem_details: true,
          evaluated_at: true,
          resolution_needed: true,
        },
      });

      if (!empropsJob) return null;

      // Get collection details if collectionId exists in job data
      let collectionInfo = null;
      const jobData = empropsJob.data as Record<string, unknown>;
      if (jobData?.collectionId) {
        try {
          // Try to fetch collection info - using raw SQL to avoid schema issues
          const result = await prisma.$queryRaw`
            SELECT * FROM collection WHERE id = ${jobData.collectionId}::uuid LIMIT 1
          `;

          if (Array.isArray(result) && result.length > 0) {
            collectionInfo = result[0];
          }
        } catch (error) {
          console.warn(`Failed to fetch collection ${jobData.collectionId}:`, error);
        }
      }

      // Convert EmProps job to Redis Job format for consistency
      const job = {
        id: empropsJob.id,
        service_required: empropsJob.job_type || 'unknown',
        priority: empropsJob.priority || 50,
        payload: (empropsJob.data as Record<string, unknown>) || {},
        customer_id: empropsJob.user_id || undefined,
        created_at: empropsJob.created_at?.toISOString(),
        started_at: empropsJob.started_at?.toISOString(),
        completed_at: empropsJob.completed_at?.toISOString(),
        status: this.mapEmpropsStatusToJobStatus(empropsJob.status),
        retry_count: empropsJob.retry_count || 0,
        max_retries: empropsJob.max_retries || 3,
        workflow_id: empropsJob.id, // Use the job ID as workflow ID for EmProps jobs
        current_step: empropsJob.progress || 0,
        total_steps: 100, // Default for EmProps jobs
        // Add additional EmProps-specific fields for forensics
        name: empropsJob.name,
        description: empropsJob.description,
        updated_at: empropsJob.updated_at?.toISOString(),
        error_message: empropsJob.error_message,
        workflow_output: empropsJob.workflow_output,
        is_cleanup_evaluated: empropsJob.is_cleanup_evaluated,
        status_category: empropsJob.status_category,
        problem_type: empropsJob.problem_type,
        problem_details: empropsJob.problem_details,
        evaluated_at: empropsJob.evaluated_at?.toISOString(),
        resolution_needed: empropsJob.resolution_needed,
      } as Job;

      // Get related flat files (generated images) for this job
      const flatFiles = await this.getJobFlatFiles(empropsJob.id, jobData?.collectionId as string);

      // Get mini-app user data for this job
      const miniAppData = await this.getMiniAppUserData(empropsJob.id, jobData?.collectionId as string);

      // Add collection info, images, and user data to payload for forensics display
      job.payload = {
        ...job.payload,
        _collection: collectionInfo,
        _flat_files: flatFiles,
        _miniapp_data: miniAppData,
      };

      // Also add result field with image outputs if available
      if (flatFiles.length > 0) {
        (job as unknown as Record<string, unknown>).result = {
          success: true,
          output_files: flatFiles.map(f => f.url).filter(Boolean),
          metadata: {
            total_images: flatFiles.length,
            generation_source: 'emprops-api',
          },
        };
      }

      return job;
    } catch (error) {
      console.error(`Error getting EmProps job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Get flat files (images) related to a job/collection
   */
  private async getJobFlatFiles(jobId: string, collectionId?: string) {
    try {
      const flatFiles = [];

      // Get images directly related to the job ID
      const directImages = await prisma.flat_file.findMany({
        where: {
          rel_id: jobId,
          rel_type: {
            in: ['component_test', 'workflow_test', 'preview', 'collection_generation'],
          },
        },
        select: {
          id: true,
          url: true,
          name: true,
          mime_type: true,
          gen_in_data: true,
          gen_out_data: true,
          created_at: true,
          rel_type: true,
          rel_id: true,
        },
        orderBy: { created_at: 'desc' },
      });

      flatFiles.push(...directImages);

      // If collection ID exists, also get images related to that collection
      if (collectionId) {
        const collectionImages = await prisma.flat_file.findMany({
          where: {
            rel_id: String(collectionId),
            rel_type: {
              in: ['component_test', 'workflow_test', 'preview'],
            },
          },
          select: {
            id: true,
            url: true,
            name: true,
            mime_type: true,
            gen_in_data: true,
            gen_out_data: true,
            created_at: true,
            rel_type: true,
            rel_id: true,
          },
          orderBy: { created_at: 'desc' },
        });

        // Add collection images that aren't already included
        const existingIds = new Set(flatFiles.map(f => f.id));
        collectionImages.forEach(img => {
          if (!existingIds.has(img.id)) {
            flatFiles.push(img);
          }
        });
      }

      return flatFiles;
    } catch (error) {
      console.error(`Error getting flat files for job ${jobId}:`, error);
      return [];
    }
  }

  /**
   * Get mini-app user data including Farcaster profile information
   */
  private async getMiniAppUserData(jobId: string, collectionId?: string) {
    try {
      console.log(`🚀 [DEBUG] getMiniAppUserData called for jobId: ${jobId}`);
      const miniAppData: Record<string, unknown> = {
        generation: null,
        user: null,
        payment: null,
        social_links: [],
      };

      // First, try to find miniapp_generation record by job_id (using same pattern as job list API)
      console.log(`🔍 [DEBUG] Looking for miniapp_generation with job_id: ${jobId}`);
      const generationResults = await prisma.miniapp_generation.findMany({
        where: { job_id: { in: [jobId] } },
        include: {
          miniapp_user: {
            include: {
              social_link: true,
            },
          },
          miniapp_payment: true,
          collection: {
            select: {
              id: true,
              title: true,
              description: true,
              status: true,
            },
          },
        },
      });
      let generation = generationResults.length > 0 ? generationResults[0] : null;
      console.log(`🔍 [DEBUG] Query returned ${generationResults.length} results`);
      console.log(`🔍 [DEBUG] First query result:`, generation ? `Found generation ${generation.id} with status ${generation.status}` : 'No generation found');
      console.log(`🔍 [DEBUG] Raw query results:`, generationResults);

      // If not found by job_id, try to find by collection_id
      if (!generation && collectionId) {
        console.log(`🔍 [DEBUG] Trying fallback search with collection_id: ${collectionId}`);
        generation = await prisma.miniapp_generation.findFirst({
          where: { collection_id: String(collectionId) },
          include: {
            miniapp_user: {
              include: {
                social_link: true,
              },
            },
            miniapp_payment: true,
            collection: {
              select: {
                id: true,
                title: true,
                description: true,
                status: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
        });
        console.log(`🔍 [DEBUG] Fallback query result:`, generation ? `Found generation ${generation.id} with status ${generation.status}` : 'Still no generation found');
      }

      console.log(`🔍 [DEBUG] Final generation result:`, generation ? `Using generation ${generation.id}` : 'No generation to use');
      if (generation) {
        // Generation data
        miniAppData.generation = {
          id: generation.id,
          status: generation.status,
          created_at: generation.created_at,
          updated_at: generation.updated_at,
          input_data: generation.input_data,
          output_url: generation.output_url,
          output_data: generation.output_data,
          generated_image: generation.generated_image,
          error_message: generation.error_message,
          retry_count: generation.retry_count,
        };

        // User data (Farcaster profile)
        if (generation.miniapp_user) {
          miniAppData.user = {
            id: generation.miniapp_user.id,
            farcaster_id: generation.miniapp_user.farcaster_id,
            farcaster_username: generation.miniapp_user.farcaster_username,
            farcaster_pfp: generation.miniapp_user.farcaster_pfp,
            wallet_address: generation.miniapp_user.wallet_address,
            created_at: generation.miniapp_user.created_at,
            notification_token: generation.miniapp_user.notification_token ? 'Present' : null,
          };

          // Social links
          miniAppData.social_links = generation.miniapp_user.social_link.map(link => ({
            id: link.id,
            social_org: link.social_org,
            identifier: link.identifier,
            created_at: link.created_at,
          }));
        }

        // Payment data
        if (generation.miniapp_payment) {
          miniAppData.payment = {
            id: generation.miniapp_payment.id,
            amount: generation.miniapp_payment.amount,
            payment_status: generation.miniapp_payment.payment_status,
            transaction_hash: generation.miniapp_payment.transaction_hash,
            created_at: generation.miniapp_payment.created_at,
          };
        }
      }

      return miniAppData;
    } catch (error) {
      console.error(`Error getting mini-app user data for job ${jobId}:`, error);
      return {
        generation: null,
        user: null,
        payment: null,
        social_links: [],
      };
    }
  }


  /**
   * Map EmProps job status to Redis Job status format
   */
  private mapEmpropsStatusToJobStatus(status: string | null): JobStatus {
    switch (status) {
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
        return JobStatus.FAILED;
      case 'in_progress':
      case 'running':
        return JobStatus.IN_PROGRESS;
      case 'pending':
      case 'queued':
        return JobStatus.PENDING;
      default:
        return JobStatus.PENDING;
    }
  }

  /**
   * Get comprehensive job attestations from Redis patterns
   */
  private async getJobAttestations(jobId: string, workflowId?: string): Promise<any[]> {
    const attestations: any[] = [];

    // Define search patterns - semantic naming: workflow->job, job->step, remove step- prefix
    const stepId = jobId.startsWith('step-') ? jobId.substring(5) : jobId;
    const patterns = [
      // Current format: worker:failure:job-id:{job_id}:step-id:{step_id}:xyz
      `worker:failure:*step-id:${stepId}*`,
      `worker:completion:*step-id:${stepId}*`,
      // Legacy patterns for backwards compatibility
      `worker:failure:*job-id:${jobId}*`,
      `worker:completion:*job-id:${jobId}*`,
      `worker:failure:*job-${jobId}*`,
      `worker:completion:*job-${jobId}*`,
      `worker:failure:${jobId}*`,
      `worker:completion:${jobId}*`,
    ];

    // Add job-specific patterns if job ID is available (formerly workflow ID)
    if (workflowId) {
      patterns.push(
        `workflow:failure:${workflowId}*`, // Legacy workflow failure pattern
        // Current job patterns (semantic: workflow->job)
        `worker:failure:job-id:${workflowId}*`,
        `worker:completion:job-id:${workflowId}*`,
        // Legacy patterns
        `worker:failure:workflow-id:${workflowId}*`,
        `worker:completion:workflow-id:${workflowId}*`,
        `worker:failure:workflow-${workflowId}*`,
        `worker:completion:workflow-${workflowId}*`
      );
    }

    for (const pattern of patterns) {
      try {
        const keys = await this.redis.keys(pattern);
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (data) {
            const attestation = {
              ...JSON.parse(data),
              attestation_key: key,
              attestation_type: this.extractAttestationType(key),
              retrieved_at: Date.now()
            };
            attestations.push(attestation);
          }
        }
      } catch (error) {
        console.error(`Error retrieving attestations for pattern ${pattern}:`, error);
      }
    }

    // Sort attestations by timestamp for chronological order
    return attestations.sort((a, b) =>
      (a.timestamp || a.failed_at || a.completed_at || 0) -
      (b.timestamp || b.failed_at || b.completed_at || 0)
    );
  }

  /**
   * Extract attestation type from Redis key
   */
  private extractAttestationType(key: string): string {
    if (key.includes('failure')) {
      if (key.includes('workflow:failure')) return 'workflow_failure';
      if (key.includes(':attempt:')) return 'failure_retry';
      if (key.includes(':permanent')) return 'failure_permanent';
      return 'worker_failure';
    } else if (key.includes('completion')) {
      if (key.includes('workflow:completion')) return 'workflow_completion';
      return 'worker_completion';
    }
    return 'unknown_attestation';
  }

  /**
   * Build comprehensive forensics data
   */
  private async buildForensicsData(
    job: Job,
    options: { includeHistory: boolean; includeCrossSystemRefs: boolean },
    empropsJob?: Job | null
  ): Promise<JobForensics> {
    const forensics: JobForensics = {};

    // Comprehensive attestation retrieval
    const attestations = await this.getJobAttestations(job.id, job.workflow_id);
    if (attestations.length > 0) {
      forensics.attestations = attestations;

      // Extract structured failure data if available
      const failureAttestations = attestations.filter(a =>
        a.attestation_type?.includes('failure') && (a.failure_type || a.failure_reason)
      );
      if (failureAttestations.length > 0) {
        const latestFailure = failureAttestations[failureAttestations.length - 1];
        forensics.structured_failure = {
          failure_type: latestFailure.failure_type,
          failure_reason: latestFailure.failure_reason,
          failure_description: latestFailure.failure_description,
          classified_at: latestFailure.timestamp
        };
      }
    }

    // Status consistency verification (using local empropsJob from earlier scope)
    if (job && empropsJob) {
      forensics.status_consistency = {
        redis_status: job.status,
        emprops_status: empropsJob.status,
        discrepancy_detected: job.status !== empropsJob.status,
        source_priority: 'redis' as const,
        verified_at: Date.now()
      };

      if (job.status !== empropsJob.status) {
        console.warn(`⚠️ [FORENSICS] Status discrepancy detected for job ${job.id}: Redis=${job.status}, EmProps=${empropsJob.status}`);
      }
    }

    // Source tracking - try to determine where this job came from
    if (job.workflow_id) {
      const crossSystemRefs = await this.getCrossSystemReferences(job);
      if (crossSystemRefs.length > 0) {
        forensics.cross_system_refs = crossSystemRefs;

        // Extract source information from cross-system refs
        const empropsRef = crossSystemRefs.find(ref => ref.system === 'emprops-api');
        if (empropsRef) {
          forensics.source_system = 'emprops-api';
          forensics.emprops_workflow_name = await this.getWorkflowName(job.workflow_id);
        }

        const miniAppRef = crossSystemRefs.find(ref => ref.system === 'mini-app');
        if (miniAppRef) {
          forensics.source_system = 'mini-app';
          forensics.source_user_id = await this.getUserIdFromMiniApp(job.workflow_id);
        }
      }
    }

    // Error analysis
    if (job.status === 'failed') {
      const errorInfo = await this.getJobErrorInfo(job);
      if (errorInfo) {
        forensics.last_known_error = errorInfo.message;
        forensics.error_category = this.categorizeError(errorInfo.message);
        forensics.error_chain = await this.getErrorChain(job);
      }
    }

    // Worker and retry tracking
    if (job.retry_count > 0 || job.last_failed_worker) {
      forensics.attempted_workers = await this.getAttemptedWorkers(job);
      forensics.worker_assignment_history = await this.getWorkerAssignmentHistory(job);
    }

    // Retry analysis using backup data
    if (job.retry_backups && job.retry_backups.length > 0) {
      forensics.retry_analysis = await this.buildRetryAnalysis(job);
    }

    // Performance tracking
    forensics.queue_wait_time_ms = await this.calculateQueueWaitTime(job);
    forensics.total_processing_time_ms = this.calculateTotalProcessingTime(job);

    // Get lifecycle events if history is requested
    if (options.includeHistory) {
      forensics.lifecycle_events = await this.getLifecycleEvents(job);
    }

    return forensics;
  }

  /**
   * Get error information for a failed job from various sources
   */
  private async getJobErrorInfo(job: Job): Promise<{ message: string } | null> {
    // Try to get error from EmProps database if workflow_id exists
    if (job.workflow_id) {
      try {
        const empropsJob = await prisma.job.findFirst({
          where: {
            OR: [{ id: job.id }, { data: { path: ['workflow_id'], equals: job.workflow_id } }],
          },
        });

        if (empropsJob?.error_message) {
          return { message: empropsJob.error_message };
        }

        // Check job history for error messages
        const historyWithError = await prisma.job_history.findFirst({
          where: {
            job_id: empropsJob?.id || job.id,
            status: 'failed',
          },
          orderBy: { created_at: 'desc' },
        });

        if (historyWithError?.message) {
          return { message: historyWithError.message };
        }
      } catch (error) {
        console.warn('Failed to get error info from database:', error);
      }
    }

    // Fallback: generic error message based on job state
    if (job.failed_at) {
      return {
        message: `Job failed at ${job.failed_at}${job.last_failed_worker ? ` on worker ${job.last_failed_worker}` : ''}`,
      };
    }

    return null;
  }

  /**
   * Map database status to CrossSystemReference status enum
   */
  private mapToReferenceStatus(status: string): 'active' | 'completed' | 'failed' | 'unknown' {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'completed';
      case 'failed':
      case 'error':
        return 'failed';
      case 'active':
      case 'pending':
      case 'running':
      case 'in_progress':
        return 'active';
      default:
        return 'unknown';
    }
  }

  /**
   * Get cross-system references to track job across systems
   */
  private async getCrossSystemReferences(job: Job) {
    const refs = [];

    if (job.workflow_id) {
      try {
        // Check EmProps API database for job records
        const empropsJob = await prisma.job.findFirst({
          where: {
            OR: [{ id: job.id }, { data: { path: ['workflow_id'], equals: job.workflow_id } }],
          },
          include: {
            job_history: true,
          },
        });

        if (empropsJob) {
          refs.push({
            system: 'emprops-api' as const,
            reference_id: empropsJob.id,
            reference_type: 'database_record' as const,
            last_verified: new Date().toISOString(),
            status: this.mapToReferenceStatus(empropsJob.status),
          });
        }

        // Check mini-app generations
        const miniAppGen = await prisma.miniapp_generation.findFirst({
          where: {
            job_id: job.workflow_id,
          },
        });

        if (miniAppGen) {
          refs.push({
            system: 'mini-app' as const,
            reference_id: miniAppGen.id,
            reference_type: 'database_record' as const,
            last_verified: new Date().toISOString(),
            status: this.mapToReferenceStatus(miniAppGen.status),
          });
        }

        // Check collections
        const collection = await prisma.collection.findFirst({
          where: {
            data: {
              path: ['workflow_id'],
              equals: job.workflow_id,
            },
          },
        });

        if (collection) {
          refs.push({
            system: 'emprops-api' as const,
            reference_id: collection.id,
            reference_type: 'database_record' as const,
            last_verified: new Date().toISOString(),
            status: this.mapToReferenceStatus(collection.status),
          });
        }
      } catch (error) {
        console.error('Error getting cross-system references:', error);
      }
    }

    return refs;
  }

  /**
   * Get workflow name from database
   */
  private async getWorkflowName(workflowId: string): Promise<string | undefined> {
    try {
      const workflow = await prisma.workflow.findUnique({
        where: { id: workflowId },
      });
      return workflow?.name;
    } catch (error) {
      console.error('Error getting workflow name:', error);
      return undefined;
    }
  }

  /**
   * Get user ID from mini-app generation
   */
  private async getUserIdFromMiniApp(workflowId: string): Promise<string | undefined> {
    try {
      const generation = await prisma.miniapp_generation.findFirst({
        where: { workflow_id: workflowId },
      });
      return generation?.user_id;
    } catch (error) {
      console.error('Error getting user ID from mini-app:', error);
      return undefined;
    }
  }

  /**
   * Categorize error types for better debugging
   */
  private categorizeError(error: string): JobForensics['error_category'] {
    const errorLower = error.toLowerCase();

    if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
      return 'timeout';
    }
    if (errorLower.includes('network') || errorLower.includes('connection')) {
      return 'network';
    }
    if (errorLower.includes('validation') || errorLower.includes('invalid')) {
      return 'validation';
    }
    if (
      errorLower.includes('memory') ||
      errorLower.includes('disk') ||
      errorLower.includes('resource')
    ) {
      return 'resource';
    }
    if (errorLower.includes('api') || errorLower.includes('external')) {
      return 'external_api';
    }

    return 'unknown';
  }

  /**
   * Get error chain from job history
   */
  private async getErrorChain(job: Job) {
    const errors = [];

    // Current error
    if (job.status === 'failed') {
      const errorInfo = await this.getJobErrorInfo(job);
      if (errorInfo) {
        errors.push({
          timestamp: job.failed_at || new Date().toISOString(),
          source: 'worker' as const,
          error_message: errorInfo.message,
          permanent: job.retry_count >= job.max_retries,
        });
      }
    }

    // Try to get historical errors from EmProps database
    try {
      if (job.workflow_id) {
        const jobHistory = await prisma.job_history.findMany({
          where: {
            job: {
              data: {
                path: ['workflow_id'],
                equals: job.workflow_id,
              },
            },
          },
          orderBy: {
            created_at: 'desc',
          },
        });

        for (const history of jobHistory) {
          if (history.message && history.status === 'failed') {
            errors.push({
              timestamp: history.created_at.toISOString(),
              source: 'api' as const,
              error_message: history.message,
            });
          }
        }
      }
    } catch (error) {
      console.error('Error getting error chain:', error);
    }

    return errors;
  }

  /**
   * Get list of workers that attempted this job
   */
  private async getAttemptedWorkers(job: Job): Promise<string[]> {
    const workers = new Set<string>();

    if (job.worker_id) workers.add(job.worker_id);
    if (job.last_failed_worker) workers.add(job.last_failed_worker);

    // TODO: Could enhance this by tracking worker assignments in Redis

    return Array.from(workers);
  }

  /**
   * Get worker assignment history
   */
  private async getWorkerAssignmentHistory(job: Job) {
    const assignments = [];

    // Current/last assignment
    if (job.worker_id || job.last_failed_worker) {
      const workerId = job.worker_id || job.last_failed_worker!;
      assignments.push({
        worker_id: workerId,
        assigned_at: job.assigned_at || job.created_at,
        released_at: job.failed_at || job.completed_at,
        assignment_reason: 'capability_match' as const,
        result:
          job.status === 'completed'
            ? ('completed' as const)
            : job.status === 'failed'
              ? ('failed' as const)
              : ('timeout' as const),
      });
    }

    return assignments;
  }

  /**
   * Calculate how long job waited in queue
   */
  private async calculateQueueWaitTime(job: Job): Promise<number | undefined> {
    if (!job.assigned_at) return undefined;

    const created = new Date(job.created_at).getTime();
    const assigned = new Date(job.assigned_at).getTime();

    return assigned - created;
  }

  /**
   * Calculate total processing time
   */
  private calculateTotalProcessingTime(job: Job): number | undefined {
    if (!job.completed_at && !job.failed_at) return undefined;

    const created = new Date(job.created_at).getTime();
    const finished = new Date(job.completed_at || job.failed_at!).getTime();

    return finished - created;
  }

  /**
   * Get lifecycle events for the job
   */
  private async getLifecycleEvents(job: Job) {
    const events = [];

    // Basic lifecycle events from job data
    events.push({
      timestamp: job.created_at,
      event: 'created' as const,
      actor: 'system',
    });

    if (job.assigned_at) {
      events.push({
        timestamp: job.assigned_at,
        event: 'assigned' as const,
        actor: job.worker_id || 'unknown',
      });
    }

    if (job.started_at) {
      events.push({
        timestamp: job.started_at,
        event: 'started' as const,
        actor: job.worker_id || 'unknown',
      });
    }

    if (job.completed_at) {
      events.push({
        timestamp: job.completed_at,
        event: 'completed' as const,
        actor: job.worker_id || 'unknown',
      });
    }

    if (job.failed_at) {
      events.push({
        timestamp: job.failed_at,
        event: 'failed' as const,
        actor: job.worker_id || job.last_failed_worker || 'unknown',
      });
    }

    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Find similar failures to help with pattern recognition
   * PERFORMANCE: Disabled in production - use Redis SCAN instead of KEYS for large datasets
   */
  private async findSimilarFailures(job: Job, limit: number): Promise<Job[]> {
    if (job.status !== 'failed') return [];

    // 🚨 PERFORMANCE FIX: Skip similar failures search - too expensive for production
    // This feature was causing major performance issues by scanning all Redis keys
    console.warn('Similar failures search disabled for performance - consider implementing with indexed queries');
    return [];

    /* DISABLED - Original implementation was too slow:
    const currentErrorInfo = await this.getJobErrorInfo(job);
    if (!currentErrorInfo) return [];

    try {
      // This redis.keys('job:*') call was scanning ALL Redis keys - extremely slow
      const keys = await this.redis.keys('job:*');
      // ... rest of expensive implementation
    } catch (error) {
      console.error('Error finding similar failures:', error);
      return [];
    }
    */
  }

  /**
   * Check if two errors are similar
   */
  private areErrorsSimilar(error1: string, error2: string): boolean {
    // Simple similarity check - could be enhanced with more sophisticated matching
    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/\d+/g, 'X')
        .replace(/[^\w\s]/g, ' ');
    const norm1 = normalize(error1);
    const norm2 = normalize(error2);

    // Check for common error patterns
    const commonPatterns = [
      'timeout',
      'connection',
      'memory',
      'disk space',
      'invalid',
      'not found',
      'permission denied',
    ];

    for (const pattern of commonPatterns) {
      if (norm1.includes(pattern) && norm2.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate recovery suggestions based on job forensics
   */
  private async generateRecoverySuggestions(
    job: Job,
    forensics: JobForensics
  ): Promise<RecoverySuggestion[]> {
    const suggestions: RecoverySuggestion[] = [];

    if (job.status === 'failed') {
      // Retry suggestions based on error category
      switch (forensics.error_category) {
        case 'timeout':
          suggestions.push({
            type: 'retry',
            confidence: 'high',
            description:
              'Timeout errors often resolve on retry. Consider retrying with increased timeout.',
            automated_action_available: true,
            estimated_success_rate: 70,
          });
          break;

        case 'network':
          suggestions.push({
            type: 'retry',
            confidence: 'medium',
            description: 'Network issues are usually temporary. Retry with exponential backoff.',
            automated_action_available: true,
            estimated_success_rate: 60,
          });
          break;

        case 'resource':
          suggestions.push({
            type: 'reassign',
            confidence: 'high',
            description:
              'Resource constraints detected. Try assigning to a different worker with more resources.',
            automated_action_available: true,
            estimated_success_rate: 80,
          });
          break;

        case 'validation':
          suggestions.push({
            type: 'manual_review',
            confidence: 'high',
            description: 'Validation errors require data/configuration fixes before retry.',
            automated_action_available: false,
          });
          break;

        default:
          if (job.retry_count < job.max_retries) {
            suggestions.push({
              type: 'retry',
              confidence: 'low',
              description: 'Unknown error type. Simple retry may help.',
              automated_action_available: true,
              estimated_success_rate: 30,
            });
          }
      }
    }

    // Cross-system consistency suggestions
    if (forensics.cross_system_refs?.length) {
      const hasInconsistentState = forensics.cross_system_refs.some(
        ref => ref.status !== job.status
      );

      if (hasInconsistentState) {
        suggestions.push({
          type: 'system_fix',
          confidence: 'medium',
          description:
            'Inconsistent state detected across systems. Manual reconciliation may be needed.',
          automated_action_available: false,
        });
      }
    }

    return suggestions;
  }

  /**
   * Get all failed jobs for pattern analysis
   */
  async getFailedJobsForAnalysis(limit: number = 50) {
    try {
      const keys = await this.redis.keys('job:*');
      const failedJobs = [];

      for (const key of keys) {
        const jobData = await this.redis.hgetall(key);
        if (jobData.status === 'failed') {
          const job = await this.getRedisJob(jobData.id);
          if (job) {
            const forensics = await this.buildForensicsData(job, {
              includeHistory: false,
              includeCrossSystemRefs: true,
            }, null);
            failedJobs.push({ job, forensics });
          }

          if (failedJobs.length >= limit) break;
        }
      }

      return failedJobs;
    } catch (error) {
      console.error('Error getting failed jobs for analysis:', error);
      return [];
    }
  }

  /**
   * Build comprehensive retry analysis from backup data
   */
  private async buildRetryAnalysis(job: Job): Promise<any> {
    const retryBackups = job.retry_backups || [];
    if (retryBackups.length === 0) {
      return null;
    }

    // Calculate retry intervals
    const retryIntervals: number[] = [];
    for (let i = 1; i < retryBackups.length; i++) {
      const prevBackup = new Date(retryBackups[i - 1].backed_up_at);
      const currentBackup = new Date(retryBackups[i].backed_up_at);
      const intervalSeconds = Math.round((currentBackup.getTime() - prevBackup.getTime()) / 1000);
      retryIntervals.push(intervalSeconds);
    }

    // Analyze state changes between retries
    const stateChanges = retryBackups.map((backup, index) => {
      const prevBackup = index > 0 ? retryBackups[index - 1] : null;

      return {
        attempt: backup.retry_attempt,
        status_before: backup.original_status,
        status_after: index < retryBackups.length - 1 ? retryBackups[index + 1].original_status : job.status,
        data_changed: prevBackup ? JSON.stringify(backup.original_data) !== JSON.stringify(prevBackup.original_data) : false,
        workflow_output_changed: prevBackup ? backup.original_workflow_output !== prevBackup.original_workflow_output : false,
        backed_up_at: backup.backed_up_at,
      };
    });

    // Determine retry pattern
    let retryPattern: 'escalating' | 'consistent' | 'random' = 'random';
    if (retryIntervals.length > 1) {
      const isIncreasing = retryIntervals.every((interval, i) => i === 0 || interval >= retryIntervals[i - 1]);
      const isConsistent = retryIntervals.every(interval => Math.abs(interval - retryIntervals[0]) < 30); // Within 30 seconds

      if (isIncreasing) {
        retryPattern = 'escalating';
      } else if (isConsistent) {
        retryPattern = 'consistent';
      }
    }

    // Calculate success probability based on retry count vs max retries
    const successProbability = job.max_retries > 0
      ? Math.max(0, (job.max_retries - job.retry_count) / job.max_retries)
      : 0;

    return {
      total_attempts: job.retry_count || 0,
      max_retries: job.max_retries || 3,
      retry_pattern: retryPattern,
      retry_intervals: retryIntervals,
      state_changes: stateChanges,
      success_probability: successProbability,
    };
  }

  async disconnect() {
    await this.redis.quit();
  }
}
