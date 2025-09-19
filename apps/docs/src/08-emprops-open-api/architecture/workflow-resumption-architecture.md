# Workflow Resumption Architecture

## Overview

A comprehensive architecture design for workflow resumption that allows any Emprops workflow to be restarted from whatever point it is triggered and move forward from there. This system enables recovery of dead workflows that failed weeks or months ago.

## Current System Context

### Technology Stack
- Node.js/TypeScript with Express API
- PostgreSQL database with Prisma ORM
- Redis queue for job processing
- WebSocket communication with workers
- Azure blob storage for assets
- Workflow engine with linear step execution

### Current Architecture
- `GeneratorV2` class executes workflows as linear sequences of steps
- Each step calls various nodes (ComfyUI, Auto1111, JS processing, etc.)
- Steps are tracked in database with status: pending → processing → completed/failed
- WebSocket communication to Redis workers for external processing
- REST fallback endpoints exist for manual intervention

### Current Database Schema
```sql
-- Jobs table
CREATE TABLE job (
  id UUID PRIMARY KEY,
  status VARCHAR, -- pending, processing, completed, failed
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  -- other fields
);

-- Steps table
CREATE TABLE step (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES job(id),
  node_name VARCHAR,
  status VARCHAR, -- pending, processing, completed, failed
  step_number INT,
  input_data JSONB,
  output_data JSONB,
  created_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  -- other fields
);
```

### Current Problems
- If WebSocket communication fails, steps get stuck in "processing" status
- No automatic recovery mechanism
- Workflows can die and never complete
- Manual intervention requires knowing exactly what failed

## Requirements

### Primary Goal
Design a system where any workflow can be resumed from any point, allowing dead workflows to be recovered weeks later.

### Key Requirements
1. **State Persistence** - All workflow state must be recoverable from database
2. **Resumption Logic** - Ability to analyze current state and determine next steps
3. **Trigger Mechanisms** - Multiple ways to trigger workflow resumption (API calls, monitoring, manual)
4. **Idempotency** - Safe to call resumption multiple times
5. **Partial Recovery** - Resume from specific steps, not just full workflow restart
6. **Dependency Handling** - Understand step dependencies and prerequisites
7. **Error Handling** - Graceful handling of permanently failed steps
8. **Monitoring** - Visibility into resumption process and success rates

### Use Cases
- Worker goes offline mid-workflow → Resume when worker returns
- Database connection lost during step update → Resume and fix state
- Manual intervention needed → Admin can resume specific workflow/step
- Batch recovery → Resume hundreds of stuck workflows automatically
- Partial completion → Resume workflow that completed 80% of steps

## Architecture Design

### 1. Enhanced Database Schema

