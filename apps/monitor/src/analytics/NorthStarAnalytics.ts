/**
 * North Star Analytics Engine
 *
 * Analyzes current system patterns to measure progress toward the North Star architecture:
 * - Job duration analysis (pool candidates)
 * - Model usage patterns (affinity opportunities)
 * - Performance variance (contention identification)
 * - Machine utilization (pool readiness)
 */

import type { Job, Worker, Machine } from '@/types';

export interface JobDurationPattern {
  fastLane: number; // Jobs <30s
  standard: number; // Jobs 30s-3min
  heavy: number; // Jobs >3min
  unknown: number; // Jobs with no duration data
}

export interface ModelUsagePattern {
  modelName: string;
  frequency: number;
  avgDownloadTime: number;
  successRate: number;
  coOccurrences: string[]; // Models used together
}

export interface PerformanceVariance {
  avgProcessingTime: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  variance: number;
  contentionScore: number; // 0-100, higher = more contention
}

export interface MachinePoolPotential {
  machineId: string;
  fastLaneScore: number; // 0-100, readiness for fast lane pool
  standardScore: number; // 0-100, readiness for standard pool
  heavyScore: number; // 0-100, readiness for heavy pool
  currentUtilization: number;
  recommendedPool: 'fast-lane' | 'standard' | 'heavy' | 'mixed';
}

export interface NorthStarMetrics {
  // Overall progress scores (0-100 or null if insufficient data)
  poolSeparationReadiness: number | null;
  modelIntelligenceReadiness: number | null;
  routingIntelligenceReadiness: number | null;
  overallNorthStarProgress: number | null;

  // Detailed metrics (null if insufficient data)
  jobDurationDistribution: JobDurationPattern | null;
  performanceHeterogeneity: PerformanceVariance | null;
  machinePoolPotentials: MachinePoolPotential[];
  modelUsagePatterns: ModelUsagePattern[];

  // Production health (real data only)
  systemHealthScore: number;
  jobCompletionRate: number | null;
  workerStabilityScore: number;
  averageQueueWaitTime: number | null;

  // Data availability indicators
  hasJobData: boolean;
  hasModelData: boolean;
  hasPerformanceData: boolean;
  minimumDataThreshold: number;
}

export class NorthStarAnalytics {
  private jobHistory: Job[] = [];
  private workerHistory: Worker[] = [];
  private machineHistory: Machine[] = [];

  private readonly FAST_LANE_THRESHOLD = 30 * 1000; // 30 seconds
  private readonly HEAVY_THRESHOLD = 3 * 60 * 1000; // 3 minutes

  /**
   * Update analytics with current system state
   */
  updateState(jobs: Job[], workers: Worker[], machines: Machine[]): void {
    // Keep sliding window of data for analysis
    this.jobHistory = [...jobs, ...this.jobHistory].slice(0, 1000);
    this.workerHistory = workers;
    this.machineHistory = machines;
  }

  /**
   * Calculate comprehensive North Star metrics - only real data, null for insufficient data
   */
  calculateMetrics(): NorthStarMetrics {
    // Data availability checks
    const completedJobs = this.jobHistory.filter(
      job => job.status === 'completed' && job.started_at && job.completed_at
    );
    const minimumJobsRequired = 10;
    const hasJobData = completedJobs.length >= minimumJobsRequired;
    const hasModelData = false; // Model tracking not implemented yet
    const hasPerformanceData = completedJobs.length >= 5;

    // Analyze only if we have sufficient data
    const jobDuration = hasJobData ? this.analyzeJobDurations() : null;
    const performance = hasPerformanceData ? this.analyzePerformanceVariance() : null;
    const machinePool = this.analyzeMachinePoolPotential(); // Can work with any data
    const modelUsage: ModelUsagePattern[] = []; // Not implemented yet

    // Calculate readiness scores only with sufficient data
    const poolSeparationReadiness =
      jobDuration && performance
        ? this.calculatePoolSeparationReadiness(jobDuration, performance)
        : null;
    const modelIntelligenceReadiness = null; // Not ready - no model tracking
    const routingIntelligenceReadiness =
      machinePool.length > 0 ? this.calculateRoutingIntelligenceReadiness(machinePool) : null;

    // Overall progress only if we have at least one component ready
    const overallProgress =
      poolSeparationReadiness !== null ? Math.round(poolSeparationReadiness * 0.4) : null; // Only count implemented parts

    return {
      poolSeparationReadiness,
      modelIntelligenceReadiness,
      routingIntelligenceReadiness,
      overallNorthStarProgress: overallProgress,

      jobDurationDistribution: jobDuration,
      performanceHeterogeneity: performance,
      machinePoolPotentials: machinePool,
      modelUsagePatterns: modelUsage,

      systemHealthScore: this.calculateSystemHealth(),
      jobCompletionRate: hasJobData ? this.calculateJobCompletionRate() : null,
      workerStabilityScore: this.calculateWorkerStability(),
      averageQueueWaitTime: hasJobData ? this.calculateAverageQueueWaitTime() : null,

      hasJobData,
      hasModelData,
      hasPerformanceData,
      minimumDataThreshold: minimumJobsRequired,
    };
  }

