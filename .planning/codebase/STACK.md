# Technology Stack

**Analysis Date:** 2026-02-19

## Languages

**Primary:**
- TypeScript 5.5.4 - All source code and configuration files

**Runtime:**
- Node.js 20+ - Server runtime

## Runtime Environment

**Environment:**
- Node.js 20 (Alpine Linux in Docker)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Fastify 4.28.1 - HTTP server framework for request handling
- pino 8.21.0 - Structured logging library

**Development:**
- TypeScript - Language and type checking
- tsx 4.7.2 - TypeScript execution and watch mode during development

**Build/Compilation:**
- tsc (TypeScript compiler) - Compiles source to ES2022 JavaScript

## Key Dependencies

**Critical:**
- env-schema 5.2.1 - Environment variable validation using JSON schemas

**Logging:**
- pino 8.21.0 - Structured JSON logging
- pino-pretty 11.0.0 - Pretty-printed logs for development

## Testing

**Framework:**
- Vitest 1.5.3 - Unit and integration test runner
- testcontainers 11.11.0 - Docker-based integration testing infrastructure

## Code Quality

**Linting:**
- ESLint 8.57.0 - Code quality and style enforcement
- @typescript-eslint/eslint-plugin 7.8.0 - TypeScript-specific linting
- @typescript-eslint/parser 7.8.0 - TypeScript parser for ESLint
- eslint-config-prettier 9.1.0 - Disables ESLint rules that conflict with Prettier

**Formatting:**
- Prettier 3.2.5 - Code formatter

## Compilation Configuration

**TypeScript Target:**
- ES2022 target with NodeNext module resolution
- Strict mode enabled
- Output directory: `dist/`

**tsconfig.json** (`/c/Users/regsd/IdeaProjects/openai-adapter/tsconfig.json`):
- `target`: ES2022
- `module`: NodeNext
- `strict`: true
- `esModuleInterop`: enabled
- `rootDir`: `src/`
- `outDir`: `dist/`

## Platform & Deployment

**Development:**
- Platform: Node.js 20+
- Runtime: npm/tsx for local development
- Watch mode: `npm run dev` (tsx watch)

**Production:**
- Container: Docker (multi-stage build)
- Base image: `gcr.io/distroless/nodejs20-debian12:nonroot`
- Node binary used: `/nodejs/bin/node`
- Port: 3000
- Environment: production (non-root user)

**Docker Configuration:**
- Multi-stage build: deps → builder → runtime
- Production dependencies only in final image
- Health check: HTTP GET `/health` endpoint every 30s
- Logging: JSON driver with 10MB max size, 3 file rotation

## Scripts & Tooling

**Development:**
- `npm run dev` - Watch mode with tsx
- `npm run build` - TypeScript compilation to dist/
- `npm start` - Run compiled server

**Testing:**
- `npm test` - Run unit tests
- `npm run test:watch` - Watch mode tests
- `npm run test:unit` - Unit tests only
- `npm run test:smoke` - Integration smoke tests
- `npm run test:regression` - Regression tests
- `npm run test:integration` - All integration tests
- `npm run test:integration:local` - Build Docker + run integration tests
- `npm run test:ci` - Full CI pipeline

**Code Quality:**
- `npm run lint` - Run ESLint
- `npm run format` - Format with Prettier

**Docker:**
- `npm run docker:build` - Build Docker image as `openai-adapter:test`
- `npm run docker:clean` - Clean up test containers

## Environment Variables

**Required:**
- `ADAPTER_TARGET_URL` - Target upstream service URL (e.g., https://api.openai.com)
- `MODEL_API_MAPPING_FILE` - Path to model-to-API-type mapping JSON (e.g., /app/config/model-mapping.json)

**Optional:**
- `PORT` (default: 3000) - Server listen port
- `LOG_PRETTY` (default: off) - Set to '1' for pretty-printed logs in development
- `UPSTREAM_TIMEOUT_SECONDS` (default: 60) - Upstream request timeout
- `MAX_CONCURRENT_CONNECTIONS` (default: 1000) - Maximum concurrent connections
- `MAX_REQUEST_SIZE_MB` (default: 10) - Maximum request payload size
- `MAX_JSON_DEPTH` (default: 100) - Maximum JSON nesting depth
- `NODE_ENV` - Set to 'production' for production deployments

## CI/CD Platform

**GitHub Actions** (`.github/workflows/ci.yml`):
- Runs on: `ubuntu-latest`
- Node setup: Node.js 20 with npm caching
- Build pipeline:
  1. Lint (ESLint)
  2. Unit tests (Vitest)
  3. TypeScript build
  4. Docker image build
  5. Integration tests (smoke + regression)
  6. Docker push to GHCR (on main/master push)

---

*Stack analysis: 2026-02-19*
