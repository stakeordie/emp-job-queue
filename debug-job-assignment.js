#!/usr/bin/env node

// Debug script to test ComfyUI job assignment flow
// This will help identify why Worker3 with ComfyUI capability isn't taking ComfyUI jobs

import Redis from 'ioredis';
import { RedisService } from './dist/core/redis-service.js';
import { JobBroker } from './dist/core/job-broker.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function main() {
  console.log('🔍 Debugging ComfyUI job assignment flow...\n');
  
  const redis = new Redis(REDIS_URL);
  const redisService = new RedisService(REDIS_URL);
  const jobBroker = new JobBroker(redisService);
  
  try {
    await redisService.connect();
    console.log('✅ Connected to Redis\n');
    
    // Step 1: Check current system state
    console.log('📊 Current System State:');
    console.log('========================');
    
    // Check active workers
    const workerKeys = await redis.keys('worker:*');
    const workers = [];
    
    for (const key of workerKeys) {
      if (key.includes(':heartbeat')) continue;
      
      const workerData = await redis.hgetall(key);
      if (workerData.worker_id) {
        const capabilities = JSON.parse(workerData.capabilities || '{}');
        workers.push({
          id: workerData.worker_id,
          status: workerData.status,
          services: capabilities.services || [],
          last_heartbeat: workerData.last_heartbeat
        });
      }
    }
    
    console.log(`Found ${workers.length} workers:`);
    workers.forEach(worker => {
      console.log(`  - ${worker.id}: status=${worker.status}, services=[${worker.services.join(', ')}]`);
    });
    
    // Check pending jobs
    const pendingJobIds = await redis.zrevrange('jobs:pending', 0, -1);
    console.log(`\nFound ${pendingJobIds.length} pending jobs:`);
    
    for (const jobId of pendingJobIds.slice(0, 5)) { // Show first 5
      const jobData = await redis.hgetall(`job:${jobId}`);
      console.log(`  - ${jobId}: service=${jobData.service_required}, priority=${jobData.priority}`);
    }
    
    // Step 2: Find Worker3 ComfyUI
    const comfyWorker = workers.find(w => w.id === 'worker3-comfyui' || w.services.includes('comfyui'));
    
    if (!comfyWorker) {
      console.log('\n❌ No ComfyUI worker found! This is the problem.');
      console.log('   Check if worker3-comfyui is running and properly registered.');
      return;
    }
    
    console.log(`\n✅ Found ComfyUI worker: ${comfyWorker.id}`);
    console.log(`   Services: [${comfyWorker.services.join(', ')}]`);
    console.log(`   Status: ${comfyWorker.status}`);
    
    // Step 3: Create a test ComfyUI job
    console.log('\n🧪 Creating test ComfyUI job...');
    
    const testJobRequest = {
      service_required: 'comfyui',
      priority: 80,
      payload: {
        workflow: {
          "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
              "ckpt_name": "test_model.safetensors"
            }
          }
        }
      },
      requirements: {
        service_type: 'comfyui'
      },
      customer_id: 'test-customer',
      max_retries: 3
    };
    
    const jobId = await jobBroker.submitJob(testJobRequest);
    console.log(`✅ Created test job: ${jobId}`);
    
    // Step 4: Test worker capability matching
    console.log('\n🔧 Testing capability matching...');
    
    // Get the full worker capabilities
    const workerRecord = await redis.hgetall(`worker:${comfyWorker.id}`);
    const fullCapabilities = JSON.parse(workerRecord.capabilities || '{}');
    
    // Get the job details
    const job = await redisService.getJob(jobId);
    if (!job) {
      console.log('❌ Failed to retrieve created job');
      return;
    }
    
    console.log('\nJob details:');
    console.log(`  Service required: ${job.service_required}`);
    console.log(`  Requirements:`, job.requirements);
    
    console.log('\nWorker capabilities:');
    console.log(`  Services: [${fullCapabilities.services?.join(', ') || 'none'}]`);
    console.log(`  Hardware:`, fullCapabilities.hardware);
    
    // Step 5: Test the canWorkerHandleJob method directly
    console.log('\n🎯 Testing job-worker matching...');
    
    // Access the private method via the redis service
    const canHandle = await redisService['canWorkerHandleJob'](job, fullCapabilities);
    console.log(`Can worker handle job: ${canHandle}`);
    
    if (!canHandle) {
      console.log('\n❌ PROBLEM IDENTIFIED: Worker cannot handle the job!');
      console.log('   Debugging why...\n');
      
      // Debug each check
      console.log('🔍 Detailed capability checks:');
      
      // Check service compatibility
      const serviceMatch = fullCapabilities.services?.includes(job.service_required);
      console.log(`  ✓ Service match (${job.service_required}): ${serviceMatch}`);
      
      if (job.requirements?.service_type) {
        const reqServiceMatch = fullCapabilities.services?.includes(job.requirements.service_type);
        console.log(`  ✓ Requirements service match (${job.requirements.service_type}): ${reqServiceMatch}`);
      }
      
      // Check if worker was last to fail this job
      const lastFailedWorker = job.last_failed_worker === fullCapabilities.worker_id;
      console.log(`  ✓ Not last failed worker: ${!lastFailedWorker}`);
      
      // Check hardware requirements
      if (job.requirements?.hardware) {
        console.log('  ✓ Hardware requirements check:');
        const hw = job.requirements.hardware;
        const workerHw = fullCapabilities.hardware;
        
        if (hw.gpu_memory_gb && hw.gpu_memory_gb !== 'all') {
          const gpuMatch = workerHw.gpu_memory_gb >= hw.gpu_memory_gb;
          console.log(`    GPU memory: ${workerHw.gpu_memory_gb}GB >= ${hw.gpu_memory_gb}GB = ${gpuMatch}`);
        }
        
        if (hw.cpu_cores && hw.cpu_cores !== 'all') {
          const cpuMatch = workerHw.cpu_cores >= hw.cpu_cores;
          console.log(`    CPU cores: ${workerHw.cpu_cores} >= ${hw.cpu_cores} = ${cpuMatch}`);
        }
        
        if (hw.ram_gb && hw.ram_gb !== 'all') {
          const ramMatch = workerHw.ram_gb >= hw.ram_gb;
          console.log(`    RAM: ${workerHw.ram_gb}GB >= ${hw.ram_gb}GB = ${ramMatch}`);
        }
      }
      
      // Check customer access
      if (job.customer_id && fullCapabilities.customer_access) {
        console.log('  ✓ Customer access check:');
        const access = fullCapabilities.customer_access;
        
        const notDenied = !access.denied_customers?.includes(job.customer_id);
        console.log(`    Not in denied list: ${notDenied}`);
        
        if (access.allowed_customers) {
          const isAllowed = access.allowed_customers.includes(job.customer_id);
          console.log(`    In allowed list: ${isAllowed}`);
        }
      }
    } else {
      console.log('\n✅ Worker CAN handle the job!');
    }
    
    // Step 6: Test job broker selection
    console.log('\n🎲 Testing job broker selection...');
    
    const selectedJob = await jobBroker.getNextJobForWorker(fullCapabilities);
    
    if (selectedJob) {
      console.log(`✅ Job broker selected job: ${selectedJob.id}`);
      if (selectedJob.id === jobId) {
        console.log('   This is our test job - SUCCESS!');
      } else {
        console.log('   This is a different job - worker is busy with other jobs');
      }
    } else {
      console.log('❌ Job broker returned no job for worker');
      console.log('   This suggests the worker polling loop issue');
    }
    
    // Step 7: Check job queue details
    console.log('\n📋 Job queue analysis:');
    
    const queuePosition = await redis.zrevrank('jobs:pending', jobId);
    console.log(`Test job queue position: ${queuePosition !== null ? queuePosition : 'not in queue'}`);
    
    const topJobs = await redis.zrevrange('jobs:pending', 0, 9, 'WITHSCORES');
    console.log('Top 10 jobs in queue:');
    for (let i = 0; i < topJobs.length; i += 2) {
      const id = topJobs[i];
      const score = topJobs[i + 1];
      console.log(`  ${Math.floor(i/2) + 1}. ${id} (score: ${score})`);
    }
    
    // Step 8: Simulate worker polling
    console.log('\n🔄 Simulating worker polling...');
    
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`  Attempt ${attempt}:`);
      
      const polledJob = await jobBroker.getNextJobForWorker(fullCapabilities);
      
      if (polledJob) {
        console.log(`    ✅ Got job: ${polledJob.id} (${polledJob.service_required})`);
        
        if (polledJob.id === jobId) {
          console.log('    🎉 SUCCESS: Worker got our ComfyUI test job!');
          break;
        } else {
          console.log(`    ℹ️  Worker got different job, will try again...`);
          // Release the job back so we can try again
          await jobBroker.releaseJob(polledJob.id);
        }
      } else {
        console.log('    ❌ No job returned');
      }
      
      // Small delay between attempts
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Cleanup
    console.log('\n🧹 Cleaning up test job...');
    await redis.zrem('jobs:pending', jobId);
    await redis.del(`job:${jobId}`);
    
    console.log('\n✅ Debug analysis complete!');
    
  } catch (error) {
    console.error('❌ Debug script failed:', error);
    console.error(error.stack);
  } finally {
    await redisService.disconnect();
    await redis.quit();
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n👋 Debug script terminated');
  process.exit(0);
});

// Run the debug script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});