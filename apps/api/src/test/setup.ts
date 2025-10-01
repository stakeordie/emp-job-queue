import { vi, beforeEach, afterEach } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

// Set testrunner profile for all tests
process.env.EMP_PROFILE = 'testrunner';

// Load testrunner environment variables for tests
config({ path: resolve(__dirname, '../../.env.testrunner') });
config({ path: resolve(__dirname, '../../.env.secret.testrunner') });

// Mock console methods for cleaner test output
vi.mock('console', () => ({
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));

// Mock express for testing
vi.mock('express', () => ({
  default: vi.fn(() => ({
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    listen: vi.fn(),
  })),
}));

// Global test setup
beforeEach(() => {
  // Reset all mocks before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  vi.restoreAllMocks();
});
