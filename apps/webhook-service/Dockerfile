# Dockerfile for Webhook Notification Service
# HTTP webhook delivery microservice

FROM node:20-alpine AS base

# Install dependencies for production
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./

# Install pnpm
RUN npm install -g pnpm@10.10.0

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder

WORKDIR /app

# Install all dependencies (including dev)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build core package first
RUN pnpm --filter=@emp/core build
# Build webhook service
RUN pnpm --filter=webhook-service build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/apps ./apps
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

USER nodejs

# Expose webhook service port
EXPOSE 3332

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3332/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Start the webhook service
WORKDIR /app/apps/webhook-service
CMD ["node", "dist/index.js"]