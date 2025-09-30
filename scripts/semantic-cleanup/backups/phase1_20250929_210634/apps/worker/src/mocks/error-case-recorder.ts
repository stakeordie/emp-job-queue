/**
 * Error Case Recorder - Captures production failures for staging replay
 *
 * Usage:
 * 1. Production error occurs
 * 2. Copy error details into a test case file
 * 3. Staging can replay the exact same failure scenario
 */

import fs from 'fs/promises';
import path from 'path';

export interface ProductionErrorCase {
  id: string;
  service: 'ollama' | 'openai' | 'comfyui';
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  timestamp: string;
  jobId: string;
  requestBody?: any;
  responseCode: number;
  responseBody: any;
  errorMessage: string;
  environment: 'production' | 'staging';
  reproducible: boolean;
  notes?: string;
}

export class ErrorCaseRecorder {
  private casesDir = path.join(__dirname, 'error-cases');

  constructor() {
    this.ensureCasesDirectory();
  }

  private async ensureCasesDirectory() {
    try {
      await fs.mkdir(this.casesDir, { recursive: true });
    } catch (error) {
      console.warn('Could not create error cases directory:', error);
    }
  }

  /**
   * Record a production error for later replay in staging
   */
  async recordProductionError(errorCase: Omit<ProductionErrorCase, 'id' | 'timestamp'>) {
    const fullErrorCase: ProductionErrorCase = {
      ...errorCase,
      id: this.generateErrorCaseId(),
      timestamp: new Date().toISOString(),
    };

    const filename = `${fullErrorCase.service}-error-${fullErrorCase.id}.json`;
    const filepath = path.join(this.casesDir, filename);

    try {
      await fs.writeFile(filepath, JSON.stringify(fullErrorCase, null, 2));
      console.log(`📝 Recorded error case: ${filename}`);
      return fullErrorCase;
    } catch (error) {
      console.error('Failed to record error case:', error);
      throw error;
    }
  }

  /**
   * Load all recorded error cases
   */
  async loadErrorCases(): Promise<ProductionErrorCase[]> {
    try {
      const files = await fs.readdir(this.casesDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      const cases = await Promise.all(
        jsonFiles.map(async (file) => {
          const filepath = path.join(this.casesDir, file);
          const content = await fs.readFile(filepath, 'utf-8');
          return JSON.parse(content) as ProductionErrorCase;
        })
      );

      return cases.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      console.warn('Could not load error cases:', error);
      return [];
    }
  }

  /**
   * Get error cases for a specific service
   */
  async getErrorCasesForService(service: string): Promise<ProductionErrorCase[]> {
    const allCases = await this.loadErrorCases();
    return allCases.filter(c => c.service === service);
  }

  /**
   * Create a quick error case from minimal production data
   * Usage: Copy/paste from production logs
   */
  async quickRecordFromLogs(logData: {
    service: string;
    jobId: string;
    error: string;
    httpCode?: number;
    endpoint?: string;
    requestBody?: any;
    responseBody?: any;
  }) {
    return this.recordProductionError({
      service: logData.service as any,
      endpoint: logData.endpoint || '/unknown',
      method: 'POST',
      jobId: logData.jobId,
      requestBody: logData.requestBody,
      responseCode: logData.httpCode || 500,
      responseBody: logData.responseBody || { error: logData.error },
      errorMessage: logData.error,
      environment: 'production',
      reproducible: false, // To be determined in staging
      notes: 'Recorded from production logs'
    });
  }

  private generateErrorCaseId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
  }

  /**
   * Generate CLI command to reproduce this error in staging
   */
  generateReproCommand(errorCase: ProductionErrorCase): string {
    return `
# Reproduce error case: ${errorCase.id}
export NODE_ENV=staging
node -e "
import { simulateProductionError } from './staging-init.js';
simulateProductionError('${errorCase.service}', '${errorCase.id}');
console.log('Error case ${errorCase.id} loaded - submit a ${errorCase.service} job to trigger');
"`;
  }
}

// Global instance
export const errorRecorder = new ErrorCaseRecorder();