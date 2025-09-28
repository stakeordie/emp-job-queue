import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'scripts/**/*.test.js',
      'scripts/**/*.test.ts'
    ],
    exclude: [
      'node_modules',
      'apps/*/node_modules',
      'packages/*/node_modules'
    ]
  }
});