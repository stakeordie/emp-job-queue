#!js name=jobMatching

/**
 * Redis Function for finding and claiming jobs that match worker capabilities
 * This function runs server-side in Redis for atomic job matching
 */

redis.registerFunction('findMatchingJob', function(client, keys, args) {
  // Parse arguments
  const workerCaps = JSON.parse(args[0]);
  const maxScan = parseInt(args[1]) || 100;
  
  // Log for debugging
  redis.log('INFO', `Worker ${workerCaps.worker_id} requesting job with capabilities: ${args[0]}`);
  
  // Get top pending jobs by priority
  const pendingJobs = client.call('ZREVRANGE', 'jobs:pending', '0', String(maxScan - 1));
  
  if (!pendingJobs || pendingJobs.length === 0) {
    redis.log('DEBUG', `No pending jobs found for worker ${workerCaps.worker_id}`);
    return null;
  }
  
  redis.log('INFO', `Found ${pendingJobs.length} pending jobs to check`);
  
  // Check each job for compatibility
  for (let i = 0; i < pendingJobs.length; i++) {
    const jobId = pendingJobs[i];
    
    // Get job details
    const jobData = client.call('HGETALL', `job:${jobId}`);
    if (!jobData || jobData.length === 0) {
      redis.log('WARN', `Job ${jobId} not found in hash`);
      continue;
    }
    
    // Convert array to object
    const job = hashToObject(jobData);
    
    // Check if worker can handle this job
    if (matchesRequirements(workerCaps, job)) {
      redis.log('INFO', `Worker ${workerCaps.worker_id} matches job ${jobId}`);
      
      // Try to claim the job atomically
      const removed = client.call('ZREM', 'jobs:pending', jobId);
      if (removed === 1) {
        // Success! Update job status
        client.call('HMSET', `job:${jobId}`, 
          'status', 'assigned',
          'worker_id', workerCaps.worker_id,
          'assigned_at', new Date().toISOString()
        );
        
        // Add to worker's active jobs
        client.call('HSET', `jobs:active:${workerCaps.worker_id}`, jobId, JSON.stringify(job));
        
        // Update worker status
        client.call('HMSET', `worker:${workerCaps.worker_id}`,
          'status', 'busy',
          'current_job_id', jobId,
          'last_status_change', new Date().toISOString()
        );
        
        // Publish assignment event
        const assignmentEvent = {
          job_id: jobId,
          worker_id: workerCaps.worker_id,
          status: 'assigned',
          progress: 0,
          message: 'Job assigned to worker',
          assigned_at: new Date().toISOString()
        };
        client.call('XADD', `progress:${jobId}`, '*',
          'job_id', jobId,
          'worker_id', workerCaps.worker_id,
          'status', 'assigned',
          'progress', '0',
          'message', 'Job assigned to worker',
          'assigned_at', new Date().toISOString()
        );
        
        redis.log('INFO', `Worker ${workerCaps.worker_id} successfully claimed job ${jobId}`);
        
        // Return job details
        return JSON.stringify({
          jobId: jobId,
          job: job
        });
      } else {
        redis.log('DEBUG', `Job ${jobId} already claimed by another worker`);
      }
    } else {
      redis.log('DEBUG', `Worker ${workerCaps.worker_id} cannot handle job ${jobId}`);
    }
  }
  
  redis.log('INFO', `No matching jobs found for worker ${workerCaps.worker_id}`);
  return null;
});

/**
 * Convert Redis HGETALL array response to object
 */
function hashToObject(data) {
  const obj = {};
  for (let i = 0; i < data.length; i += 2) {
    obj[data[i]] = data[i + 1];
  }
  return obj;
}

/**
 * Check if worker capabilities match job requirements
 */
