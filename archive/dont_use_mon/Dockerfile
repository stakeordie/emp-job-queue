FROM node:18-alpine

# Install pnpm
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN pnpm build

# Expose port
EXPOSE 3003

# Start the application
CMD ["pnpm", "start"]