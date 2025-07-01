# Job Submission Features

## Status: Partially Completed ⚠️

## Description
Implement comprehensive job submission functionality including single jobs, workflow simulations, batch operations, and advanced job management features.

## Job Submission Features with shadcn/ui Forms

### Single Job Submission
```typescript
interface JobSubmissionForm {
  jobType: string;
  priority: number;
  payload: Record<string, any>;
  customerId?: string;
  requirements?: JobRequirements;
  maxRetries?: number;
}

interface JobSubmissionComponent {
  onSubmit: (data: JobSubmissionForm) => Promise<string>;
  onReset: () => void;
  validationErrors?: Record<string, string>;
  isSubmitting?: boolean;
}
// Uses: Form, FormField, FormItem, FormLabel, FormControl (shadcn)
// Uses: Select, Input, Textarea, Slider, Button (shadcn)
// Uses: Card, CardHeader, CardContent, CardFooter (shadcn)
```

### Workflow Simulation
```typescript
interface WorkflowSubmissionForm {
  jobType: string;
  priority: number;
  stepCount: number;
  stepDelay?: number;
  basePayload: Record<string, any>;
  customerId?: string;
}

interface WorkflowSimulationComponent {
  onSubmit: (data: WorkflowSubmissionForm) => Promise<string>;
  activeWorkflows: ActiveWorkflow[];
  onCancelWorkflow: (workflowId: string) => void;
}
// Uses: Form, Switch, Slider, NumberInput (shadcn)
// Uses: Progress, Badge, AlertDialog (shadcn)
// Uses: Tabs, TabsContent for workflow visualization
```

### Batch Job Submission
```typescript
interface BatchJobSubmission {
  jobs: JobSubmissionForm[];
  batchSize?: number;
  delayBetweenJobs?: number;
}

interface BatchSubmissionComponent {
  onSubmit: (data: BatchJobSubmission) => Promise<string[]>;
  progress?: {
    completed: number;
    total: number;
    failed: number;
  };
}
```

### Advanced Features
```typescript
// Job Templates
interface JobTemplate {
  id: string;
  name: string;
  description: string;
  jobType: string;
  defaultPriority: number;
  payloadSchema: JSONSchema;
  defaultPayload: Record<string, any>;
}

// Job Scheduling
interface ScheduledJob {
  id: string;
  jobData: JobSubmissionForm;
  scheduledAt: Date;
  recurring?: {
    interval: 'hourly' | 'daily' | 'weekly';
    count?: number;
  };
}
```

## Component Architecture

### JobSubmissionForm
- **Form validation** with Zod schemas
- **Real-time payload validation** 
- **Job type templates** for quick setup
- **Payload editor** with JSON syntax highlighting
- **Priority presets** (low, normal, high, urgent)
- **Requirements builder** for worker selection

### WorkflowBuilder
- **Visual workflow designer** 
- **Step configuration** with conditional logic
- **Progress tracking** for active workflows
- **Workflow templates** for common patterns
- **Step dependencies** and parallel execution

### BatchJobManager
- **CSV import** for bulk job creation
- **Progress monitoring** with cancel capability
- **Error handling** and retry logic
- **Results export** with success/failure reports

## Tasks
- [x] Create JobSubmissionForm with validation (basic version completed)
- [x] Implement payload editor with JSON validation (textarea with JSON parsing)
- [x] Create validation schemas with Zod (basic job submission schema)
- [x] Add comprehensive error handling (form validation and submission)
- [x] Integrate with WebSocket service for job submission
- [x] Add workflow parameter support (workflow_id, workflow_priority, etc.)
- [ ] Build WorkflowBuilder with step configuration
- [ ] Create workflow simulation with real-time progress
- [ ] Implement BatchJobManager with CSV import
- [ ] Add job templates system with CRUD operations
- [ ] Create job scheduling functionality
- [ ] Build requirements builder for worker selection
- [ ] Add form persistence with localStorage
- [ ] Implement job submission history
- [ ] Build progress tracking for batch operations
- [ ] Implement job cancellation and retry logic
- [ ] Add JSON schema validation for payloads
- [ ] Create visual payload editor with syntax highlighting

## Priority: High

## Dependencies
- monitor-core-components.md (base components)
- monitor-state-management.md (job store)
- monitor-websocket-service.md (message sending)

## Files to Create
- `src/components/jobs/JobSubmissionForm.tsx`
- `src/components/jobs/WorkflowBuilder.tsx`
- `src/components/jobs/BatchJobManager.tsx`
- `src/components/jobs/JobTemplates.tsx`
- `src/components/jobs/PayloadEditor.tsx`
- `src/components/jobs/RequirementsBuilder.tsx`
- `src/lib/validation/jobSchemas.ts`
- `src/lib/templates/jobTemplates.ts`
- `src/hooks/useJobSubmission.ts`
- `__tests__/job-submission/` - Test files

## Acceptance Criteria
- [x] Single job submission works with basic job types
- [x] Form validation prevents invalid submissions (basic validation)
- [x] Error handling provides actionable feedback (form errors)
- [x] Workflow parameters properly supported and transmitted
- [x] JSON payload validation with error messages
- [ ] Workflow simulation creates sequential jobs correctly
- [ ] Batch job submission handles large datasets efficiently
- [ ] Job templates speed up common submissions
- [ ] Real-time progress tracking for all operations
- [ ] Job history allows resubmission of previous jobs
- [ ] Requirements builder simplifies worker targeting
- [ ] All submission features are thoroughly tested

## Completion Notes
Basic job submission completed on 2025-01-01 as part of monitor foundation. Implemented in `src/components/job-submission-form.tsx` with:
- React Hook Form + Zod validation for all job fields
- JSON payload and requirements validation with error handling
- Workflow parameter support (workflow_id, workflow_priority, workflow_datetime, step_number)
- Real-time connection status indication
- Form reset and state management
- Integration with Zustand store and WebSocket service

Remaining tasks focus on advanced features like workflow builder, batch submission, templates, and visual editors.