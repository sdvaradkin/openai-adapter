---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7]
inputDocuments: 
  - product-brief-openai-adapter-2026-02-02.md
  - prd.md
workflowType: 'architecture'
project_name: 'openai-adapter'
user_name: 'Siarhei'
date: '2026-02-05'
---

# Architecture Decision Document - openai-adapter

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
The openai-adapter has 72 functional requirements spanning six key areas:

1. **API Translation & Routing (FR1-FR14)**: Bidirectional translation between OpenAI's Response API and Chat Completions API, with pass-through mode when formats match. Includes payload size limits (10MB) and JSON depth validation (100 levels).

2. **Conversation State Management (FR15-FR20)**: Stateful conversation tracking for Chat Completions → Response API flows. Generates adapter request IDs for tracing and (when needed) Response API `response_id` values for compatibility, manages multi-turn conversations, persists state across requests.

3. **Configuration & Deployment (FR21-FR30)**: Environment variable-based configuration with startup validation. Model-to-API mapping, target URL validation, timeout configuration, concurrent connection limits.

4. **Health & Observability (FR31-FR42)**: Health/readiness endpoints, adapter request ID generation and propagation, duplicate detection, structured JSON logging, routing decision visibility.

5. **Error Handling & Reliability (FR43-FR54)**: Transparent OpenAI error pass-through, specific adapter errors (400/422/500/503/504), error source attribution, configurable upstream timeouts.

6. **Feature Translation Support (FR55-FR66)**: Feature detection + compatibility validation for all recognized feature types, with **full translation in MVP** for text generation, vision, structured outputs, function calling, and web search; **explicit 422 Unsupported** for deferred features (file search, computer use, code interpreter, MCP, image generation, reasoning summaries) until Post-MVP.

**Non-Functional Requirements:**
50 NFRs drive critical architectural decisions:

- **Performance**: <10ms translation overhead, <1ms pass-through latency, <5s startup time
- **Scalability**: 128MB memory footprint, shared external state for horizontal scaling, 100+ concurrent requests
- **Reliability**: 99% uptime, 100% error transparency, graceful shutdown, per-request isolation
- **Maintainability**: Startup config validation, correlation ID propagation, structured logging, comprehensive debugging info
- **Security**: Credential isolation, network-level deployment, input validation (MVP scope)
- **Compatibility**: OpenAI API contract compliance, Docker 20.10+/Kubernetes 1.20+, round-trip translation validation

### MVP vs Post-MVP Requirements (Scope Cut)

**Functional requirements (FRs)**
- **MVP:** All FR1–FR72 are MVP scope.

**Non-functional requirements (NFRs)**
- **MVP (must meet / enforce):**
  - Input safety + resilience: NFR-P6, NFR-P7, NFR-SEC3
  - Startup correctness: NFR-M1
  - Error transparency: NFR-R2
  - Streaming-aware timeout semantics: NFR-P5 (headers timeout + idle timeout for SSE)
  - Horizontal scaling prerequisite: NFR-S2, NFR-D1, NFR-D2
  - Containerization baseline: NFR-DP1, NFR-DP4
- **MVP (targets; validate during implementation):**
  - Performance/concurrency/memory targets (e.g., NFR-P1, NFR-P2, NFR-P4, NFR-S1, NFR-S4)
  - Operational behaviors (e.g., NFR-R4, NFR-O1, NFR-O2, NFR-OP3, NFR-OP4)
  - Testing targets (e.g., NFR-Q1–NFR-Q4) can be phased across implementation milestones
- **Post-MVP / explicitly deferred:** NFR-O4 and any “Post-MVP …” items in the PRD.

**Requirements adjusted by decision**
- NFR-DP3: production image size target is <150MB.

**Scale & Complexity:**

- **Primary domain**: Infrastructure/DevOps tooling - API proxy service
- **Complexity level**: Medium (HTTP proxy with bidirectional protocol translation and distributed state coordination)
- **Estimated architectural components**: 7-9 core components
  - HTTP routing layer
  - Request/response translation engines (bidirectional)
  - State management subsystem (external coordination)
  - Configuration management
  - Health/observability endpoints
  - Error handling & pass-through logic
  - Streaming response processor
  - JSON validation layer
  - Logging & correlation tracking

### Technical Constraints & Dependencies

**Hard Constraints:**
- External state storage required for conversation persistence (Chat Completions → Response API)
- Must maintain OpenAI API contract compatibility (drop-in replacement)
- 128MB memory allocation target
- Docker container packaging
- Streaming response support (Server-Sent Events)

**Performance Boundaries:**
- Translation overhead budget: 10ms
- Pass-through latency budget: 1ms
- JSON parsing depth limit: 100 levels
- Request payload limit: 10MB
- Upstream timeout: 60s (configurable)

**Deployment Constraints:**
- Single Docker container with external state dependency
- Environment variable configuration (no hot-reload in MVP)
- Private network deployment (no TLS/auth in MVP)
- Kubernetes/Docker Compose compatibility required

### Cross-Cutting Concerns Identified

**State Persistence**: Conversation state must survive adapter restarts and scale horizontally. Architecture must select storage technology (embedded vs external, SQL vs NoSQL vs in-memory store).

**Error Attribution**: Every error must clearly indicate source (adapter_error vs upstream_error vs storage_error) for operational debugging. Impacts logging, error response formatting, and observability design.

