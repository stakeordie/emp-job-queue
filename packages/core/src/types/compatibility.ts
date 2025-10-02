// Backwards Compatibility Layer
// This file provides type aliases to support gradual migration
// TODO: Remove this file once all code has been migrated to new terminology

import { Job as StepType } from './step.js';

/**
 * DEPRECATED: Use Step instead
 * This alias maintains backwards compatibility during migration
 */
export type Job = StepType;

/**
 * DEPRECATED: Use the new Job type from job-new.ts
 * This is a placeholder to prevent breaking changes
 */
export const MIGRATION_NOTICE = `
  ⚠️  SEMANTIC MIGRATION IN PROGRESS ⚠️

  Old terminology:
  - "Job" → Individual processing unit (what workers process)
  - "Workflow" → Collection of jobs (what users submit)

  New terminology:
  - "Step" → Individual processing unit (what workers process)
  - "Job" → What users submit (may contain one or more steps)

  During migration:
  - Old "Job" type → Now "Step" type (in step.ts)
  - Old "Workflow" concept → Now "Job" type (in job-new.ts)
  - Compatibility aliases provided in this file

  This notice will be removed once migration is complete.
`;

// console.log(MIGRATION_NOTICE);