```sql
-- New tables for resumption tracking
CREATE TABLE workflow_resumption_session (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES job(id),
  trigger_type VARCHAR, -- 'manual', 'automatic', 'scheduled'
  triggered_by VARCHAR, -- user_id or system identifier
  status VARCHAR, -- 'analyzing', 'resuming', 'completed', 'failed'
  resumption_strategy VARCHAR,
  analysis_result JSONB,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE step_dependency (
  id UUID PRIMARY KEY,
  step_id UUID REFERENCES step(id),
  depends_on_step_id UUID REFERENCES step(id),
  dependency_type VARCHAR -- 'output_required', 'sequence', 'conditional'
);

CREATE TABLE workflow_checkpoint (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES job(id),
  checkpoint_name VARCHAR,
  step_id UUID REFERENCES step(id),
  state_snapshot JSONB,
  created_at TIMESTAMP
);

CREATE TABLE workflow_health_monitor (
  id UUID PRIMARY KEY,
  job_id UUID REFERENCES job(id),
  last_activity TIMESTAMP,
  stuck_detection_threshold INTERVAL,
  status VARCHAR, -- 'healthy', 'stuck', 'failed', 'completed'
  alert_level VARCHAR, -- 'none', 'warning', 'critical'
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### 2. Core Components

#### A. Workflow State Analyzer
**Purpose:** Intelligent analysis of current workflow state to generate resumption options

**Capabilities:**
- Analyzes current job/step state from database
- Identifies completed, failed, and pending steps
- Validates asset availability and data integrity
- Maps step dependencies and execution order
- Generates resumption options with risk assessment
- Determines optimal resumption strategy based on workflow state

**Key Methods:**
```typescript
class WorkflowStateAnalyzer {
  analyzeWorkflow(jobId: string): Promise<WorkflowAnalysis>
  validateAssetIntegrity(stepId: string): Promise<AssetValidationResult>
  generateResumptionOptions(jobId: string): Promise<ResumptionOption[]>
  assessResumptionRisk(option: ResumptionOption): RiskAssessment
}
```

#### B. Resumption Engine
**Purpose:** Core engine that executes resumption plans with validation and safety checks

**Capabilities:**
- Executes resumption plans with comprehensive validation
- Handles multiple resumption strategies
- Manages WebSocket reconnection and worker communication
- Provides real-time progress tracking
- Handles rollback if resumption fails
- Integrates with existing GeneratorV2 workflow engine

**Key Methods:**
```typescript
class ResumptionEngine {
  resumeWorkflow(jobId: string, strategy: ResumptionStrategy): Promise<ResumptionSession>
  validatePreResumption(jobId: string): Promise<ValidationResult>
  executeResumptionPlan(plan: ResumptionPlan): Promise<ExecutionResult>
  rollbackResumption(sessionId: string): Promise<RollbackResult>
}
```

#### C. Health Monitoring System
**Purpose:** Proactive monitoring and automatic detection of workflow issues

**Capabilities:**
- Automatically detects stuck workflows (configurable timeouts)
- Monitors WebSocket connection health
- Tracks step completion rates and identifies patterns
- Generates alerts for manual intervention
- Provides operational dashboard
- Triggers automatic resumption for recoverable failures

**Key Methods:**
```typescript
class WorkflowHealthMonitor {
  detectStuckWorkflows(): Promise<StuckWorkflow[]>
  monitorWorkflowHealth(jobId: string): Promise<HealthStatus>
  generateAlerts(): Promise<Alert[]>
  triggerAutomaticResumption(criteria: ResumptionCriteria): Promise<ResumptionSession[]>
}
```

### 3. Resumption Strategies

#### Strategy 1: From Last Completed
- **Use Case:** Normal workflow interruption with clear last completed step
- **Process:**
  1. Identify last successfully completed step
  2. Validate all outputs and assets from completed steps
  3. Resume execution from next step in sequence
  4. Validate all dependencies are satisfied
- **Risk Level:** Low
- **Best For:** Standard interruptions, worker restarts

#### Strategy 2: From Failed Step
- **Use Case:** Specific step failure that can be retried
- **Process:**
  1. Identify the specific failed step
  2. Analyze failure cause and determine if retryable
  3. Reset step status to pending
  4. Retry the failed step with same inputs
  5. Continue linear execution if successful
- **Risk Level:** Medium
- **Best For:** Transient failures, worker timeouts

#### Strategy 3: Checkpoint-Based
- **Use Case:** Long-running workflows with natural break points
- **Process:**
  1. Resume from predefined workflow checkpoints
  2. Restore workflow state from checkpoint snapshot
  3. Validate checkpoint integrity and asset availability
  4. Continue execution from checkpoint position
- **Risk Level:** Low
- **Best For:** Complex workflows, scheduled maintenance

#### Strategy 4: Full Restart
- **Use Case:** Workflow state is corrupted or unsafe to resume partially
- **Process:**
  1. Complete workflow restart with existing job ID
  2. Preserve audit trail and retry count
  3. Reset all steps to pending status
  4. Re-execute entire workflow from beginning
- **Risk Level:** High (duplicate work)
- **Best For:** State corruption, major system changes

### 4. API Design

#### Analysis Endpoints
```typescript
// Get comprehensive workflow analysis
GET /jobs/:id/resumption-analysis
Response: {
  jobId: string,
  currentState: WorkflowState,
  resumptionOptions: ResumptionOption[],
  riskAssessment: RiskAssessment,
  recommendedStrategy: ResumptionStrategy
}

// Validate if workflow can be safely resumed
POST /jobs/:id/validate-resumption
Body: { strategy: ResumptionStrategy }
Response: {
  canResume: boolean,
  validationResults: ValidationResult[],
  risks: Risk[],
  recommendations: string[]
}

// Get list of stuck workflows
GET /jobs/stuck-workflows
Query: { threshold?: string, limit?: number }
Response: {
  stuckWorkflows: StuckWorkflow[],
  totalCount: number,
  criteria: StuckDetectionCriteria
}
```

#### Resumption Endpoints
```typescript
// Resume specific workflow
POST /jobs/:id/resume
Body: {
  strategy: ResumptionStrategy,
  options?: ResumptionOptions,
  triggerType: 'manual' | 'automatic'
}
Response: {
  sessionId: string,
  status: 'analyzing' | 'resuming',
  estimatedDuration: number
}

// Resume multiple workflows in batch
POST /jobs/batch-resume
Body: {
  jobIds: string[],
  strategy: ResumptionStrategy,
  priority: 'high' | 'normal' | 'low'
}
Response: {
  batchId: string,
  sessions: ResumptionSession[],
  estimatedCompletion: Date
}

// Resume from specific step
POST /steps/:id/resume-from
Body: {
  resumptionStrategy: ResumptionStrategy,
  validateDependencies: boolean
}
Response: {
  sessionId: string,
  resumptionPlan: ResumptionPlan
}
```

#### Monitoring Endpoints
```typescript
// Get resumption session status
GET /resumption-sessions/:id/status
Response: {
  sessionId: string,
  status: SessionStatus,
  progress: ProgressInfo,
  currentStep: StepInfo,
  errors: Error[]
}

// Get real-time resumption progress
GET /resumption-sessions/:id/progress
Response: {
  sessionId: string,
  totalSteps: number,
  completedSteps: number,
  currentStep: StepInfo,
  estimatedTimeRemaining: number
}

