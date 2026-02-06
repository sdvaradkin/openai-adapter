---
stepsCompleted: ['step-01-validate-prerequisites']
inputDocuments:
  - product-brief-openai-adapter-2026-02-02.md
  - prd.md
  - architecture.md
---

# openai-adapter - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for openai-adapter, decomposing the requirements from the PRD and Architecture into implementable epics and stories.

## Requirements Inventory

### Functional Requirements

FR1: System endpoints maintain protocol compatibility with OpenAI API endpoints (drop-in replacement requiring only base URL change)
FR2: System can receive requests at Response API endpoint (`/v1/responses`)
FR3: System can receive requests at Chat Completions API endpoint (`/v1/chat/completions`)
FR4: System can detect model name from incoming request payload
FR5: System can determine target API format based on model-to-API mapping
FR6: System can translate Response API requests to Chat Completions API format
FR7: System can translate Chat Completions API requests to Response API format
FR8: System can translate Chat Completions API responses to Response API format
FR9: System can translate Response API responses to Chat Completions API format
FR10: System can forward requests in pass-through mode when source format matches target format
FR11: System can forward requests to configured OpenAI endpoint
FR12: System response format matches OpenAI response format for transparent operation
FR13: System can reject requests exceeding maximum payload size (10MB limit)
FR14: System can validate JSON depth during translation mode (100 levels maximum)
FR15: System initiates new conversation session when translating Chat Completions API requests to Response API format
FR16: System generates unique correlation ID (UUID format) for each new Response API session
FR17: System sends only current message (not full history) to Response API endpoint
FR18: System extracts full conversation history from Chat Completions API requests when translating to Response API
FR19: System persists conversation state across requests to enable multi-turn conversations for Chat Completions → Response API translation
FR20: System retrieves conversation state from previous requests when processing subsequent messages in same conversation
FR21: System can load configuration from environment variables at startup
FR22: System can validate target URL format before accepting requests
FR23: System can validate required environment variables are present
FR24: System can fail startup with clear error messages when configuration invalid
FR25: System can accept model-to-API mapping configuration
FR26: System can validate model names from incoming requests against configured model-to-API mapping
FR27: System can reject requests with unknown model names (400 Bad Request with specific model identification)
FR28: System can be deployed as Docker container
FR29: System can accept configuration for upstream timeout values
FR30: System can accept configuration for maximum concurrent connections (default: 1000)
FR31: System can provide health status via `/health` endpoint (returns 200 OK when adapter process is operational)
FR32: System can provide readiness status via `/ready` endpoint (returns 200 OK when configuration loaded successfully, storage accessible, and adapter can accept requests)
FR33: System can validate storage connectivity as part of readiness check (does not probe OpenAI endpoint)
FR34: System can generate request IDs (UUID format) for each incoming request for duplicate detection
FR35: System can extract request IDs from incoming requests when provided
FR36: System can reject duplicate request IDs with 400 Bad Request (request IDs must be unique per request)
FR37: System can generate or extract conversation IDs for conversation state tracking (conversation IDs may repeat across requests in same conversation)
FR38: System can extract correlation IDs from incoming Response API requests for OpenAI state tracking
FR39: System can log routing decisions with request ID and correlation ID
FR40: System can log translation mode applied (translation or pass-through)
FR41: System can log request URIs for troubleshooting
FR42: System can output structured JSON logs to stdout
FR43: System can pass through OpenAI error responses unchanged (4xx, 5xx) preserving headers and body
FR44: System can return 422 Unprocessable Entity for unsupported features
FR45: System can return 400 Bad Request for invalid request format (includes malformed JSON, excessive nesting depth >100 levels, oversized payloads >10MB, duplicate request IDs)
FR46: System can return 400 Bad Request for unknown model names with specific model identification
FR47: System can return 500 Internal Server Error for adapter failures (includes malformed OpenAI response handling)
FR48: System can return 503 Service Unavailable when maximum concurrent connections exceeded
FR49: System can return 503 Service Unavailable when storage unavailable
FR50: System can return 504 Gateway Timeout when upstream timeout exceeded
FR51: System can include request IDs in all error responses
FR52: System can include error source attribution in error responses (adapter_error vs upstream_error vs storage_error)
FR53: System can log detailed error information with stack traces for adapter failures
FR54: System can time out upstream requests after configured duration (non-streaming: full request-response; streaming: time-to-first-byte + idle timeout semantics)
FR55: System can detect feature types in incoming requests (vision, function calling, structured outputs, streaming, etc.)
FR56: System can validate whether detected features are translatable between API formats
FR57: System can perform field-level translation for supported features with protocol equivalence
FR58: System can pass through unknown fields in OpenAI responses unchanged for forward compatibility
FR59: System can log unknown fields detected in responses for monitoring
FR60: System can fail fast with 422 Unprocessable Entity when feature translation not supported
FR61: System can provide error response indicating which specific feature cannot be translated
FR62: System can log feature translation attempts with success/failure status
FR63: System maintains feature support for MVP scope: text generation, vision, structured outputs, function calling, web search (all other listed capabilities explicitly deferred in MVP with 422 Unsupported)
FR64: System can translate streaming responses (SSE format) in both pass-through and translation modes
FR65: System can translate request/response fields for all MVP-supported FR63 features between Response API and Chat Completions API formats
FR66: System validates feature compatibility at request time and rejects unsupported feature combinations
FR67: System can store conversation state with automatic expiration (default: 24 hours)
FR68: System can retrieve conversation state by conversation ID
FR69: System can update conversation state with new messages and responses
FR70: System can generate unique conversation IDs when not provided in request
FR71: System can validate storage connectivity at startup
FR72: System can handle storage unavailability with clear error responses (503 Service Unavailable)

