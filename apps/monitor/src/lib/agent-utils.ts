/**
 * Agent utilities for AI-powered workflow debugging
 * Provides context preparation and question handling for AI agent modal
 */

import type { QueryResult } from '@/app/workflow-debug/page';

export interface AgentContext {
  workflowId: string;
  queryResults: QueryResult[];
  analysis?: {
    mismatches: Array<{ severity: string; message: string; details?: string }>;
    attestationSummary: { total: number; failures: number; completions: number; retries: number };
    outputStatus: { hasFiles: boolean; hasDbColumn: boolean; fileCount: number; mismatch: boolean };
    statusConsistency: { redis: string | null; db: string | null; consistent: boolean };
  };
}

export interface AgentQuestion {
  question: string;
  context: AgentContext;
}

export interface AgentResponse {
  answer: string;
  confidence: 'high' | 'medium' | 'low';
  suggestedActions?: string[];
  relatedData?: Record<string, unknown>;
}

/**
 * Prepare context for AI agent by extracting and summarizing relevant data
 */
export function prepareAgentContext(
  workflowId: string,
  queryResults: QueryResult[],
  analysis?: AgentContext['analysis']
): AgentContext {
  return {
    workflowId,
    queryResults: queryResults.map(r => ({
      step: r.step,
      query: r.query,
      result: simplifyResult(r.result),
      status: r.status,
      timing: r.timing
    })),
    analysis
  };
}

/**
 * Simplify query result for AI context (remove excessive nested data)
 */
function simplifyResult(result: any): any {
  if (!result) return result;

  // If array, limit to first 5 items
  if (Array.isArray(result)) {
    return result.slice(0, 5).map(item => simplifyObject(item));
  }

  return simplifyObject(result);
}

/**
 * Simplify object by removing deeply nested structures
 */
function simplifyObject(obj: any, depth = 0): any {
  if (depth > 3) return '[nested object]';
  if (!obj || typeof obj !== 'object') return obj;

  const simplified: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      simplified[key] = `[${value.length} items]`;
    } else if (value && typeof value === 'object') {
      simplified[key] = simplifyObject(value, depth + 1);
    } else {
      simplified[key] = value;
    }
  }
  return simplified;
}

/**
 * Build a comprehensive context summary for the AI
 */
export function buildContextSummary(context: AgentContext): string {
  const parts: string[] = [];

  parts.push(`Workflow ID: ${context.workflowId}`);
  parts.push(`\n## Query Results Summary:`);
  parts.push(`Total queries executed: ${context.queryResults.length}`);
  parts.push(`Successful: ${context.queryResults.filter(r => r.status === 'success').length}`);
  parts.push(`Empty: ${context.queryResults.filter(r => r.status === 'empty').length}`);
  parts.push(`Errors: ${context.queryResults.filter(r => r.status === 'error').length}`);

  if (context.analysis) {
    parts.push(`\n## Analysis Summary:`);
    parts.push(`Issues detected: ${context.analysis.mismatches.length}`);

    if (context.analysis.mismatches.length > 0) {
      parts.push(`\n### Issues:`);
      context.analysis.mismatches.forEach((m, idx) => {
        parts.push(`${idx + 1}. [${m.severity}] ${m.message}`);
        if (m.details) parts.push(`   Details: ${m.details}`);
      });
    }

    parts.push(`\n### Attestations:`);
    parts.push(`Total: ${context.analysis.attestationSummary.total}`);
    parts.push(`Failures: ${context.analysis.attestationSummary.failures}`);
    parts.push(`Completions: ${context.analysis.attestationSummary.completions}`);
    parts.push(`Retries: ${context.analysis.attestationSummary.retries}`);

    parts.push(`\n### Status Consistency:`);
    parts.push(`Redis: ${context.analysis.statusConsistency.redis || 'N/A'}`);
    parts.push(`Database: ${context.analysis.statusConsistency.db || 'N/A'}`);
    parts.push(`Consistent: ${context.analysis.statusConsistency.consistent ? 'Yes' : 'No'}`);

    parts.push(`\n### Output Status:`);
    parts.push(`Files generated: ${context.analysis.outputStatus.fileCount}`);
    parts.push(`DB column populated: ${context.analysis.outputStatus.hasDbColumn ? 'Yes' : 'No'}`);
    parts.push(`Mismatch detected: ${context.analysis.outputStatus.mismatch ? 'Yes' : 'No'}`);
  }

  // Add key data from query results
  const dbJob = context.queryResults.find(r => r.step === 'EmProps Database - Job Record');
  const redisJob = context.queryResults.find(r => r.step === 'Redis - Direct Job Lookup');

  if (dbJob?.result) {
    parts.push(`\n## Database Job Data:`);
    parts.push(JSON.stringify(dbJob.result, null, 2));
  }

  if (redisJob?.result) {
    parts.push(`\n## Redis Job Data:`);
    parts.push(JSON.stringify(redisJob.result, null, 2));
  }

  return parts.join('\n');
}

/**
 * Send question to AI agent API
 */
export async function askAgent(question: AgentQuestion): Promise<AgentResponse> {
  const contextSummary = buildContextSummary(question.context);

  const response = await fetch('/api/agent/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: question.question,
      context: contextSummary,
      workflowId: question.context.workflowId
    })
  });

  if (!response.ok) {
    throw new Error(`Agent API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get suggested questions based on the current analysis
 */
export function getSuggestedQuestions(context: AgentContext): string[] {
  const suggestions: string[] = [];

  if (!context.analysis) {
    suggestions.push("What happened to this workflow?");
    suggestions.push("Is there any data for this workflow ID?");
    return suggestions;
  }

  const { analysis } = context;

  // Suggest questions based on detected issues
  if (analysis.mismatches.length > 0) {
    const highSeverity = analysis.mismatches.filter(m => m.severity === 'high');
    if (highSeverity.length > 0) {
      suggestions.push("What caused the critical issues in this workflow?");
      suggestions.push("How can I fix the detected mismatches?");
    }
  }

  if (!analysis.statusConsistency.consistent) {
    suggestions.push("Why is there a status mismatch between Redis and the database?");
    suggestions.push("Which status is correct - Redis or database?");
  }

  if (analysis.outputStatus.mismatch) {
    suggestions.push("Why are there files but no workflow_output data?");
    suggestions.push("How do I sync the generated files with the database?");
  }

  if (analysis.attestationSummary.failures > 0) {
    suggestions.push("What were the failure reasons?");
    suggestions.push("Can this workflow be retried successfully?");
  }

  if (analysis.attestationSummary.retries > 0) {
    suggestions.push("Why did this workflow require retries?");
    suggestions.push("What changed between retry attempts?");
  }

  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push("Summarize what happened with this workflow");
    suggestions.push("Are there any potential issues I should investigate?");
    suggestions.push("What is the current state of this workflow?");
  }

  return suggestions.slice(0, 5); // Limit to 5 suggestions
}
