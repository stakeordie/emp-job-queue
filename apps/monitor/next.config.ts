import type { NextConfig } from "next";

const path = require('path');

const nextConfig: NextConfig = {
  typescript: {
    // Skip type checking during build if SKIP_TYPE_CHECK is set
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true',
  },
  eslint: {
    // Skip ESLint errors during build if SKIP_TYPE_CHECK is set
    ignoreDuringBuilds: process.env.SKIP_TYPE_CHECK === 'true',
  },
  outputFileTracingRoot: path.join(__dirname, '../../'),
  outputFileTracingExcludes: {
    '*': [
      '../apps/api/**/*',
      '../apps/worker/**/*',
      '../apps/machines/**/*',
      '../apps/docs/**/*',
      '../packages/docs/**/*',
      '../tools/**/*',
      '../scripts/**/*',
      '../logs/**/*',
      '../.git/**/*',
      '../.turbo/**/*',
      './node_modules/.cache/**/*',
      './.next/cache/**/*',
      './.vercel/**/*',
      '**/*.md',
      '**/README*',
      '**/CHANGELOG*',
      '**/LICENSE*',
      '**/.gitignore',
      '**/.eslintrc*',
      '**/.prettierrc*',
      '**/tsconfig.json',
      '**/vitest.config.*',
      '**/package-lock.json',
      '**/pnpm-lock.yaml',
      '**/__tests__/**/*',
      '**/*.test.*',
      '**/*.spec.*',
      '**/test/**/*',
      '**/tests/**/*'
    ]
  }
};

export default nextConfig;
