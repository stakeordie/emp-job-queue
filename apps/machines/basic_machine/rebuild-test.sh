#!/bin/bash
# Force clean rebuild and test

echo "🧹 Cleaning up old containers and images..."
docker stop basic-machine-local 2>/dev/null || true
docker rm basic-machine-local 2>/dev/null || true
docker rmi basic-machine-pm2-test 2>/dev/null || true

echo ""
echo "📦 Building fresh image..."
docker build --no-cache -t basic-machine-pm2-test .

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

echo "✅ Build successful"
echo ""

echo "🏃 Running with minimal services..."
docker run -it --rm \
  --name basic-machine-local \
  -p 9090:9090 \
  -e NODE_ENV=development \
  -e NUM_GPUS=1 \
  -e ENABLE_REDIS_WORKER=false \
  -e ENABLE_HELLO_WORLD=false \
  basic-machine-pm2-test