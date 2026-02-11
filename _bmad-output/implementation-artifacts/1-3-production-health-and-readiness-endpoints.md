# Story 1.3: Production Health and Readiness Endpoints

**Epic:** [Epic 1: Deploy & Operate the Adapter](../planning-artifacts/epic-1/epic-1.md)  
**Status:** done  
**Story ID:** 1-3  
**Created:** 2026-02-11

---

## User Story

**As a** platform engineer,  
**I want** production-grade health and readiness endpoints with proper operational checks,  
**So that** orchestration platforms can route traffic only when the adapter is fully operational and ready.

---

## Acceptance Criteria

### AC-1: Health Endpoint (`/health`) - Process Alive Check

**Given** the adapter HTTP server is running  
**When** I call `GET /health`  
**Then** it returns HTTP 200 OK with response time <50ms  
**And** `Content-Type: application/json`  
**And** the response body is:
```json
{
  "status": "ok"
}
```

**And** the health check only verifies the HTTP server is responding  
**And** the health check does NOT verify configuration, storage, or upstream connectivity  
**And** the endpoint ALWAYS returns 200 OK if the process is alive (even if config invalid or storage down)

---

### AC-2: Readiness Endpoint (`/ready`) - All Checks Pass

**Given** the adapter is fully operational with valid configuration  
**When** I call `GET /ready`  
**Then** it returns HTTP 200 OK with response time <50ms  
**And** `Content-Type: application/json`  
**And** the response body is:
```json
{
  "status": "ready",
  "checks": {
    "config": "ok"
  }
}
```

**And** the readiness check verifies configuration loaded successfully and is valid  
**Note:** Storage connectivity check will be added in Epic 4 when Redis is introduced.

---

### AC-3: Readiness Endpoint (`/ready`) - Configuration Invalid

