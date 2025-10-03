import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@emergexyz/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '24h';

    // Convert time range to interval
    const getInterval = (range: string) => {
      switch (range) {
        case '1h': return '1 hour';
        case '24h': return '24 hours';
        case '7d': return '7 days';
        case '30d': return '30 days';
        default: return '24 hours';
      }
    };

    const interval = getInterval(timeRange);

    // Overview metrics - Use Prisma.sql for safe interpolation
    const overviewResult = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN retry_count > 0 THEN 1 END) as retried_jobs,
        COALESCE(AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) END), 0) as avg_duration_seconds
      FROM job
      WHERE created_at > NOW() - INTERVAL '24 hours'
    ` as any[];

    const overview = overviewResult[0];
    const totalJobs = Number(overview.total_jobs);
    const completed = Number(overview.completed);

    // Calculate success rate
    const successRate = totalJobs > 0 ? completed / totalJobs : 0;

    // Hourly statistics for the time range
    const hourlyStats = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COALESCE(AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) END), 0) as avg_duration
      FROM job
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', created_at)
      ORDER BY hour DESC
      LIMIT 24
    ` as any[];

    // Retry analysis
    const retryAnalysis = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total_retries,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_retries
      FROM job
      WHERE retry_count > 0
        AND created_at > NOW() - INTERVAL '24 hours'
    ` as any[];

    const retryData = retryAnalysis[0];
    const totalRetries = Number(retryData.total_retries);
    const successfulRetries = Number(retryData.successful_retries);
    const retrySuccessRate = totalRetries > 0 ? successfulRetries / totalRetries : 0;

    // Most retried workflows
    const mostRetriedWorkflows = await prisma.$queryRaw`
      SELECT
        name,
        SUM(retry_count) as total_retry_count,
        COUNT(*) as job_count
      FROM job
      WHERE retry_count > 0
        AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY name
      ORDER BY total_retry_count DESC
      LIMIT 5
    ` as any[];

    // Performance metrics (percentiles)
    const performanceResult = await prisma.$queryRaw`
      SELECT
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_seconds) as p50_duration,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_seconds) as p95_duration,
        MIN(duration_seconds) as fastest_job,
        MAX(duration_seconds) as slowest_job
      FROM (
        SELECT EXTRACT(EPOCH FROM (completed_at - started_at)) as duration_seconds
        FROM job
        WHERE completed_at IS NOT NULL
          AND started_at IS NOT NULL
          AND created_at > NOW() - INTERVAL '24 hours'
      ) durations
    ` as any[];

    const performance = performanceResult[0] || {
      p50_duration: 0,
      p95_duration: 0,
      fastest_job: 0,
      slowest_job: 0
    };

    // Format the response
    const metricsData = {
      overview: {
        total_jobs: totalJobs,
        completed: completed,
        failed: Number(overview.failed),
        processing: Number(overview.processing),
        pending: Number(overview.pending),
        retried_jobs: Number(overview.retried_jobs),
        avg_duration_seconds: Number(overview.avg_duration_seconds),
        success_rate: successRate
      },
      hourly_stats: hourlyStats.map(stat => ({
        hour: stat.hour,
        total: Number(stat.total),
        completed: Number(stat.completed),
        failed: Number(stat.failed),
        avg_duration: Number(stat.avg_duration)
      })),
      retry_analysis: {
        total_retries: totalRetries,
        retry_success_rate: retrySuccessRate,
        most_retried_workflows: mostRetriedWorkflows.map(workflow => ({
          name: workflow.name,
          retry_count: Number(workflow.total_retry_count)
        }))
      },
      performance: {
        p50_duration: Number(performance.p50_duration) || 0,
        p95_duration: Number(performance.p95_duration) || 0,
        fastest_job: Number(performance.fastest_job) || 0,
        slowest_job: Number(performance.slowest_job) || 0
      }
    };

    return NextResponse.json(metricsData);

  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    );
  }
}