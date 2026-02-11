# Story 1.4: Timeout and Concurrency Configuration

**Status:** ready-for-dev

## Story

As a DevOps engineer,
I want configurable upstream timeouts and connection limits,
so that I can tune the adapter for my infrastructure and protect against overload.

## Acceptance Criteria

1. **Configuration Loading & Validation**
   - `UPSTREAM_TIMEOUT_SECONDS` environment variable is read and validated
   - `MAX_CONCURRENT_CONNECTIONS` environment variable is read and validated
   - Both variables are optional with sensible defaults (60 seconds and 1000 respectively)
   - Invalid values (non-numeric, negative, zero) cause startup to fail with clear error messages
   - Error messages indicate the valid range and provide an example of valid value

2. **Configuration Logging**
   - Timeout configuration is logged at startup in structured JSON format
   - Concurrency configuration is logged at startup in structured JSON format
   - All configuration errors logged with error level

3. **Concurrency Enforcement**
   - When concurrent connection limit is reached, new requests receive 503 Service Unavailable
   - 503 response includes clear error message indicating max connections exceeded
   - 503 response includes request ID for tracking
   - After connections complete and fall below limit, adapter accepts new requests without restart
   - Fastify's built-in `connectionLimit` option is leveraged for implementation

4. **Timeout Configuration Availability**
   - Timeout value is loaded, validated, and made available to request handlers
   - Value is stored in adapter config for use by Epic 5 (actual enforcement happens there)
   - Configuration is logged for operational visibility

## Tasks / Subtasks

- [ ] Task 1: Update Configuration Types and Add New Fields (AC: 1, 2)
  - [ ] Subtask 1.1: Add `upstreamTimeoutSeconds` and `maxConcurrentConnections` to `AdapterConfig` type
  - [ ] Subtask 1.2: Update `EnvConfig` interface in loader to include new env variables

- [ ] Task 2: Implement Configuration Validation (AC: 1, 2)
  - [ ] Subtask 2.1: Create env-schema validation rules for both variables
  - [ ] Subtask 2.2: Implement error message generation with examples and valid ranges
  - [ ] Subtask 2.3: Handle defaults (60 seconds, 1000 connections)
  - [ ] Subtask 2.4: Add structured JSON logging at startup

- [ ] Task 3: Integrate Concurrency Limiting into Fastify (AC: 3)
  - [ ] Subtask 3.1: Update `buildServer()` to pass `connectionLimit` to Fastify options
  - [ ] Subtask 3.2: Create error handler for connection limit exceeded (503 response)
  - [ ] Subtask 3.3: Ensure error response includes request ID and clear message

- [ ] Task 4: Unit Tests (AC: 1, 2)
  - [ ] Subtask 4.1: Test valid timeout values (30, 60, 120, 3600)
  - [ ] Subtask 4.2: Test valid concurrency limits (100, 500, 1000, 5000)
  - [ ] Subtask 4.3: Test invalid timeout values (negative, zero, non-numeric, missing)
  - [ ] Subtask 4.4: Test invalid concurrency values (negative, zero, non-numeric, missing)
  - [ ] Subtask 4.5: Test default values when env vars not set
  - [ ] Subtask 4.6: Test error messages include valid range and examples

- [ ] Task 5: Integration Tests (AC: 3)
  - [ ] Subtask 5.1: Simulate concurrent connections up to limit
  - [ ] Subtask 5.2: Verify 503 returned when limit reached
  - [ ] Subtask 5.3: Verify requests accepted after connections drop below limit
  - [ ] Subtask 5.4: Verify error response includes request ID

- [ ] Task 6: Documentation and Logging (AC: 2)
  - [ ] Subtask 6.1: Document new environment variables in README
  - [ ] Subtask 6.2: Include examples of configuration in deployment guide

## Dev Notes

### Architecture Context

**Previous Stories Completed:**
- **1-1**: Container build pipeline and Docker setup established
- **1-2**: Configuration loading framework implemented (env-schema, typed config)
- **1-3**: Health and readiness endpoints implemented

**Current Story Context:**
This story extends the configuration system (Story 1-2) to add two new operational parameters. The implementation builds on existing patterns:
- Use env-schema validation (established in 1-2)
- Follow structured JSON logging (established pattern in 1-2)
- Leverage Fastify's built-in features (connectionLimit option)

