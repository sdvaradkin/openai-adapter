# Story 1.1: Container Build Pipeline with Hello World

**Epic:** [Epic 1: Deploy & Operate the Adapter](epic-1.md)

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
**And** the final image is <150MB  
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

## Technical Notes

This story establishes the foundational build and deployment pipeline. The `/health` endpoint is a simple stub to verify the HTTP server works - it will be enhanced with proper operational checks in Story 1.3.

## Requirements Fulfilled

- FR28 (partial): Docker container deployment
- Pipeline foundation for all subsequent stories
