#!/bin/bash

# Deploy Redis with JavaScript Functions to Railway

echo "🚀 Deploying Redis with JavaScript Functions to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "npm install -g @railway/cli"
    exit 1
fi

# Login check
if ! railway whoami &> /dev/null; then
    echo "🔐 Please login to Railway first:"
    railway login
fi

# Create new Railway project for Redis
echo "📦 Creating Railway project for Redis Functions..."
railway new redis-functions --detach

# Switch to the project
railway link

# Deploy Redis service
echo "🔧 Deploying Redis service..."
railway up --dockerfile Dockerfile.redis

# Get connection details
echo "📋 Getting Redis connection details..."
railway variables

echo "✅ Redis deployment complete!"
echo ""
echo "Next steps:"
echo "1. Copy the Redis URL from the variables above"
echo "2. Update your .env.railway file with the connection details"
echo "3. Run: export REDIS_URL='your-railway-redis-url'"
echo "4. Test the functions: pnpm redis:functions:install"