**Given** configuration failed to load or is invalid  
**When** I call `GET /ready`  
**Then** it returns HTTP 503 Service Unavailable  
**And** `Content-Type: application/json`  
**And** the response body is:
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation failed"
}
```

---

### AC-4: General Requirements

**And** neither endpoint requires authentication or API keys  
**And** neither endpoint logs requests to standard application logs (to avoid noise)  
**And** both endpoints use consistent JSON response format with proper Content-Type header  
**And** both endpoints handle errors gracefully and never crash or hang  
**And** readiness checks are performed synchronously on each request (no caching)  
**And** health endpoint has no side effects and can be called frequently  
**And** both endpoints respond within <50ms (excluding network latency)

---

## Implementation Tasks

### Task 1: Create Health & Readiness Handler Module (AC-1, AC-2, AC-3, AC-4)

**Subtasks:**
- [x] Create `src/handlers/health.ts` module
- [x] Implement `getHealth()` handler function that returns `{ status: 'ok' }` (200)
- [x] Implement `getReadiness()` handler function that:
  - Checks if global config state is valid
  - Returns `{ status: 'ready', checks: { config: 'ok' } }` (200) if valid
  - Returns `{ status: 'not_ready', checks: { config: 'failed' }, message: 'Configuration validation failed' }` (503) if invalid
- [x] Ensure both handlers set `Content-Type: application/json` response header
- [x] Add JSDoc comments documenting K8s liveness/readiness patterns

**Implementation Notes:**
- Health endpoint should be ultra-lightweight (no checks at all, just respond)
- Readiness endpoint checks a global `appConfig` state that was set during startup
- Response format must match schemas exactly (lowercase status, consistent check naming)

---

### Task 2: Integrate Health & Readiness Routes into Fastify App (AC-1, AC-2, AC-3, AC-4)

**Subtasks:**
- [x] Modify `src/index.ts` `buildServer()` function
- [x] Register `GET /health` route using health handler
- [x] Register `GET /ready` route using readiness handler
- [x] Ensure routes are registered BEFORE other routes (health/ready have highest priority)
- [x] Verify both routes respond with correct Content-Type header
- [x] Test routes are not included in standard request logging (use Fastify hook to exclude)

**Implementation Notes:**
- Use Fastify's route registration: `app.get('/health', getHealth)`
- Use Fastify hook `preHandler` to skip logging for these endpoints (keep logs clean)
- Both handlers should be synchronous (readiness doesn't do I/O - just checks state)

---

### Task 3: Implement Global Config State Tracking (AC-2, AC-3)

**Subtasks:**
- [x] Create or modify `src/config/state.ts` to export global config state holder
- [x] Define interface: `type ConfigState = { isValid: boolean; config?: AdapterConfig; error?: Error }`
- [x] Modify `src/index.ts` startup flow:
  - After config is loaded successfully → set `configState.isValid = true`
  - After config validation fails → set `configState.isValid = false; configState.error = error`
  - Before HTTP server starts, readiness handler can check `configState.isValid`
- [x] Ensure config state is initialized before Fastify app starts listening

**Implementation Notes:**
- Use a simple module-level variable or singleton pattern
- Readiness handler reads this state synchronously (no async calls)
- Config state is set once during startup, never changes during runtime (MVP scope)

---

### Task 4: Create Response Type Definitions (AC-1, AC-2, AC-3, AC-4)

**Subtasks:**
- [x] Create `src/handlers/types.ts`
- [x] Define response types:
  ```typescript
  export interface HealthResponse {
    status: 'ok';
  }
  
  export interface ReadinessSuccessResponse {
    status: 'ready';
    checks: {
      config: 'ok';
    };
  }
  
  export interface ReadinessFailureResponse {
    status: 'not_ready';
    checks: {
      config: 'failed';
    };
    message: string;
  }
  
  export type ReadinessResponse = ReadinessSuccessResponse | ReadinessFailureResponse;
  ```
- [x] Use these types in handler functions for type safety

---

### Task 5: Add Fastify Hook to Exclude Health/Readiness from Logs (AC-4)

**Subtasks:**
- [x] In `buildServer()`, add Fastify `onRequest` hook
- [x] Check if request path is `/health` or `/ready`
- [x] If yes, set response skip flag to prevent logging (e.g., Pino's `customLogLevel` or Fastify's `quietLogger`)
- [x] This keeps application logs clean of frequent health check noise

**Implementation Note:**
- Fastify + Pino allow per-request logging control via hooks
- Alternative: use a custom logger level that doesn't output for these paths

---

### Task 6: Create Integration Tests (AC-1, AC-2, AC-3, AC-4)

**Subtasks:**
- [x] Create `tests/integration/health-readiness.test.ts`
- [x] Test AC-1: `GET /health` returns 200 with `{ status: 'ok' }` and correct Content-Type
- [x] Test AC-2: `GET /ready` returns 200 with `{ status: 'ready', checks: { config: 'ok' } }` when config valid
- [x] Test AC-3: `GET /ready` returns 503 with `{ status: 'not_ready', checks: { config: 'failed' }, message: ... }` when config invalid
- [x] Test response time <50ms for both endpoints
- [x] Test response headers include `Content-Type: application/json`
- [x] Test health endpoint always returns 200 even if config is invalid (simulate by temporarily breaking config state)

**Test Setup:**
- Use Vitest + Fastify test utilities
- Create helper to build app with valid/invalid config states
- Mock config state for failure scenarios

---

### Task 7: Document Health & Readiness Behavior (AC-4)

**Subtasks:**
- [x] Add section to `README.md` or deployment guide explaining:
  - Health endpoint (`/health`): liveness probe for Kubernetes
  - Readiness endpoint (`/ready`): readiness probe for Kubernetes and load balancing
  - Health vs readiness distinction (K8s patterns)
  - Example Kubernetes probe configuration
  - Response schema documentation
- [x] Document that health endpoint has no side effects and can be called frequently
- [x] Document that readiness endpoint checks configuration but not external dependencies (in Epic 1)

---

## Technical Context & Implementation Guide

### Architecture Context

**Health vs Readiness Best Practices** [Source: story-1.3.md#Technical Notes]

- **Health (`/health`)**: Answers "Is the process alive?"
  - Minimal check - only verifies HTTP server responds
  - Always returns 200 if process is running
  - Used for liveness probes (restart dead containers)
  - Format: simple `{"status": "ok"}`

- **Readiness (`/ready`)**: Answers "Can this instance accept traffic?"
  - Comprehensive checks - verifies config and dependencies (storage added in Epic 4)
  - Returns 200 when ready, 503 when not ready
  - Used for readiness probes (control load balancer routing)
  - Format: includes status and per-check details for debugging

---

### Critical Developer Guardrails

**1. Response Format Exactness** [Source: epic-1/story-1.3.md]
- Health response MUST be exactly: `{"status": "ok"}`
- Readiness success MUST be exactly: `{"status": "ready", "checks": {"config": "ok"}}`
- Readiness failure MUST be exactly: `{"status": "not_ready", "checks": {"config": "failed"}, "message": "..."}`
- NO additional fields in MVP (response schema designed for future extension but don't anticipate it)
- All status values lowercase

**2. HTTP Status Codes** [Source: epic-1/story-1.3.md]
- Health: ALWAYS 200 (even if config broken - process is alive)
- Readiness success: 200
- Readiness failure: 503 (Service Unavailable - not ready)

**3. Response Timing** [Source: epic-1/story-1.3.md#Performance]
- Both endpoints must respond in <50ms
- This is a K8s readiness probe timeout requirement
- No caching - fresh check on every request for accuracy

**4. Configuration State Management** [Source: epic-1/story-1.3.md#Operational Context]
- Config validation happens in Story 1.2 startup flow
- Story 1.3 readiness handler just reads the config validity flag (set in Story 1.2)
- Config state is immutable during runtime (no dynamic reload in MVP)

**5. Logging Exclusion** [Source: epic-1/story-1.3.md#General Requirements]
- Health and readiness requests MUST NOT appear in standard application logs
- These endpoints are called frequently by orchestration platforms (every few seconds)
- Logging them would flood the log output
- Use Fastify hooks or Pino configuration to suppress logging for `/health` and `/ready`

---

### Previous Story Context: Story 1.2 Integration

**From Story 1.2: Environment Configuration & Validation** [Source: 1-2-environment-configuration-validation.md]

Story 1.2 established:
- Config loading via `loadConfiguration()` function in `src/config/loader.ts`
- Config types in `src/config/types.ts`: `AdapterConfig` with `targetUrl` and `modelMapping`
- Validation in `src/config/validator.ts`
- Server startup in `src/index.ts` with `buildServer()` and `startServer()`

**Integration Point for Story 1.3:**
- Story 1.2 loads config before calling `app.listen()`
- Story 1.3 needs to access config validity state from Story 1.2's startup flow
- Both stories modify `src/index.ts` - coordinate timing:
  1. Story 1.2 loads and validates config
  2. Story 1.2 sets global `configState` to `isValid = true`
  3. Story 1.3 reads `configState.isValid` in readiness handler
  4. Story 1.2 calls `app.listen()` (server starts with config loaded)

---

### File Structure & Locations

**Files to Create:**
- `src/handlers/health.ts` - Health and readiness handlers
- `src/handlers/types.ts` - Response type definitions
- `src/config/state.ts` - Global config state holder (may already exist from Story 1.2)
- `tests/integration/health-readiness.test.ts` - Integration tests

**Files to Modify:**
- `src/index.ts` - Register routes, set config state, exclude logging
- `README.md` - Document health/readiness endpoints and K8s patterns

---

### Project Context & Patterns

**From Story 1.2 Implementation:**
- Project uses Fastify 4.x for HTTP framework
- Pino 8.x for structured logging
- TypeScript with strict mode
- Vitest for testing
- Route handlers are functions that take (request, reply) parameters
- Config is loaded and validated before server starts

**Naming Conventions (from Story 1.2):**
- Handler functions: `get<Feature>()` (e.g., `getHealth`)
- Type files: `types.ts`
- State/config modules: descriptive names (e.g., `state.ts`)
- Response interfaces: `<Feature>Response` (e.g., `HealthResponse`)

**Error Handling Patterns (from Story 1.2):**
- Startup errors logged with structured JSON
- Process exits with code 1 on failures
- Detailed error messages for troubleshooting

---

### Performance & Operational Requirements

**NFR Coverage from Epic 1** [Source: epics.md#Epic 1]
- NFR-O1: Health Check Responsiveness — `/health` responds in <50ms ✓
- NFR-O2: Readiness Check Accuracy — `/ready` accurate for config accessibility ✓

**Startup & Health Checks:**
- Both endpoints must be available immediately after server starts listening
- No initialization delay
- Synchronous checks only (no async I/O)

---

### Testing Strategy

**Unit Tests (Vitest):**
- Test handler functions directly with mock Fastify context
- Verify correct status codes and response bodies
- Test response format exactness

**Integration Tests (Vitest):**
- Start actual Fastify server with test config
- Make HTTP requests to `/health` and `/ready`
- Verify correct responses and timing (<50ms)
- Test config state transitions (valid → invalid)

**Test Files Location:**
- `tests/integration/health-readiness.test.ts`
- Reference: Story 1.2 created `tests/` structure
- Use existing test setup from Story 1.1/1.2

---

### References & Source Context

**Story Definition & Acceptance Criteria:**
- [Source: epic-1/story-1.3.md](../planning-artifacts/epic-1/story-1.3.md) - Complete user story and AC

**Architecture Decisions:**
- [Source: architecture.md#Starter Template Evaluation](../planning-artifacts/architecture.md) - Technology stack: Fastify 4.x, Pino 8.x, Node.js 20.x
- [Source: architecture.md#Health & Observability](../planning-artifacts/architecture.md) - Health endpoint pattern from FR31-FR32

**Previous Story (1.2) Implementation:**
- [Source: 1-2-environment-configuration-validation.md](1-2-environment-configuration-validation.md) - Config loading patterns, startup flow, directory structure

**Epic 1 Context:**
- [Source: epics.md#Epic 1: Deploy & Operate the Adapter](../planning-artifacts/epics.md) - Epic overview and FR/NFR coverage

---

## Dev Notes

### Architecture Patterns

This story implements two complementary operational patterns:

1. **Liveness Probe Pattern** (`/health`)
   - Ultra-lightweight check
   - Used by container orchestration to restart dead processes
   - Must always return 200 when process is alive

2. **Readiness Probe Pattern** (`/ready`)
   - Comprehensive dependency check (config in MVP, +storage in Epic 4)
   - Used by load balancers and service meshes
   - Returns 503 when dependencies fail
   - Enables graceful degradation without killing container

### Key Implementation Details

**1. Config State Must Be Set by Story 1.2**
- Story 1.2's `startServer()` function must set a global `configState` after loading config
- This state is then read (synchronously) by readiness handler
- Coordinate timing: Story 1.2 sets state, then calls `app.listen()`

**2. Handlers Must Be Synchronous**
- No async I/O in handlers
- Readiness checks only verify in-memory state (config validity flag)
- Storage checks will be added in Epic 4 (and can be async if needed)

**3. Response Format Exactness Matters**
- Orchestration platforms parse these responses
- Schema must match exactly: lowercase status, specific check names
- Don't add extra fields in MVP

**4. Logging Exclusion Critical for Operations**
- Health checks happen every few seconds from K8s
- Without logging exclusion, logs become noise
- Use Fastify hooks to skip logging for these paths

### Common Developer Mistakes to Avoid

❌ **MISTAKE 1:** Making readiness check async and waiting for storage connectivity  
✓ **FIX:** In Epic 1, readiness only checks config (synchronous). Storage async check comes in Epic 4.

❌ **MISTAKE 2:** Adding extra fields to response (e.g., `timestamp`, `uptime`, `version`)  
✓ **FIX:** Response format is exactly as specified. No additional fields in MVP.

❌ **MISTAKE 3:** Caching readiness result (to avoid checking every request)  
✓ **FIX:** Spec says "synchronously on each request" - no caching allowed. Checks are fast.

❌ **MISTAKE 4:** Making health endpoint check config or storage  
✓ **FIX:** Health only checks if process is alive. Never check dependencies.

❌ **MISTAKE 5:** Logging health/readiness requests in application logs  
✓ **FIX:** These should not appear in standard logs. Use Fastify hooks to exclude them.

---

## File & Component Impact Summary

### Files to Create
- `src/handlers/health.ts` — Health and readiness endpoint handlers
- `src/handlers/types.ts` — Response type definitions
- `src/config/state.ts` — Global config state holder
- `tests/integration/health-readiness.test.ts` — Integration tests

### Files to Modify
- `src/index.ts` — Register routes, set config state, exclude from logging
- `README.md` — Document endpoints and K8s patterns

### Dependencies
- No new dependencies required (uses existing Fastify, Pino)

### Testing
- Vitest integration tests for both endpoints
- Response format validation
- Response timing validation (<50ms)
- Config state transition scenarios

---

## Dev Agent Record

### Agent Model Used
Claude Haiku 4.5

### Implementation Summary

✅ **All tasks and acceptance criteria successfully implemented and tested**

**Tasks Completed:**
1. Created `src/handlers/health.ts` with `getHealth()` and `getReadiness()` handlers
2. Integrated routes into Fastify app with logging exclusion hook
3. Created `src/config/state.ts` for global config state management
4. Created `src/handlers/types.ts` with TypeScript response type definitions
5. Added Fastify hook to exclude `/health` and `/ready` from request logs
6. Created comprehensive integration test suite with 21 test cases
7. Updated README.md with Kubernetes configuration examples and endpoint documentation

**Test Results:**
- 45 total tests passing (21 new integration tests for health/readiness)
- All acceptance criteria verified by automated tests
- Response time validation confirms <50ms requirement
- Config state transitions tested (valid → invalid → valid)
- Logging exclusion verified

**Implementation Details:**
- Health endpoint: Always returns 200 if process alive (no checks)
- Readiness endpoint: Returns 200 when config valid, 503 when invalid
- Config state initialized in startup flow (Story 1.2 integration)
- Response format exactly matches AC specifications
- Both endpoints excluded from standard application logs

**Files Created:**
- `src/handlers/health.ts` — Handler implementations with JSDoc
- `src/handlers/types.ts` — TypeScript type definitions
- `src/config/state.ts` — Global state management (get/set/reset)
- `tests/integration/health-readiness.test.ts` — 21 integration tests

**Files Modified:**
- `src/index.ts` — Route registration, config state setup, logging hook
- `README.md` — Operational endpoints documentation with K8s examples

**Key Design Decisions:**
1. Health endpoint has no checks (ultra-lightweight for frequent polling)
2. Readiness checks only config validity in MVP (storage checks deferred to Epic 4)
3. Used Fastify `addHook` with `skipLogging` flag for log exclusion
4. Config state is immutable after startup (no dynamic reload in MVP)
5. Synchronous handlers with no async I/O or external dependencies

### Completion Notes
- Story implemented with strict adherence to specification
- All 7 tasks completed with subtask-level accuracy
- All AC verified by automated tests (45 passing)
- Integration point with Story 1.2 (config state) properly coordinated
- Performance requirements validated (<50ms response time)
- No dependencies added beyond existing tech stack

### Related Stories
- **Previous:** [1-2-environment-configuration-validation.md](1-2-environment-configuration-validation.md) (config setup)
- **Next:** [1-4-timeout-and-concurrency-configuration.md](1-4-timeout-and-concurrency-configuration.md) (operational parameters)

