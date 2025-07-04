#!lua name=jobMatching

--[[
Redis Function for finding and claiming jobs that match worker capabilities
This function runs server-side in Redis for atomic job matching
--]]

-- Helper functions need to be defined before the main function
local function hash_to_table(data)
  local obj = {}
  for i = 1, #data, 2 do
    obj[data[i]] = data[i + 1]
  end
  return obj
end

local function split_string(str, delimiter)
  local result = {}
  local pattern = '([^' .. delimiter .. ']+)'
  for match in string.gmatch(str, pattern) do
    table.insert(result, match)
  end
  return result
end

local function is_array(t)
  if type(t) ~= 'table' then
    return false
  end
  local i = 0
  for _ in pairs(t) do
    i = i + 1
    if t[i] == nil then
      return false
    end
  end
  return true
end

local function get_iso_timestamp()
  local time_result = redis.call('TIME')
  local seconds = tonumber(time_result[1])
  local microseconds = tonumber(time_result[2])
  -- Convert Unix timestamp to ISO format manually (simplified)
  -- This is a workaround since os.date is not available in Redis Lua
  return tostring(seconds) .. '.' .. string.format('%06d', microseconds)
end

local function get_nested_value(obj, path)
  local keys = split_string(path, '.')
  local value = obj
  
  for _, key in ipairs(keys) do
    if type(value) == 'table' and value[key] ~= nil then
      value = value[key]
    else
      return nil
    end
  end
  
  return value
end

local function compare_values(worker_value, required_value)
  if worker_value == nil then
    return false
  end
  
  if type(required_value) == 'table' and is_array(required_value) then
    if type(worker_value) ~= 'table' or not is_array(worker_value) then
      return false
    end
    
    for _, required_item in ipairs(required_value) do
      local has_item = false
      for _, worker_item in ipairs(worker_value) do
        if worker_item == required_item then
          has_item = true
          break
        end
      end
      if not has_item then
        return false
      end
    end
    return true
  end
  
  if type(required_value) == 'number' then
    if type(worker_value) ~= 'number' then
      return false
    end
    return worker_value >= required_value
  end
  
  return worker_value == required_value
end

local function check_custom_capability(worker, key, required_value)
  local worker_value = get_nested_value(worker, key)
  
  if type(required_value) == 'table' and not is_array(required_value) then
    if type(worker_value) ~= 'table' then
      return false
    end
    
    for sub_key, required_sub_value in pairs(required_value) do
      local worker_sub_value = worker_value[sub_key]
      
      if not compare_values(worker_sub_value, required_sub_value) then
        return false
      end
    end
    return true
  end
  
  return compare_values(worker_value, required_value)
end

local function check_model_requirements(worker_models, required_models, service_type)
  if type(required_models) ~= 'table' then
    return true
  end
  
  local service_models = worker_models[service_type] or {}
  if type(service_models) ~= 'table' then
    return false
  end
  
  for _, required_model in ipairs(required_models) do
    local has_model = false
    for _, worker_model in ipairs(service_models) do
      if worker_model == required_model then
        has_model = true
        break
      end
    end
    if not has_model then
      redis.log(redis.LOG_DEBUG, 'Model mismatch: need ' .. required_model .. ', worker doesn\'t have it')
      return false
    end
  end
  
  return true
end

local function check_customer_isolation(worker_access, required_isolation, customer_id)
  if required_isolation == 'strict' and worker_access.isolation ~= 'strict' then
    redis.log(redis.LOG_DEBUG, 'Isolation mismatch: need strict, worker has ' .. tostring(worker_access.isolation or 'none'))
    return false
  end
  
  if customer_id and worker_access.allowed_customers and type(worker_access.allowed_customers) == 'table' then
    local is_allowed = false
    for _, allowed_customer in ipairs(worker_access.allowed_customers) do
      if allowed_customer == customer_id then
        is_allowed = true
        break
      end
    end
    if not is_allowed then
      redis.log(redis.LOG_DEBUG, 'Customer ' .. customer_id .. ' not in allowed list')
      return false
    end
  end
  
  if customer_id and worker_access.denied_customers and type(worker_access.denied_customers) == 'table' then
    for _, denied_customer in ipairs(worker_access.denied_customers) do
      if denied_customer == customer_id then
        redis.log(redis.LOG_DEBUG, 'Customer ' .. customer_id .. ' in denied list')
        return false
      end
    end
  end
  
  return true
end

local function check_hardware_requirements(worker_hw, required_hw)
  if required_hw.gpu_memory_gb and required_hw.gpu_memory_gb ~= 'all' then
    if not worker_hw.gpu_memory_gb or worker_hw.gpu_memory_gb < required_hw.gpu_memory_gb then
      redis.log(redis.LOG_DEBUG, 'GPU memory insufficient: need ' .. tostring(required_hw.gpu_memory_gb) .. 'GB, have ' .. tostring(worker_hw.gpu_memory_gb or 0) .. 'GB')
      return false
    end
  end
  
  if required_hw.cpu_cores and required_hw.cpu_cores ~= 'all' then
    if not worker_hw.cpu_cores or worker_hw.cpu_cores < required_hw.cpu_cores then
      redis.log(redis.LOG_DEBUG, 'CPU cores insufficient: need ' .. tostring(required_hw.cpu_cores) .. ', have ' .. tostring(worker_hw.cpu_cores or 0))
      return false
    end
  end
  
  if required_hw.ram_gb and required_hw.ram_gb ~= 'all' then
    if not worker_hw.ram_gb or worker_hw.ram_gb < required_hw.ram_gb then
      redis.log(redis.LOG_DEBUG, 'RAM insufficient: need ' .. tostring(required_hw.ram_gb) .. 'GB, have ' .. tostring(worker_hw.ram_gb or 0) .. 'GB')
      return false
    end
  end
  
  return true
