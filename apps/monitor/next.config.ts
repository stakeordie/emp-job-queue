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
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
