#!/usr/bin/env node
/**
 * Error Case CLI - Easy production error recording and replay
 *
 * Usage Examples:
 *
 * Record from production logs:
 * node error-case-cli.ts record --service ollama --job-id abc123 --error "model not found"
 *
 * List recorded cases:
 * node error-case-cli.ts list
 *
 * Replay in staging:
 * node error-case-cli.ts replay --case-id xyz789
 */

import { errorRecorder } from './error-case-recorder.js';
import { simulateProductionError } from './mock-manager.js';

interface CLIArgs {
  command: 'record' | 'list' | 'replay' | 'help';
  service?: string;
  jobId?: string;
  error?: string;
  caseId?: string;
  httpCode?: number;
  endpoint?: string;
}

class ErrorCaseCLI {
  async run(args: string[]) {
    const parsedArgs = this.parseArgs(args);

    switch (parsedArgs.command) {
      case 'record':
        await this.recordError(parsedArgs);
        break;
      case 'list':
        await this.listCases(parsedArgs);
        break;
      case 'replay':
        await this.replayError(parsedArgs);
        break;
      case 'help':
      default:
        this.showHelp();
        break;
    }
  }

  private parseArgs(args: string[]): CLIArgs {
    const parsed: CLIArgs = { command: 'help' };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const value = args[i + 1];

      switch (arg) {
        case 'record':
        case 'list':
        case 'replay':
        case 'help':
          parsed.command = arg;
          break;
        case '--service':
          parsed.service = value;
          i++;
          break;
        case '--job-id':
          parsed.jobId = value;
          i++;
          break;
        case '--error':
          parsed.error = value;
          i++;
          break;
        case '--case-id':
          parsed.caseId = value;
          i++;
          break;
        case '--http-code':
          parsed.httpCode = parseInt(value);
          i++;
          break;
        case '--endpoint':
          parsed.endpoint = value;
          i++;
          break;
      }
    }

    return parsed;
  }

  private async recordError(args: CLIArgs) {
    if (!args.service || !args.jobId || !args.error) {
      console.error('❌ Missing required arguments for record command');
      console.error('Usage: node error-case-cli.ts record --service ollama --job-id abc123 --error "model not found"');
      return;
    }

    try {
      console.log('📝 Recording production error...');

      const errorCase = await errorRecorder.quickRecordFromLogs({
        service: args.service,
        jobId: args.jobId,
        error: args.error,
        httpCode: args.httpCode,
        endpoint: args.endpoint
      });

      console.log('✅ Error case recorded successfully!');
      console.log(`   Case ID: ${errorCase.id}`);
      console.log(`   Service: ${errorCase.service}`);
      console.log(`   Job ID: ${errorCase.jobId}`);
      console.log(`   Error: ${errorCase.errorMessage}`);
      console.log('');
      console.log('🎬 To replay in staging:');
      console.log(`   NODE_ENV=staging node error-case-cli.ts replay --case-id ${errorCase.id}`);

    } catch (error) {
      console.error('❌ Failed to record error case:', error);
    }
  }

  private async listCases(args: CLIArgs) {
    try {
      const cases = await errorRecorder.loadErrorCases();

      if (cases.length === 0) {
        console.log('📂 No error cases recorded yet');
        return;
      }

      console.log(`📋 Recorded Error Cases (${cases.length} total)`);
      console.log('═'.repeat(80));

      cases.forEach((errorCase, index) => {
        const date = new Date(errorCase.timestamp).toLocaleDateString();
        const time = new Date(errorCase.timestamp).toLocaleTimeString();

        console.log(`${index + 1}. [${errorCase.service.toUpperCase()}] ${errorCase.id}`);
        console.log(`   Date: ${date} ${time}`);
        console.log(`   Job: ${errorCase.jobId}`);
        console.log(`   Error: ${errorCase.errorMessage.substring(0, 60)}${errorCase.errorMessage.length > 60 ? '...' : ''}`);
        console.log(`   HTTP: ${errorCase.responseCode}`);
        console.log(`   Replay: NODE_ENV=staging node error-case-cli.ts replay --case-id ${errorCase.id}`);
        console.log('');
      });

    } catch (error) {
      console.error('❌ Failed to list error cases:', error);
    }
  }

  private async replayError(args: CLIArgs) {
    if (!args.caseId) {
      console.error('❌ Missing case ID for replay command');
      console.error('Usage: node error-case-cli.ts replay --case-id xyz789');
      return;
    }

    if (process.env.NODE_ENV !== 'staging') {
      console.error('❌ Replay only works in staging environment');
      console.error('Set NODE_ENV=staging first');
      return;
    }

    try {
      console.log(`🎬 Loading error case: ${args.caseId}`);

      const cases = await errorRecorder.loadErrorCases();
      const errorCase = cases.find(c => c.id === args.caseId);

      if (!errorCase) {
        console.error(`❌ Error case ${args.caseId} not found`);
        console.log('📋 Available cases:');
        cases.slice(0, 5).forEach(c => {
          console.log(`   ${c.id} - ${c.service} - ${c.errorMessage.substring(0, 40)}`);
        });
        return;
      }

      await simulateProductionError(errorCase.service, args.caseId);

      console.log('✅ Error case loaded successfully!');
      console.log('');
      console.log('🚀 Next steps:');
      console.log('1. Start your worker: pnpm worker:start');
      console.log(`2. Submit a ${errorCase.service} job`);
      console.log('3. The job will fail with the same error as production');
      console.log('4. Use this to debug and fix the issue');

    } catch (error) {
      console.error('❌ Failed to replay error case:', error);
    }
  }

  private showHelp() {
    console.log('🎭 Error Case CLI - Production Error Recording & Replay');
    console.log('');
    console.log('Commands:');
    console.log('  record    Record a production error for replay in staging');
    console.log('  list      Show all recorded error cases');
    console.log('  replay    Replay a recorded error case in staging');
    console.log('  help      Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  # Record a production error');
    console.log('  node error-case-cli.ts record --service ollama --job-id abc123 --error "model not found"');
    console.log('');
    console.log('  # Add more details');
    console.log('  node error-case-cli.ts record \\');
    console.log('    --service openai \\');
    console.log('    --job-id def456 \\');
    console.log('    --error "rate limit exceeded" \\');
    console.log('    --http-code 429 \\');
    console.log('    --endpoint "/v1/chat/completions"');
    console.log('');
    console.log('  # List all cases');
    console.log('  node error-case-cli.ts list');
    console.log('');
    console.log('  # Replay in staging');
    console.log('  NODE_ENV=staging node error-case-cli.ts replay --case-id xyz789');
  }
}

// CLI execution
if (require.main === module) {
  const cli = new ErrorCaseCLI();
  cli.run(process.argv.slice(2));
}

export { ErrorCaseCLI };