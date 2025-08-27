# Query & Debug Guide

> **Practical guide** - Using the observability system to solve problems and understand system behavior

## Overview

This guide provides practical patterns for querying the observability system to debug issues, understand system behavior, and monitor performance across the distributed AI workload system.

## Query Patterns

### Dash0 Query Examples

#### Find All Data for a Specific Job

```sql
-- Find all logs for a specific job
SELECT * FROM logs 
WHERE job_id = 'job-12345'
ORDER BY timestamp ASC;

-- Find all traces for a specific job
SELECT * FROM traces 
WHERE job_id = 'job-12345' OR trace_id IN (
  SELECT trace_id FROM traces WHERE job_id = 'job-12345'
)
ORDER BY timestamp ASC;

-- Find all metrics for a specific job timeframe
SELECT * FROM metrics 
WHERE job_id = 'job-12345'
   OR (timestamp BETWEEN '2025-01-15T10:00:00Z' AND '2025-01-15T10:05:00Z'
       AND machine_id = 'comfyui-prod-1')
ORDER BY timestamp ASC;
```

#### Machine Performance Analysis

```sql
-- Machine resource utilization over time
SELECT machine_id, 
       AVG(cpu_percent) as avg_cpu,
       AVG(memory_usage_bytes) as avg_memory,
       AVG(gpu_utilization) as avg_gpu
FROM metrics 
WHERE timestamp > now() - interval '1 hour'
  AND metric_name IN ('machine.cpu.percent', 'machine.memory.used_bytes', 'machine.gpu.utilization')
GROUP BY machine_id
ORDER BY avg_cpu DESC;

-- Find machines with high error rates
SELECT machine_id, 
       COUNT(*) as error_count,
       COUNT(*) * 100.0 / (
         SELECT COUNT(*) FROM logs l2 
         WHERE l2.machine_id = logs.machine_id 
         AND l2.timestamp > now() - interval '1 hour'
       ) as error_rate_percent
FROM logs 
WHERE level = 'error' 
  AND timestamp > now() - interval '1 hour'
GROUP BY machine_id
HAVING COUNT(*) > 10
ORDER BY error_rate_percent DESC;
```

#### Service Performance Analysis

```sql
-- Job processing durations by service type
SELECT service_type, 
       COUNT(*) as job_count,
       AVG(duration_ms) as avg_duration,
       PERCENTILE(duration_ms, 50) as p50_duration,
       PERCENTILE(duration_ms, 95) as p95_duration,
       PERCENTILE(duration_ms, 99) as p99_duration
FROM logs
WHERE event_type = 'job_completed'
  AND timestamp > now() - interval '24 hours'
GROUP BY service_type
ORDER BY avg_duration DESC;

-- Error patterns by service type
SELECT service_type, 
       error_type,
       COUNT(*) as error_count,
       ARRAY_AGG(DISTINCT job_id) as affected_jobs
FROM logs 
WHERE level = 'error'
  AND timestamp > now() - interval '4 hours'
  AND error_type IS NOT NULL
GROUP BY service_type, error_type
ORDER BY error_count DESC;
```

#### Correlation Queries

```sql
-- Find all telemetry for a job across all tracks
SELECT 'logs' as track, timestamp, message, level, service_type, machine_id
FROM logs WHERE job_id = 'job-12345'
UNION ALL
SELECT 'traces' as track, timestamp, span_name, status, service_type, machine_id  
FROM traces WHERE job_id = 'job-12345'
UNION ALL
SELECT 'metrics' as track, timestamp, metric_name, value::text, service_type, machine_id
FROM metrics WHERE job_id = 'job-12345'
ORDER BY timestamp;

-- Find jobs that failed on a specific machine
SELECT job_id, error_type, error_message, timestamp
FROM logs 
WHERE machine_id = 'comfyui-prod-01'
  AND event_type = 'job_failed'
  AND timestamp > now() - interval '2 hours'
ORDER BY timestamp DESC;
```

## Common Debugging Scenarios

### Scenario 1: Job Takes Too Long

**Investigation Steps:**

1. **Find the job's complete timeline:**
```sql
SELECT timestamp, event_type, message, duration_ms
FROM logs 
WHERE job_id = 'job-slow-123'
ORDER BY timestamp;
```

2. **Check machine resource usage during job:**
```sql
SELECT timestamp, metric_name, value
FROM metrics 
WHERE machine_id = (
  SELECT machine_id FROM logs 
  WHERE job_id = 'job-slow-123' LIMIT 1
)
AND timestamp BETWEEN '2025-01-15T10:00:00Z' AND '2025-01-15T10:10:00Z'
AND metric_name LIKE 'machine.%'
ORDER BY timestamp;
```

3. **Compare with similar jobs:**
```sql
SELECT AVG(duration_ms) as avg_duration, 
       COUNT(*) as job_count
FROM logs 
WHERE service_type = 'comfyui'
  AND event_type = 'job_completed'
  AND timestamp > now() - interval '24 hours';
```