**Request Correlation**: Request tracing through adapter → OpenAI → adapter requires a per-request adapter-generated ID propagated across logs and adapter-generated error responses. Affects logging architecture and error handling.

**Streaming Response Handling**: SSE streams must work in both pass-through and translation modes. Translation mode cannot buffer entire stream (memory constraint). Requires chunk-by-chunk transformation architecture.

**JSON Parsing Resilience**: Pathological JSON (deep nesting, malicious payloads) must be rejected before processing in all modes. Affects request validation pipeline and error handling.

**Graceful Degradation**: When storage unavailable, adapter must return 503 clearly. When OpenAI times out, must return 504. When feature unsupported, must return 422 with specifics. Each failure mode needs distinct handling.

## Starter Template Evaluation

### Primary Technology Domain

API/Backend Infrastructure - HTTP proxy service with Node.js/TypeScript

### Starter Options Considered

Evaluated Fastify CLI, community templates, and manual setup approaches. Given the performance-critical nature of the proxy (NFR-P1, NFR-P2) and 128MB memory constraint (NFR-S1), a minimal dependency footprint is essential.

### Selected Approach: Manual Setup with Fastify

**Rationale for Selection:**
Infrastructure proxies benefit from explicit dependency control. Starters often include unnecessary packages that bloat memory footprint and obscure architectural decisions. Manual setup ensures every dependency serves a specific requirement and maintains alignment with performance budgets.

**Initialization Approach:**

```bash
# Project initialization
npm init -y
npm install fastify@^4 ioredis@^5 pino@^8 env-schema@^5
npm install -D typescript @types/node tsx vitest eslint prettier

# TypeScript setup
npx tsc --init
```

**Architectural Decisions Established:**

**Language & Runtime:**
- TypeScript 5.x with strict mode for type safety
- Node.js 20.x LTS for stability and performance
- ESM modules (modern import/export)

