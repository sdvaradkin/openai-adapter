# Story 1.1: Container Build Pipeline with Hello World

**Epic:** [Epic 1: Deploy & Operate the Adapter](../planning-artifacts/epic-1/epic-1.md)  
**Status:** done

## User Story

**As a** DevOps engineer,  
**I want** a complete container build pipeline with a working Node.js application,  
**So that** I have confidence the build, test, and publish process works end-to-end.

## Acceptance Criteria

**Given** the project repository with TypeScript configuration  
**When** I run `npm run build`  
**Then** TypeScript compiles successfully to JavaScript with strict mode enabled  
**And** the compiled output is in the `dist/` directory

**When** I run the application locally with `node dist/index.js`  
**Then** a simple HTTP server starts on a configured port  
**And** it responds to `GET /health` with 200 OK and `{"status": "ok"}` (basic stub for pipeline verification only)  
**And** it logs startup message to stdout as structured JSON

**When** I run `docker build -t openai-adapter:test .`  
**Then** the multi-stage build completes successfully  
**And** the final image is <250MB  
**And** it uses Node.js 20.x alpine or minimal base  
**And** the container runs as non-root user  
**And** TypeScript and dev dependencies are not in the final image

**When** I run `docker run -p 3000:3000 openai-adapter:test`  
**Then** the container starts and the basic health endpoint responds successfully  
**And** logs are output as structured JSON to stdout

**When** CI runs (GitHub Actions or equivalent)  
**Then** it executes: install dependencies, run linting, run tests, build TypeScript, build Docker image  
**And** tests run using Vitest  
**And** the pipeline publishes the image to a container registry (with appropriate tag)  
**And** the full CI pipeline completes in <5 minutes

**And** the project includes:  
- `package.json` with scripts for build, test, lint, dev  
- `tsconfig.json` with strict mode enabled  
- Fastify 4.x and Pino for logging  
- Basic test setup with Vitest  
- `.dockerignore` to exclude unnecessary files  
- CI configuration file (`.github/workflows/` or equivalent)

## Technical Context

### Architecture Decisions (from Architecture Document)

