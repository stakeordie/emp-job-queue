# Track 4: Metrics 📊

**System Performance Data and Operational Insights**

## Goals

**Primary Goal**: Collect quantitative performance metrics and operational data to enable data-driven decisions, alerting, and capacity planning.

**Secondary Goals**:
- Real-time system health monitoring
- Performance trend analysis and optimization
- Resource utilization tracking and alerting
- SLA monitoring and compliance reporting
- Predictive capacity planning and scaling

## Technology Stack

### Core Components
- **[OpenTelemetry Metrics](https://opentelemetry.io/docs/specs/otel/metrics/)**: Counters, gauges, histograms
- **OTel Collector**: Metrics aggregation and export
- **Prometheus Client Libraries**: Direct metrics export (alternative)
- **Custom Metrics**: Business-specific measurements

### External Integrations
- **[Dash0](https://www.dash0.com/)**: Primary metrics storage and visualization
- **Alternative Options**: Prometheus + Grafana, Datadog, CloudWatch, New Relic

## What It Captures

### System Metrics
- **Resource Usage**: CPU, memory, GPU utilization, disk I/O
- **Network Performance**: Request rates, latency, throughput
- **Service Health**: Uptime, availability, error rates
- **Queue Metrics**: Job queue sizes, processing rates, wait times

### Business Metrics
- **Job Processing**: Jobs completed, failed, processing times
- **User Activity**: API requests, WebSocket connections, active users
- **Model Usage**: Model downloads, cache hits, usage frequency
- **Revenue Impact**: Billable operations, cost per job, resource efficiency

### Performance Metrics
- **Latency Distributions**: Response times, queue wait times, processing durations
- **Throughput Measurements**: Requests per second, jobs per minute, data processed
- **Error Rates**: Failed requests, timeout rates, retry attempts
- **Saturation Indicators**: Resource limits, queue capacity, connection pools

## Implementation Details

### OTel Metrics Configuration

```yaml
# otel-collector-machine.yaml.template (Metrics Pipeline)
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
  
  # System metrics collection
  hostmetrics:
    collection_interval: 30s
    scrapers:
      cpu:
        metrics:
          system.cpu.utilization:
            enabled: true
      memory:
        metrics:
          system.memory.utilization:
            enabled: true
      disk:
        metrics:
          system.disk.io:
            enabled: true
      network:
        metrics:
          system.network.io:
            enabled: true
  
  # Docker container metrics
  docker_stats:
    endpoint: unix:///var/run/docker.sock
    collection_interval: 30s

processors:
  batch:
    timeout: 30s
    send_batch_size: 1000
    send_batch_max_size: 2000
  
  resource:
    attributes:
      - key: machine.id
        value: ${MACHINE_ID}
        action: upsert
      - key: deployment.environment  
        value: ${RAILWAY_ENVIRONMENT}
        action: upsert

exporters:
  otlp:
    endpoint: ${DASH0_OTLP_ENDPOINT}
    headers:
      Authorization: "Bearer ${DASH0_API_TOKEN}"
    compression: gzip

service:
  pipelines:
    metrics:
      receivers: [otlp, hostmetrics, docker_stats]
      processors: [resource, batch]
      exporters: [otlp]
```

### Application Metrics Implementation

```typescript
// Metrics setup in applications
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('emp-job-queue', '1.0.0');

// Counter metrics
export const jobsProcessedCounter = meter.createCounter('jobs_processed_total', {
  description: 'Total number of jobs processed',
  unit: '1'
});

export const httpRequestsCounter = meter.createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
  unit: '1'
});

export const errorsCounter = meter.createCounter('errors_total', {
  description: 'Total number of errors encountered',
  unit: '1'
});

// Gauge metrics (current state)
export const activeJobsGauge = meter.createUpDownCounter('jobs_active', {
  description: 'Number of currently active jobs',
  unit: '1'
});

export const queueSizeGauge = meter.createObservableGauge('queue_size', {
  description: 'Current size of job queue',
  unit: '1'
});

export const workerCountGauge = meter.createObservableGauge('workers_available', {
  description: 'Number of available workers',
  unit: '1'
});

// Histogram metrics (distributions)
export const jobDurationHistogram = meter.createHistogram('job_duration_seconds', {
  description: 'Job processing duration in seconds',
  unit: 's',
  boundaries: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 300, 600] // 10 minutes max
});

export const httpLatencyHistogram = meter.createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  boundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]
});

export const queueWaitHistogram = meter.createHistogram('job_queue_wait_seconds', {
  description: 'Time jobs spend waiting in queue',
  unit: 's',
  boundaries: [1, 5, 10, 30, 60, 300, 600, 1800, 3600] // 1 hour max
});
```

### Job Processing Metrics Integration

```typescript
// Comprehensive job processing metrics
export class MetricsInstrumentedJobProcessor {
  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const startTime = Date.now();
    const labels = {
      service: jobData.service_required,
      priority: jobData.priority?.toString() || 'unknown',
      worker_id: process.env.WORKER_ID || 'unknown'
    };
    
    // Increment active jobs
    activeJobsGauge.add(1, labels);
    
    try {
      // Record job start
      jobsProcessedCounter.add(1, { 
        ...labels, 
        status: 'started' 
      });

      // Process the job
      const result = await this.processJobImpl(jobData, progressCallback);
      
      // Record completion metrics
      const duration = (Date.now() - startTime) / 1000;
      jobDurationHistogram.record(duration, labels);
      
      jobsProcessedCounter.add(1, { 
        ...labels, 
        status: result.success ? 'completed' : 'failed' 
      });

      // Output size metrics
      if (result.success && result.output_data) {
        const outputSize = JSON.stringify(result.output_data).length;
        meter.createHistogram('job_output_size_bytes').record(outputSize, labels);
      }

      return result;
      
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      
      // Error metrics
      errorsCounter.add(1, {
        ...labels,
        error_type: this.classifyError(error),
        error_name: error.name || 'unknown'
      });
      
      // Failed job duration
      jobDurationHistogram.record(duration, { 
        ...labels, 
        status: 'failed' 
      });

      throw error;
      
    } finally {
      // Decrement active jobs
      activeJobsGauge.add(-1, labels);
    }
  }

  private classifyError(error: any): string {
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('memory')) return 'memory';
    if (error.message?.includes('network')) return 'network';
    if (error.code === 'ECONNRESET') return 'connection';
    return 'unknown';
  }
}
```

### System Resource Metrics

```typescript
// System resource monitoring
export class ResourceMetrics {
  private meter = metrics.getMeter('system-resources');
  
  constructor() {
    // GPU metrics (if available)
    this.meter.createObservableGauge('gpu_utilization_percent', {
      description: 'GPU utilization percentage'
    }).addCallback(async (result) => {
      const gpuStats = await this.getGPUStats();
      gpuStats.forEach((stats, index) => {
        result.observe(stats.utilization, { gpu_index: index.toString() });
      });
    });
    
    // GPU memory usage
    this.meter.createObservableGauge('gpu_memory_used_bytes', {
      description: 'GPU memory usage in bytes'
    }).addCallback(async (result) => {
      const gpuStats = await this.getGPUStats();
      gpuStats.forEach((stats, index) => {
        result.observe(stats.memoryUsed, { gpu_index: index.toString() });
      });
    });

    // Process metrics
    this.meter.createObservableGauge('process_memory_usage_bytes', {
      description: 'Process memory usage in bytes'
    }).addCallback((result) => {
      const memUsage = process.memoryUsage();
      result.observe(memUsage.heapUsed, { type: 'heap' });
      result.observe(memUsage.heapTotal, { type: 'heap_total' });
      result.observe(memUsage.rss, { type: 'rss' });
    });

    // Disk space metrics
    this.meter.createObservableGauge('disk_usage_bytes', {
      description: 'Disk usage in bytes'
    }).addCallback(async (result) => {
      const diskStats = await this.getDiskStats();
      result.observe(diskStats.used, { path: '/workspace', type: 'used' });
      result.observe(diskStats.free, { path: '/workspace', type: 'free' });
    });
  }

  private async getGPUStats() {
    try {
      // Use nvidia-ml-py or similar GPU monitoring
      // This is a placeholder implementation
      return [{ utilization: 75, memoryUsed: 6000000000 }];
    } catch {
      return [];
    }
  }

  private async getDiskStats() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('/workspace');
      return { used: stats.size, free: stats.free || 0 };
    } catch {
      return { used: 0, free: 0 };
    }
  }
}
```

## Current Status: ⚠️ Needs Implementation

### ❌ Missing Implementation
This track is currently identified as **"NOT SURE YET HOW TO DO THIS"** and requires immediate implementation to complete the observability system.

### 🎯 Implementation Priority
**HIGH PRIORITY** - This is the only missing track in the 5-Track Observability System.

### ⚠️ Current Gaps
- **No OTel Metrics SDK**: Applications not configured for metrics collection
- **No Metrics Export**: OTel Collector missing metrics pipeline configuration  
- **No System Metrics**: Host metrics collection not implemented
- **No Business Metrics**: Job processing metrics not captured
- **No Alerting**: No metrics-based alerting configured

### 🚧 Implementation Plan

**Phase 1: Basic Metrics (Week 1)**
- Install OTel Metrics SDK in all applications
- Configure basic counters and gauges for job processing
- Set up OTel Collector metrics pipeline
- Test metrics export to Dash0

**Phase 2: System Metrics (Week 2)** 
- Add host metrics collection (CPU, memory, disk)
- Implement Docker container metrics
- Add GPU metrics collection for ML workloads
- Configure resource-based alerting

**Phase 3: Business Metrics (Week 3)**
- Implement business KPI metrics
- Add SLA monitoring metrics  
- Create performance distribution histograms
- Set up capacity planning metrics

## Configuration Examples

### Environment Variables (To Be Implemented)
```bash
# OTel Metrics configuration
OTEL_METRICS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://localhost:4318/v1/metrics
METRICS_COLLECTION_INTERVAL=30s

# Dash0 metrics endpoint
DASH0_METRICS_ENDPOINT=https://ingress.dash0.com/v1/metrics
DASH0_API_TOKEN=${DASH0_API_TOKEN}

# System metrics configuration
ENABLE_HOST_METRICS=true
ENABLE_GPU_METRICS=true
ENABLE_DOCKER_METRICS=true

# Business metrics configuration
ENABLE_JOB_METRICS=true
ENABLE_API_METRICS=true
METRICS_LABEL_MACHINE_ID=${MACHINE_ID}
METRICS_LABEL_WORKER_ID=${WORKER_ID}
```

### Docker Integration (To Be Implemented)
```yaml
# docker-compose.yml additions needed
services:
  worker:
    environment:
      - OTEL_METRICS_EXPORTER=otlp
      - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT=http://otel-collector:4318/v1/metrics
      - ENABLE_JOB_METRICS=true
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro

  otel-collector:
    # Collector needs metrics pipeline configuration
    volumes:
      - ./otel-collector-metrics.yaml:/etc/otel-collector-config.yaml:ro
```

## Expected Performance Impact

### Resource Requirements (Projected)
- **Memory Overhead**: ~25MB additional RAM per service
- **CPU Overhead**: ~2% additional CPU usage
- **Network Impact**: ~10KB/minute metrics data per service  
- **Storage Requirements**: ~1GB/month compressed metrics data

### Collection Intervals
- **High Frequency**: 5s for critical job processing metrics
- **Medium Frequency**: 30s for resource utilization metrics
- **Low Frequency**: 300s for business KPI metrics

## Debugging and Troubleshooting (Future)

### Health Checks (To Be Implemented)
```bash
# Verify metrics collection
curl http://localhost:4318/v1/metrics -X POST \
  -H "Content-Type: application/x-protobuf" \
  --data-binary "@test-metrics.pb"

# Check OTel Collector metrics endpoint
curl http://localhost:8888/metrics | grep -i otel

# Test metrics generation
node -e "
  const { metrics } = require('@opentelemetry/api');
  const meter = metrics.getMeter('test');
  const counter = meter.createCounter('test_counter');
  counter.add(1, { test: 'value' });
  console.log('Metrics generated');
"
```

## Integration with Other Tracks

### Cross-Track Enhancement
- **Track 2 (Logs)**: Metrics from log analysis (error rates from log parsing)
- **Track 3 (Tracing)**: Performance metrics from trace data (latency percentiles)
- **Track 5 (Sentry)**: Error rate metrics from Sentry events
- **Track 1 (Operational Event Bus)**: KPI metrics from operational events

### Unified Dashboards (Future)
```typescript
// Example: Unified observability dashboard
const dashboardMetrics = {
  // From Track 4: Direct metrics
  activeJobs: await getMetric('jobs_active'),
  errorRate: await getMetric('errors_total'),
  
  // From Track 2: Log-derived metrics  
  logErrorRate: await getLogMetric('error_log_count'),
  
  // From Track 3: Trace-derived metrics
  avgLatency: await getTraceMetric('avg_request_duration'),
  
  // From Track 1: Operational metrics
  completionRate: await getOperationalMetric('job_completion_rate')
};
```

## Success Metrics (Target)

### Implementation Goals
- **100%** service coverage with basic metrics
- **<5%** performance overhead from metrics collection
- **30 second** maximum metric freshness
- **99.9%** metrics collection reliability

### Business Impact Metrics
- **Real-time** job processing visibility
- **Predictive** capacity planning capabilities
- **Automated** performance alerting
- **Data-driven** optimization decisions

## Next Steps

### Immediate Actions Required

**1. Install OTel Metrics SDK**
```bash
# Add to package.json
npm install @opentelemetry/sdk-metrics @opentelemetry/exporter-metrics-otlp-http
```

**2. Configure Basic Metrics**
```typescript
// Create metrics-setup.ts in each application
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';

const metricExporter = new OTLPMetricExporter({
  url: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
});

const meterProvider = new MeterProvider({
  readers: [metricExporter],
});

metrics.setGlobalMeterProvider(meterProvider);
```

**3. Update OTel Collector Configuration**
- Add metrics receivers and pipeline
- Configure host metrics collection
- Set up Dash0 metrics export

**4. Implement Job Processing Metrics**
- Add counters for jobs processed, errors
- Add histograms for processing times
- Add gauges for active jobs, queue sizes

**5. Test and Validate**
- Verify metrics appear in Dash0
- Test alerting on metric thresholds
- Validate performance impact

This track requires immediate implementation to complete the 5-Track Observability System. The foundation is in place with OTel Collector - only metrics-specific configuration and application instrumentation is needed.