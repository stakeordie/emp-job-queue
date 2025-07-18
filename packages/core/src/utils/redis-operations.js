// Redis Operations Utilities
// Shared utilities for common Redis operations to reduce code duplication
export class RedisOperations {
    /**
     * Safely scan for keys using SCAN instead of KEYS (non-blocking)
     */
    static async scanKeys(redis, pattern) {
        const keys = [];
        let cursor = '0';
        do {
            const [newCursor, foundKeys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = newCursor;
            keys.push(...foundKeys);
        } while (cursor !== '0');
        return keys;
    }
    /**
     * Calculate workflow-aware job score for priority queuing
     * Higher priority jobs get higher scores, with FIFO within same priority
     */
    static calculateJobScore(priority, datetime) {
        const priorityComponent = priority * 1e15;
        const timeComponent = Math.floor(datetime / 1000);
        return priorityComponent - timeComponent;
    }
    /**
     * Serialize job for Redis storage
     */
    static serializeJobForRedis(job) {
        return {
            id: job.id,
            status: job.status,
            service_required: job.service_required,
            priority: job.priority.toString(),
            payload: JSON.stringify(job.payload),
            retry_count: job.retry_count.toString(),
            max_retries: job.max_retries.toString(),
            customer_id: job.customer_id || '',
            requirements: job.requirements ? JSON.stringify(job.requirements) : '',
            workflow_id: job.workflow_id || '',
            workflow_priority: job.workflow_priority?.toString() || '',
            workflow_datetime: job.workflow_datetime?.toString() || '',
            step_number: job.step_number?.toString() || '',
            created_at: job.created_at,
            ...(job.assigned_at && { assigned_at: job.assigned_at }),
            ...(job.started_at && { started_at: job.started_at }),
            ...(job.completed_at && { completed_at: job.completed_at }),
            ...(job.failed_at && { failed_at: job.failed_at }),
            ...(job.worker_id && { worker_id: job.worker_id }),
            ...(job.last_failed_worker && { last_failed_worker: job.last_failed_worker }),
            ...(job.processing_time && { processing_time: job.processing_time.toString() }),
            ...(job.estimated_completion && { estimated_completion: job.estimated_completion }),
        };
    }
    /**
     * Deserialize job from Redis storage
     */
    static deserializeJobFromRedis(jobData) {
        if (!jobData.id)
            return null;
        try {
            const job = {
                id: jobData.id,
                status: jobData.status,
                service_required: jobData.service_required,
                priority: parseInt(jobData.priority) || 50,
                payload: JSON.parse(jobData.payload || '{}'),
                retry_count: parseInt(jobData.retry_count) || 0,
                max_retries: parseInt(jobData.max_retries) || 3,
                created_at: jobData.created_at,
            };
            // Optional fields
            if (jobData.customer_id)
                job.customer_id = jobData.customer_id;
            if (jobData.requirements) {
                try {
                    job.requirements = JSON.parse(jobData.requirements);
                }
                catch {
                    // Ignore invalid JSON requirements
                }
            }
            if (jobData.workflow_id)
                job.workflow_id = jobData.workflow_id;
            if (jobData.workflow_priority)
                job.workflow_priority = parseInt(jobData.workflow_priority);
            if (jobData.workflow_datetime)
                job.workflow_datetime = parseInt(jobData.workflow_datetime);
            if (jobData.step_number)
                job.step_number = parseInt(jobData.step_number);
            if (jobData.assigned_at)
                job.assigned_at = jobData.assigned_at;
            if (jobData.started_at)
                job.started_at = jobData.started_at;
            if (jobData.completed_at)
                job.completed_at = jobData.completed_at;
            if (jobData.failed_at)
                job.failed_at = jobData.failed_at;
            if (jobData.worker_id)
                job.worker_id = jobData.worker_id;
            if (jobData.last_failed_worker)
                job.last_failed_worker = jobData.last_failed_worker;
            if (jobData.processing_time)
                job.processing_time = parseFloat(jobData.processing_time);
            if (jobData.estimated_completion)
                job.estimated_completion = jobData.estimated_completion;
            return job;
        }
        catch (error) {
            console.error('Failed to deserialize job from Redis:', error);
            return null;
        }
    }
    /**
     * Store job in Redis with proper serialization
     */
    static async storeJob(redis, job) {
        const jobRecord = this.serializeJobForRedis(job);
        await redis.hmset(`job:${job.id}`, jobRecord);
    }
    /**
     * Get job from Redis with proper deserialization
     */
    static async getJob(redis, jobId) {
        const jobData = await redis.hgetall(`job:${jobId}`);
        return this.deserializeJobFromRedis(jobData);
    }
    /**
     * Get all jobs from a Redis hash field pattern
     */
    static async getJobsFromKeys(redis, keys) {
        if (keys.length === 0)
            return [];
        const jobs = [];
        for (const key of keys) {
            const jobData = await redis.hgetall(key);
            const parsedJobs = Object.values(jobData)
                .map(data => {
                try {
                    return JSON.parse(data);
                }
                catch {
                    return null;
                }
            })
                .filter((job) => job !== null);
            jobs.push(...parsedJobs);
        }
        return jobs;
    }
}
//# sourceMappingURL=redis-operations.js.map