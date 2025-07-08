import type { Redis } from 'ioredis';
import { Job } from '../types/job.js';
export declare class RedisOperations {
    /**
     * Safely scan for keys using SCAN instead of KEYS (non-blocking)
     */
    static scanKeys(redis: Redis, pattern: string): Promise<string[]>;
    /**
     * Calculate workflow-aware job score for priority queuing
     * Higher priority jobs get higher scores, with FIFO within same priority
     */
    static calculateJobScore(priority: number, datetime: number): number;
    /**
     * Serialize job for Redis storage
     */
    static serializeJobForRedis(job: Job): Record<string, string>;
    /**
     * Deserialize job from Redis storage
     */
    static deserializeJobFromRedis(jobData: Record<string, string>): Job | null;
    /**
     * Store job in Redis with proper serialization
     */
    static storeJob(redis: Redis, job: Job): Promise<void>;
    /**
     * Get job from Redis with proper deserialization
     */
    static getJob(redis: Redis, jobId: string): Promise<Job | null>;
    /**
     * Get all jobs from a Redis hash field pattern
     */
    static getJobsFromKeys(redis: Redis, keys: string[]): Promise<Job[]>;
}
//# sourceMappingURL=redis-operations.d.ts.map