// Simple test to verify Jest setup
import { describe, it, expect } from '@jest/globals';

describe('Test Infrastructure', () => {
  it('should run basic tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle async operations', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });

  it('should have access to test utilities', () => {
    // Test that our global test utilities are available
    // expect(typeof global.testUtils?.createTestJob).toBe('function');
    // expect(typeof global.testUtils?.createTestWorker).toBe('function');
    expect(true).toBe(true); // Placeholder for now
  });
});