**Core Framework Stack:**
- Fastify 4.x for HTTP routing and request handling
- ioredis 5.x for Redis conversation state management
- Pino 8.x for structured JSON logging (Fastify's default logger)
- env-schema 5.x for startup configuration validation (NFR-M1)

**Build Tooling:**
- Native TypeScript compiler (tsc) for production builds
- tsx for development hot-reload
- Multi-stage Dockerfile with node:20-alpine base (production image target: <150MB)

**Testing Framework:**
- Vitest for fast TypeScript-native testing
- testcontainers for integration tests with real Redis instance
- Contract tests against OpenAI API mocks

**Code Organization:**
Define code organization by **logical responsibilities**, not a prescribed folder tree. A typical decomposition includes:
- Server bootstrap & lifecycle (startup, graceful shutdown)
- HTTP app composition (Fastify plugins, hooks)
- Routing & handlers (OpenAI-compatible endpoints + health/readiness)
- Translation (bidirectional)
- Streaming (SSE pass-through + event-by-event translation)
- State management (Redis integration + conversation model)
- Validation (schema + custom checks like size/depth)
- Configuration (env + mapping registry)
- Shared types & error types

**Physical folder/file layout is a developer decision**. Architecture cares that dependency direction stays clean (e.g., translation stays stateless; only state subsystem touches Redis).

**Development Experience:**
- Hot-reload with `tsx --watch <server-entrypoint>`
- Structured logging with pino-pretty for human-readable development logs
- Docker Compose for local Redis instance
- ESLint + Prettier for code quality

**CI/CD Pipeline (GitHub Actions):**
- Unit and contract tests on pull requests
- Docker image build and validation
- Integration tests against testcontainers
- Docker image artifacts ready for deployment

**Docker Strategy:**
- Multi-stage build (builder + minimal runtime)
- Alpine-based for minimal footprint
- Non-root user for security
- Layer caching optimization (package.json copied separately)

**Note:** Project structure setup and dependency installation should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Translation Engine Architecture - defines core translation logic
2. Streaming SSE Handler - enables streaming support requirement
3. Redis Data Model - foundation for state management
4. HTTP Client Selection - affects all upstream communication
5. Request Validation Pipeline - security and error handling foundation

**Important Decisions (Shape Architecture):**
6. Error Handling Strategy - affects debugging and operational clarity
7. Correlation ID Management - enables request tracing
8. Configuration Loading - deployment and operational flexibility

**Deferred Decisions (Post-MVP):**
- Authentication/authorization mechanisms
- Advanced observability and metrics
- Hot-reload configuration support
- Performance optimization beyond MVP targets

### Translation Engine

**Decision:** Separate bidirectional translator classes

**Architecture:**
```
ResponseToCompletions translator
CompletionsToResponse translator
Shared utility functions for common field mappings
```

**Rationale:** Clear responsibility boundaries enable independent testing of each translation direction. Explicit transformation logic per direction simplifies reasoning about correctness and enables focused contract testing for round-trip validation (NFR-C5).

**Implementation:**
- Response API → Chat Completions transformation (translator module)
- Chat Completions → Response API transformation (translator module)
- Shared utilities for common field mappings and feature detection
- Each translator implements **full translation** for the MVP-supported feature set (text generation, vision, structured outputs, function calling, web search) and supports **feature detection + 422 Unsupported** paths for deferred features.

**Affects:** FR6-FR9 (bidirectional translation), NFR-C5 (round-trip validation)

### Streaming Response Architecture

**Decision:** Hybrid approach - direct pipe for pass-through, event-by-event buffering for translation

**Architecture:**
```
Pass-through mode:
  incomingStream → outgoingResponse (direct pipe, zero processing)

Translation mode:
  incomingStream → SSE event parser → translate event → SSE formatter → outgoingResponse
```

**Rationale:** Pass-through mode achieves <1ms target with zero processing overhead (NFR-P2). Translation mode processes complete SSE events (valid JSON boundaries) while maintaining memory-bounded operation - one event at a time fits within 128MB budget (NFR-S1). Avoids buffering entire stream which could exhaust memory.

**Implementation:**
- SSE event parsing (newline-delimited)
- Pass-through stream piping (zero processing)
- Event-by-event translation + SSE formatting
- Detection logic: Check if translation needed, route to appropriate handler

**Affects:** FR64 (streaming SSE support), NFR-P2 (<1ms pass-through), NFR-S1 (128MB memory)

### Error Handling Strategy

**Decision:** Try-catch per layer with explicit attribution at boundaries

**Architecture:**
```
HTTP Layer → Validation Layer → Translation Layer → Storage Layer → OpenAI Upstream
     ↓              ↓                  ↓                  ↓              ↓
   400/422         400/422          400/422/500         503           pass-through
```

**Layer Responsibilities:**
- **HTTP Layer**: Malformed requests, payload size violations → 400 Bad Request
- **Validation Layer**: JSON depth, unknown models, duplicate request IDs → 400/422
- **Translation Layer**: Unsupported features, translation failures → 422/500
- **Storage Layer**: Redis unavailable → 503 Service Unavailable
- **Upstream Layer**: Pass through OpenAI errors unchanged (4xx/5xx)

**Rationale:** Clear boundary separation enables precise error attribution (adapter_error vs storage_error vs upstream_error per FR52). Pass-through preserves exact OpenAI responses without wrapper overhead. No centralized error handler that must differentiate sources - each layer handles its domain explicitly.

**Implementation:**
- Try-catch blocks at each layer boundary
- Error response format includes: `{ error, source, requestId, message }`
- OpenAI responses forwarded bit-for-bit (FR43, NFR-R2)

**Clarification: upstream errors vs adapter errors**
- **Upstream error pass-through:** If OpenAI returns an error response, forward it unchanged (status, headers, body) to preserve OpenAI contract compatibility.
- **Adapter-generated errors:** Only failures originating inside the adapter (validation/translation/storage/concurrency/timeouts owned by the adapter) use the adapter error envelope and include `requestId`.
- **Mid-stream failures:**
  - **Pass-through streaming:** if the upstream stream errors mid-flight, terminate the client stream and rely on logs (`requestId`) for diagnosis.
  - **Translation streaming:** if the adapter is actively parsing/formatting SSE, it may emit a final adapter-generated SSE error event only when safe (i.e., at an event boundary), then close; otherwise terminate.

**Affects:** FR43-FR54 (error handling), FR52 (error attribution), NFR-R2 (100% error transparency)

### Redis Data Model

**Decision:** Conversation ID with message normalization (eliminates duplication)

**Schema:**
```typescript
// Conversation messages (single source of truth)
Key: conversation:{conversationId}
Value: {
  messages: Message[]  // Full conversation history
}
TTL: 86400 seconds (24 hours)

// Response ID pointer
Key: response:{responseId}
Value: {
  conversationId: string,
  messageCount: number  // Messages that existed at this response
}
TTL: 86400 seconds

// Request deduplication
Key: request:{requestId}
Value: "1"
TTL: 3600 seconds (1 hour)

// Message format (Chat Completions structure)
interface Message {
  role: "user" | "assistant" | "system";
  content: string | object;
  [key: string]: any;  // Preserve OpenAI optional fields
}
```

**Rationale:** Eliminates message duplication that would grow quadratically with conversation length. For 20-turn conversation: stores 20 unique messages vs 420 copies = 95% reduction. +0.5ms latency for second lookup fits within <10ms translation budget (NFR-P1). Critical for 128MB memory constraint with unpredictable conversation lengths in test environments.

**Flow (Response API → Chat Completions):**
1. Lookup `response:{previous_response_id}` → get conversationId, messageCount
2. Lookup `conversation:{conversationId}` → get full message array
3. Slice first `messageCount` messages for conversation context
4. Add new user message, forward to OpenAI Chat Completions
5. Append assistant response to conversation messages array
6. Store updated messages under same conversationId
7. Create new response pointer with updated messageCount

**Flow (Chat Completions → Response API):**
- No Redis needed - stateless by design
- Send full messages array to OpenAI Response API as `input` array
- Response API handles conversation context

**Affects:** FR15-FR20, FR67-FR72 (state management), NFR-S1 (memory footprint), NFR-S2 (horizontal scaling)

### Request Validation Pipeline

**Decision:** Layered approach - Fastify schema validation + custom middleware

**Architecture:**
```typescript
// Layer 1: Fastify schema (structure validation)
fastify.post('/v1/responses', {
  schema: {
    body: {
      type: 'object',
      properties: { model: { type: 'string' }, ... }
    }
  }
}, handler);

// Layer 2: Custom middleware (depth/size limits)
fastify.addHook('preValidation', async (request, reply) => {
  validatePayloadSize(request.body);  // 10MB limit
  validateJSONDepth(request.body);    // 100 levels max
  validateModelName(request.body.model);  // Known model check
});
```

**Rationale:** Fastify's native validation provides fast malformed JSON rejection. Custom middleware enforces adapter-specific constraints (JSON depth 100, payload 10MB) that aren't standard JSON schema validations. Clear separation enables focused error messages and fast rejection before expensive translation operations.

**Implementation:**
- Fastify schemas per endpoint for basic structure
- Custom validation hooks for depth/size/model checks
- Both validation layers run in all modes (pass-through and translation) per NFR-P7

**Affects:** FR13-FR14 (size/depth limits), FR45 (invalid request errors), NFR-P7 (JSON resilience)

### Correlation ID Management

**Decision:** Use `@fastify/request-id` plugin for internal adapter correlation

**Architecture:**
```typescript
fastify.register(require('@fastify/request-id'));

// Available as request.id throughout request lifecycle
logger.info({
  requestId: request.id,  // UUID auto-generated per request
  action: 'translation_started',
  model: request.body.model
});
```

**Rationale:** Auto-generates UUID for every request (both Response API and Chat Completions formats). Provides internal adapter correlation independent of OpenAI's business-level IDs (response_id, previous_response_id). Used purely for adapter logging, tracing, debugging, and duplicate detection (FR36). Standard Fastify plugin with zero configuration needed.

**Implementation:**
- Plugin registration at app startup
- Propagate `request.id` through all log entries
- Include in error responses for debugging
- Use for duplicate detection: Store in Redis as `request:{requestId}`

**Affects:** FR34-FR36 (request ID generation/tracking), FR51 (error response IDs), NFR-M2 (correlation propagation)

### Identifier Taxonomy (Canonical)

**Decision:** Treat adapter request correlation and OpenAI contract IDs as distinct concepts.

**Adapter-generated request correlation (`requestId`)**
- **Purpose:** Logging, tracing, debugging, and (optionally) duplicate request detection.
- **Scope:** Internal to the adapter; not part of the OpenAI API contract.
- **Where it appears:**
  - Always in adapter logs.
  - Included in adapter-generated error responses.
  - Not required to be added to successful upstream pass-through responses.

**OpenAI contract IDs (examples)**
- **Responses API `response_id` / `previous_response_id`:** part of the contract.
  - If upstream is the Responses API, treat these values as upstream-owned and pass through unchanged.
  - If the adapter serves the Responses API contract while routing to Chat Completions upstream, the adapter must generate a Response-compatible `response_id` and persist its mapping in Redis (`response:{responseId}`) to support `previous_response_id` lookups.

### Configuration Management

**Decision:** JSON file path via environment variable with startup validation

**Environment Variables:**
```bash
MODEL_API_MAPPING_FILE=<path-to-model-mapping.json>
ADAPTER_TARGET_URL=https://api.openai.com/v1
REDIS_URL=redis://redis:6379
UPSTREAM_TIMEOUT=60
MAX_CONCURRENT_CONNECTIONS=1000
MAX_REQUEST_SIZE_MB=10
MAX_JSON_DEPTH=100
CONVERSATION_STATE_TTL=86400
LOG_LEVEL=INFO
```

**Model Mapping File:**
```json
{
  "gpt-4": "response",
  "gpt-4-turbo": "response",
  "gpt-3.5-turbo": "chat_completions",
  "gpt-3.5-turbo-16k": "chat_completions"
}
```

**Rationale:** JSON file format provides readable, version-control friendly configuration suitable for growing model mappings. The file can be provided via container volume mount, baked into an image, or injected by the deployment system; exact paths are a developer/deployment decision. Environment variables cover scalar values. Startup validation fails fast with clear error messages before accepting requests (NFR-M1).

**Validation:**
- File exists and is readable
- Valid JSON structure
- All model names map to valid API types ("response" or "chat_completions")
- Required environment variables present
- URL formats valid
- Numeric values within acceptable ranges

**Implementation:**
- Config loader module (file loading + parsing)
- Config validator module (schema validation + detailed error messages)
- Use `env-schema` for environment variable validation

**Affects:** FR21-FR30 (configuration), FR22-FR27 (validation), NFR-M1 (startup validation)

### HTTP Client Selection

**Decision:** Use `undici` for OpenAI API communication

**Rationale:** `undici` is Fastify's underlying HTTP client - likely already in dependency tree. Optimized for performance (critical for <1ms pass-through target NFR-P2 and <10ms translation budget NFR-P1). Excellent streaming support for SSE handling (FR64). Built-in connection pooling, timeout management, and low-level stream access. Significantly faster than alternatives (axios) while being more feature-rich than native fetch.

**Implementation:**
```typescript
import { request } from 'undici';

// Non-streaming requests
const { statusCode, headers, body } = await request(
  'https://api.openai.com/v1/responses',
  {
    method: 'POST',
    body: JSON.stringify(translatedRequest),
    headers: { 'Authorization': `Bearer ${apiKey}` },
    bodyTimeout: upstreamTimeout * 1000,
    headersTimeout: upstreamTimeout * 1000
  }
);

// Streaming requests
const { body: stream } = await request(url, {
  ...options,
  headersTimeout: upstreamTimeout * 1000,
  bodyTimeout: 0 // disable; enforce adapter-level idle timeout instead
});
stream.pipe(responseStream);  // Pass-through or translate
```

**Configuration:**
- Timeout enforcement:
  - Non-streaming: `bodyTimeout` + `headersTimeout`
  - Streaming (SSE): `headersTimeout` + adapter-level idle timeout (no hard `bodyTimeout`)
- Connection pooling for concurrent requests
- Header preservation for error pass-through

**Affects:** FR11 (forward to OpenAI), FR54 (upstream timeout), NFR-P2 (<1ms pass-through), FR64 (streaming)

### Health & Readiness Endpoints

**Decision:** Split liveness and readiness responsibilities.

**`GET /health` (liveness)**
- **Meaning:** The process is running and able to respond to HTTP.
- **Checks:** none beyond serving the request (no Redis/OpenAI calls).
- **Response:** `200` with a minimal body (e.g., `{ "status": "ok" }`).

**`GET /ready` (readiness)**
- **Meaning:** The adapter is ready to serve *its configured modes*.
- **Checks (MVP):**
  - Configuration loaded and validated (env + model mapping file).
  - Redis connectivity if conversation state features are enabled/required (e.g., `PING`).
- **Non-goal (MVP):** Upstream reachability probes are optional (they require auth and can create false negatives). If needed, guard behind a config flag.
- **Response:**
  - `200` when all required checks pass.
  - `503` when any required check fails, with a structured body showing failed checks and a stable error `type`.

### Concurrency Limits

**Decision:** Enforce a configurable max in-flight request budget at the adapter boundary.

**What is limited:**
- Total number of concurrent in-flight requests handled by the adapter, including streaming requests (SSE connections count until the stream ends).

**Rejection behavior:**
- If the limit is exceeded, return `503` with an adapter error (e.g., `type: "over_capacity"`) and optionally `Retry-After`.

### Timeout Semantics

**Decision:** Distinguish timeouts for non-streaming requests vs streaming SSE.

**Non-streaming upstream requests**
- Use `undici` `headersTimeout` and `bodyTimeout` set from `UPSTREAM_TIMEOUT`.
- On timeout: return `504` with an adapter error envelope (this is an adapter-observed timeout, not an upstream response).

**Streaming upstream requests (SSE)**
- Apply `headersTimeout` for time-to-first-byte.
- Avoid a hard `bodyTimeout` that would incorrectly kill long-lived streams; instead enforce an idle timeout (no bytes received for N seconds) as a separate configuration value.
- On idle-timeout or upstream stream error: terminate the client stream; in translation mode, emit a final SSE adapter error event only when safe (see Error Handling clarifications).

### Decision Impact Analysis

**Implementation Sequence:**
1. **Configuration loading** - Required first, validates environment and model mappings
2. **Redis connection** - State management dependency, needed before request handling
3. **Fastify app setup** - HTTP server with request-id plugin and validation pipeline
4. **Translation engines** - Core bidirectional logic
5. **Streaming handlers** - Pass-through and translation modes
6. **HTTP client integration** - undici configuration for OpenAI communication
7. **Error handling** - Layer-specific try-catch implementation
8. **Health endpoints** - `/health` and `/ready` with Redis connectivity checks

**Cross-Component Dependencies:**
- **Translation engines** depend on **validation pipeline** (reject before translating)
- **Streaming handlers** depend on **translation engines** (reuse transformation logic)
- **Error handlers** depend on **request ID** (include in adapter-generated error responses)
- **Redis operations** depend on **configuration** (connection string, TTLs)
- **All components** depend on **request ID** (logging correlation)
- **HTTP client** depends on **configuration** (timeout values, target URL)

**Technology Stack Summary:**
- **Runtime**: Node.js 20.x LTS + TypeScript 5.x
- **HTTP Framework**: Fastify 4.x with plugins (@fastify/request-id)
- **State Storage**: Redis (via ioredis 5.x)
- **HTTP Client**: undici (Fastify's underlying client)
- **Logging**: Pino 8.x (structured JSON)
- **Configuration**: env-schema 5.x + JSON file loading
- **Testing**: Vitest + testcontainers
- **Build**: tsc (TypeScript compiler) + multi-stage Docker

## Implementation Patterns & Consistency Rules

### Overview

**Purpose:** Ensure multiple AI agents write compatible, consistent code that works together seamlessly across all components of the openai-adapter.

**Critical Conflict Points Identified:** 27 areas where AI agents could make different implementation choices that would cause integration failures.

### Naming Patterns

#### File & Directory Naming

**Files:** kebab-case for all files
```typescript
// ✅ Correct
response-to-completions.ts
sse-parser.ts
redis-client.ts

// ❌ Incorrect
ResponseToCompletions.ts
sseParser.ts
redis_client.ts
```

**Directories (if used):** prefer kebab-case; plural for collections. Exact folder layout is a developer choice.

#### Code Naming

**Variables & Functions:** camelCase
```typescript
// ✅ Correct
const requestId = generateRequestId();
async function translateRequest(payload: RequestPayload) {}

// ❌ Incorrect
const request_id = generate_request_id();
async function translate_request(payload: RequestPayload) {}
```

**Classes & Interfaces:** PascalCase, NO I-prefix on interfaces
```typescript
// ✅ Correct
class TranslationEngine {}
interface RequestPayload {}
type ApiResponse = {};

// ❌ Incorrect
class translationEngine {}
interface IRequestPayload {}
type apiResponse = {};
```

**Constants:** SCREAMING_SNAKE_CASE for true constants, camelCase for config objects
```typescript
// ✅ Correct
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT = 60;
const config = { timeout: 60, maxRetries: 3 };

// ❌ Incorrect
const max_payload_size = 10485760;
const Config = { timeout: 60 };
```

#### Redis Key Naming

**Pattern:** `namespace:identifier` with colon separators
```typescript
// ✅ Correct
`conversation:${conversationId}`
`response:${responseId}`
`request:${requestId}`

// ❌ Incorrect
`conversation_${conversationId}`
`responses/${responseId}`
`request-${requestId}`
```

### Structure Patterns

#### Project Organization

**Tests:** Keep tests separated from runtime code (traditional separation, not co-located). Organize tests by intent (unit/integration/contract) and mirror production module boundaries. Directory names/paths are a developer choice.

**Types:** Centralize shared types in a dedicated place (a “types module”) to prevent duplication and drift. The exact module/file layout is a developer choice.

**Validation:** Keep schema validation and custom validation hooks separated (structure vs. policy), with shared utilities reused across endpoints.

**Route Handlers:** Organized by endpoint, no controller classes
```typescript
// ✅ Correct - Simple handler functions
export async function chatCompletionsHandler(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Handle request
}

// ❌ Incorrect - Unnecessary class wrapper
class ChatCompletionsController {
  async handle() {}
}
```

#### Module Exports

**Pattern:** Named exports, barrel files for convenience
```typescript
// ✅ Correct
// translation/response-to-completions.ts
export async function translateResponseToCompletions() {}
export class TranslationError extends Error {}

// translation/index.ts (barrel file)
export * from './response-to-completions.js';
export * from './completions-to-response.js';
export * from './utils.js';

// ❌ Incorrect - Default exports
export default async function translate() {}
```

### Format Patterns

#### Error Response Structure

**Adapter Errors:** Consistent format with source attribution
```typescript
// ✅ Correct
{
  error: {
    type: "validation_error",
    message: "Payload exceeds 10MB limit",
    source: "adapter_error"
  },
  requestId: "550e8400-e29b-41d4-a716-446655440000"
}

// Storage Errors
{
  error: {
    type: "storage_unavailable",
    message: "Redis connection failed",
    source: "storage_error"
  },
  requestId: "..."
}

// ❌ Incorrect - Missing source attribution
{
  error: "Validation failed",
  message: "..."
}
```

**Upstream Pass-through:** Forward OpenAI errors unchanged
```typescript
// ✅ Correct - Bit-for-bit pass-through
return reply
  .code(upstreamResponse.statusCode)
  .headers(upstreamResponse.headers)
  .send(upstreamResponse.body);

// ❌ Incorrect - Wrapping upstream errors
return reply.send({
  error: { upstream: upstreamError }
});
```

#### Logging Format (Pino)

**Standard Fields:** Always include requestId and action
```typescript
// ✅ Correct
logger.info({
  requestId: request.id,
  action: 'translation_started',
  model: request.body.model,
  mode: 'response_to_completions'
});

logger.error({
  requestId: request.id,
  action: 'redis_operation_failed',
  error: err.message,
  conversationId
});

// ❌ Incorrect - Missing standard fields
logger.info('Translation started for model gpt-4');
logger.error('Redis failed');
```

**Log Levels:**
- `error` - Adapter failures, storage unavailable
- `warn` - Retryable failures, degraded operation
- `info` - Request start/end, routing decisions
- `debug` - Translation details, Redis operations

#### JSON Field Naming

**API Responses:** Match OpenAI conventions (snake_case for API, camelCase internal)
```typescript
// ✅ Correct - External API format (snake_case)
interface ResponseApiRequest {
  model: string;
  previous_response_id?: string;
}

// ✅ Correct - Internal code (camelCase)
interface ConversationState {
  conversationId: string;
  messageCount: number;
}

// ❌ Incorrect - Mixing conventions
interface Request {
  model: string;
  previousResponseId: string;  // Should be previous_response_id for API
}
```

#### Date/Time Handling

**Format:** ISO 8601 strings for Redis and logs
```typescript
// ✅ Correct
const timestamp = new Date().toISOString();
// "2026-02-06T10:30:00.000Z"

// ❌ Incorrect
const timestamp = Date.now();  // Unix milliseconds
const timestamp = new Date().toString();  // Locale string
```

### Communication Patterns

#### Async Flow Control

**Pattern:** Async/await throughout, no Promise chains
```typescript
// ✅ Correct
async function processRequest() {
  const config = await loadConfig();
  const state = await redis.get(key);
  const result = await translateAndForward(state);
  return result;
}

// ❌ Incorrect
function processRequest() {
  return loadConfig()
    .then(config => redis.get(key))
    .then(state => translateAndForward(state));
}
```

#### Error Propagation

**Pattern:** Throw custom error classes, catch at layer boundaries
```typescript
// ✅ Correct
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

async function validate(payload: unknown) {
  if (!isValid(payload)) {
    throw new ValidationError('Invalid payload structure');
  }
}

// Catch at route handler boundary
try {
  await validate(request.body);
} catch (err) {
  if (err instanceof ValidationError) {
    return reply.code(400).send({
      error: { type: 'validation_error', message: err.message, source: 'adapter_error' },
      requestId: request.id
    });
  }
  throw err;  // Re-throw unexpected errors
}

// ❌ Incorrect - Returning error objects
async function validate(payload: unknown) {
  if (!isValid(payload)) {
    return { error: 'Invalid payload' };
  }
  return { success: true };
}
```

#### Redis Operations

**Pattern:** Wrap ioredis calls, handle connection errors explicitly
```typescript
// ✅ Correct
async function getConversation(conversationId: string): Promise<ConversationState | null> {
  try {
    const data = await redis.get(`conversation:${conversationId}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    logger.error({ action: 'redis_get_failed', conversationId, error: err.message });
    throw new StorageError('Failed to retrieve conversation state');
  }
}

