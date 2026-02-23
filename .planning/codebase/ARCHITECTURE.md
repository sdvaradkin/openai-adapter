# Architecture

**Analysis Date:** 2026-02-19

## Pattern Overview

**Overall:** Intelligent Request Router with Conditional Translation

**Key Characteristics:**
- Request detection + routing-based dispatch (pass-through or translate)
- Format-aware translation pipeline (Chat Completions ↔ Response API)
- Layered handler chain: validation → routing → decision → execution
- Stateless, immutable configuration loaded at startup
- All translation logic isolated from HTTP concerns

## Layers

**HTTP Server & Lifecycle:**
- Purpose: Fastify HTTP server initialization, middleware hooks, connection management
- Location: `src/index.ts`
- Contains: Server builder, hook registration, error handler setup
- Depends on: Fastify, config module, handlers
- Used by: Application startup via `startServer()`, tests for server setup

**Configuration & Bootstrap:**
- Purpose: Load, validate, and provide configuration to all other layers
- Location: `src/config/` (loader.ts, validator.ts, state.ts, types.ts)
- Contains: Environment parsing, model mapping file loading, validation
- Depends on: env-schema, Node.js fs
- Used by: Server startup, routing handler creation

**Request Routing & Dispatch:**
- Purpose: Determine whether request needs translation or pass-through
- Location: `src/handlers/routing.handler.ts`, `src/routing/router.ts`
- Contains: Endpoint detection, model validation, routing decision logic
- Depends on: ModelMapper, validation layer
- Used by: HTTP handlers (POST /v1/responses, POST /v1/chat/completions)

**Translation Engine:**
- Purpose: Transform request/response formats between Chat Completions and Response API
- Location: `src/translation/` (index.ts, types.ts, chat-to-response/request.ts)
- Contains: Field mapping logic, format detection, unknown field tracking
- Depends on: Translation utilities
- Used by: Routing handler when translation needed

**Translation Utilities:**
- Purpose: Support translation operations (logging, field detection, round-trip testing)
- Location: `src/translation/utils/` (translation-logger.ts, unknown-fields.ts, round-trip-tester.ts)
- Contains: Structured logging, field categorization, test helpers
- Depends on: Pino logger
- Used by: Translation engine, handlers

**Pass-Through Execution:**
- Purpose: Forward requests to OpenAI API unchanged with timeout/error handling
- Location: `src/handlers/pass-through.handler.ts`
- Contains: Request forwarding via fetch, header management, response streaming
- Depends on: AdapterConfig, Node.js fetch API
- Used by: Routing handler for both pass-through and translated requests

**Validation Layer:**
- Purpose: Enforce payload constraints (size, JSON depth, model existence)
- Location: `src/validation/` (json-depth-validator.ts, payload-size-validator.ts)
- Contains: Constraint checkers, depth calculation algorithm
- Depends on: ValidationError type
- Used by: Routing handler before routing decision

**Error Handling & Response Formatting:**
- Purpose: Convert errors to standardized response format
- Location: `src/handlers/error-formatter.ts`, `src/types/validation-errors.ts`
- Contains: ValidationError class, error formatting, type guards
- Depends on: None (pure types and formatters)
- Used by: Server error handler, routing handler

## Data Flow

**Request → Routing Decision → Execution:**

1. HTTP request arrives at `/v1/responses` or `/v1/chat/completions`
2. Routing handler validates JSON depth against `config.maxJsonDepth`
3. Router extracts endpoint path (source format) and model from request body
4. ModelMapper looks up target format for the model
5. Router compares: if source == target → pass-through, else → translate
6. **Pass-through path:** Forward request directly to OpenAI via fetch
7. **Translation path:**
   - Validate request format
   - Transform fields according to mapping rules
   - Log unknown fields for monitoring
   - Create new request object with translated fields
   - Forward translated request to pass-through handler
8. Pass-through handler forwards to OpenAI, returns response unchanged

**Configuration Flow:**

