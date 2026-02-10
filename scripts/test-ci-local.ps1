#!/usr/bin/env pwsh
# Run full CI pipeline locally
# Usage: .\scripts\test-ci-local.ps1

Write-Host "🚀 Running full CI pipeline locally..." -ForegroundColor Cyan

# Install dependencies
Write-Host "`n📦 Installing dependencies..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Lint
Write-Host "`n🔍 Linting..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Unit tests
Write-Host "`n🧪 Running unit tests..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Build TypeScript
Write-Host "`n🔨 Building TypeScript..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Build Docker image
Write-Host "`n🐳 Building Docker image..." -ForegroundColor Yellow
docker build -t openai-adapter:test .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Test Docker image health endpoint
Write-Host "`n🏥 Testing Docker health endpoint..." -ForegroundColor Yellow
docker run -d -p 3000:3000 --name test-container openai-adapter:test
if ($LASTEXITCODE -ne 0) {
    docker rm -f test-container 2>$null
    exit $LASTEXITCODE
}

Start-Sleep -Seconds 5

$healthResponse = curl -f http://localhost:3000/health 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Health check failed" -ForegroundColor Red
    docker rm -f test-container 2>$null
    exit 1
}

docker rm -f test-container 2>$null

# Integration tests
Write-Host "`n🧪 Running integration tests..." -ForegroundColor Yellow
$env:DOCKER_IMAGE = "openai-adapter:test"
npm run test:integration
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n✅ All CI checks passed!" -ForegroundColor Green
Write-Host "Image: openai-adapter:test is ready for deployment" -ForegroundColor Cyan