// ❌ Incorrect - No error handling
async function getConversation(id: string) {
  const data = await redis.get(`conversation:${id}`);
  return JSON.parse(data);
}
```

### Process Patterns

#### Graceful Shutdown

**Pattern:** Drain connections, close Redis, exit cleanly
```typescript
// ✅ Correct - server entrypoint
const gracefulShutdown = async () => {
  logger.info({ action: 'shutdown_initiated' });
  
  await fastify.close();  // Stop accepting new requests, drain existing
  await redis.quit();     // Close Redis connection
  
  logger.info({ action: 'shutdown_complete' });
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ❌ Incorrect - Abrupt exit
process.on('SIGTERM', () => process.exit(0));
```

#### Stream Error Handling

**Pattern:** Attach error handlers to all streams
```typescript
// ✅ Correct
const upstreamStream = await getUpstreamStream();

upstreamStream.on('error', (err) => {
  logger.error({ requestId: request.id, action: 'upstream_stream_error', error: err.message });
  if (!reply.sent) {
    reply.code(500).send({
      error: { type: 'stream_error', message: 'Streaming failed', source: 'adapter_error' },
      requestId: request.id
    });
  }
});

upstreamStream.pipe(reply.raw);

// ❌ Incorrect - No error handling
upstreamStream.pipe(reply.raw);
```

#### Configuration Loading

**Pattern:** Fail fast at startup, no runtime config changes
```typescript
// ✅ Correct - server entrypoint
async function startServer() {
  try {
    const config = await loadAndValidateConfig();
    const redis = await connectRedis(config.redisUrl);
    const fastify = await createApp(config);
    
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ action: 'server_started', port: config.port });
  } catch (err) {
    logger.error({ action: 'startup_failed', error: err.message });
    process.exit(1);  // Fail fast
  }
}