Total FRs: 72

### NonFunctional Requirements

NFR-P1: Translation Overhead — JSON transformation between API formats completes in <10ms for typical requests (95th percentile <10ms for requests up to 100KB)
NFR-P2: Pass-Through Latency — Pass-through mode introduces <1ms additional latency beyond network overhead (median <1ms, 99th percentile <5ms)
NFR-P3: Startup Time — Container startup completes in <5 seconds (cold start <5s, warm restart <2s)
NFR-P4: Request Processing Capacity — Handle ≥100 concurrent requests without degradation (P95 latency remains <50ms for translation operations under load)
NFR-P5: Upstream Timeout Configuration — Configurable upstream timeouts with streaming-aware semantics (default: 60 seconds)
NFR-P6: Request Payload Size Limit — Maximum request payload size enforced at 10MB
NFR-P7: JSON Parsing Resilience — JSON parser validates depth in all modes (max 100 nesting levels)

NFR-S1: Memory Footprint — Adapter operates reliably with 128MB memory allocation
NFR-S2: Shared State Architecture — Conversation state supports horizontal scaling without session affinity
NFR-S3: Resource Efficiency — CPU usage <5% idle, <30% during steady-state translation load
NFR-S4: Maximum Concurrency Limit — Enforce max 1000 concurrent connections (configurable)

NFR-R1: Availability Target — 99% uptime in test/staging environments
NFR-R2: Error Transparency — 100% of OpenAI API errors passed through unchanged
NFR-R3: Graceful Degradation — Adapter failures isolate to individual requests (no cascading failures)
NFR-R4: Graceful Shutdown — SIGTERM completes in-flight requests (<30s)

NFR-M1: Configuration Validation — All configuration errors detected at startup
NFR-M2: Correlation ID Propagation — Every request assigned unique correlation ID, logged in all operations
NFR-M3: Structured Logging — Logs output as structured JSON with consistent schema
NFR-M4: Debugging Information — Logs include request URIs, translation decisions, error stack traces
NFR-M5: Documentation Currency — Translation documentation updated within 1 week of code changes

NFR-SEC1: Credential Isolation — OpenAI API credentials stored only in environment variables
NFR-SEC2: Network-Level Security — Deployable on private networks without public exposure
NFR-SEC3: Input Validation — Reject malformed JSON or invalid field types

NFR-C1: OpenAI API Contract Compliance — Honor OpenAI API contracts for supported features
NFR-C2: Model-to-API Mapping Accuracy — Model detection and API selection accurate
NFR-C3: Feature Detection Accuracy — Detect unsupported translation scenarios (zero false positives)
NFR-C4: Container Platform Compatibility — Docker 20.10+, Kubernetes 1.20+
NFR-C5: Translation Accuracy Validation — Round-trip testing maintains functional equivalence

NFR-O1: Health Check Responsiveness — `/health` responds in <50ms
NFR-O2: Readiness Check Accuracy — `/ready` accurate for config+storage accessibility
NFR-O3: Logging Volume Management — <1MB logs per 1,000 requests at INFO
NFR-O4: Error Log Protection — stack trace logging protection (post-MVP)

NFR-U2: Error Message Clarity — Specific problem + resolution guidance
NFR-U3: Zero Application Changes — Base URL change only
NFR-U4: Quick Start Time — First deployment to requests <10 minutes

NFR-OP1: 12-Factor App Compliance
NFR-OP2: Resource Requests and Limits — Recommend memory/cpu requests & limits
NFR-OP3: Signal Handling — SIGTERM graceful; SIGINT immediate
NFR-OP4: Logging Levels — configurable at startup

