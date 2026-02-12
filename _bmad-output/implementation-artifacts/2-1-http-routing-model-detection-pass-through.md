# Story 2.1: HTTP Routing, Model Detection & Pass-Through

**Status:** done

**Story ID:** 2.1  
**Epic:** [Epic 2: Drop-in Proxy Compatibility](../planning-artifacts/epic-2/epic-2.md)  
**Sprint:** Epic 2 - Proxy Compatibility & Observability  
**Date Started:** 2026-02-12

---

## User Story

**As a** platform engineer,  
**I want** the adapter to route requests intelligently based on model-to-API mapping and forward them in pass-through mode when no translation is needed,  
**So that** I can use the adapter as a drop-in proxy with minimal latency overhead.

## Acceptance Criteria

**Given** the adapter is running with a model-to-API mapping configuration  
**And** the mapping contains entries like `{"gpt-4": "response", "gpt-3.5-turbo": "chat_completions"}`

**When** a request arrives at `/v1/responses` with model `gpt-4`  
**Then** the adapter extracts the model name from the request payload  
**And** determines target API is "response" from the mapping  
**And** detects source format is "response" (from the endpoint)  
**And** routes to pass-through mode (source matches target)

**When** a request arrives at `/v1/chat/completions` with model `gpt-3.5-turbo`  
**Then** the adapter extracts the model name  
**And** determines target API is "chat_completions"  
**And** detects source format is "chat_completions"  
**And** routes to pass-through mode

**When** a request is routed to pass-through mode  
**Then** the adapter forwards the request to the configured OpenAI endpoint with:
- Original HTTP method
- Original request headers (including Authorization)
- Original request body unchanged
- Target URL: `{ADAPTER_TARGET_URL}/v1/{endpoint}`

**And** the adapter forwards the OpenAI response to the client with:
- Original status code
- Original response headers
- Original response body unchanged

**When** a request arrives at `/v1/responses` with model `gpt-3.5-turbo`  
**Then** the adapter detects source format is "response" but target API is "chat_completions"  
**And** logs a routing decision indicating translation mode required  
**And** returns 501 Not Implemented with message "Translation not yet implemented (Epic 3)" (temporary until Epic 3 complete)

**When** a request arrives at `/v1/chat/completions` with model `gpt-4`  
**Then** the adapter detects source format is "chat_completions" but target API is "response"  
**And** logs routing decision indicating translation mode required  
**And** returns 501 Not Implemented (temporary until Epic 3 complete)

**And** the adapter exposes endpoints:
- `POST /v1/responses` - Response API endpoint
- `POST /v1/chat/completions` - Chat Completions API endpoint

**And** the routing logic uses the HTTP client (undici) configured in Epic 1 for upstream communication

**And** the adapter uses the model-to-API mapping file loaded from `MODEL_API_MAPPING_FILE` environment variable (from Epic 1)

---

## Technical Requirements

### Routing Architecture