// ❌ Incorrect - Silent failures
async function startServer() {
  const config = loadConfig() || DEFAULT_CONFIG;
  // Continues with potentially invalid config
}
```

### TypeScript Patterns

#### Strict Mode Configuration

**tsconfig.json:** All strict checks enabled
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

#### Type Annotations

**Pattern:** Explicit return types on public functions, inferred for simple cases
```typescript
// ✅ Correct
export async function translateRequest(payload: RequestPayload): Promise<CompletionsRequest> {
  const model = payload.model;  // Type inferred
  return { ...payload, messages: [] };
}

// ❌ Incorrect - No return type on public function
export async function translateRequest(payload: RequestPayload) {
  return { ...payload, messages: [] };
}
```

#### Null Handling

**Pattern:** Explicit null checks, use optional chaining
```typescript
// ✅ Correct
const conversationState = await getConversation(conversationId);
if (!conversationState) {
  throw new NotFoundError('Conversation not found');
}
const messageCount = conversationState.messageCount;

// Optional chaining for nested properties
const previousId = request.body.previous_response_id ?? null;

// ❌ Incorrect - Assuming non-null
const messageCount = conversationState.messageCount;  // Might be null
```

### Testing Patterns

#### Test Organization

**Structure:** Mirror production module boundaries and keep test types separated by intent (unit/integration/contract). Exact folder layout is a developer choice.

#### Test Naming

**Pattern:** `describe` with class/function name, `it` with behavior description
```typescript
// ✅ Correct
describe('translateResponseToCompletions', () => {
  it('should convert Response API request to Chat Completions format', async () => {
    const input = { model: 'gpt-4', previous_response_id: 'resp_123' };
    const result = await translateResponseToCompletions(input);
    expect(result.messages).toBeDefined();
  });

  it('should throw ValidationError for unknown model', async () => {
    await expect(translateResponseToCompletions({ model: 'unknown' }))
      .rejects.toThrow(ValidationError);
  });
});