**Integration Points:**
- Config types defined in: `src/config/types.ts`
- Config loading in: `src/config/loader.ts` 
- Config validation in: `src/config/validator.ts`
- Server bootstrap in: `src/index.ts` (buildServer function)
- Configuration state in: `src/config/state.ts`

### Technical Requirements

**For Timeout Configuration:**
- Must be a positive integer > 0
- Unit: seconds
- Default: 60
- Must be available in `AdapterConfig.upstreamTimeoutSeconds` for later use in Epic 5
- Validation happens at startup (fail-fast pattern)
- Log format: structured JSON with `upstreamTimeoutSeconds` field

**For Concurrency Limiting:**
- Must be a positive integer > 0
- No unit (count of connections)
- Default: 1000
- Implementation uses Fastify's native `connectionLimit` option
- When exceeded: return 503 Service Unavailable immediately
- Error response must include:
  - Clear message: "Maximum concurrent connections exceeded"
  - Request ID for tracking
  - Proper HTTP 503 status code

**Validation Patterns:**
Follow existing validation approach from Story 1-2:
- Use env-schema with type: 'integer', minimum: 1
- Throw error immediately on validation failure
- Error message format: `<Variable> must be <condition>. Example: <value>`

**Logging Pattern:**
Follow Fastify + Pino structured logging established in previous stories:
```json
{
  "level": "info",
  "msg": "Configuration loaded successfully",
  "upstreamTimeoutSeconds": 60,
  "maxConcurrentConnections": 1000
}
```

**Testing Standards:**
- Unit tests: Test config validation in isolation (no Fastify server)
- Integration tests: Test actual connection limiting with Fastify running
- Use existing Vitest + supertest pattern from smoke tests
- Test both happy path and error cases

### Project Structure Notes

**No new files needed** - extend existing configuration system:
- `src/config/types.ts`: Add two fields to `AdapterConfig`
- `src/config/loader.ts`: Add env var schema validation
- `src/config/validator.ts`: May need to add custom validation rules
- `src/index.ts`: Update Fastify initialization with `connectionLimit`
- `tests/`: Add new test cases (can be in existing test files or new ones)

**Naming Convention:**
- Environment variables: SCREAMING_SNAKE_CASE (UPSTREAM_TIMEOUT_SECONDS, MAX_CONCURRENT_CONNECTIONS)
- Config properties: camelCase (upstreamTimeoutSeconds, maxConcurrentConnections)

### Key Decisions & Constraints

**Why Fastify's connectionLimit?**
- Fastify provides built-in connection limiting via the `connectionLimit` option
- When limit reached, connections are rejected immediately
- This is more efficient than application-level limiting
- No custom middleware needed

**Default Values:**
- 60 seconds timeout: Standard for HTTP operations, balances responsiveness and upstream delays
- 1000 concurrent connections: Conservative default for 128MB memory constraint, can be tuned higher in production

**Error Attribution:**
- Connection limit exceeded is an operational error (503)
- Validation errors during startup are configuration errors (process exit)
- Error responses include request ID for observability

### References

- [Epic 1: Deploy & Operate](../epic-1/epic-1.md#story-14-timeout-and-concurrency-configuration)
- [Architecture: Configuration Management](../architecture.md#project-context-analysis)
- [Fastify Docs: connectionLimit](https://www.fastify.io/docs/latest/Guides/HTTP2/)
- [Story 1-2: Configuration Loading and Validation](1-2-environment-configuration-validation.md)
- [Story 1-3: Health and Readiness Endpoints](1-3-production-health-and-readiness-endpoints.md)

## Dev Agent Record

### Agent Model Used

Claude Haiku 4.5

### Completion Notes

- [ ] Configuration types updated
- [ ] Environment variable validation implemented
- [ ] Fastify integration with connectionLimit completed
- [ ] Error response handling implemented
- [ ] Unit tests added
- [ ] Integration tests added
- [ ] Documentation updated
- [ ] All acceptance criteria verified

### File List

**Modified Files:**
- `src/config/types.ts`
- `src/config/loader.ts`
- `src/index.ts`

**Test Files:**
- `tests/unit/config/timeout-concurrency.test.ts` (new)
- `tests/integration/timeout-concurrency.test.ts` (new)

**Documentation:**
- `README.md` (updated)
