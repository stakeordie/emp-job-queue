/**
 * Debug test to see what the classifier actually returns
 */

import { describe, it, expect } from 'vitest';
import { FailureClassifier } from '../types/failure-classification.js';

describe('Failure Classifier Debug', () => {
  it('should show actual classification results', () => {
    const testCases = [
      { error: 'Request failed with status code 401 - Invalid API key', context: { httpStatus: 401, serviceType: 'openai_responses' } },
      { error: 'Rate limit exceeded: 429 Too Many Requests', context: { httpStatus: 429, serviceType: 'openai_responses' } },
      { error: 'Content generation refused: cannot generate violent imagery per policy', context: { serviceType: 'openai_responses' } },
      { error: 'Cannot generate copyrighted character artwork', context: { serviceType: 'openai_responses' } },
      { error: 'Network timeout after 30 seconds', context: { timeout: true, serviceType: 'openai_responses' } },
      { error: 'HTTP 500: Internal Server Error', context: { httpStatus: 500, serviceType: 'openai_responses' } },
      { error: 'Process ran out of memory: Cannot allocate 8GB for model', context: { serviceType: 'comfyui' } },
      { error: 'Failed to parse JSON response: Unexpected token at position 42', context: { serviceType: 'openai_responses' } },
      { error: 'Model gpt-5 not found or unavailable', context: { httpStatus: 404, serviceType: 'openai_responses' } },
      { error: 'Something completely unexpected happened', context: { serviceType: 'openai_responses' } }
    ];

    testCases.forEach(({ error, context }) => {
      const result = FailureClassifier.classify(error, context);
      console.log(`Error: "${error}"`);
      console.log(`Result:`, result);
      console.log('---');
    });

    // Just pass - this is for debugging
    expect(true).toBe(true);
  });
});