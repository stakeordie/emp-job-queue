import { NextRequest, NextResponse } from 'next/server';

/**
 * Agent Ask API - Placeholder for AI-powered workflow debugging assistance
 *
 * TODO: Implement actual AI logic here
 * Options:
 * 1. OpenAI API integration
 * 2. Anthropic Claude API
 * 3. Local LLM
 * 4. Custom rule-based system
 */

export async function POST(request: NextRequest) {
  try {
    const { question, context, workflowId } = await request.json();

    if (!question || !context || !workflowId) {
      return NextResponse.json(
        { error: 'Missing required fields: question, context, workflowId' },
        { status: 400 }
      );
    }

    // Placeholder: Simple pattern matching for common questions
    const answer = generatePlaceholderAnswer(question, context);

    return NextResponse.json({
      answer: answer.text,
      confidence: answer.confidence,
      suggestedActions: answer.actions,
      relatedData: {}
    });
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Placeholder answer generator
 * Replace this with actual AI integration
 */
function generatePlaceholderAnswer(question: string, context: string): {
  text: string;
  confidence: 'high' | 'medium' | 'low';
  actions: string[];
} {
  const lowerQuestion = question.toLowerCase();

  // Pattern: Status mismatch
  if (lowerQuestion.includes('status') && lowerQuestion.includes('mismatch')) {
    return {
      text: `Based on the workflow data, there appears to be a status discrepancy between Redis and the database. This typically occurs when:

1. The job status was updated in Redis but the database update failed or was delayed
2. The job was processed asynchronously and Redis (authoritative source) updated faster
3. There was a temporary connection issue between systems

Redis is considered the authoritative source for job status in this system. The database status should eventually sync with Redis.`,
      confidence: 'high',
      actions: [
        'Check if there are any database connection errors in the logs',
        'Verify the job status update webhook is functioning correctly',
        'Consider manually syncing the database status with Redis for this job'
      ]
    };
  }

  // Pattern: Output files
  if (lowerQuestion.includes('file') && (lowerQuestion.includes('output') || lowerQuestion.includes('workflow_output'))) {
    return {
      text: `The analysis shows files were generated but the workflow_output column is empty. This mismatch indicates:

1. Files were successfully created and uploaded to storage
2. The workflow_output database column was not updated after file generation
3. This could be due to a webhook failure or database update issue

The files exist and are accessible, but the metadata wasn't properly recorded in the database.`,
      confidence: 'high',
      actions: [
        'Check webhook logs for workflow completion events',
        'Verify the flat_file table has records for these files',
        'Consider backfilling the workflow_output column with file metadata',
        'Review the workflow completion handler code for bugs'
      ]
    };
  }

  // Pattern: What happened / Summary
  if (lowerQuestion.includes('what happened') || lowerQuestion.includes('summary') || lowerQuestion.includes('summarize')) {
    return {
      text: `Based on the available data, here's what I can determine about this workflow:

**Data Sources Found:**
${context.includes('Database Job Data:') ? '✓ Job record found in EmProps database' : '✗ No job record in database'}
${context.includes('Redis Job Data:') ? '✓ Job data found in Redis' : '✗ No job data in Redis'}

**Status Information:**
${extractStatusFromContext(context)}

**Issues Detected:**
${extractIssuesFromContext(context)}

Please ask more specific questions if you need details about particular aspects of this workflow.`,
      confidence: 'medium',
      actions: [
        'Review the timeline of events in the Analysis tab',
        'Check the attestation records for failure details',
        'Examine the raw query results for missing data'
      ]
    };
  }

  // Pattern: Retry related
  if (lowerQuestion.includes('retry') || lowerQuestion.includes('retries')) {
    return {
      text: `Regarding retries for this workflow:

${context.includes('Retries: 0') ? 'No retry attempts were recorded for this workflow.' : 'This workflow has retry history. Check the retry backups in the Analysis tab for details on what changed between attempts.'}

Retries in this system occur when:
1. A worker fails to complete a job (temporary failure)
2. The job encounters a recoverable error
3. A timeout occurs during processing

Each retry attempt is backed up in the job_retry_backup table with the previous state preserved.`,
      confidence: 'medium',
      actions: [
        'Review the Job Retry Backups query result for retry history',
        'Check worker failure attestations for failure reasons',
        'Verify max_retries configuration for this job type'
      ]
    };
  }

  // Default response
  return {
    text: `I've analyzed the workflow data you provided. Unfortunately, I couldn't find a specific pattern match for your question.

**What I can see:**
- Workflow ID: ${context.split('\n')[0]}
- Available query results and analysis data

**To get better answers, try asking:**
- "What caused the status mismatch?"
- "Why are there files but no workflow_output?"
- "What were the failure reasons?"
- "Summarize what happened with this workflow"

Or ask specific questions about the data you see in the Analysis and Raw Queries tabs.

**Note:** This is a placeholder AI. For production use, integrate with OpenAI, Claude, or another LLM service.`,
    confidence: 'low',
    actions: [
      'Integrate with an actual AI service (OpenAI, Claude, etc.)',
      'Implement domain-specific analysis logic',
      'Add more pattern matching rules'
    ]
  };
}

function extractStatusFromContext(context: string): string {
  const redisMatch = context.match(/Redis: (\w+)/);
  const dbMatch = context.match(/Database: (\w+)/);

  if (redisMatch && dbMatch) {
    return `Redis status: ${redisMatch[1]}, Database status: ${dbMatch[1]}`;
  }
  return 'Status information not found in context';
}

function extractIssuesFromContext(context: string): string {
  const issuesMatch = context.match(/Issues detected: (\d+)/);
  if (issuesMatch && parseInt(issuesMatch[1]) > 0) {
    return `${issuesMatch[1]} issue(s) detected. Check the Analysis tab for details.`;
  }
  return 'No issues detected';
}
