import type { NextConfig } from "next";

const path = require('path');

const nextConfig: NextConfig = {
  typescript: {
    // Always skip TypeScript errors for forensics/monitoring tool
    ignoreBuildErrors: true,
  },
  eslint: {
    // Always skip ESLint for forensics/monitoring tool - we use relaxed typing
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['@prisma/client', '@prisma/engines'],
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // Include Prisma files in the bundle instead of externalizing them
      config.externals = config.externals.filter(
        (external: any) => !external.includes?.('@prisma') && !external.includes?.('prisma')
      );

      // Ensure .node files are handled properly
      config.module.rules.push({
        test: /\.node$/,
        use: 'raw-loader',
      });
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn-dev.emprops.ai',
        pathname: '/generations/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.emprops.ai',
        pathname: '/generations/**',
      },
      {
        protocol: 'https',
        hostname: 'imagedelivery.net',
        pathname: '/**',
      }
    ],
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
  },
};

export default nextConfig;
