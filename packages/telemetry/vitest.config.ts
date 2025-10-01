import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 15000, // Higher timeout for OTLP export tests
    hookTimeout: 10000,
    teardownTimeout: 10000,
  }
})