**Technology Stack:**
- **Runtime:** Node.js 20.x LTS (Alpine base for production image)
- **Language:** TypeScript 5.x with strict mode enabled
- **HTTP Framework:** Fastify 4.x (performance-critical proxy, NFR-P2: <1ms pass-through latency)
- **Logging:** Pino 8.x (structured JSON logging, Fastify's default logger)
- **Testing:** Vitest (fast TypeScript-native testing)
- **Build:** Native TypeScript compiler (tsc) for production builds
- **Development:** tsx for hot-reload during development

**Project Initialization Approach:**
Manual setup with explicit dependency control (not using Fastify CLI starter) to ensure:
- Minimal dependency footprint for 128MB memory constraint (NFR-S1)
- Every dependency serves a specific requirement
- Alignment with performance budgets (NFR-P1, NFR-P2)

**Docker Strategy:**
- Multi-stage build (builder + minimal runtime)
- Alpine-based image for minimal footprint
- Non-root user for security
- Layer caching optimization (package.json copied separately)
- **Production image target:** <250MB (NFR-DP3 adjusted from initial 100MB)

**Reference:** [Architecture Document - Starter Template Evaluation](../planning-artifacts/architecture.md#starter-template-evaluation)

### Key Dependencies for Story 1.1

**Core Dependencies (Runtime):**
```json
{
  "fastify": "^4.0.0",
  "pino": "^8.0.0"
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.0.0",
  "@types/node": "^20.0.0",
  "tsx": "^4.0.0",
  "vitest": "^1.0.0",
  "eslint": "^8.0.0",
  "@typescript-eslint/eslint-plugin": "^7.0.0",
  "@typescript-eslint/parser": "^7.0.0",
  "eslint-config-prettier": "^9.0.0",
  "prettier": "^3.0.0",
  "pino-pretty": "^11.0.0"
}
```

**Note:** Other dependencies (ioredis, env-schema, etc.) will be added in subsequent stories. This story establishes the foundational build pipeline.

### Implementation Requirements

#### 1. Project Structure

Create the following project structure:
```
openai-adapter/
├── src/
│   └── index.ts          # Main server entry point
├── tests/                # Test files organized by type
│   └── health.test.ts    # Basic health endpoint test
├── .github/
│   └── workflows/
│       └── ci.yml        # CI/CD pipeline configuration
├── .dockerignore         # Files to exclude from Docker build
├── .gitignore            # Git exclusions
├── .eslintrc.json        # ESLint configuration
├── .prettierrc           # Prettier configuration
├── Dockerfile            # Multi-stage Docker build
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── vitest.config.ts      # Vitest configuration
```

**Note:** The exact folder layout is a developer decision. The architecture cares about logical separation (server bootstrap, handlers, validation, etc.) rather than prescribing specific folders. The structure above is a starting point.

#### 2. TypeScript Configuration Requirements

**tsconfig.json must include:**
- `"strict": true` - Enable all strict type checking
- `"target": "ES2022"` - Modern JavaScript features
- `"module": "NodeNext"` - Node.js ESM-compatible module emit
- `"moduleResolution": "NodeNext"` - Node.js ESM-compatible resolution
- `"outDir": "./dist"` - Output directory for compiled files
- `"rootDir": "./src"` - Source files location
- `"esModuleInterop": true` - Enable CommonJS/ES module interop

**package.json (recommended for Node.js 20 ESM):**
- `"type": "module"`

**Note:** The architecture recommends ESM; if you choose CJS, adjust TypeScript settings accordingly.

**Reference:** [Architecture Document - Implementation Patterns](../planning-artifacts/architecture.md#implementation-patterns--consistency-rules)

#### 3. Package.json Scripts

**Required scripts:**
- `"build"`: Compile TypeScript to JavaScript (`tsc`)
- `"dev"`: Run development server with hot-reload (`tsx --watch src/index.ts`)
- `"start"`: Run production server (`node dist/index.js`)
- `"test"`: Run tests (`vitest run`)
- `"test:watch"`: Run tests in watch mode (`vitest`)
- `"lint"`: Run ESLint (`eslint src tests`)
- `"format"`: Run Prettier (`prettier --write .`)

#### 4. Basic HTTP Server Implementation

**src/index.ts requirements:**

```typescript
// Basic structure (developer will implement full details)
import Fastify from 'fastify';

// Initialize Fastify with Pino logger
const fastify = Fastify({
  logger: {
    level: 'info',
    // Production: JSON output
    // Development: pretty-print (pino-pretty)
  }
});

// Basic health endpoint (stub for pipeline verification)
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Server startup with structured logging
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info({ action: 'server_started', port });
  } catch (err) {
    fastify.log.error({ action: 'server_start_failed', error: err });
    process.exit(1);
  }
};

start();
```

**Key Requirements:**
- Fastify instance with Pino logger configured
- Basic `/health` endpoint returning `{ status: "ok" }`
- Structured JSON logging for startup events
- Port configurable via `PORT` environment variable (default: 3000)
- Graceful error handling on startup failure

**Note:** This is a minimal "hello world" implementation. Future stories will add proper configuration, validation, routing, etc.

#### 5. Docker Multi-Stage Build

**Dockerfile requirements:**

```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const port=process.env.PORT||3000; require('http').get('http://localhost:'+port+'/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"

# Start application
CMD ["node", "dist/index.js"]
```

**Key Requirements:**
- Multi-stage build (builder + runtime)
- Alpine base image (minimal footprint)
- Non-root user (security best practice)
- Production dependencies only in final image
- Health check included
- Final image <250MB (NFR-DP3)

#### 6. .dockerignore

**Exclude from Docker context:**
```
node_modules
dist
.git
.github
*.md
.env
.env.*
tests
coverage
*.test.ts
.eslintrc.json
.prettierrc
vitest.config.ts
tsconfig.json
```

#### 7. CI/CD Pipeline (GitHub Actions)

**.github/workflows/ci.yml requirements:**

```yaml
name: CI

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Lint
      run: npm run lint
    
    - name: Test
      run: npm test
    
    - name: Build TypeScript
      run: npm run build
    
    - name: Build Docker image
      run: docker build -t openai-adapter:${{ github.sha }} .
    
    - name: Test Docker image
      run: |
        docker run -d -p 3000:3000 --name test-container openai-adapter:${{ github.sha }}
        sleep 5
        curl -f http://localhost:3000/health || exit 1
        docker rm -f test-container

  publish:
    # Optional: publish only on pushes (not on PRs)
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    needs: [build]

    steps:
    - uses: actions/checkout@v4

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Log in to GHCR
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Build and push
      uses: docker/build-push-action@v6
      with:
        context: .
        push: true
        tags: |
          ghcr.io/${{ github.repository_owner }}/openai-adapter:${{ github.sha }}
```

**Key Requirements:**
- Run on push/PR to main/master branches
- Install dependencies, lint, test, build TypeScript
- Build Docker image with commit SHA tag
- Verify Docker image health endpoint works
- Complete pipeline in <5 minutes (NFR-Q3)

**Publishing note:** If you keep the “publish image” acceptance criterion for Story 1.1, standardize on a registry (recommended: GHCR) and ensure repo settings allow `GITHUB_TOKEN` to write packages.

#### 8. Basic Test Setup

**tests/health.test.ts:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

describe('Health Endpoint', () => {
  let fastify: FastifyInstance;

  beforeAll(async () => {
    // Import and setup server (or replicate minimal setup)
    fastify = Fastify({ logger: false });
    fastify.get('/health', async () => ({ status: 'ok' }));
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should return 200 OK with status: ok', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });
});
```

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', 'tests/**', '*.config.*']
    }
  }
});
```

### Naming and Code Patterns (from Architecture)

**File Naming:**
- Use **kebab-case** for all files: `health.test.ts`, `index.ts`
- Test files: `<name>.test.ts`

**Code Naming:**
- Variables/functions: **camelCase** (`const requestId`, `async function startServer()`)
- Classes/interfaces: **PascalCase** (`class Server`, `interface Config`)
- Constants: **SCREAMING_SNAKE_CASE** (`const DEFAULT_PORT = 3000`)

**Module Exports:**
- Use **named exports** (not default exports)
- Use barrel files (index.ts) for convenience exports

**Reference:** [Architecture Document - Naming Patterns](../planning-artifacts/architecture.md#naming-patterns)

### Non-Functional Requirements

**NFR-P3: Startup Time**
- Container startup must complete in <5 seconds
- Measure from container start to `/health` endpoint returning 200 OK
- **Success Criteria:** Cold start <5s, warm restart <2s

**NFR-DP3: Production Image Size**
- Final Docker image must be <250MB
- Multi-stage build eliminates dev dependencies
- Alpine base image for minimal footprint

**NFR-Q3: CI Execution Time**
- Full CI pipeline must complete in <5 minutes (P50)
- Includes: dependencies, lint, test, build, Docker image creation

**Reference:** [PRD - Non-Functional Requirements](../planning-artifacts/prd.md#non-functional-requirements)

## Development Tasks

- [x] Task 1: Initialize Project Structure
  - [x] Create directory structure (src/, tests/, .github/workflows/)
  - [x] Initialize `package.json` with required scripts
  - [x] Install core dependencies (fastify, pino) and dev dependencies (typescript, vitest, etc.)
  - [x] Configure `.gitignore` and `.dockerignore`

- [x] Task 2: Configure TypeScript
  - [x] Create `tsconfig.json` with strict mode and ESM modules
  - [x] Configure output directory (`dist/`)
  - [x] Ensure ES2022 target for modern features

- [x] Task 3: Implement Basic HTTP Server
  - [x] Create `src/index.ts` with Fastify setup
  - [x] Configure Pino logger for structured JSON output
  - [x] Implement `/health` endpoint returning `{ status: "ok" }`
  - [x] Add server startup logging with port information
  - [x] Handle startup errors gracefully

- [x] Task 4: Create Dockerfile
  - [x] Implement multi-stage build (builder + runtime)
  - [x] Use Node.js 20 Alpine images
  - [x] Create non-root user for security
  - [x] Configure health check
  - [x] Verify final image size <250MB

- [x] Task 5: Setup Testing Infrastructure
  - [x] Configure Vitest with vitest.config.ts
  - [x] Create basic health endpoint test
  - [x] Verify tests pass with `npm test`
  - [x] Add test coverage configuration

- [x] Task 6: Configure Linting and Formatting
  - [x] Setup ESLint configuration (.eslintrc.json)
  - [x] Setup Prettier configuration (.prettierrc)
  - [x] Add lint/format scripts to package.json
  - [x] Verify lint passes with `npm run lint`

**Minimal `.eslintrc.json` (TypeScript + Node + Prettier):**
```json
{
  "root": true,
  "env": {
    "node": true,
    "es2022": true
  },
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "ignorePatterns": ["dist/", "node_modules/"],
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
```

**Notes:**
- This config intentionally avoids type-aware lint rules (no `parserOptions.project`) to keep CI fast and simple for Story 1.1.
- If you want type-aware rules later, add `"parserOptions": { "project": ["./tsconfig.json"] }` and switch to `plugin:@typescript-eslint/recommended-type-checked`.

 
- [x] Task 7: Create CI/CD Pipeline
  - [x] Create `.github/workflows/ci.yml`
  - [x] Configure workflow to run on push/PR
  - [x] Include all steps: dependencies, lint, test, build, Docker
  - [x] Verify Docker image health endpoint works
  - [x] Ensure pipeline completes in <5 minutes

- [x] Task 8: Documentation and Validation
  - [x] Add README.md with build instructions
  - [x] Document environment variables (PORT)
  - [x] Verify all acceptance criteria pass
  - [x] Test Docker container locally
  - [x] Validate CI pipeline runs successfully

## Dev Notes

### Architecture Compliance

**Performance Targets:**
- Startup time: <5 seconds (NFR-P3)
- Docker image size: <250MB (NFR-DP3)
- CI execution time: <5 minutes (NFR-Q3)

**Technology Decisions:**
- Node.js 20.x LTS (stability and performance)
- Fastify 4.x (performance-critical for proxy use case)
- Pino 8.x (structured logging, Fastify's default)
- TypeScript strict mode (type safety)
- Vitest (fast TypeScript-native testing)

### Project Structure Guidelines

**Logical Separation (Architecture Principle):**
The architecture cares about logical responsibilities, not prescriptive folder structure:
- Server bootstrap & lifecycle
- HTTP app composition (Fastify plugins, hooks)
- Routing & handlers
- Translation (bidirectional)
- State management
- Validation
- Configuration
- Shared types

**Physical Layout (Developer Decision):**
Choose a folder structure that makes sense for the team. Common patterns:
- Flat structure (all modules at src/ level)
- Feature-based (group by feature/epic)
- Layer-based (handlers/, services/, types/)

**For Story 1.1:**
A simple flat structure works well:
```
src/
  index.ts       # Server entry point
tests/
  health.test.ts # Basic test
```

Future stories will add more modules organically.

### Testing Standards

**Test Coverage Targets (NFR-Q1):**
- Overall: ≥80% unit test coverage
- Critical paths: 100% coverage

**Test Organization:**
- Tests separated from runtime code (tests/ directory)
- Test files mirror source structure
- Use Vitest for TypeScript-native testing

**For Story 1.1:**
- Basic health endpoint test
- Verify HTTP server starts
- Validate structured logging output

### Common Pitfalls to Avoid

1. **❌ Using Default Exports:** Use named exports for consistency
2. **❌ Skipping .dockerignore:** Without it, node_modules bloat Docker context
3. **❌ Running as root in Docker:** Security risk, use non-root user
4. **❌ Including dev dependencies in production image:** Bloats image size
5. **❌ Hardcoding port:** Use environment variable (PORT)
6. **❌ Missing health endpoint:** Required for container orchestration
7. **❌ Not testing Docker image in CI:** Ensures image actually works

### References

**Architecture Decisions:**
- [Starter Template Evaluation](../planning-artifacts/architecture.md#starter-template-evaluation)
- [Implementation Patterns & Consistency Rules](../planning-artifacts/architecture.md#implementation-patterns--consistency-rules)

**Requirements:**
- [PRD - Functional Requirements](../planning-artifacts/prd.md#functional-requirements) (FR28: Docker container)
- [PRD - Non-Functional Requirements](../planning-artifacts/prd.md#non-functional-requirements) (NFR-P3, NFR-DP3, NFR-Q3)

**Epic Context:**
- [Epic 1: Deploy & Operate the Adapter](../planning-artifacts/epic-1/epic-1.md)
- [Story 1.1 Details](../planning-artifacts/epic-1/story-1.1.md)

## Dev Agent Record

### Agent Model Used
GPT-5.2

### Implementation Log
- 2026-02-10: Started Story 1.1 implementation.
- 2026-02-10: Scaffolded Node.js 20 + TypeScript strict project (Fastify + Pino).
- 2026-02-10: Added Vitest health test and made it pass.
- 2026-02-10: Added Docker multi-stage build and validated container health endpoint.
- 2026-02-10: Added ESLint + Prettier config and CI workflow.
- 2026-02-10: Verified GitHub Actions CI run success + timing; publish to GHCR executed.

### Files Created/Modified
- package.json
- package-lock.json
- tsconfig.json
- src/index.ts
- tests/health.test.ts
- vitest.config.ts
- .eslintrc.json
- .prettierrc
- .gitignore
- .dockerignore
- Dockerfile
- .github/workflows/ci.yml
- README.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/implementation-artifacts/1-1-container-build-pipeline-with-hello-world.md

### Testing Results
- ✅ `npm test` (Vitest) passes.
- ✅ `npm run lint` passes.
- ✅ `npm run build` (tsc strict) passes and outputs to `dist/`.
- ✅ `docker build -t openai-adapter:test .` passes.
- ✅ `docker run ...` responds `GET /health` with `{"status":"ok"}` and logs JSON to stdout.
- ✅ Docker non-root confirmed via `process.getuid()`.
- ✅ Image size confirmed via `docker image inspect openai-adapter:test --format "{{.Size}}"` (<250MB).
- ✅ GitHub Actions CI runs succeeded (build + publish): run `21860746801` (1m27s) and run `21860804727` (1m19s) (<5 minutes).
- ✅ GHCR publish step pushed tag `ghcr.io/${{ github.repository_owner }}/openai-adapter:${{ github.sha }}`.

### Completion Notes
- CI pipeline observed on GitHub Actions and completed successfully in <5 minutes.

## File List
- package.json
- package-lock.json
- tsconfig.json
- src/index.ts
- tests/health.test.ts
- vitest.config.ts
- .eslintrc.json
- .prettierrc
- .gitignore
- .dockerignore
- Dockerfile
- .github/workflows/ci.yml
- README.md

## Change Log
- 2026-02-10: Added Node+TypeScript strict scaffold with Fastify health endpoint, Vitest tests, Docker build, lint/format, and CI workflow.