end

local function matches_requirements(worker, job)
  local requirements = {}
  if job.requirements and job.requirements ~= '' then
    local success, parsed = pcall(cjson.decode, job.requirements)
    if success then
      requirements = parsed
    else
      redis.log(redis.LOG_WARNING, 'Failed to parse job requirements: ' .. (job.requirements or 'nil'))
      requirements = {}
    end
  end
  
  if job.service_required then
    if not worker.services or type(worker.services) ~= 'table' then
      return false
    end
    
    local has_service = false
    for _, service in ipairs(worker.services) do
      if service == job.service_required then
        has_service = true
        break
      end
    end
    
    if not has_service then
      local services_str = table.concat(worker.services or {}, ',')
      redis.log(redis.LOG_DEBUG, 'Service mismatch: need ' .. job.service_required .. ', worker has ' .. services_str)
      return false
    end
  end
  
  if requirements.hardware then
    if not check_hardware_requirements(worker.hardware or {}, requirements.hardware) then
      return false
    end
  end
  
  if requirements.customer_isolation then
    if not check_customer_isolation(worker.customer_access or {}, requirements.customer_isolation, job.customer_id) then
      return false
    end
  end
  
  if requirements.models and requirements.models ~= 'all' then
    if not check_model_requirements(worker.models or {}, requirements.models, job.service_required) then
      return false
    end
  end
  
  for key, required_value in pairs(requirements) do
    if key ~= 'service_type' and key ~= 'hardware' and key ~= 'customer_isolation' and key ~= 'models' then
      if not check_custom_capability(worker, key, required_value) then
        redis.log(redis.LOG_DEBUG, 'Custom capability mismatch: ' .. key)
        return false
      end
    end
  end
  
  return true
end

redis.register_function('findMatchingJob', function(keys, args)
  -- Parse arguments
  local worker_caps_json = args[1]
  local max_scan = tonumber(args[2]) or 100
  
  -- Parse worker capabilities
  local worker_caps = cjson.decode(worker_caps_json)
  
  -- Log for debugging
  redis.log(redis.LOG_NOTICE, 'Worker ' .. worker_caps.worker_id .. ' requesting job with capabilities: ' .. worker_caps_json)
  
  -- Get top pending jobs by priority
  local pending_jobs = redis.call('ZREVRANGE', 'jobs:pending', '0', tostring(max_scan - 1))
  
  if not pending_jobs or #pending_jobs == 0 then
    redis.log(redis.LOG_DEBUG, 'No pending jobs found for worker ' .. worker_caps.worker_id)
    return nil
  end
  
  redis.log(redis.LOG_NOTICE, 'Found ' .. #pending_jobs .. ' pending jobs to check')
  
  -- Check each job for compatibility
  for i = 1, #pending_jobs do
    local job_id = pending_jobs[i]
    
    -- Get job details
    local job_data = redis.call('HGETALL', 'job:' .. job_id)
    if not job_data or #job_data == 0 then
      redis.log(redis.LOG_WARNING, 'Job ' .. job_id .. ' not found in hash')
    else
      -- Convert array to table
      local job = hash_to_table(job_data)
      
      -- Check if worker can handle this job
      if matches_requirements(worker_caps, job) then
        redis.log(redis.LOG_NOTICE, 'Worker ' .. worker_caps.worker_id .. ' matches job ' .. job_id)
        
        -- Try to claim the job atomically
        local removed = redis.call('ZREM', 'jobs:pending', job_id)
        if removed == 1 then
          -- Success! Update job status
          redis.call('HMSET', 'job:' .. job_id,
            'status', 'assigned',
            'worker_id', worker_caps.worker_id,
            'assigned_at', get_iso_timestamp()
          )
          
          -- Add to worker's active jobs
          redis.call('HSET', 'jobs:active:' .. worker_caps.worker_id, job_id, cjson.encode(job))
          
          -- Update worker status
          redis.call('HMSET', 'worker:' .. worker_caps.worker_id,
            'status', 'busy',
            'current_job_id', job_id,
            'last_status_change', get_iso_timestamp()
          )
          
          -- Publish assignment event
          redis.call('XADD', 'progress:' .. job_id, '*',
            'job_id', job_id,
            'worker_id', worker_caps.worker_id,
            'status', 'assigned',
            'progress', '0',
            'message', 'Job assigned to worker',
            'assigned_at', get_iso_timestamp()
          )
          
          redis.log(redis.LOG_NOTICE, 'Worker ' .. worker_caps.worker_id .. ' successfully claimed job ' .. job_id)
          
          -- Return job details
          return cjson.encode({
            jobId = job_id,
            job = job
          })
        else
          redis.log(redis.LOG_DEBUG, 'Job ' .. job_id .. ' already claimed by another worker')
        end
      else
        redis.log(redis.LOG_DEBUG, 'Worker ' .. worker_caps.worker_id .. ' cannot handle job ' .. job_id)
      end
    end
  end
  
  redis.log(redis.LOG_NOTICE, 'No matching jobs found for worker ' .. worker_caps.worker_id)
  return nil
end)