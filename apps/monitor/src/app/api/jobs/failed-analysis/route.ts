import { NextRequest, NextResponse } from 'next/server';
import { JobForensicsService } from '@/services/jobForensics';

const REDIS_URL = process.env.HUB_REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');

  const forensicsService = new JobForensicsService(REDIS_URL);

  try {
    const failedJobs = await forensicsService.getFailedJobsForAnalysis(limit);

    // Analyze patterns
    const errorCategories: Record<string, number> = {};
    const commonErrors: Record<string, number> = {};
    const sourceSystems: Record<string, number> = {};
    const workerFailures: Record<string, number> = {};

    for (const { job, forensics } of failedJobs) {
      // Count error categories
      if (forensics.error_category) {
        errorCategories[forensics.error_category] = (errorCategories[forensics.error_category] || 0) + 1;
      }

      // Count common error messages
      if (forensics.last_known_error) {
        const normalizedError = forensics.last_known_error.toLowerCase().substring(0, 100);
        commonErrors[normalizedError] = (commonErrors[normalizedError] || 0) + 1;
      }

      // Count source systems
      if (forensics.source_system) {
        sourceSystems[forensics.source_system] = (sourceSystems[forensics.source_system] || 0) + 1;
      }

      // Count worker failures
      if (job.last_failed_worker) {
        workerFailures[job.last_failed_worker] = (workerFailures[job.last_failed_worker] || 0) + 1;
      }
    }

    // Sort and limit results
    const sortByCount = (obj: Record<string, number>) =>
      Object.entries(obj)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    const analysis = {
      total_failed_jobs: failedJobs.length,
      error_categories: Object.fromEntries(sortByCount(errorCategories)),
      common_errors: Object.fromEntries(sortByCount(commonErrors)),
      source_systems: Object.fromEntries(sortByCount(sourceSystems)),
      worker_failures: Object.fromEntries(sortByCount(workerFailures)),
      jobs_with_cross_system_refs: failedJobs.filter(({ forensics }) =>
        forensics.cross_system_refs && forensics.cross_system_refs.length > 0
      ).length,
      avg_retry_count: failedJobs.reduce((sum, { job }) => sum + job.retry_count, 0) / failedJobs.length,
      jobs_by_retry_count: failedJobs.reduce((acc, { job }) => {
        acc[job.retry_count] = (acc[job.retry_count] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    };

    return NextResponse.json({
      success: true,
      analysis,
      sample_jobs: failedJobs.slice(0, 10), // Include sample for detailed inspection
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error analyzing failed jobs:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Internal server error',
        success: false
      },
      { status: 500 }
    );
  } finally {
    await forensicsService.disconnect();
  }
}