1. Application startup calls `startServer()`
2. `loadConfiguration()` reads environment variables (required: ADAPTER_TARGET_URL, MODEL_API_MAPPING_FILE)
3. `loadModelMappingFile()` reads JSON file mapping models to API types
4. `validateModelMapping()` ensures valid format
5. Create AdapterConfig object with loaded values and defaults
6. Decorate Fastify instance with config
7. Create handlers with config reference (ModelMapper)
8. Set global config state for readiness probe

**State Management:**

- Configuration: Immutable at runtime, loaded once at startup
- Request state: Passed through handler chain via request object and response object
- Connection limits: Tracked with atomic counter (`activeConnections`)
- No shared mutable state between requests (stateless design)

## Key Abstractions

**Router:**
- Purpose: Encapsulates routing logic and model validation
- Examples: `src/routing/router.ts`
- Pattern: Class with methods for format detection, model extraction, routing decision
- Used by: Routing handler to make dispatch decisions

**ModelMapper:**
- Purpose: Maps model names to target API types
- Examples: `src/routing/model-mapper.ts`
- Pattern: Immutable class initialized once with model mapping
- Used by: Router to determine target format for a model

**ValidationError:**
- Purpose: Represents validation failures with type and context
- Examples: `src/types/validation-errors.ts`
- Pattern: Custom Error class with type field and source
- Used by: All validation code, error handler for formatting

**ChatToResponseTranslationResult:**
- Purpose: Encapsulates translation outcome (success/error, translated body, metadata)
- Examples: `src/translation/chat-to-response/types.ts`
- Pattern: Discriminated union (success boolean determines available fields)
- Used by: Routing handler to check translation outcome

**Handlers (Factory Pattern):**
- Purpose: Create configured request handlers with dependency injection
- Examples: `createRoutingHandler()`, `createPassThroughHandler()`
- Pattern: Factory functions that accept config and return handler function
- Used by: Server setup to create reusable handlers

## Entry Points

**HTTP Server:**
- Location: `src/index.ts` → `buildServer()` → returns FastifyInstance
- Triggers: Called from `startServer()` after config loading
- Responsibilities: Register routes, set hooks, return app instance

**Configuration Load:**
- Location: `src/index.ts` → `startServer()` → `loadConfiguration()`
- Triggers: Application startup
- Responsibilities: Parse env, load files, validate, set global state

**Routing Endpoint:**
- Location: `src/handlers/routing.handler.ts` → `createRoutingHandler()`
- Triggers: POST requests to `/v1/responses` or `/v1/chat/completions`
- Responsibilities: Validate JSON depth, make routing decision, dispatch request

**Health Endpoints:**
- Location: `src/handlers/health.ts`
- Triggers: GET `/health` (liveness), GET `/ready` (readiness)
- Responsibilities: Return status based on configuration state

## Error Handling

**Strategy:** Explicit error types with standardized formatting

**Patterns:**
- **ValidationError:** Thrown during validation, caught by routing handler, formatted to 400 response
- **Model validation:** Router throws ValidationError if model not in mapping
- **Upstream errors:** Pass-through handler catches network errors, returns 503
- **Timeout errors:** AbortController timeout returns 504
- **Payload size:** Fastify body limit handler returns 400 formatted as ValidationError
- **Unknown endpoints:** Routing handler returns 404 for unrecognized paths

## Cross-Cutting Concerns

**Logging:**
- Framework: Pino (JSON-structured)
- Approach: Logger passed through handlers, logs at key decision points
- Patterns: routing_decision, translation_completed, pass_through_request, upstream_error
- Health/readiness endpoints set request log level to 'silent'

**Validation:**
- Approach: Validation happens early in request pipeline before routing
- Constraints: Payload size (Fastify), JSON depth (custom validator), model existence (Router)
- Type safety: TypeScript strict mode enforces types at compile time

**Authentication:**
- Approach: Authorization header passed through unchanged to OpenAI
- Pattern: Requests preserve original headers except host/content-length/transfer-encoding
- Responsibility: OpenAI API validates token

**Request Tracing:**
- Approach: Fastify-generated request.id included in all logs and error responses
- Enables: Correlation of logs for same request across system

---

*Architecture analysis: 2026-02-19*