  /**
   * Analyze job duration patterns for pool classification
   */
  private analyzeJobDurations(): JobDurationPattern {
    const completedJobs = this.jobHistory.filter(
      job => job.status === 'completed' && job.started_at && job.completed_at
    );

    let fastLane = 0;
    let standard = 0;
    let heavy = 0;
    let unknown = 0;

    completedJobs.forEach(job => {
      if (!job.started_at || !job.completed_at) {
        unknown++;
        return;
      }

      const duration = job.completed_at - job.started_at;

      if (duration < this.FAST_LANE_THRESHOLD) {
        fastLane++;
      } else if (duration < this.HEAVY_THRESHOLD) {
        standard++;
      } else {
        heavy++;
      }
    });

    const total = completedJobs.length || 1;
    return {
      fastLane: Math.round((fastLane / total) * 100),
      standard: Math.round((standard / total) * 100),
      heavy: Math.round((heavy / total) * 100),
      unknown: Math.round((unknown / total) * 100),
    };
  }

  /**
   * Analyze performance variance to identify contention
   */
  private analyzePerformanceVariance(): PerformanceVariance {
    const durations = this.jobHistory
      .filter(job => job.status === 'completed' && job.started_at && job.completed_at)
      .map(job => job.completed_at! - job.started_at!)
      .filter(duration => duration > 0);

    if (durations.length === 0) {
      return {
        avgProcessingTime: 0,
        minProcessingTime: 0,
        maxProcessingTime: 0,
        variance: 0,
        contentionScore: 0,
      };
    }

    const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const min = Math.min(...durations);
    const max = Math.max(...durations);

    // Calculate variance
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // Contention score: higher variance indicates more contention
    // Normalize to 0-100 scale based on coefficient of variation
    const coefficientOfVariation = avg > 0 ? stdDev / avg : 0;
    const contentionScore = Math.min(100, Math.round(coefficientOfVariation * 100));

    return {
      avgProcessingTime: Math.round(avg),
      minProcessingTime: min,
      maxProcessingTime: max,
      variance: Math.round(variance),
      contentionScore,
    };
  }

  /**
   * Analyze machine readiness for different pools
   */
  private analyzeMachinePoolPotential(): MachinePoolPotential[] {
    return this.machineHistory.map(machine => {
      // Get workers for this machine
      const machineWorkers = this.workerHistory.filter(w => machine.workers.includes(w.worker_id));

      // Get recent jobs for this machine
      const machineJobs = this.jobHistory.filter(job =>
        machineWorkers.some(w => w.worker_id === job.worker_id)
      );

      // Analyze job patterns to determine pool suitability
      const fastLaneJobs = machineJobs.filter(job => {
        if (!job.started_at || !job.completed_at) return false;
        return job.completed_at - job.started_at < this.FAST_LANE_THRESHOLD;
      }).length;

      const standardJobs = machineJobs.filter(job => {
        if (!job.started_at || !job.completed_at) return false;
        const duration = job.completed_at - job.started_at;
        return duration >= this.FAST_LANE_THRESHOLD && duration < this.HEAVY_THRESHOLD;
      }).length;

      const heavyJobs = machineJobs.filter(job => {
        if (!job.started_at || !job.completed_at) return false;
        return job.completed_at - job.started_at >= this.HEAVY_THRESHOLD;
      }).length;

      const totalJobs = fastLaneJobs + standardJobs + heavyJobs || 1;

      // Calculate scores based on job distribution and hardware
      const fastLaneScore = Math.round((fastLaneJobs / totalJobs) * 100);
      const standardScore = Math.round((standardJobs / totalJobs) * 100);
      const heavyScore = Math.round((heavyJobs / totalJobs) * 100);

      // Determine recommended pool
      let recommendedPool: 'fast-lane' | 'standard' | 'heavy' | 'mixed';
      if (fastLaneScore > 60) {
        recommendedPool = 'fast-lane';
      } else if (heavyScore > 40) {
        recommendedPool = 'heavy';
      } else if (standardScore > 50) {
        recommendedPool = 'standard';
      } else {
        recommendedPool = 'mixed';
      }

      // Calculate current utilization
      const activeWorkers = machineWorkers.filter(w => w.status === 'busy').length;
      const currentUtilization =
        machineWorkers.length > 0 ? Math.round((activeWorkers / machineWorkers.length) * 100) : 0;

      return {
        machineId: machine.machine_id,
        fastLaneScore,
        standardScore,
        heavyScore,
        currentUtilization,
        recommendedPool,
      };
    });
  }