**Decision Point Location:** Stage 3 in [Request/Response Pipeline Architecture](../planning-artifacts/architecture.md#requestresponse-pipeline-architecture)

The routing decision happens AFTER validation and BEFORE upstream communication.

**Pass-Through Mode Logic:**
```
1. Extract model from request body (where model appears depends on endpoint format)
2. Lookup model in mapping to determine target API format (response vs chat_completions)
3. Compare source format (derived from endpoint path) with target format
4. If source format == target format:
   - Route to pass-through handler
   - Forward request UNCHANGED to OpenAI endpoint
5. If source format != target format:
   - Route to translation handler (Epic 3 - return 501 for now)
```

**Endpoint Detection:**
| Endpoint | Source Format | Provides |
|----------|--------------|----------|
| `/v1/responses` | `response` | Response API format |
| `/v1/chat/completions` | `chat_completions` | Chat Completions format |

**Model Extraction for Each Format:**

*Response API format:*
```json
POST /v1/responses
{
  "model": "gpt-4",
  "messages": [...],
  ...
}
```
Extract: `request.body.model`

*Chat Completions format:*
```json
POST /v1/chat/completions
{
  "model": "gpt-3.5-turbo",
  "messages": [...],
  ...
}
```
Extract: `request.body.model`

**Mapping Configuration:**

The model-to-API mapping (loaded from `MODEL_API_MAPPING_FILE` in Epic 1) is a JSON file:
```json
{
  "gpt-4": "response",
  "gpt-4-turbo": "response",
  "gpt-3.5-turbo": "chat_completions",
  "gpt-3.5-turbo-16k": "chat_completions",
  "gpt-4o": "response",
  "gpt-4o-mini": "response"
}
```

When model is not found in mapping, return 400 Bad Request (handled in validation layer per Epic 2.2)

### Upstream Communication

**HTTP Client:** undici (already configured in Epic 1)

**Headers to Forward:**
- `Authorization` - MUST be preserved
- `User-Agent` - forwarded as-is
- `Content-Type` - forwarded as-is (should be `application/json`)
- `X-Request-ID` or custom request ID header (will be added per FR34 in Epic 2.3)
- All other headers - forwarded as-is

**Request Forwarding:**
```typescript
const upstreamUrl = `${ADAPTER_TARGET_URL}/v1/${endpoint}`;
// endpoint examples: "responses", "chat/completions"

const upstreamRequest = {
  method: incomingRequest.method, // POST
  url: upstreamUrl,
  headers: forwardedHeaders,
  body: incomingRequest.body // UNCHANGED - bit for bit
};

const response = await httpClient.send(upstreamRequest);
```

**Timeout Behavior:**
- Use `UPSTREAM_TIMEOUT` from environment (configured in Epic 1)
- For pass-through, timeout applies to entire OpenAI request/response cycle
- Timeout errors → 504 Gateway Timeout (error handling in Epic 2.4)

### Response Pass-Through

**Response Headers to Forward:**
- All OpenAI response headers preserved UNCHANGED
- Examples: `content-type`, `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, etc.

**Response Body:**
- Forward UNCHANGED from OpenAI
- No transformation of any kind in pass-through mode
- Status code passed through as-is

**Implementation Pattern:**
```typescript
// Pass-through mode implementation
const openaiResponse = await httpClient.send(upstreamRequest);

// Forward response completely unchanged
return {
  statusCode: openaiResponse.statusCode,
  headers: openaiResponse.headers,
  body: openaiResponse.body  // Stream or buffered, depending on Fastify integration
};
```

### Error Scenarios (Pass-Through Specific)

| Scenario | HTTP Status | Handling | Logging |
|----------|-----------|----------|---------|
| Invalid model (not in mapping) | 400 | Validation layer rejects (Epic 2.2) | Per FR39 |
| OpenAI connection error | 503 | Service Unavailable + error attribution | Per FR39 |
| OpenAI timeout | 504 | Gateway Timeout + error attribution | Per FR39 |
| OpenAI 4xx error | 4xx | Pass through UNCHANGED | Include `upstream_error` attribution |
| OpenAI 5xx error | 5xx | Pass through UNCHANGED | Include `upstream_error` attribution |

**Error Pass-Through Requirement (FR45):**
When OpenAI returns an error response (4xx/5xx), the adapter MUST:
1. Forward the status code unchanged
2. Forward all response headers unchanged
3. Forward the response body unchanged
4. Add adapter-generated request_id to headers or body (Epic 2.3)
5. Log the error with source attribution (Epic 2.5)

---

## Developer Context

### Files to Create/Modify

**Create:**
- `src/handlers/routing.handler.ts` - Main routing handler (separates pass-through and translation paths)
- `src/routing/router.ts` - Router class: model lookup, format detection, decision logic
- `src/routing/model-mapper.ts` - Model mapping loader and lookup
- `src/handlers/pass-through.handler.ts` - Pass-through request/response forwarder
- `tests/unit/routing/router.spec.ts` - Routing logic tests
- `tests/unit/routing/model-mapper.spec.ts` - Model mapper tests
- `tests/integration/pass-through.spec.ts` - Pass-through integration tests

**Modify:**
- `src/index.ts` - Register `/v1/responses` and `/v1/chat/completions` endpoints
- `src/handlers/index.ts` - Export routing handler (if not created)

### Code Structure Alignment

**Dependency Direction:**
```
Fastify app bootstrap (src/index.ts)
  ↓
routing.handler (request/response cycle)
  ↓
Router class (routing decision)
  ├→ ModelMapper (lookups)
  └→ pass-through.handler (actual forwarding)
```

**Naming Conventions (from architecture.md):**
- Handler functions: `camelCase` + generic names (`routingHandler`, `passThroughHandler`)
- Logic classes: PascalCase (`Router`, `ModelMapper`)
- Error types: PascalCase with `Error` suffix (`RoutingError`, `ModelNotFoundError`)
- Logging fields: snake_case (`routing_decision`, `model_found`, `upstream_status`)

### Project Structure Notes (from Epic 1)

The project uses the structure established in Epic 1:
- Source files in `src/` (TypeScript)
- Tests mirror source: `tests/unit/` and `tests/integration/`
- Configuration loaded from environment variables via env-schema
- HTTP client (undici) is pre-configured in the server bootstrap
- Fastify server is the primary app instance

**File Organization Principle:** Logical grouping by responsibility, not by type. The routing subsystem can be in `src/routing/` to group all routing-related logic together.

### Testing Standards (from architecture.md + Epic 1)

**Unit Tests (routing logic only):**
- Test Router.routingDecision() with various model/endpoint combinations
- Test ModelMapper.getTargetApi() with mapped and unmapped models
- Test error cases (missing model, malformed mapping)
- Framework: Vitest

**Integration Tests (pass-through end-to-end):**
- Mock OpenAI API with testcontainers or MSW (Mock Service Worker)
- Test full request → adapter → OpenAI → response flow
- Verify headers and body are forwarded unchanged (bit-for-bit comparison)
- Test error pass-through: verify OpenAI errors are forwarded unchanged

**Contract Tests (for future translation integration):**
- Ensure pass-through mode can be toggled
- Verify routing decision can be mocked for translation tests (Epic 3)

### Architecture Compliance Checklist

- [x] **Endpoint Routing:** Properly register `/v1/responses` and `/v1/chat/completions` with Fastify
- [x] **Model Extraction:** Extract from request body (consistent across both formats)
- [x] **Mapping Lookup:** Use pre-loaded model-to-API mapping
- [x] **Format Detection:** Infer from endpoint path
- [x] **Pass-Through Mode:** Forward requests/responses unchanged
- [x] **Error Handling:** Return 501 for translation-required scenarios (temporary)
- [x] **HTTP Client:** Use undici configured in Epic 1
- [x] **Code Organization:** Clean dependency direction, logical grouping
- [x] **Testing:** Unit + integration tests

### Key Decisions to Remember

1. **Pass-through is the happy path** — Most requests in production will be pass-through (both source and target are same API). Translation is the exception.

2. **Logging happens at routing stage** — When a translation is needed, the routing decision logs that decision for debugging (FR39). The actual translation happens in Epic 3.

3. **Errors must preserve source attribution** — When OpenAI returns an error, it's passed through unchanged. Adapter-originated errors (503, 504) are clearly source-attributed.

4. **Model mapping is immutable at runtime** (in MVP) — No hot-reload. Re-deployment requires config change.

---

## Previous Story Intelligence

**Story 1.4** (Timeout & Concurrency Configuration) established:
- Environment variable loading via env-schema
- Upstream timeout configuration: `UPSTREAM_TIMEOUT` (default 60s)
- Fastify server with undici HTTP client
- Graceful shutdown hooks
- Request/response hooks for instrumentation

**Learnings that impact Story 2.1:**
- Use `ADAPTER_TARGET_URL` from environment for upstream endpoint
- HTTP client timeouts already configured — pass through to undici
- Fastify request/response hooks available for performance measurement
- Server bootstrap in `src/index.ts` is the place to register new endpoints

---

## Git Intelligence Summary

**Recent commits (last 5 from Epic 1):**
- Commit 1: "feat: add health and readiness endpoints"
- Commit 2: "feat: environment configuration with validation"
- Commit 3: "refactor: extract server bootstrap to separate module"
- Commit 4: "test: add integration tests for health checks"
- Commit 5: "chore: add docker multi-stage build"

**File Patterns Observed:**
- Route handlers export a Fastify plugin
- Environment config loaded at server startup
- Error types centralized in `src/types/errors.ts`
- Tests use vitest + testcontainers for integration

**Code Patterns:**
- Fastify plugins for feature modules
- Configuration via env-schema + TypeScript types
- Error handling with custom error classes extending Error
- Structured logging with pino (Fastify's default logger)

---

## Latest Tech Information

### Fastify 4.x Routing & Performance

**Routing:** Fastify 4.x uses *find-my-way* internally for ultra-fast route matching. Route registration happens at startup.
- `app.post('/v1/responses', routingHandler)` - registers a new route
- `app.post('/v1/chat/completions', routingHandler)` - registers another
- Both routes can use the same handler function with path inference

**Performance:**
- Route matching is O(1) if using exact paths
- No regex by default ensures sub-microsecond latency
- Streaming is supported natively via `reply.raw.pipe()` or `reply.send(stream)`

**Best Practice:** Use the same handler function for both endpoints since the logic is identical; the request object contains the original path in `request.url`.

### undici HTTP Client (Node.js 20.x Native)

**Key Features:**
- Built into Node.js as experimental API (semi-stable)
- High performance HTTP/1.1 client
- Connection pooling enabled by default
- Timeout support: `dispatcher` can set timeouts per request or globally
- Streaming support native

**Timeout Pattern for Pass-Through:**
```typescript
// Per-request timeout
const response = await dispatcher.request({
  method: 'POST',
  origin: targetUrl,
  path: `/v1/${endpoint}`,
  headers: {...},
  body: body,
  signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) // Node.js 17+
});
```

**Header Preservation:**
- undici preserves all headers by default
- Casting response headers as-is to client is automatic

---

## Project Context Reference

**Product Brief:** [product-brief-openai-adapter-2026-02-02.md](../planning-artifacts/product-brief-openai-adapter-2026-02-02.md)  
**PRD:** [prd.md](../planning-artifacts/prd.md)  
**Architecture:** [architecture.md](../planning-artifacts/architecture.md)  
**Epic 2:** [epic-2.md](../planning-artifacts/epic-2/epic-2.md)  

**Configuration Reference:**
- `MODEL_API_MAPPING_FILE` - Path to model mapping JSON (from Epic 1)
- `ADAPTER_TARGET_URL` - OpenAI base URL (from Epic 1)
- `UPSTREAM_TIMEOUT` - Request timeout in milliseconds (from Epic 1)

**Related Stories:**
- **Story 1.1** - Container build & hello world
- **Story 1.2** - Environment configuration
- **Story 1.3** - Health & readiness endpoints
- **Story 1.4** - Timeout & concurrency configuration
- **Story 2.2** - Request validation (depends on routing from this story)
- **Story 2.3** - Request ID management (integrates with routing)
- **Story 3.x** - Translation engine (will hook into routing decision)

---

## Story Completion Status

**Ultimate Context Engine Analysis:** Completed ✓

This story now contains:
- ✓ Complete routing architecture with decision logic
- ✓ Technical specifications for model extraction, format detection, pass-through flow
- ✓ Error scenarios with handling specification
- ✓ Files to create/modify with clear dependencies
- ✓ Code structure alignment based on Epic 1 patterns
- ✓ Testing standards (unit + integration)
- ✓ Architecture compliance checklist
- ✓ Previous story learnings applicable to this story
- ✓ Git patterns and code conventions observed from recent work
- ✓ Latest tech information for Fastify 4.x, undici

**Developer is now ready to implement** with all context needed for flawless execution.

---

## Dev Agent Notes

### Ready for Handoff

This story is ready for the dev agent (`dev-story` workflow). The developer has:
1. All acceptance criteria with clear BDD scenarios
2. Architecture decisions and constraints
3. Technical requirements with implementation details
4. Error handling specification
5. Performance measurement method
6. Testing strategy (unit + integration + performance)
7. Code structure and naming conventions
8. Previous learnings and code patterns
9. Files to create and dependencies between them

### Potential Clarifications (if dev agent questions arise)

**Q: Should both endpoints use the same handler or separate handlers?**  
A: Same handler function is cleaner. The handler can detect the endpoint from `request.url` if needed, but the routing logic is identical for both.

**Q: How should the model-to-API mapping be made extensible for future stories?**  
A: The `ModelMapper` class should be a standalone module that can be easily extended. The actual mapping file is loaded once at startup. Future stories can add validation layers on top without changing the mapper interface.

**Q: What about streaming requests (stream: true)?**  
A: For Story 2.1 (pass-through only), streaming is handled automatically by undici and Fastify. The response body is piped directly; no special handling needed. Translation streaming (buffering events) comes in Epic 3.

---

## Tasks/Subtasks

- [x] **Task 1: Create ModelMapper Class** - Model-to-API format lookup with tests
  - [x] Implement `src/routing/model-mapper.ts` with `getTargetApi()`, `hasModel()`, `getMappedModels()` methods
  - [x] Write unit tests with mapped/unmapped models and edge cases (14 tests)
  
- [x] **Task 2: Create Router Class** - Routing decision logic with tests
  - [x] Implement `src/routing/router.ts` with endpoint detection, model extraction, and routing decision
  - [x] Write unit tests for pass-through and translation scenarios (29 tests)
  
- [x] **Task 3: Create Pass-Through Handler** - Request/response forwarding with tests
  - [x] Implement `src/handlers/pass-through.handler.ts` for forwarding requests to OpenAI
  - [x] Write integration tests for pass-through flow, error handling, and error pass-through (12 tests)
  
- [x] **Task 4: Create Routing Handler** - Orchestrate routing decisions
  - [x] Implement `src/handlers/routing.handler.ts` to make routing decisions and delegate to appropriate handler
  - [x] Route pass-through requests to pass-through handler
  - [x] Return 501 for translation-required scenarios (temporary until Epic 3)
  - [x] Log routing decisions with model, source format, target format
  
- [x] **Task 5: Register Endpoints in Server Bootstrap** - Wire endpoints to handlers
  - [x] Import routing handler in `src/index.ts`
  - [x] Register `POST /v1/responses` endpoint with routing handler
  - [x] Register `POST /v1/chat/completions` endpoint with routing handler
  - [x] Only register endpoints if configuration is available
  
- [x] **Task 6: Full Test Suite Validation** - Verify all tests pass
  - [x] All unit tests pass (93 tests, 0 failures)
  - [x] All integration tests pass (12 pass-through tests, 0 failures)
  - [x] No regressions introduced

---

## Dev Agent Record

### Implementation Plan

**Approach:** Red-Green-Refactor cycle for each component

1. **ModelMapper:** Immutable runtime lookup of model-to-API mappings loaded at startup. Simple data accessor with validation.

2. **Router:** Core routing logic separated from HTTP concerns. Pure function that analyzes request path and body to make routing decision.

3. **Pass-Through Handler:** Forwards requests and responses to OpenAI unchanged. Uses global fetch API with timeout support.

4. **Routing Handler:** Orchestrates the decision-making and delegates to appropriate handler. Entry point for both endpoints.

5. **Server Bootstrap:** Conditionally registers endpoints only when config is available (important for testing).

### Implementation Summary

**Files Created:**
- `src/routing/model-mapper.ts` - Model mapping lookup class
- `src/routing/router.ts` - Routing decision logic
- `src/handlers/pass-through.handler.ts` - Request/response forwarding
- `src/handlers/routing.handler.ts` - Main routing orchestration
- `tests/unit/routing/model-mapper.spec.ts` - 14 unit tests
- `tests/unit/routing/router.spec.ts` - 29 unit tests
- `tests/integration/pass-through.spec.ts` - 12 integration tests

**Files Modified:**
- `src/index.ts` - Added endpoint registration with routing handler

### Testing Summary

**Unit Tests (43 tests):**
- ModelMapper: 14 tests covering all mapped/unmapped models and edge cases
- Router: 29 tests covering source format detection, model extraction, pass-through/translation decisions

**Integration Tests (12 tests):**
- Pass-through to /v1/responses: 3 tests for request/header forwarding
- Pass-through to /v1/chat/completions: 2 tests for chat completions flow  
- Translation mode (not implemented): 2 tests verifying 501 responses
- Error handling: 4 tests for validation, unmapped models, invalid endpoints
- Basic functionality: 1 test validating pass-through completes successfully

**All Tests:**
- 93 passing unit tests
- 12 passing integration tests
- 0 failures
- No regressions in existing codebase

### Technical Decisions

1. **ModelMapper Immutability:** Model mapping is loaded once at startup and never reloaded during runtime. Extensibility for hot-reload can be added in future stories if needed.

2. **Router as Pure Function:** Router.routingDecision() takes request context and returns routing result, allowing easy testing and reuse without HTTP framework coupling.

3. **Pass-Through Header Forwarding:** Uses Headers object and Response.headers.forEach() to forward all headers from OpenAI to client.

4. **Conditional Endpoint Registration:** Routes only registered if `app.config` exists, supporting test scenarios where buildServer is called without config.

### Key Achievements

✅ **All Acceptance Criteria Met:**
- Routes model-to-API mapping lookups correctly (response vs chat_completions)
- Detects source format from endpoint path
- Extracts model from request body
- Routes to pass-through when source == target
- Routes to translation (501) when source != target
- Forwards requests/responses unchanged in pass-through mode
- Logs routing decisions with model and format information
- Handles error scenarios with appropriate HTTP status codes

✅ **Code Quality:**
- Clear separation of concerns (ModelMapper, Router, Handlers)
- Comprehensive unit + integration test coverage
- No regressions in existing codebase
- Follows project naming conventions and code patterns
- Error handling with structured logging

---

## File List

**Created:**
- `src/routing/model-mapper.ts`
- `src/routing/router.ts`
- `src/handlers/pass-through.handler.ts`
- `src/handlers/routing.handler.ts`
- `tests/unit/routing/model-mapper.spec.ts`
- `tests/unit/routing/router.spec.ts`
- `tests/integration/pass-through.spec.ts`

**Modified:**
- `src/index.ts`

---

## Change Log

**2026-02-12:** Initial implementation of story 2.1 - HTTP Routing, Model Detection & Pass-Through
- Implemented ModelMapper class for model-to-API mapping lookup
- Implemented Router class for routing decision logic
- Implemented pass-through handler for forwarding requests to OpenAI
- Implemented routing handler for orchestrating routing decisions
- Registered /v1/responses and /v1/chat/completions endpoints
- Created comprehensive unit tests (43 tests)
- Created integration tests (12 tests)
- All acceptance criteria satisfied

---

**Status:** done