### Scenario 2: Machine Appears Unhealthy

**Investigation Steps:**

1. **Check recent error patterns:**
```sql
SELECT timestamp, level, message, job_id
FROM logs 
WHERE machine_id = 'machine-problematic'
  AND level IN ('error', 'warn')
  AND timestamp > now() - interval '1 hour'
ORDER BY timestamp DESC;
```

2. **Review resource trends:**
```sql
SELECT DATE_TRUNC('minute', timestamp) as minute,
       AVG(CASE WHEN metric_name = 'machine.cpu.percent' THEN value END) as cpu,
       AVG(CASE WHEN metric_name = 'machine.memory.used_bytes' THEN value END) / 1e9 as memory_gb,
       AVG(CASE WHEN metric_name = 'machine.gpu.utilization' THEN value END) as gpu
FROM metrics 
WHERE machine_id = 'machine-problematic'
  AND timestamp > now() - interval '2 hours'
GROUP BY minute
ORDER BY minute;
```

3. **Check for job processing issues:**
```sql
SELECT event_type, COUNT(*) as count
FROM logs 
WHERE machine_id = 'machine-problematic'
  AND timestamp > now() - interval '2 hours'
  AND event_type LIKE 'job_%'
GROUP BY event_type;
```

### Scenario 3: Service-Wide Performance Degradation

**Investigation Steps:**

1. **Compare current vs historical performance:**
```sql
-- Current performance (last hour)
SELECT 'current' as period,
       AVG(duration_ms) as avg_duration,
       PERCENTILE(duration_ms, 95) as p95_duration
FROM logs 
WHERE service_type = 'comfyui'
  AND event_type = 'job_completed'
  AND timestamp > now() - interval '1 hour'

UNION ALL

-- Historical performance (same hour yesterday)
SELECT 'yesterday' as period,
       AVG(duration_ms) as avg_duration,
       PERCENTILE(duration_ms, 95) as p95_duration
FROM logs 
WHERE service_type = 'comfyui'
  AND event_type = 'job_completed'
  AND timestamp BETWEEN now() - interval '25 hours' AND now() - interval '24 hours';
```

2. **Identify affected machines:**
```sql
SELECT machine_id,
       COUNT(*) as jobs,
       AVG(duration_ms) as avg_duration,
       SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errors
FROM logs 
WHERE service_type = 'comfyui'
  AND timestamp > now() - interval '1 hour'
  AND event_type IN ('job_completed', 'job_failed')
GROUP BY machine_id
ORDER BY avg_duration DESC;
```

3. **Check for common error patterns:**
```sql
SELECT error_type, 
       COUNT(*) as count,
       COUNT(DISTINCT machine_id) as affected_machines
FROM logs 
WHERE service_type = 'comfyui'
  AND level = 'error'
  AND timestamp > now() - interval '1 hour'
GROUP BY error_type
ORDER BY count DESC;
```

## Performance Monitoring Queries

### System Health Dashboard

```sql
-- Active jobs by service type
SELECT service_type, COUNT(*) as active_jobs
FROM logs 
WHERE event_type = 'job_started'
  AND job_id NOT IN (
    SELECT job_id FROM logs l2 
    WHERE l2.event_type IN ('job_completed', 'job_failed')
    AND l2.timestamp > logs.timestamp
  )
  AND timestamp > now() - interval '1 hour'
GROUP BY service_type;

-- Queue wait times
SELECT service_type,
       AVG(queue_wait_time_ms) as avg_wait,
       PERCENTILE(queue_wait_time_ms, 95) as p95_wait
FROM logs 
WHERE event_type = 'job_claimed'
  AND timestamp > now() - interval '1 hour'
GROUP BY service_type;

-- Error rates by service
SELECT service_type,
       COUNT(CASE WHEN event_type = 'job_failed' THEN 1 END) as failures,
       COUNT(CASE WHEN event_type IN ('job_completed', 'job_failed') THEN 1 END) as total,
       (COUNT(CASE WHEN event_type = 'job_failed' THEN 1 END) * 100.0 / 
        COUNT(CASE WHEN event_type IN ('job_completed', 'job_failed') THEN 1 END)) as error_rate
FROM logs 
WHERE timestamp > now() - interval '1 hour'
  AND event_type IN ('job_completed', 'job_failed')
GROUP BY service_type;
```

### Resource Utilization Trends

```sql
-- Machine resource usage over time (last 4 hours, 5-minute intervals)
SELECT DATE_TRUNC('5 minutes', timestamp) as time_bucket,
       machine_id,
       AVG(CASE WHEN metric_name = 'machine.cpu.percent' THEN value END) as cpu_avg,
       MAX(CASE WHEN metric_name = 'machine.cpu.percent' THEN value END) as cpu_max,
       AVG(CASE WHEN metric_name = 'machine.memory.used_bytes' THEN value END) / 1e9 as memory_gb,
       AVG(CASE WHEN metric_name = 'machine.gpu.utilization' THEN value END) as gpu_util
FROM metrics 
WHERE timestamp > now() - interval '4 hours'
  AND metric_name IN ('machine.cpu.percent', 'machine.memory.used_bytes', 'machine.gpu.utilization')
GROUP BY time_bucket, machine_id
ORDER BY time_bucket, machine_id;
```

