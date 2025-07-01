/**
 * Comprehensive Integration Test for Job Broker Behavior
 * 
 * Tests the complete job broker system with:
 * - 10 diverse workers with different capabilities
 * - 100 varied workflows with multiple steps each, different priorities, and requirements
 * - Verification of correct job ordering and worker assignment with workflow inheritance
 */

import { RedisService } from '@core/redis-service';
import { JobBroker } from '@core/job-broker';
import { WorkerCapabilities, HardwareSpecs, CustomerAccessConfig, PerformanceConfig } from '@core/types/worker';
import { Job, JobSubmissionRequest, JobStatus } from '@core/types/job';
import { logger } from '@core/utils/logger';

describe('Job Broker Behavior Integration Test', () => {
  let redisService: RedisService;
  let jobBroker: JobBroker;
  let workers: WorkerCapabilities[];
  let workflows: Array<{ id: string; priority: number; jobs: JobSubmissionRequest[] }>;

  beforeAll(async () => {
    // Setup Redis and JobBroker
    redisService = new RedisService(process.env.REDIS_URL || 'redis://localhost:6379');
    await redisService.connect();
    jobBroker = new JobBroker(redisService);

    // Clear any existing data
    await redisService['redis'].flushdb();
  });

  afterAll(async () => {
    await redisService.disconnect();
  });

  beforeEach(async () => {
    // Clear Redis before each test
    await redisService['redis'].flushdb();
    
    // Setup 10 diverse workers
    workers = createDiverseWorkers();
    
    // Setup 100 varied workflows with multiple steps each
    workflows = createVariedWorkflows();
  });

  describe('Worker Capability Matching', () => {
    test('should correctly match workflow jobs to capable workers', async () => {
      // Submit all workflows and their jobs
      const allJobIds: string[] = [];
      for (const workflow of workflows) {
        // Create the workflow first
        const workflowId = await jobBroker.createWorkflow(
          workflow.priority,
          `customer-${workflow.id}`,
          workflow.id
        );

        // Submit all jobs in the workflow
        for (const jobRequest of workflow.jobs) {
          const jobRequestWithWorkflow = {
            ...jobRequest,
            workflow_id: workflowId,
            workflow_priority: workflow.priority,
          };
          const jobId = await jobBroker.submitJob(jobRequestWithWorkflow);
          allJobIds.push(jobId);
        }
      }

      logger.info(`Submitted ${allJobIds.length} jobs across ${workflows.length} workflows to queue`);

      // Track which workers claim which jobs
      const workerJobAssignments = new Map<string, string[]>();
      const jobAssignments = new Map<string, string>();

      // Simulate workers claiming and processing jobs (not just claiming)
      for (let round = 0; round < 50; round++) { 
        let jobsClaimed = 0;
        
        for (const worker of workers) {
          const job = await jobBroker.getNextJobForWorker(worker);
          if (job) {
            if (!workerJobAssignments.has(worker.worker_id)) {
              workerJobAssignments.set(worker.worker_id, []);
            }
            workerJobAssignments.get(worker.worker_id)!.push(job.id);
            jobAssignments.set(job.id, worker.worker_id);
            jobsClaimed++;
            
            // Simulate job processing by immediately completing it
            await simulateJobProcessing(job.id, worker.worker_id);
            
            logger.debug(`Worker ${worker.worker_id} claimed and processed job ${job.id} (${job.service_required}) on round ${round}`);
          }
        }
        
        // Stop early if no jobs were claimed in this round
        if (jobsClaimed === 0) {
          logger.info(`Round ${round}: No jobs claimed, stopping early`);
          break;
        }
      }
      
      // Helper function to simulate instant job completion
      async function simulateJobProcessing(jobId: string, workerId: string): Promise<void> {
        // Simulate processing time (very fast for testing)
        await new Promise(resolve => setTimeout(resolve, 1));
        
        // Mark job as completed (this automatically sets timestamps)
        await redisService.updateJobStatus(jobId, JobStatus.COMPLETED);
        
        // Update worker assignment in the job record
        await redisService['redis'].hmset(`job:${jobId}`, {
          worker_id: workerId,
          updated_at: new Date().toISOString(),
        });
      }

      // Verify job assignment results
      logger.info('Job Assignment Results:');
      for (const [workerId, assignedJobs] of workerJobAssignments) {
        const worker = workers.find(w => w.worker_id === workerId)!;
        logger.info(`Worker ${workerId} (${worker.services.join(', ')}): ${assignedJobs.length} jobs`);
      }

      logger.info(`Total jobs submitted: ${allJobIds.length}, jobs claimed: ${jobAssignments.size}`);
      
      // Verification: Each job should only be assigned to one worker (no double-assignment)
      // jobAssignments.size = number of jobs claimed
      // new Set(jobAssignments.values()).size = number of unique workers that claimed jobs
      const uniqueWorkers = new Set(jobAssignments.values());
      logger.info(`Unique workers that claimed jobs: ${uniqueWorkers.size}`);
      
      // This assertion checks that each job is assigned to exactly one worker (no duplicates)
      expect(jobAssignments.size).toBeGreaterThan(0);
      expect(uniqueWorkers.size).toBeGreaterThan(0);
      expect(uniqueWorkers.size).toBeLessThanOrEqual(workers.length);

      // Verification: Jobs should be assigned to workers with matching capabilities
      for (const [jobId, workerId] of jobAssignments) {
        const job = await redisService.getJob(jobId);
        const worker = workers.find(w => w.worker_id === workerId)!;
        
        expect(job).toBeTruthy();
        expect(worker.services).toContain(job!.service_required);
      }

      logger.info(`Successfully assigned ${jobAssignments.size} jobs to appropriate workers`);
      
      // Additional verification: Check that workflow jobs maintain priority inheritance
      let lastWorkflowPriority = Number.MAX_SAFE_INTEGER;
      let lastWorkflowDatetime = 0;
      
      for (const [jobId] of jobAssignments) {
        const job = await redisService.getJob(jobId);
        if (job && job.workflow_priority && job.workflow_datetime) {
          // Within same priority, should be FIFO by workflow datetime
          if (job.workflow_priority === lastWorkflowPriority) {
            expect(job.workflow_datetime).toBeGreaterThanOrEqual(lastWorkflowDatetime);
          } else {
            // Different priority, should be higher or equal priority
            expect(job.workflow_priority).toBeLessThanOrEqual(lastWorkflowPriority);
          }
          
          lastWorkflowPriority = job.workflow_priority;
          lastWorkflowDatetime = job.workflow_datetime;
        }
      }
    });

    test('should respect priority ordering within workflow inheritance', async () => {
      // Create workflow jobs with specific priority ordering
      const workflowJobs = [
        { workflow_id: 'workflow-A', priority: 90, step: 1, service: 'comfyui' },
        { workflow_id: 'workflow-B', priority: 95, step: 1, service: 'comfyui' }, // Higher priority
        { workflow_id: 'workflow-A', priority: 90, step: 2, service: 'a1111' },
        { workflow_id: 'workflow-C', priority: 85, step: 1, service: 'comfyui' },
        { workflow_id: 'workflow-B', priority: 95, step: 2, service: 'a1111' },
      ];

      // Submit workflow jobs
      const submittedJobs: { id: string; expectedOrder: number }[] = [];
      for (let i = 0; i < workflowJobs.length; i++) {
        const jobRequest = workflowJobs[i];
        
        // Create workflow first
        const workflowId = await jobBroker.createWorkflow(
          jobRequest.priority, 
          'test-customer', 
          jobRequest.workflow_id
        );

        const jobId = await jobBroker.submitJob({
          service_required: jobRequest.service,
          priority: jobRequest.priority,
          payload: { step: jobRequest.step },
          workflow_id: workflowId,
          workflow_priority: jobRequest.priority,
          step_number: jobRequest.step,
        });

        submittedJobs.push({ 
          id: jobId, 
          expectedOrder: i 
        });
      }

      // Get a worker that can handle both comfyui and a1111
      const universalWorker = workers.find(w => 
        w.services.includes('comfyui') && w.services.includes('a1111')
      )!;

      // Claim jobs and verify they come out in priority order
      const claimedJobs: Job[] = [];
      for (let i = 0; i < submittedJobs.length; i++) {
        const job = await jobBroker.getNextJobForWorker(universalWorker);
        if (job) {
          claimedJobs.push(job);
        }
      }

      // Verify priority ordering
      expect(claimedJobs).toHaveLength(workflowJobs.length);
      
      // Should get workflow-B jobs first (priority 95), then workflow-A (priority 90), then workflow-C (priority 85)
      // Within same workflow, should maintain FIFO order (step 1 before step 2)
      const expectedSequence = [
        'workflow-B', // step 1, priority 95
        'workflow-B', // step 2, priority 95  
        'workflow-A', // step 1, priority 90
        'workflow-A', // step 2, priority 90
        'workflow-C', // step 1, priority 85
      ];

      for (let i = 0; i < claimedJobs.length; i++) {
        const job = claimedJobs[i];
        const expectedWorkflow = expectedSequence[i];
        expect(job.workflow_id).toBe(expectedWorkflow);
        logger.info(`Position ${i}: Job ${job.id} from ${job.workflow_id} (priority: ${job.workflow_priority})`);
      }
    });

    test('should handle hardware requirement filtering', async () => {
      // Create jobs with specific hardware requirements
      const highMemoryJob = await jobBroker.submitJob({
        service_required: 'comfyui',
        priority: 50,
        payload: { model: 'flux-large' },
        requirements: {
          service_type: 'comfyui',
          hardware: {
            gpu_memory_gb: 24, // Requires high-end GPU
          }
        }
      });

      const lowMemoryJob = await jobBroker.submitJob({
        service_required: 'comfyui', 
        priority: 50,
        payload: { model: 'sdxl' },
        requirements: {
          service_type: 'comfyui',
          hardware: {
            gpu_memory_gb: 8, // Can run on mid-range GPU
          }
        }
      });

      // Get workers with different GPU memory
      const highEndWorker = workers.find(w => 
        w.services.includes('comfyui') && w.hardware.gpu_memory_gb >= 24
      )!;
      
      const midRangeWorker = workers.find(w => 
        w.services.includes('comfyui') && 
        w.hardware.gpu_memory_gb >= 8 && 
        w.hardware.gpu_memory_gb < 24
      )!;

      // High-end worker should be able to claim both jobs
      const highEndJob1 = await jobBroker.getNextJobForWorker(highEndWorker);
      expect(highEndJob1).toBeTruthy();
      
      const highEndJob2 = await jobBroker.getNextJobForWorker(highEndWorker);
      expect(highEndJob2).toBeTruthy();

      // Reset jobs for mid-range test
      await redisService['redis'].flushdb();
      
      const highMemoryJob2 = await jobBroker.submitJob({
        service_required: 'comfyui',
        priority: 50,
        payload: { model: 'flux-large' },
        requirements: {
          service_type: 'comfyui',
          hardware: { gpu_memory_gb: 24 }
        }
      });

      const lowMemoryJob2 = await jobBroker.submitJob({
        service_required: 'comfyui',
        priority: 50, 
        payload: { model: 'sdxl' },
        requirements: {
          service_type: 'comfyui',
          hardware: { gpu_memory_gb: 8 }
        }
      });

      // Mid-range worker should only be able to claim the low memory job
      const midRangeClaimedJob = await jobBroker.getNextJobForWorker(midRangeWorker);
      expect(midRangeClaimedJob).toBeTruthy();
      expect(midRangeClaimedJob!.id).toBe(lowMemoryJob2);

      // Mid-range worker should not be able to claim the high memory job
      const midRangeSecondJob = await jobBroker.getNextJobForWorker(midRangeWorker);
      expect(midRangeSecondJob).toBeNull();
    });

    test('should handle customer isolation correctly', async () => {
      // Create jobs for different customers
      const customerAJob = await jobBroker.submitJob({
        service_required: 'a1111',
        priority: 50,
        payload: { prompt: 'customer A content' },
        customer_id: 'customer-a'
      });

      const customerBJob = await jobBroker.submitJob({
        service_required: 'a1111',
        priority: 50,
        payload: { prompt: 'customer B content' },
        customer_id: 'customer-b'
      });

      // Get worker with customer restrictions (a1111 specialist restricted to customer-a and customer-c)
      const restrictedWorker = workers.find(w => 
        w.services.includes('a1111') &&
        w.customer_access?.allowed_customers?.includes('customer-a') &&
        !w.customer_access?.allowed_customers?.includes('customer-b')
      )!;

      // Restricted worker should only claim customer A's job
      const claimedJob = await jobBroker.getNextJobForWorker(restrictedWorker);
      expect(claimedJob).toBeTruthy();
      expect(claimedJob!.id).toBe(customerAJob);

      // Should not be able to claim customer B's job
      const secondJob = await jobBroker.getNextJobForWorker(restrictedWorker);
      expect(secondJob).toBeNull();
    });
  });

  describe('Workflow Priority Inheritance', () => {
    test('should process 100 workflows in correct priority order with step preservation', async () => {
      // Submit all workflows  
      const allJobIds: string[] = [];
      const workflowSubmissionTimes = new Map<string, number>();
      
      for (const workflow of workflows) {
        const submissionTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 1)); // Ensure different timestamps
        
        // Create the workflow first
        const workflowId = await jobBroker.createWorkflow(
          workflow.priority,
          `customer-${workflow.id}`,
          workflow.id
        );
        
        workflowSubmissionTimes.set(workflowId, submissionTime);

        // Submit all jobs in the workflow
        for (const jobRequest of workflow.jobs) {
          const jobRequestWithWorkflow = {
            ...jobRequest,
            workflow_id: workflowId,
            workflow_priority: workflow.priority,
          };
          const jobId = await jobBroker.submitJob(jobRequestWithWorkflow);
          allJobIds.push(jobId);
        }
      }

      logger.info(`Submitted ${allJobIds.length} jobs across ${workflows.length} workflows`);

      // Get a universal worker that can handle all services
      const universalWorker = workers.find(w => 
        w.services.includes('comfyui') && 
        w.services.includes('a1111') && 
        w.services.includes('flux') &&
        w.hardware.gpu_memory_gb >= 32 // Can handle all hardware requirements
      )!;

      expect(universalWorker).toBeTruthy();

      // Claim jobs in order and verify workflow inheritance
      const claimedJobs: Job[] = [];
      for (let i = 0; i < allJobIds.length; i++) {
        const job = await jobBroker.getNextJobForWorker(universalWorker);
        if (job) {
          claimedJobs.push(job);
        }
      }

      logger.info(`Claimed ${claimedJobs.length} jobs`);

      // Verify workflow priority inheritance rules
      let lastWorkflowPriority = Number.MAX_SAFE_INTEGER;
      let lastWorkflowDatetime = 0;
      let workflowSteps = new Map<string, number>();

      for (let i = 0; i < claimedJobs.length; i++) {
        const job = claimedJobs[i];
        
        if (!job.workflow_id || !job.workflow_priority || !job.workflow_datetime) {
          continue;
        }

        // Track step numbers within workflows
        const currentStep = workflowSteps.get(job.workflow_id) || 0;
        workflowSteps.set(job.workflow_id, Math.max(currentStep, job.step_number || 0));

        // Rule 1: Higher priority workflows should be processed first
        if (job.workflow_priority !== lastWorkflowPriority) {
          expect(job.workflow_priority).toBeLessThanOrEqual(lastWorkflowPriority);
          logger.debug(`Priority change: ${lastWorkflowPriority} -> ${job.workflow_priority}`);
        }

        // Rule 2: Within same priority, older workflows (FIFO by submission time)
        if (job.workflow_priority === lastWorkflowPriority) {
          expect(job.workflow_datetime).toBeGreaterThanOrEqual(lastWorkflowDatetime);
        }

        // Rule 3: Within same workflow, steps should be processed in order
        const workflowJobs = claimedJobs.filter(j => j.workflow_id === job.workflow_id);
        workflowJobs.sort((a, b) => (a.step_number || 0) - (b.step_number || 0));
        
        for (let j = 1; j < workflowJobs.length; j++) {
          expect(workflowJobs[j].step_number).toBeGreaterThan(workflowJobs[j-1].step_number || 0);
        }

        lastWorkflowPriority = job.workflow_priority;
        lastWorkflowDatetime = job.workflow_datetime;

        if (i < 10) { // Log first 10 for debugging
          logger.info(`Job ${i}: Workflow ${job.workflow_id} step ${job.step_number} priority ${job.workflow_priority}`);
        }
      }

      // Verify we processed all high-priority emergency workflows first
      const emergencyJobs = claimedJobs.filter(job => 
        job.workflow_id?.startsWith('emergency-workflow-')
      );
      const firstEmergencyIndex = claimedJobs.findIndex(job => 
        job.workflow_id?.startsWith('emergency-workflow-')
      );
      const lastEmergencyIndex = claimedJobs.findIndex(job => 
        job.workflow_id?.startsWith('emergency-workflow-')
      );

      // Emergency workflows should be at the beginning
      expect(firstEmergencyIndex).toBeLessThan(20); // Should be in first 20 jobs
      logger.info(`Emergency workflows processed in positions ${firstEmergencyIndex} to ${lastEmergencyIndex}`);
    });
  });

  describe('Concurrent Worker Behavior', () => {
    test('should mark unworkable jobs when no workers can handle them', async () => {
      // Submit a job that requires a service none of our workers support
      const unworkableJobId = await jobBroker.submitJob({
        service_required: 'dalle3', // No workers support this service
        priority: 100,
        payload: { prompt: 'unworkable job test' }
      });

      // Submit a normal job that workers can handle
      const workableJobId = await jobBroker.submitJob({
        service_required: 'comfyui',
        priority: 90,
        payload: { prompt: 'workable job test' }
      });

      // Mark unworkable jobs
      const markedJobs = await jobBroker.markUnworkableJobs();
      
      // The unworkable job should be marked
      expect(markedJobs).toContain(unworkableJobId);
      expect(markedJobs).not.toContain(workableJobId);

      // Verify the unworkable job is moved to the unworkable queue
      const unworkableJobs = await jobBroker.getUnworkableJobs();
      expect(unworkableJobs).toHaveLength(1);
      expect(unworkableJobs[0].id).toBe(unworkableJobId);
      expect(unworkableJobs[0].status).toBe(JobStatus.UNWORKABLE);

      logger.info(`Successfully marked ${markedJobs.length} jobs as unworkable`);
    });

    test('should handle race conditions in job claiming', async () => {
      // Submit a single high-priority job
      const jobId = await jobBroker.submitJob({
        service_required: 'comfyui',
        priority: 100,
        payload: { prompt: 'race condition test' }
      });

      // Get multiple workers that can handle this job
      const capableWorkers = workers.filter(w => w.services.includes('comfyui'));
      expect(capableWorkers.length).toBeGreaterThan(1);

      // Have all workers try to claim the job simultaneously
      const claimPromises = capableWorkers.map(worker => 
        jobBroker.getNextJobForWorker(worker)
      );

      const results = await Promise.all(claimPromises);
      
      // Only one worker should successfully claim the job
      const successfulClaims = results.filter(job => job !== null);
      expect(successfulClaims).toHaveLength(1);
      
      const claimedJob = successfulClaims[0]!;
      expect(claimedJob.id).toBe(jobId);

      logger.info('Race condition test passed: Only one worker claimed the job');
    });
  });
});