// ❌ Incorrect - Vague descriptions
describe('translator', () => {
  it('works', () => {});
  it('test 1', () => {});
});
```

### Enforcement Guidelines

#### All AI Agents MUST:

1. **Use kebab-case for files**, camelCase for code, PascalCase for classes
2. **Keep tests separated from runtime code** (traditional separation; no co-location). Directory naming/layout is a developer choice.
3. **Include `requestId` in all log entries** for correlation
4. **Throw custom Error classes**, catch at layer boundaries
5. **Use async/await**, never Promise chains
6. **Add explicit return types** on all exported functions
7. **Follow error response format** with source attribution
8. **Forward upstream errors unchanged** (bit-for-bit)
9. **Attach error handlers to all streams**
10. **Fail fast at startup** for configuration errors
11. **Use Redis key pattern** `namespace:identifier`
12. **Export named exports**, no default exports
13. **Centralize shared types** in a dedicated types module (location/layout is a developer choice)
14. **Enable TypeScript strict mode** checks
15. **Use ISO 8601 strings** for timestamps

#### Pattern Verification

**Pre-commit Checks:**
- ESLint validates naming conventions
- TypeScript compiler enforces strict mode
- Prettier formats code consistently
- Tests run in CI before merge

**Code Review Focus:**
- Error handling at layer boundaries
- Logging includes requestId
- Streams have error handlers
- No Promise chains (async/await only)

### Examples

#### Good Pattern Example

```typescript
// translation/response-to-completions.ts
import type { ResponseApiRequest, ChatCompletionsRequest } from '../types/index.js';
import { ValidationError } from '../types/errors.js';
import { logger } from '../logger.js';

