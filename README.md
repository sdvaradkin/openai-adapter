# openai-adapter

Minimal Node.js/TypeScript service scaffold for the OpenAI Adapter.

## Requirements

- Node.js 20+
- npm
- Docker (optional, for container build/run)

## Scripts

- `npm run build` — compile TypeScript to `dist/`
- `npm run dev` — run dev server with watch
- `npm start` — run compiled server (`node dist/index.js`)
- `npm test` — run unit tests (Vitest)
- `npm run test:smoke` — run smoke tests (Docker container health checks)
- `npm run test:regression` — run regression tests (Docker image validation)
- `npm run test:integration` — run all integration tests (smoke + regression)
- `npm run test:integration:local` — build Docker image + run integration tests
- `npm run test:ci` — run full CI pipeline (lint, test, build, docker, integration)
- `npm run lint` — lint `src/` and `tests/`
- `npm run format` — format with Prettier
- `npm run docker:build` — build Docker image as `openai-adapter:test`

## Running locally

```bash
npm ci
npm run build
PORT=3000 node dist/index.js
```

## Operational Endpoints

### Health Endpoint (`/health`) - Liveness Probe

The health endpoint is a **liveness probe** used by container orchestration platforms (Kubernetes, Docker Swarm, etc.) to determine if the process is alive.

**Characteristics:**
- Always returns HTTP 200 if the process is running
- No configuration or dependency checks
- Ultra-lightweight, designed for frequent polling (every few seconds)
- Does not log requests to avoid clutter

**Request:**
```bash
curl http://localhost:3000/health
```

**Response (success):**
```json
{
  "status": "ok"
}
```

### Readiness Endpoint (`/ready`) - Readiness Probe

The readiness endpoint is a **readiness probe** used by load balancers and service meshes to determine if the instance can accept traffic.

**Characteristics:**
- Returns HTTP 200 when adapter is fully operational
- Returns HTTP 503 when adapter cannot accept traffic (e.g., configuration invalid)
- Verifies configuration is valid and loaded
- Does not log requests to avoid clutter
- Does NOT check external dependencies (Redis, upstream APIs) in MVP scope

**Request:**
```bash
curl http://localhost:3000/ready
```

**Response (ready):**
```json
{
  "status": "ready",
  "checks": {
    "config": "ok"
  }
}
```

**Response (not ready):**
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation failed"
}
```

### Kubernetes Configuration Example

Use these endpoints in Kubernetes health checks:

```yaml
spec:
  containers:
  - name: openai-adapter
    livenessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 10
      timeoutSeconds: 3
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /ready
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 1
```

## Environment variables

### Required

- `ADAPTER_TARGET_URL` — target OpenAI API base URL (e.g., `https://api.openai.com/v1`)
- `MODEL_API_MAPPING_FILE` — path to model-to-API mapping JSON file (e.g., `./config/model-mapping.json`)

### Optional

- `PORT` (default: `3000`) — server listen port
- `LOG_PRETTY` — set to `1` for pretty logs in development (requires `pino-pretty`)

See [.env.example](.env.example) for a complete example.

## Docker

Build:

```bash
docker build -t openai-adapter:test .
```

Run:

```bash
docker run -p 3000:3000 openai-adapter:test
```

Health:

```bash
curl -f http://localhost:3000/health
```

## Testing

### Unit Tests
```bash
npm test
```

### Integration Tests (requires Docker)
```bash
# Build image + run integration tests
npm run test:integraall integration tests (smoke + regression)
npm run test:integration:local

# Or run individually:
docker build -t openai-adapter:test .

# Smoke tests (container health checks with testcontainers)
npm run test:smoke

# Regression tests (image metadata validation)
npm run test:regression
# Or manually:
docker build -t openai-adapter:test .
npm run test:integration
```

### Full CI Pipeline Locally
```bash
# CRun smoke tests (container health)
6. Run regression tests (image validation)
```

This runs the complete CI flow:
1. Lint code
2. Run unit tests
3. Build TypeScript
4. Build Docker image
5. Test Docker health endpoint
6. Run integration tests