  /**
   * Analyze model usage patterns
   */
  private analyzeModelUsage(): ModelUsagePattern[] {
    // Model tracking not yet implemented - return empty array
    // TODO: Implement model usage tracking from job payloads and ComfyUI workflows
    return [];
  }

  /**
   * Calculate pool separation readiness score
   */
  private calculatePoolSeparationReadiness(
    jobDuration: JobDurationPattern,
    performance: PerformanceVariance
  ): number {
    // High readiness if:
    // 1. Clear job duration separation (not all mixed together)
    // 2. High performance variance (indicating contention that pools would solve)

    const durationSeparation = Math.max(jobDuration.fastLane, jobDuration.heavy);
    const contentionIndicator = performance.contentionScore;

    // Weight: 60% duration patterns, 40% contention level
    return Math.round(durationSeparation * 0.6 + contentionIndicator * 0.4);
  }

  /**
   * Calculate model intelligence readiness score
   */
  private calculateModelIntelligenceReadiness(): number | null {
    // Model tracking not implemented yet - return null for honest status
    return null;
  }

  /**
   * Calculate routing intelligence readiness score
   */
  private calculateRoutingIntelligenceReadiness(machinePool: MachinePoolPotential[]): number {
    // High readiness if machines show clear specialization potential
    const specializedMachines = machinePool.filter(m => m.recommendedPool !== 'mixed').length;
    const totalMachines = machinePool.length || 1;

    return Math.round((specializedMachines / totalMachines) * 100);
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealth(): number {
    const totalWorkers = this.workerHistory.length;
    const onlineWorkers = this.workerHistory.filter(w => w.status !== 'offline').length;
    const totalMachines = this.machineHistory.length;
    const readyMachines = this.machineHistory.filter(m => m.status === 'ready').length;

    if (totalWorkers === 0 || totalMachines === 0) return 0;

    const workerHealth = (onlineWorkers / totalWorkers) * 100;
    const machineHealth = (readyMachines / totalMachines) * 100;

    return Math.round((workerHealth + machineHealth) / 2);
  }

  /**
   * Calculate job completion rate
   */
  private calculateJobCompletionRate(): number {
    const recentJobs = this.jobHistory.slice(0, 100); // Last 100 jobs
    const completedJobs = recentJobs.filter(j => j.status === 'completed').length;
    const totalFinished = recentJobs.filter(
      j => j.status === 'completed' || j.status === 'failed'
    ).length;

    if (totalFinished === 0) return 100;
    return Math.round((completedJobs / totalFinished) * 100);
  }

  /**
   * Calculate worker stability score
   */
  private calculateWorkerStability(): number {
    // Count workers that haven't failed recently
    const stableWorkers = this.workerHistory.filter(
      w => w.status !== 'error' && w.total_jobs_failed < w.total_jobs_completed
    ).length;

    const totalWorkers = this.workerHistory.length || 1;
    return Math.round((stableWorkers / totalWorkers) * 100);
  }

  /**
   * Calculate average queue wait time
   */
  private calculateAverageQueueWaitTime(): number {
    const recentJobs = this.jobHistory.filter(job => job.created_at && job.started_at).slice(0, 50); // Last 50 jobs with timing data

    if (recentJobs.length === 0) return 0;

    const waitTimes = recentJobs.map(job => job.started_at! - job.created_at || 0);

    return Math.round(waitTimes.reduce((sum, time) => sum + time, 0) / waitTimes.length);
  }
}