function matchesRequirements(worker, job) {
  // Parse requirements
  let requirements;
  try {
    requirements = JSON.parse(job.requirements || '{}');
  } catch (e) {
    redis.log('WARN', `Failed to parse job requirements: ${job.requirements}`);
    requirements = {};
  }
  
  // Check service type
  if (job.service_required) {
    if (!worker.services || !Array.isArray(worker.services)) {
      return false;
    }
    if (!worker.services.includes(job.service_required)) {
      redis.log('DEBUG', `Service mismatch: need ${job.service_required}, worker has ${worker.services.join(',')}`);
      return false;
    }
  }
  
  // Check hardware requirements
  if (requirements.hardware) {
    if (!checkHardwareRequirements(worker.hardware || {}, requirements.hardware)) {
      return false;
    }
  }
  
  // Check customer isolation
  if (requirements.customer_isolation) {
    if (!checkCustomerIsolation(worker.customer_access || {}, requirements.customer_isolation, job.customer_id)) {
      return false;
    }
  }
  
  // Check models if specified
  if (requirements.models && requirements.models !== 'all') {
    if (!checkModelRequirements(worker.models || {}, requirements.models, job.service_required)) {
      return false;
    }
  }
  
  // Check custom capabilities (generic matching)
  for (const key in requirements) {
    // Skip already handled requirements
    if (['service_type', 'hardware', 'customer_isolation', 'models'].includes(key)) {
      continue;
    }
    
    // Check if worker has this capability
    if (!checkCustomCapability(worker, key, requirements[key])) {
      redis.log('DEBUG', `Custom capability mismatch: ${key}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check hardware requirements
 */
function checkHardwareRequirements(workerHw, requiredHw) {
  // GPU memory check
  if (requiredHw.gpu_memory_gb && requiredHw.gpu_memory_gb !== 'all') {
    if (!workerHw.gpu_memory_gb || workerHw.gpu_memory_gb < requiredHw.gpu_memory_gb) {
      redis.log('DEBUG', `GPU memory insufficient: need ${requiredHw.gpu_memory_gb}GB, have ${workerHw.gpu_memory_gb || 0}GB`);
      return false;
    }
  }
  
  // CPU cores check
  if (requiredHw.cpu_cores && requiredHw.cpu_cores !== 'all') {
    if (!workerHw.cpu_cores || workerHw.cpu_cores < requiredHw.cpu_cores) {
      redis.log('DEBUG', `CPU cores insufficient: need ${requiredHw.cpu_cores}, have ${workerHw.cpu_cores || 0}`);
      return false;
    }
  }
  
  // RAM check
  if (requiredHw.ram_gb && requiredHw.ram_gb !== 'all') {
    if (!workerHw.ram_gb || workerHw.ram_gb < requiredHw.ram_gb) {
      redis.log('DEBUG', `RAM insufficient: need ${requiredHw.ram_gb}GB, have ${workerHw.ram_gb || 0}GB`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check customer isolation requirements
 */
function checkCustomerIsolation(workerAccess, requiredIsolation, customerId) {
  // Check isolation level
  if (requiredIsolation === 'strict' && workerAccess.isolation !== 'strict') {
    redis.log('DEBUG', `Isolation mismatch: need strict, worker has ${workerAccess.isolation || 'none'}`);
    return false;
  }
  
  // Check allowed/denied customers
  if (customerId && workerAccess.allowed_customers && Array.isArray(workerAccess.allowed_customers)) {
    if (!workerAccess.allowed_customers.includes(customerId)) {
      redis.log('DEBUG', `Customer ${customerId} not in allowed list`);
      return false;
    }
  }
  
  if (customerId && workerAccess.denied_customers && Array.isArray(workerAccess.denied_customers)) {
    if (workerAccess.denied_customers.includes(customerId)) {
      redis.log('DEBUG', `Customer ${customerId} in denied list`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check model requirements
 */
function checkModelRequirements(workerModels, requiredModels, serviceType) {
  if (!Array.isArray(requiredModels)) {
    return true; // Invalid format, allow
  }
  
  const serviceModels = workerModels[serviceType] || [];
  if (!Array.isArray(serviceModels)) {
    return false;
  }
  
  // Check if worker has all required models
  for (const model of requiredModels) {
    if (!serviceModels.includes(model)) {
      redis.log('DEBUG', `Model mismatch: need ${model}, worker doesn't have it`);
      return false;
    }
  }
  
  return true;
}

/**
 * Check custom capability (generic)
 */
function checkCustomCapability(worker, key, requiredValue) {
  const workerValue = getNestedValue(worker, key);
  
  // If required value is an object, check nested properties
  if (typeof requiredValue === 'object' && !Array.isArray(requiredValue)) {
    if (typeof workerValue !== 'object') {
      return false;
    }
    
    // Check each nested requirement
    for (const subKey in requiredValue) {
      const workerSubValue = workerValue[subKey];
      const requiredSubValue = requiredValue[subKey];
      
      if (!compareValues(workerSubValue, requiredSubValue)) {
        return false;
      }
    }
    return true;
  }
  
  // Direct value comparison
  return compareValues(workerValue, requiredValue);
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value && typeof value === 'object') {
      value = value[key];
    } else {
      return undefined;
    }
  }
  
  return value;
}

/**
 * Compare values based on type
 */
function compareValues(workerValue, requiredValue) {
  // Missing capability
  if (workerValue === undefined || workerValue === null) {
    return false;
  }
  
  // Array comparison (worker must have all required items)
  if (Array.isArray(requiredValue)) {
    if (!Array.isArray(workerValue)) {
      return false;
    }
    
    for (const item of requiredValue) {
      if (!workerValue.includes(item)) {
        return false;
      }
    }
    return true;
  }
  
  // Numeric comparison (worker must have >= required)
  if (typeof requiredValue === 'number') {
    if (typeof workerValue !== 'number') {
      return false;
    }
    return workerValue >= requiredValue;
  }
  
  // String/boolean comparison (must match exactly)
  return workerValue === requiredValue;
}