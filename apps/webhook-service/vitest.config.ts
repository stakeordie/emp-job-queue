import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 120000, // 2 minutes for e2e tests
    hookTimeout: 30000,  // 30 seconds for beforeAll/afterAll
    teardownTimeout: 10000,
  },
});