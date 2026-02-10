#!/bin/bash
# Run full CI pipeline locally
# Usage: ./scripts/test-ci-local.sh

set -e

echo "🚀 Running full CI pipeline locally..."

# Install dependencies
echo -e "\n📦 Installing dependencies..."
npm ci

# Lint
echo -e "\n🔍 Linting..."
npm run lint

# Unit tests
echo -e "\n🧪 Running unit tests..."
npm test

# Build TypeScript
echo -e "\n🔨 Building TypeScript..."
npm run build

# Build Docker image
echo -e "\n🐳 Building Docker image..."
docker build -t openai-adapter:test .

# Test Docker image health endpoint
echo -e "\n🏥 Testing Docker health endpoint..."
docker run -d -p 3000:3000 --name test-container openai-adapter:test

sleep 5

if ! curl -f http://localhost:3000/health; then
    echo "❌ Health check failed"
    docker rm -f test-container 2>/dev/null || true
    exit 1
fi

docker rm -f test-container

# Integration tests
echo -e "\n🧪 Running integration tests..."
export DOCKER_IMAGE="openai-adapter:test"
npm run test:integration

echo -e "\n✅ All CI checks passed!"
echo "Image: openai-adapter:test is ready for deployment"