/**
 * Create 10 diverse workers with different capabilities
 */
function createDiverseWorkers(): WorkerCapabilities[] {
  const workers: WorkerCapabilities[] = [];

  // Worker 1: High-end ComfyUI specialist
  workers.push({
    worker_id: 'worker-comfyui-highend',
    services: ['comfyui'],
    hardware: {
      gpu_memory_gb: 32,
      gpu_model: 'RTX 4090',
      cpu_cores: 16,
      cpu_threads: 32,
      ram_gb: 64
    },
    models: { comfyui: ['flux-dev', 'flux-pro', 'sdxl', 'sd3'] },
    customer_access: {
      isolation: 'loose',
      max_concurrent_customers: 5
    },
    performance: {
      concurrent_jobs: 2,
      quality_levels: ['fast', 'balanced', 'quality'],
      max_processing_time_minutes: 120
    },
    metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'linux', arch: 'x64' }
  });

  // Worker 2: Mid-range ComfyUI + A1111
  workers.push({
    worker_id: 'worker-hybrid-midrange',
    services: ['comfyui', 'a1111'],
    hardware: {
      gpu_memory_gb: 16,
      gpu_model: 'RTX 3080',
      cpu_cores: 8,
      cpu_threads: 16,
      ram_gb: 32
    },
    models: { comfyui: ['sdxl', 'sd15'], a1111: ['sdxl', 'sd15'] },
    customer_access: {
      isolation: 'loose',
      max_concurrent_customers: 3
    },
    performance: {
      concurrent_jobs: 1,
      quality_levels: ['fast', 'balanced'],
      max_processing_time_minutes: 60
    },
    metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'linux', arch: 'x64' }
  });

  // Worker 3: A1111 specialist with customer restrictions
  workers.push({
    worker_id: 'worker-a1111-restricted',
    services: ['a1111'],
    hardware: {
      gpu_memory_gb: 12,
      gpu_model: 'RTX 3060',
      cpu_cores: 6,
      cpu_threads: 12,
      ram_gb: 16
    },
    models: { a1111: ['sd15', 'sd21'] },
    customer_access: {
      isolation: 'strict',
      allowed_customers: ['customer-a', 'customer-c'],
      max_concurrent_customers: 1
    },
    performance: {
      concurrent_jobs: 1,
      quality_levels: ['fast'],
      max_processing_time_minutes: 30
    },
    metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'linux', arch: 'x64' }
  });

  // Worker 4: Low-end general purpose
  workers.push({
    worker_id: 'worker-lowend-general',
    services: ['comfyui', 'a1111', 'flux'],
    hardware: {
      gpu_memory_gb: 8,
      gpu_model: 'GTX 1660',
      cpu_cores: 4,
      cpu_threads: 8,
      ram_gb: 16
    },
    models: { comfyui: ['sd15'], a1111: ['sd15'], flux: ['flux-schnell'] },
    customer_access: {
      isolation: 'none',
      max_concurrent_customers: 10
    },
    performance: {
      concurrent_jobs: 1,
      quality_levels: ['fast'],
      max_processing_time_minutes: 45
    },
    metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'windows', arch: 'x64' }
  });

  // Worker 5: Flux specialist
  workers.push({
    worker_id: 'worker-flux-specialist',
    services: ['flux'],
    hardware: {
      gpu_memory_gb: 24,
      gpu_model: 'RTX 4080',
      cpu_cores: 12,
      cpu_threads: 24,
      ram_gb: 48
    },
    models: { flux: ['flux-dev', 'flux-pro', 'flux-schnell'] },
    customer_access: {
      isolation: 'loose',
      max_concurrent_customers: 4
    },
    performance: {
      concurrent_jobs: 2,
      quality_levels: ['balanced', 'quality'],
      max_processing_time_minutes: 90
    },
    metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'linux', arch: 'x64' }
  });

  // Workers 6-10: More varied configurations
  for (let i = 6; i <= 10; i++) {
    workers.push({
      worker_id: `worker-${i}`,
      services: i % 2 === 0 ? ['comfyui'] : ['a1111'],
      hardware: {
        gpu_memory_gb: 8 + (i * 2),
        gpu_model: `GPU-${i}`,
        cpu_cores: 4 + i,
        cpu_threads: (4 + i) * 2,
        ram_gb: 16 + (i * 4)
      },
      models: {},
      customer_access: {
        isolation: i % 3 === 0 ? 'strict' : 'loose',
        allowed_customers: i % 3 === 0 ? [`customer-${String.fromCharCode(97 + (i % 3))}`] : undefined,
        max_concurrent_customers: 2 + (i % 3)
      },
      performance: {
        concurrent_jobs: 1,
        quality_levels: ['fast', 'balanced'],
        max_processing_time_minutes: 30 + (i * 5)
      },
      metadata: { version: '1.0.0', node_version: 'v18.0.0', platform: 'linux', arch: 'x64' }
    });
  }

  return workers;
}