NFR-D1: Conversation State Persistence — automatic expiration (24h default)
NFR-D2: State Storage Reliability — storage outages return 503 without crashes
NFR-D3: State Storage Security — encrypted in transit to external storage (TLS)

NFR-Q1: Code Coverage — ≥80% unit test coverage
NFR-Q2: Contract Test Coverage — 100% supported endpoints covered
NFR-Q3: CI Execution Time — full CI <5 minutes (P50)
NFR-Q4: Automated Testing — all FRs validated by automated tests (≥95% coverage)

NFR-DP1: Container Deployment — functional state management with clear errors
NFR-DP2: Multi-Architecture Support — amd64 and arm64
NFR-DP3: Minimal Base Image — production image <150MB
NFR-DP4: Configuration Portability — same image across environments

Total NFRs: 50

### Additional Requirements

- Runtime/Language: Node.js 20.x, TypeScript (strict)
- HTTP framework: Fastify 4.x
- Logging: Pino structured JSON logging
- Config validation: env-schema at startup; fail-fast on invalid/missing configuration
- State storage: Redis (via ioredis) for Chat Completions → Response API conversation state; must support horizontal scaling
- Streaming: SSE pass-through (pipe) when formats match; event-by-event parse/translate/format when translating
- Validation: enforce max request size 10MB and max JSON depth 100 in all modes
- Error handling: upstream errors pass through bit-for-bit; adapter-generated errors include request ID and error attribution (adapter/upstream/storage)
- Operational endpoints: `/health` and `/ready` (readiness checks config + storage; does not probe OpenAI)
- Concurrency: enforce max concurrent connections (default 1000) returning 503 when exceeded
- Timeouts: upstream timeouts configurable; streaming requires headers timeout + idle timeout semantics
- Docker: multi-stage build, non-root user, alpine/minimal base; image target <150MB
- Testing: unit + contract tests (Vitest); integration tests with real Redis (testcontainers)
- Documentation deliverables (MVP): OpenAPI spec, translation mapping docs, feature compatibility matrix, deployment/config guides, error code reference

### FR Coverage Map

### FR Coverage Map

FR1: Epic 2 - Drop-in proxy compatibility
FR2: Epic 2 - Expose `/v1/responses` entrypoint
FR3: Epic 2 - Expose `/v1/chat/completions` entrypoint
FR4: Epic 2 - Model extraction from payload
FR5: Epic 2 - Mapping lookup (model → target API)
FR6: Epic 3 - Translate Response → Chat (non-streaming)
FR7: Epic 3 - Translate Chat → Response (non-streaming)
FR8: Epic 3 - Translate Chat responses → Response
FR9: Epic 3 - Translate Response responses → Chat
FR10: Epic 2 - Pass-through mode when formats match
FR11: Epic 2 - Forward to configured upstream OpenAI endpoint
FR12: Epic 2 - Preserve OpenAI-compatible response shapes
FR13: Epic 2 - Reject oversized payloads (10MB)
FR14: Epic 2 - Enforce JSON depth limit (100) in all modes
FR15: Epic 4 - Start Chat→Response conversation session
FR16: Epic 4 - Generate correlation ID for Response session
FR17: Epic 4 - Send only current message to Response endpoint
FR18: Epic 4 - Extract full chat history for state update
FR19: Epic 4 - Persist conversation state across requests
FR20: Epic 4 - Retrieve prior conversation state for subsequent turns
FR21: Epic 1 - Load configuration from environment at startup
FR22: Epic 1 - Validate target URL format
FR23: Epic 1 - Validate required environment variables present
FR24: Epic 1 - Fail startup with clear configuration errors
FR25: Epic 1 - Accept model-to-API mapping config
FR26: Epic 1 - Validate mapping contents (models/types)
FR27: Epic 2 - Reject unknown model names with specific error
FR28: Epic 1 - Docker container packaging
FR29: Epic 1 - Upstream timeout config surface
FR30: Epic 2 - Max concurrent connections config + enforcement
FR31: Epic 1 - `/health` endpoint
FR32: Epic 1 - `/ready` endpoint
FR33: Epic 1 - Readiness checks storage connectivity (not OpenAI)
FR34: Epic 2 - Request ID generation for each request
FR35: Epic 2 - Extract request IDs when provided
FR36: Epic 2 - Duplicate request ID rejection
FR37: Epic 4 - Conversation ID extraction/generation for state tracking
FR38: Epic 2 - Correlation ID extraction from Response requests
FR39: Epic 2 - Log routing decisions with IDs
FR40: Epic 2 - Log translation mode (pass-through vs translate)
FR41: Epic 2 - Log request URIs
FR42: Epic 2 - Structured JSON logs to stdout
FR43: Epic 2 - Upstream error pass-through unchanged
FR44: Epic 6 - 422 for unsupported features
FR45: Epic 2 - 400 for malformed/invalid requests (size/depth/dup IDs)
FR46: Epic 2 - 400 for unknown models (explicit)
FR47: Epic 2 - 500 for adapter failures + safe error body
FR48: Epic 2 - 503 when max concurrency exceeded
FR49: Epic 4 - 503 when storage unavailable
FR50: Epic 5 - 504 for upstream timeout
FR51: Epic 2 - Include request IDs in all error responses
FR52: Epic 2 - Include error source attribution in errors
FR53: Epic 2 - Log error details + stack traces (with sane defaults)
FR54: Epic 5 - Streaming-aware timeout semantics (TTFB + idle timeout)
FR55: Epic 6 - Detect feature types in requests
FR56: Epic 6 - Validate translatability per feature
FR57: Epic 3 - Field-level translation for supported features (baseline)
FR58: Epic 2 - Unknown response fields pass-through for forward compat
FR59: Epic 2 - Log unknown fields for monitoring
FR60: Epic 6 - Fail fast with 422 on unsupported translation
FR61: Epic 6 - Error response identifies specific unsupported feature
FR62: Epic 6 - Log feature translation attempts success/failure
FR63: Epic 6 - MVP supports: text generation, vision, structured outputs, function calling, web search; others explicitly deferred (422) and tracked
FR64: Epic 5 - Translate streaming responses in pass-through + translation
FR65: Epic 6 - Translate request/response fields for MVP feature set (and document 422 for deferred)
FR66: Epic 6 - Validate feature compatibility at request time
FR67: Epic 4 - Store conversation state with TTL (24h default)
FR68: Epic 4 - Retrieve conversation state by conversation ID
FR69: Epic 4 - Update conversation state with new messages/responses
FR70: Epic 4 - Generate unique conversation IDs when not provided
FR71: Epic 1 - Validate storage connectivity at startup
FR72: Epic 4 - Handle storage unavailability with clear 503 responses

