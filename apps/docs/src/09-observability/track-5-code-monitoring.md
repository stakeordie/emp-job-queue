# Track 5: Code Monitoring 🐛

**Error Tracking and Performance Issue Analysis**

## Goals

**Primary Goal**: Capture, aggregate, and analyze application errors and performance issues to enable rapid identification and resolution of code-level problems.

**Secondary Goals**:
- Real-time error alerting and notification
- Performance regression detection and analysis
- Release impact tracking and rollback decisions
- Developer productivity through actionable error insights
- Proactive issue detection before user impact

## Technology Stack

### Core Components
- **[Sentry](https://sentry.io/)**: Primary error tracking and performance monitoring platform
- **Source Maps**: Accurate error location mapping for TypeScript/JavaScript
- **Context Enrichment**: User session, environment, and request data
- **Performance Monitoring**: Transaction performance and slow query detection

### External Integrations
- **Sentry Dashboard**: Centralized error analysis and team collaboration
- **Alternative Options**: Bugsnag, Rollbar, Airbrake, LogRocket

## What It Captures

### Error Information
- **Unhandled Exceptions**: Runtime errors with full stack traces
- **Handled Errors**: Explicitly captured errors with business context
- **Promise Rejections**: Async operation failures
- **HTTP Errors**: API request failures and status codes
- **Database Errors**: Query failures and connection issues

### Performance Issues
- **Slow Transactions**: API endpoints exceeding performance thresholds
- **Memory Leaks**: Gradual memory consumption increases
- **CPU Bottlenecks**: Operations consuming excessive CPU time
- **Database Performance**: Slow queries and connection pool exhaustion
- **External Service Latency**: Third-party API response times

### Context Information
- **User Context**: Session data, user ID, request details
- **Environment Context**: Machine ID, worker ID, deployment version
- **Request Context**: HTTP headers, query parameters, request body
- **Business Context**: Job ID, service type, processing stage
- **System Context**: Resource usage, service health, dependency status

## Implementation Details

### Sentry SDK Setup

```typescript
// Sentry initialization in API server
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  release: process.env.SERVICE_VERSION || '1.0.0',
  
  // Performance monitoring
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
  
  // Integration configuration
  integrations: [
    new ProfilingIntegration(),
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
  
  // Context enhancement
  beforeSend(event) {
    // Add machine context to all events
    event.contexts = {
      ...event.contexts,
      machine: {
        id: process.env.MACHINE_ID,
        worker_id: process.env.WORKER_ID,
        deployment_env: process.env.RAILWAY_ENVIRONMENT,
        region: process.env.RAILWAY_REGION
      }
    };
    return event;
  },

  // Error filtering
  beforeSendTransaction(event) {
    // Filter out health check transactions
    if (event.transaction === 'GET /health') {
      return null;
    }
    return event;
  }
});
```

### Express.js Integration

```typescript
// Express middleware integration
import express from 'express';

const app = express();

// Request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler({
  user: ['id', 'email'],
  request: ['method', 'url', 'headers', 'data'],
  transaction: 'methodPath' // GET /api/jobs/:id
}));

// Tracing handler for performance monitoring
app.use(Sentry.Handlers.tracingHandler());

// Your application routes
app.get('/api/jobs/:id', async (req, res) => {
  try {
    const job = await getJobById(req.params.id);
    res.json(job);
  } catch (error) {
    // Error will be automatically captured by Sentry
    throw error;
  }
});

// Error handler must be last middleware
app.use(Sentry.Handlers.errorHandler({
  shouldHandleError(error) {
    // Capture 4xx and 5xx errors
    return error.status >= 400;
  }
}));
```

### Job Processing Error Tracking

```typescript
// Enhanced job processing with comprehensive error tracking
export class SentryInstrumentedJobProcessor {
  async processJob(jobData: JobData, progressCallback: ProgressCallback): Promise<JobResult> {
    const transaction = Sentry.startTransaction({
      op: 'job.process',
      name: `Process ${jobData.service_required} Job`,
      data: {
        job_id: jobData.id,
        service_type: jobData.service_required,
        priority: jobData.priority
      }
    });
    
    Sentry.getCurrentHub().configureScope((scope) => {
      scope.setTag('job_id', jobData.id);
      scope.setTag('service_type', jobData.service_required);
      scope.setTag('worker_id', process.env.WORKER_ID);
      scope.setTag('machine_id', process.env.MACHINE_ID);
      
      scope.setContext('job', {
        id: jobData.id,
        service_required: jobData.service_required,
        priority: jobData.priority,
        created_at: jobData.created_at,
        payload_size: JSON.stringify(jobData.payload).length
      });
      
      scope.setUser({
        id: jobData.submitted_by || 'unknown',
        segment: 'job_processor'
      });
    });

    try {
      // Child span for service validation
      const validationSpan = transaction.startChild({
        op: 'job.validate',
        description: 'Validate job requirements'
      });
      
      await this.validateJobRequirements(jobData);
      validationSpan.setStatus('ok');
      validationSpan.finish();

      // Child span for actual processing
      const processingSpan = transaction.startChild({
        op: 'job.execute',
        description: `Execute ${jobData.service_required} job`
      });
      
      const result = await this.processJobImpl(jobData, progressCallback);
      
      processingSpan.setTag('success', result.success);
      processingSpan.setData('processing_time_ms', result.processing_time_ms);
      processingSpan.setStatus('ok');
      processingSpan.finish();

      // Success metrics
      Sentry.addBreadcrumb({
        message: `Job ${jobData.id} completed successfully`,
        category: 'job.success',
        level: 'info',
        data: {
          processing_time: result.processing_time_ms,
          output_size: JSON.stringify(result.output_data).length
        }
      });

      transaction.setStatus('ok');
      return result;
      
    } catch (error) {
      // Comprehensive error handling
      const errorType = this.classifyError(error);
      
      // Add error context
      Sentry.withScope((scope) => {
        scope.setTag('error_type', errorType);
        scope.setTag('error_recoverable', this.isRecoverableError(error));
        scope.setLevel('error');
        
        scope.setContext('error_details', {
          name: error.name,
          code: error.code,
          stack_preview: error.stack?.split('\n').slice(0, 5).join('\n'),
          occurred_at: new Date().toISOString()
        });

        scope.addBreadcrumb({
          message: `Job ${jobData.id} failed with ${errorType}`,
          category: 'job.error',
          level: 'error',
          data: {
            error_message: error.message,
            error_type: errorType
          }
        });

        Sentry.captureException(error);
      });

      transaction.setStatus('internal_error');
      throw error;
      
    } finally {
      transaction.finish();
    }
  }

  private classifyError(error: any): string {
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('memory')) return 'memory_exhaustion';
    if (error.message?.includes('network') || error.code === 'ECONNRESET') return 'network';
    if (error.message?.includes('model')) return 'model_error';
    if (error.code === 'ENOENT') return 'file_not_found';
    if (error.name === 'ValidationError') return 'validation';
    return 'unknown';
  }

  private isRecoverableError(error: any): boolean {
    const recoverableTypes = ['timeout', 'network', 'memory_exhaustion'];
    return recoverableTypes.includes(this.classifyError(error));
  }
}
```

### Performance Monitoring Integration

```typescript
// API performance monitoring
export class SentryPerformanceMonitor {
  static instrumentRoute(routeName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const transaction = Sentry.startTransaction({
        op: 'http.server',
        name: `${req.method} ${routeName}`,
        data: {
          url: req.url,
          method: req.method,
          user_agent: req.get('User-Agent')
        }
      });
      
      // Add request context
      Sentry.getCurrentHub().configureScope((scope) => {
        scope.setTag('endpoint', routeName);
        scope.setTag('method', req.method);
        scope.setContext('request', {
          url: req.url,
          method: req.method,
          headers: this.sanitizeHeaders(req.headers),
          query: req.query,
          ip: req.ip
        });
      });
      
      // Monitor response time
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        
        transaction.setTag('status_code', res.statusCode);
        transaction.setData('response_size', res.get('Content-Length'));
        transaction.setData('duration_ms', duration);
        
        // Flag slow responses
        if (duration > 5000) {
          Sentry.addBreadcrumb({
            message: `Slow response: ${duration}ms for ${req.method} ${req.url}`,
            category: 'performance',
            level: 'warning',
            data: { duration_ms: duration, threshold_ms: 5000 }
          });
        }
        
        transaction.setStatus(res.statusCode >= 400 ? 'failed_precondition' : 'ok');
        transaction.finish();
      });
      
      next();
    };
  }

  private static sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized['x-api-key'];
    return sanitized;
  }
}

// Usage in routes
app.get('/api/jobs/:id', 
  SentryPerformanceMonitor.instrumentRoute('/api/jobs/:id'),
  async (req, res) => {
    // Route implementation
  }
);
```

## Current Status: 🚧 Ready for Implementation

### ✅ Preparation Complete
- **Architecture Designed**: Complete Sentry integration plan documented
- **Environment Setup**: Sentry DSN and configuration variables identified
- **Integration Points**: Express.js, job processing, and worker integration mapped
- **Error Classification**: Error types and recovery strategies defined

### 🚧 Implementation Required
- **SDK Installation**: Install Sentry SDK in API server and workers
- **Configuration**: Set up environment variables and initialization
- **Middleware Integration**: Add Express.js error handling middleware
- **Job Processing**: Instrument job processing with error capture
- **Performance Monitoring**: Enable transaction performance tracking

### 🎯 Implementation Priority
**MEDIUM PRIORITY** - Ready for immediate implementation once Track 4 (Metrics) is completed.

## Configuration Examples

### Environment Variables
```bash
# Sentry configuration
SENTRY_DSN=https://your-key@sentry.io/project-id
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=v1.2.3

# Sampling rates
SENTRY_TRACES_SAMPLE_RATE=0.1    # 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1  # 10% performance profiling

# Context enrichment
MACHINE_ID=machine-prod-01
WORKER_ID=worker-gpu-01
RAILWAY_ENVIRONMENT=production
RAILWAY_REGION=us-west1

# Feature flags
SENTRY_DEBUG=false
SENTRY_ATTACH_STACKTRACE=true
SENTRY_SEND_DEFAULT_PII=false    # Don't send personal data
```

### Docker Integration
```yaml
# docker-compose.yml
services:
  api:
    environment:
      - SENTRY_DSN=${SENTRY_DSN}
      - SENTRY_ENVIRONMENT=production
      - SENTRY_RELEASE=${SERVICE_VERSION}
      - MACHINE_ID=${MACHINE_ID}
    # Mount source maps for accurate error reporting
    volumes:
      - ./dist:/app/dist:ro
      - ./src:/app/src:ro

  worker:
    environment:
      - SENTRY_DSN=${SENTRY_DSN}
      - SENTRY_ENVIRONMENT=production
      - WORKER_ID=${WORKER_ID}
      - MACHINE_ID=${MACHINE_ID}
```

### Package Dependencies
```json
{
  "dependencies": {
    "@sentry/node": "^7.90.0",
    "@sentry/profiling-node": "^1.3.0",
    "@sentry/tracing": "^7.90.0"
  },
  "devDependencies": {
    "@sentry/cli": "^2.25.0"
  }
}
```

## Expected Performance Impact

### Resource Requirements (Projected)
- **Memory Overhead**: ~10-20MB additional RAM per service
- **CPU Overhead**: <1% additional CPU usage for error tracking
- **Network Impact**: ~5KB per error event, ~10KB per performance transaction
- **Latency Impact**: <1ms additional latency per request

### Data Retention
- **Error Events**: 90 days for resolved issues, 1 year for unresolved
- **Performance Data**: 30 days for detailed transactions
- **Release Tracking**: Permanent for deployment correlation

## Debugging and Troubleshooting (Implementation Guide)

### Installation and Setup
```bash
# Install Sentry SDK
npm install @sentry/node @sentry/profiling-node @sentry/tracing

# Test Sentry connection
node -e "
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  Sentry.captureMessage('Test message from Node.js');
  console.log('Test event sent to Sentry');
"
```

### Health Checks (Future)
```bash
# Verify Sentry integration
curl -X POST http://localhost:3000/api/test-error
# Should generate Sentry event

# Check Sentry configuration
node -e "
  const Sentry = require('@sentry/node');
  console.log('Sentry DSN configured:', !!process.env.SENTRY_DSN);
  console.log('Environment:', process.env.SENTRY_ENVIRONMENT);
"

# Test error capture
node -e "
  const Sentry = require('@sentry/node');
  Sentry.init({ dsn: process.env.SENTRY_DSN });
  try {
    throw new Error('Test error for Sentry');
  } catch (error) {
    Sentry.captureException(error);
    console.log('Error captured by Sentry');
  }
"
```

## Best Practices

### Error Context Enhancement
```typescript
// Rich error context for debugging
Sentry.withScope((scope) => {
  // Tags for filtering and searching
  scope.setTag('component', 'job-processor');
  scope.setTag('operation', 'model-download');
  scope.setTag('error_type', 'network_timeout');
  
  // Structured context data
  scope.setContext('job_details', {
    id: jobData.id,
    service: jobData.service_required,
    model_url: jobData.payload.model_url,
    attempt_count: retryCount,
    timeout_ms: timeoutValue
  });
  
  // User information
  scope.setUser({
    id: jobData.submitted_by,
    segment: 'api_user'
  });
  
  // Breadcrumb trail
  scope.addBreadcrumb({
    message: 'Started model download',
    category: 'model.download',
    level: 'info',
    data: { url: jobData.payload.model_url }
  });
  
  Sentry.captureException(error);
});
```

### Performance Monitoring Best Practices
```typescript
// Custom performance instrumentation
const transaction = Sentry.startTransaction({
  op: 'business.operation',
  name: 'Process ComfyUI Workflow'
});

// Child operations
const downloadSpan = transaction.startChild({
  op: 'model.download',
  description: 'Download SDXL model'
});

// Add meaningful data
downloadSpan.setData('model_size_mb', 6700);
downloadSpan.setData('download_speed_mbps', 50);
downloadSpan.setTag('model_type', 'sdxl');

downloadSpan.finish();
transaction.finish();
```

### Release Tracking
```bash
# Create new release in Sentry
sentry-cli releases new $SERVICE_VERSION
sentry-cli releases set-commits $SERVICE_VERSION --auto
sentry-cli releases deploys $SERVICE_VERSION new -e production
sentry-cli releases finalize $SERVICE_VERSION

# Upload source maps for accurate stack traces
sentry-cli sourcemaps upload --release $SERVICE_VERSION ./dist
```

## Integration with Other Tracks

### Cross-Track Correlation
- **Track 2 (Logs)**: Sentry events include log correlation IDs
- **Track 3 (Tracing)**: Sentry transactions linked to trace IDs  
- **Track 4 (Metrics)**: Error rates feed into metrics dashboards
- **Track 1 (Operational Event Bus)**: Operational context in error events

### Unified Error Analysis
```typescript
// Correlate Sentry errors with other observability data
const errorCorrelation = {
  // Sentry error ID
  sentry_event_id: 'abc123',
  
  // Track 3: Trace correlation
  trace_id: span.traceId,
  
  // Track 2: Log correlation  
  log_correlation_id: logContext.correlationId,
  
  // Track 1: Operational context
  job_id: jobData.id,
  business_impact: 'job_processing_failed'
};
```

## Next Steps

### Phase 1: Basic Error Tracking (Week 1)
1. **Install Sentry SDK** in API server and workers
2. **Configure Environment Variables** for all deployment environments
3. **Implement Express Middleware** for automatic error capture
4. **Test Error Capture** with deliberate test errors
5. **Verify Dash0 Integration** if Sentry supports it

### Phase 2: Performance Monitoring (Week 2) 
1. **Enable Performance Monitoring** with transaction tracking
2. **Instrument Job Processing** with custom transactions
3. **Set Performance Thresholds** for alerting
4. **Configure Release Tracking** for deployment correlation
5. **Add Source Map Upload** to build process

### Phase 3: Advanced Features (Week 3)
1. **Custom Error Boundaries** for React components (if applicable)
2. **Operational Context Integration** with Track 1 events
3. **Automated Alert Rules** for critical error patterns
4. **Error Recovery Workflows** based on error classification
5. **Performance Regression Detection** across releases

## Success Metrics (Target)

### Error Tracking Goals
- **<1 minute** average time to error detection and alert
- **99%** error capture rate (no silent failures)
- **100%** critical errors captured and alerted
- **<24 hours** average time to error resolution

### Performance Monitoring Goals  
- **95th percentile** request latency tracking
- **Automated** performance regression detection
- **Real-time** slow query identification
- **Proactive** capacity limit alerting

### Developer Productivity Goals
- **Actionable** error reports with full context
- **Automated** error categorization and assignment
- **Integration** with issue tracking systems
- **Historical** error trend analysis

This track is ready for immediate implementation and will provide crucial error visibility and performance insights for the production system.