// Get workflow health monitoring dashboard
GET /health/workflow-monitoring
Response: {
  healthyWorkflows: number,
  stuckWorkflows: number,
  recentResumptions: ResumptionSession[],
  alerts: Alert[],
  systemMetrics: HealthMetrics
}
```

### 5. Integration with Current System

#### GeneratorV2 Integration
- **Entry Point:** Add resumption entry point to existing workflow engine
- **State Management:** Extend current step tracking to support resumption metadata
- **Execution Flow:** Maintain compatibility with existing WebSocket communication
- **Error Handling:** Integrate with existing error handling and retry mechanisms

```typescript
class GeneratorV2 {
  // New resumption methods
  async resumeFromStep(stepId: string, strategy: ResumptionStrategy): Promise<void>
  async validateResumptionState(jobId: string): Promise<ValidationResult>

  // Enhanced existing methods
  async executeStep(step: Step, resumptionContext?: ResumptionContext): Promise<StepResult>
}
```

#### Database Integration
- **Schema Extensions:** Add resumption fields to existing tables without breaking changes
- **Migration Strategy:** Gradual rollout with backward compatibility
- **Query Optimization:** Ensure resumption queries don't impact existing performance
- **Data Integrity:** Maintain referential integrity during resumption operations

### 6. Safety & Validation Framework

#### Pre-Resumption Validation
- **Job State Validation:** Verify job exists and is in resumable state
- **Dependency Checking:** Validate step dependencies and data integrity
- **Worker Availability:** Confirm worker availability for required services
- **Asset Verification:** Validate asset availability in storage systems
- **Conflict Detection:** Check for concurrent resumption attempts

#### During-Resumption Monitoring
- **Progress Tracking:** Real-time monitoring of resumption progress
- **Performance Metrics:** Track resumption performance and resource usage
- **Failure Detection:** Monitor for new failures during resumption process
- **Resource Management:** Ensure resumption doesn't overwhelm system resources
- **Rollback Preparation:** Maintain rollback capabilities if resumption fails

#### Post-Resumption Verification
- **Completion Validation:** Verify workflow completed successfully
- **Output Verification:** Confirm all expected outputs were generated
- **Asset Integrity:** Validate generated assets are accessible and correct
- **Audit Trail:** Update audit logs with resumption details
- **Metrics Update:** Update monitoring dashboards and success metrics

### 7. Operational Features

#### Batch Recovery
- **Concurrent Processing:** Resume multiple workflows simultaneously with resource limits
- **Prioritization:** Priority-based resumption (critical workflows first)
- **Progress Tracking:** Comprehensive progress tracking across batch operations
- **Failure Isolation:** One failed resumption doesn't stop others in batch
- **Resource Management:** Intelligent resource allocation across batch operations

#### Monitoring Dashboard
- **Real-time View:** Live monitoring of workflow health across system
- **Stuck Detection:** Automatic detection and alerting for stuck workflows
- **Success Metrics:** Resumption success rates and performance analytics
- **Historical Analysis:** Trends and patterns in workflow failures
- **Alert Management:** Configurable alerts for different failure conditions

#### Automation Integration
- **Scheduled Jobs:** Automated resumption jobs for routine recovery
- **Monitoring Integration:** Integration with external monitoring systems
- **Webhook Support:** Webhook notifications for resumption events
- **API Integration:** RESTful APIs for integration with external systems
- **Configuration Management:** Centralized configuration for resumption policies

### 8. Implementation Phases

#### Phase 1: Core Infrastructure
- Implement enhanced database schema
- Build Workflow State Analyzer
- Create basic resumption API endpoints
- Add resumption entry points to GeneratorV2

#### Phase 2: Resumption Engine
- Implement Resumption Engine with basic strategies
- Add validation and safety frameworks
- Create monitoring and progress tracking
- Implement rollback capabilities

#### Phase 3: Advanced Features
- Add Health Monitoring System
- Implement batch resumption capabilities
- Create monitoring dashboard
- Add automation and integration features

#### Phase 4: Optimization & Monitoring
- Performance optimization and scaling
- Advanced analytics and reporting
- Enhanced automation capabilities
- Production monitoring and alerting

## Conclusion

This architecture provides a comprehensive framework for resuming any workflow from any point, with the intelligence to handle complex scenarios and the safety mechanisms to prevent data loss or corruption. The system is designed to integrate seamlessly with the existing infrastructure while providing powerful new capabilities for workflow recovery and resilience.

Key benefits:
- **Universal Resumption:** Resume any workflow from any valid point
- **Intelligent Analysis:** Smart analysis of workflow state and resumption options
- **Safety First:** Comprehensive validation and rollback capabilities
- **Scalable:** Handle batch operations and high-volume resumption
- **Observable:** Full monitoring and alerting capabilities
- **Automatable:** Support for automated recovery and integration

The reactive approach allows for both automatic detection and recovery of stuck workflows, as well as manual intervention when needed, providing a robust foundation for workflow resilience in the Emprops platform.