## Epic List

## Epic List

### Epic 1: Deploy & Operate the Adapter (config + health/ready)

DevOps can run the adapter as a container with validated configuration and clear health/readiness.

**FRs covered:** FR21–FR26, FR28–FR30, FR31–FR32

**Note:** FR33 (storage connectivity in readiness) and FR71 (storage connectivity at startup) are deferred to Epic 4 when Redis is introduced.

**Built-in quality/docs (done within epic):** deployment guide + env var reference + config troubleshooting, plus basic tests for config validation.

### Epic 2: Drop-in Proxy Compatibility (routing + safety + observability)

Applications can point their base URL to the adapter and get OpenAI-compatible behavior with strong safety checks, logging, and transparent upstream errors.

**FRs covered:** FR1–FR5, FR10–FR14, FR11–FR12, FR27, FR30, FR34–FR53, FR58–FR59

**Built-in quality/docs (done within epic):** contract tests for pass-through + error pass-through; logging schema documented.

### Epic 3: Core Bidirectional Translation (non-streaming baseline)

Teams can translate between Response API and Chat Completions API for baseline non-streaming flows.

**FRs covered:** FR6–FR9, FR57

**Built-in quality/docs (done within epic):** mapping notes + contract tests for baseline translation flows.

### Epic 4: Multi-turn Conversations (Chat → Response) with Shared State

Stateless chat clients can work against Response API models across turns, with state persisted in shared storage and resilient error behavior.

**FRs covered:** FR15–FR20, FR33, FR37, FR49, FR67–FR72

**Note:** This epic also enhances the `/ready` endpoint from Epic 1 to include storage connectivity checks (FR33, FR71).

**Built-in quality/docs (done within epic):** Redis/state model docs + integration tests against real Redis.

### Epic 5: Streaming Support (SSE) + Streaming-aware Timeouts

Streaming works in both pass-through and translation modes with correct timeout semantics (TTFB + idle timeout).

**FRs covered:** FR50, FR54, FR64

**Built-in quality/docs (done within epic):** streaming examples + timeout behavior tests.

### Epic 6: MVP Feature Set (FR63 subset) + Compatibility Matrix + 422s for Deferred Features

The adapter explicitly supports the MVP feature set and is explicit (and safe) for anything deferred.

**MVP “fully supported” features:** text generation, vision, structured outputs, function calling, web search

**Post-MVP / deferred (explicit 422 in MVP):** file search, computer use, code interpreter, MCP integration, image generation, reasoning summaries (and any other emerging features)

**FRs covered:** FR44, FR55–FR56, FR60–FR63, FR65–FR66

**Built-in quality/docs (done within epic):** feature compatibility matrix + per-feature contract tests for the MVP-supported set.