export async function translateResponseToCompletions(
  request: ResponseApiRequest,
  requestId: string
): Promise<ChatCompletionsRequest> {
  logger.debug({
    requestId,
    action: 'translation_started',
    direction: 'response_to_completions',
    model: request.model
  });

  if (!request.model) {
    throw new ValidationError('Model is required');
  }

  const messages = await buildMessageHistory(request.previous_response_id);
  
  logger.debug({
    requestId,
    action: 'translation_completed',
    messageCount: messages.length
  });

  return {
    model: request.model,
    messages,
    stream: request.stream ?? false
  };
}

async function buildMessageHistory(previousResponseId?: string): Promise<Message[]> {
  if (!previousResponseId) return [];
  
  try {
    const state = await redis.get(`response:${previousResponseId}`);
    return state ? JSON.parse(state).messages : [];
  } catch (err) {
    logger.error({
      action: 'redis_get_failed',
      previousResponseId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    throw new StorageError('Failed to load conversation history');
  }
}
```

#### Anti-Pattern Example

```typescript
// ❌ Multiple violations
// translation/ResponseToCompletions.ts  // Wrong: PascalCase file
import translator from './translator';  // Wrong: default import

export default async function translate(req) {  // Wrong: default export, no types
  console.log('Translating:', req.model);  // Wrong: console.log instead of logger
  
  const msgs = await redis.get('response_' + req.previous_response_id)  // Wrong: key pattern
    .then(data => JSON.parse(data))  // Wrong: Promise chain
    .catch(e => null);  // Wrong: Silent error swallow
  
  return {
    model: req.model,
    messages: msgs || []
  };
}
```

## Logical Component Architecture

### Overview

**Decision:** Define logical subsystems by responsibility. Developers determine internal file organization.

### 1. Entry Point & Routing Subsystem
*   **Responsibilities**:
    *   Initialize the Fastify server and plugins.
    *   Route HTTP requests (`/v1/responses`, `/v1/chat/completions`) to handlers.
    *   Enforce initial safeguards (payload size, JSON depth).
*   **Boundary Rules**: Must not contain translation logic. Delegates immediately to functional layers.

### 2. Translation Subsystem (Core Domain)
*   **Responsibilities**:
    *   Bidirectional transformation of JSON payloads.
    *   Feature mapping (e.g., `feature_x` -> `function_calling`).
    *   SSE Event parsing and reformatting during streaming.
*   **Boundary Rules**: Purely functional and stateless. No direct database or network access allowed.

### 3. State Management Subsystem
*   **Responsibilities**:
    *   Manage the lifecycle of Conversation IDs and Response IDs.
    *   Handle message deduplication logic (normalization).
    *   Interface with the persistence layer (Redis).
*   **Boundary Rules**: The only subsystem permitted to establish Redis connections.

### 4. Upstream Gateway Subsystem
*   **Responsibilities**:
    *   Maintain HTTP connection pools to OpenAI.
    *   Handle request signing (API Keys) and timeout enforcement.
    *   Manage error pass-through from upstream.
*   **Boundary Rules**: Must treat all upstream interactions as potentially streaming sources.

### 5. Configuration & Infrastructure Subsystem
*   **Responsibilities**:
    *   Load and validate environment variables at startup.
    *   Provide the Model-to-API mapping registry.
    *   Centralized logging configuration (Pino).
*   **Boundary Rules**: Must complete initialization and validation *before* the server opens port for traffic.

## Architecture Validation

### Requirement Coverage Analysis

**Functional Requirements:**
- **Routing & Translation (FR1-FR14)**: Covered by "Entry Point & Routing" and "Translation Subsystem".
- **State Management (FR15-FR20)**: Covered by "State Management Subsystem" (Redis normalized model).
- **Configuration (FR21-FR30)**: Covered by "Configuration & Infrastructure Subsystem" (Env vars + JSON map).
- **Observability (FR31-FR42)**: Covered by "Entry Point" (Request ID) and "Configuration" (Pino).
- **Reliability (FR43-FR54)**: Covered by "Layered Error Handling" strategy.
- **Features (FR55-FR66)**: Covered by "Translation Subsystem" (Feature mapping).

**Non-Functional Requirements:**
- **Performance (p99 < 10ms)**: Addressed via `undici` client + fastify + hybrid streaming.
- **Memory (< 128MB)**: Addressed via Event-by-Event streaming (no buffering) and normalized state.
- **Consistency**: Addressed via strict "Implementation Patterns" (Step 5).

### Risk Assessment

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Complexity of 13+ Features** | High dev effort, potential bugs | "Separate Translation Engines" isolates logic; Incremental implementation (Text -> Tools -> Vision). |
| **Redis Latency (2 calls/req)** | Added overhead | Connection pooling in "State Subsystem"; Redis is <0.5ms; acceptable within 10ms budget. |
| **Streaming Memory Leaks** | Crash (OOM) | Strict "Event-by-Event" processing rule; dedicated "Stream Error Handling" pattern. |
| **Upstream API Changes** | Breakage | "Upstream Gateway" centralizes client logic; Contract tests (Step 5). |

### Validation Status

**Result**: ✅ **PASSED**
The proposed architecture fully addresses the PRD requirements and constraints. The logical separation allows for parallel development while the consistency rules prevent integration drift.