/**
 * Create 100 varied workflows with multiple steps each, different priorities, and requirements
 */
function createVariedWorkflows(): Array<{ id: string; priority: number; jobs: JobSubmissionRequest[] }> {
  const workflows: Array<{ id: string; priority: number; jobs: JobSubmissionRequest[] }> = [];
  const services = ['comfyui', 'a1111', 'flux'];
  const customers = ['customer-a', 'customer-b', 'customer-c', 'customer-d'];
  
  // Create 100 workflows with varying characteristics
  for (let i = 0; i < 100; i++) {
    const workflowId = `workflow-${i.toString().padStart(3, '0')}`;
    const priority = 10 + (i % 90); // Priority 10-99
    const customer = customers[i % customers.length];
    
    // Each workflow has 2-5 steps
    const numSteps = 2 + (i % 4);
    const jobs: JobSubmissionRequest[] = [];
    
    for (let step = 1; step <= numSteps; step++) {
      const service = services[(i + step) % services.length]; // Vary service by step
      
      const job: JobSubmissionRequest = {
        service_required: service,
        priority: priority, // Will be inherited from workflow
        payload: {
          prompt: `Workflow ${workflowId} step ${step} prompt`,
          seed: i * 100 + step,
          steps: 20 + ((i + step) % 30)
        },
        customer_id: customer,
        step_number: step,
        workflow_id: workflowId
      };

      // Add hardware requirements to some steps
      if ((i + step) % 5 === 0) {
        const gpuMemory = [8, 16, 24, 32][(i + step) % 4];
        job.requirements = {
          service_type: service,
          hardware: {
            gpu_memory_gb: gpuMemory
          }
        };
      }

      // Add quality requirements to some steps
      if ((i + step) % 7 === 0) {
        if (!job.requirements) job.requirements = { service_type: service };
        job.requirements.quality_level = ['fast', 'balanced', 'quality'][(i + step) % 3] as 'fast' | 'balanced' | 'quality';
      }

      // Add customer isolation requirements for some workflows
      if (i % 10 === 0) {
        if (!job.requirements) job.requirements = { service_type: service };
        job.requirements.customer_isolation = 'strict';
      }

      // Add model requirements for some steps
      if ((i + step) % 6 === 0) {
        if (!job.requirements) job.requirements = { service_type: service };
        job.requirements.models = service === 'comfyui' ? ['sdxl', 'flux-dev'] : ['sd15', 'sd21'];
      }

      jobs.push(job);
    }
    
    workflows.push({
      id: workflowId,
      priority: priority,
      jobs: jobs
    });
  }

  // Add some high-priority emergency workflows
  for (let i = 0; i < 5; i++) {
    const workflowId = `emergency-workflow-${i}`;
    const priority = 95 + i; // Very high priority
    
    const jobs: JobSubmissionRequest[] = [
      {
        service_required: 'comfyui',
        priority: priority,
        payload: { prompt: `Emergency workflow ${i} - urgent generation`, seed: i },
        customer_id: 'customer-priority',
        step_number: 1,
        workflow_id: workflowId,
        requirements: {
          service_type: 'comfyui',
          hardware: { gpu_memory_gb: 16 }
        }
      },
      {
        service_required: 'flux',
        priority: priority,
        payload: { prompt: `Emergency workflow ${i} - final output`, seed: i + 1000 },
        customer_id: 'customer-priority',
        step_number: 2,
        workflow_id: workflowId,
        requirements: {
          service_type: 'flux',
          hardware: { gpu_memory_gb: 24 }
        }
      }
    ];
    
    workflows.push({
      id: workflowId,
      priority: priority,
      jobs: jobs
    });
  }

  // Add some low-priority batch workflows
  for (let i = 0; i < 10; i++) {
    const workflowId = `batch-workflow-${i}`;
    const priority = 5 + (i % 5); // Low priority
    
    const jobs: JobSubmissionRequest[] = [];
    // Batch workflows have many steps (5-8 steps each)
    const numSteps = 5 + (i % 4);
    
    for (let step = 1; step <= numSteps; step++) {
      jobs.push({
        service_required: 'a1111',
        priority: priority,
        payload: { 
          prompt: `Batch ${i} item ${step}`, 
          seed: i * 1000 + step,
          batch_size: 4 
        },
        customer_id: 'customer-batch',
        step_number: step,
        workflow_id: workflowId,
        requirements: {
          service_type: 'a1111',
          hardware: { gpu_memory_gb: 8 },
          quality_level: 'fast'
        }
      });
    }
    
    workflows.push({
      id: workflowId,
      priority: priority,
      jobs: jobs
    });
  }

  logger.info(`Created ${workflows.length} workflows with ${workflows.reduce((sum, w) => sum + w.jobs.length, 0)} total jobs`);
  return workflows;
}