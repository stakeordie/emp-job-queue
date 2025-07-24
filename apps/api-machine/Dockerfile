# Multi-stage build for production optimization
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm@10.12.4

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy source code
COPY src/ ./src/

# Production stage
FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S apiuser && \
    adduser -S apiuser -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=base --chown=apiuser:apiuser /app ./

# Switch to non-root user
USER apiuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "import('http').then(http => { \
    const req = http.request({hostname:'localhost',port:process.env.HEALTH_PORT||9090,path:'/health',timeout:5000}, \
    res => process.exit(res.statusCode === 200 ? 0 : 1)); \
    req.on('error', () => process.exit(1)); \
    req.end(); \
  })"

# Expose ports
EXPOSE 3000 9090 8000

# Start command
CMD ["node", "src/index.js"]