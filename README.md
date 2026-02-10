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

Health endpoint:

```bash
curl -f http://localhost:3000/health
```

## Environment variables

- `PORT` (default: `3000`) — server listen port
- `LOG_PRETTY` (optional) — set to `1` for pretty logs in development (requires `pino-pretty`)

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