## Debug Commands

### Telemetry Pipeline Health

```bash
# Check Fluent Bit connectivity
curl -X POST http://localhost:9880/logs -d '{"test": "message"}'

# Verify OTel Collector status  
curl http://localhost:8888/metrics

# Test Fluentd health
curl http://fluentd-host:24220/api/plugins.json

# Check ConnectorLogger output
grep "event_type" /workspace/logs/*.log | head -10
```

### Log File Analysis

```bash
# Monitor real-time log flow
tail -f /workspace/logs/*.log | grep job_id

# Search for specific job across all logs
find /workspace/logs -name "*.log" -exec grep -l "job-12345" {} \;

# Check for error patterns
grep -E "(ERROR|FAIL|TIMEOUT)" /workspace/logs/*.log | head -20

# Analyze log volume
wc -l /workspace/logs/*.log
```

### Connection Testing

```bash
# Test direct Dash0 connection
curl -X POST https://ingress.us-west-2.aws.dash0.com/logs/json \
  -H "Authorization: Bearer $DASH0_API_KEY" \
  -H "Dash0-Dataset: development" \
  -d '{"test": "connection", "timestamp": "'$(date -Iseconds)'"}'

# Test Fluentd forwarding
echo '{"message": "test", "timestamp": "'$(date -Iseconds)'"}' | \
  nc fluentd-host 24224

# Verify OpenTelemetry endpoint
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans": []}'
```

## Alert Configuration Examples

### High-Priority Alerts

```sql
-- Job failure rate > 10% in last 15 minutes
SELECT service_type,
       (COUNT(CASE WHEN event_type = 'job_failed' THEN 1 END) * 100.0 / 
        COUNT(*)) as failure_rate
FROM logs 
WHERE timestamp > now() - interval '15 minutes'
  AND event_type IN ('job_completed', 'job_failed')
GROUP BY service_type
HAVING failure_rate > 10;

-- Machine down (no heartbeat in 5 minutes)
SELECT machine_id
FROM (
  SELECT DISTINCT machine_id 
  FROM logs 
  WHERE timestamp > now() - interval '1 hour'
) active_machines
WHERE machine_id NOT IN (
  SELECT DISTINCT machine_id 
  FROM logs 
  WHERE timestamp > now() - interval '5 minutes'
);

-- Queue backlog growing (>50 jobs waiting)
SELECT COUNT(*) as waiting_jobs
FROM logs 
WHERE event_type = 'job_submitted'
  AND job_id NOT IN (
    SELECT job_id FROM logs l2 
    WHERE l2.event_type = 'job_claimed'
  )
  AND timestamp > now() - interval '30 minutes';
```

### Performance Alerts

```sql
-- P95 job duration >2x normal
WITH normal_p95 AS (
  SELECT service_type, 
         PERCENTILE(duration_ms, 95) as normal_p95
  FROM logs 
  WHERE event_type = 'job_completed'
    AND timestamp BETWEEN now() - interval '7 days' AND now() - interval '1 day'
  GROUP BY service_type
), current_p95 AS (
  SELECT service_type,
         PERCENTILE(duration_ms, 95) as current_p95
  FROM logs 
  WHERE event_type = 'job_completed'
    AND timestamp > now() - interval '1 hour'
  GROUP BY service_type
)
SELECT c.service_type,
       c.current_p95,
       n.normal_p95,
       (c.current_p95 / n.normal_p95) as ratio
FROM current_p95 c
JOIN normal_p95 n ON c.service_type = n.service_type
WHERE c.current_p95 > n.normal_p95 * 2;
```

## Best Practices

### Query Optimization

1. **Use time ranges** - Always specify recent time windows to improve performance
2. **Filter early** - Use WHERE clauses before JOINs and aggregations
3. **Index on correlation IDs** - Ensure job_id, machine_id, trace_id are indexed
4. **Batch similar queries** - Group related queries to reduce overhead

### Debugging Workflow

1. **Start broad** - Look at overall system health first
2. **Narrow down** - Focus on specific services, machines, or time periods
3. **Correlate** - Use correlation IDs to connect related events
4. **Context** - Always include relevant metadata (machine_id, service_type, etc.)

### Dashboard Design

1. **Layer information** - High-level overview → detailed drill-downs
2. **Use consistent time windows** - Align all charts to same time ranges
3. **Include context** - Show related metrics together
4. **Automate common queries** - Create saved searches for frequent investigations

For complete setup instructions, see the [Telemetry Setup Guide](./telemetry-setup-guide.md).