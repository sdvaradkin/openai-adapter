---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories-epic-1', 'step-03-create-stories-epic-2', 'step-03-create-stories-epic-3', 'step-03-create-stories-epic-4', 'step-03-create-stories-epic-5', 'step-03-create-stories-epic-6']
inputDocuments:
  - product-brief-openai-adapter-2026-02-02.md
  - prd.md
  - architecture.md
  - translation-mapping-reference.md
epicsWithStories:
  - epic-1: COMPLETE (4 stories in epic-1/ folder)
  - epic-2: COMPLETE (5 stories in epic-2/ folder)
  - epic-3: COMPLETE (5 stories in epic-3/ folder)
  - epic-4: COMPLETE (3 stories in epic-4/ folder)
  - epic-5: COMPLETE (3 stories in epic-5/ folder)
  - epic-6: COMPLETE (6 stories in epic-6/ folder)
pendingEpics: []
---

# openai-adapter - Epic Breakdown

**Status:** ALL EPICS COMPLETE - 6 Epics, 26 Stories Ready for Implementation

## Document Map

**Document Structure:**
- This file (epics.md): Requirements inventory, FR coverage map, and epic summaries
- Separate epic directories: Detailed epic descriptions and user stories

**Completed Sections:**
- ✅ Requirements Inventory
  - Functional Requirements: 72 FRs
  - Non-Functional Requirements: 50 NFRs
  - Additional Requirements
- ✅ FR Coverage Map
- ✅ Epic List (6 Epics)
  - Epic 1: Deploy & Operate (FR21-FR26, FR28-FR32)
  - Epic 2: Drop-in Proxy Compatibility (FR1-FR5, FR10-FR14, FR27, FR34-FR53)
  - Epic 3: Core Bidirectional Translation (FR6-FR9, FR57, FR58-FR59)
  - Epic 4: Response API → Chat Multi-turn with State (FR15-FR20, FR33, FR37, FR49, FR67-FR72)
  - Epic 5: Streaming Support (FR50, FR54, FR64)
  - Epic 6: MVP Feature Set (FR44, FR55-FR56, FR60-FR63, FR65-FR66)

**Epic Folders with Stories:**
- ✅ **epic-1/** Deploy & Operate the Adapter - **COMPLETE (4 stories)**
  - [epic-1/epic-1.md](epic-1/epic-1.md) - Epic description
  - [epic-1/story-1.1.md](epic-1/story-1.1.md) - Container Build Pipeline with Hello World
  - [epic-1/story-1.2.md](epic-1/story-1.2.md) - Environment Configuration & Validation
  - [epic-1/story-1.3.md](epic-1/story-1.3.md) - Production Health and Readiness Endpoints
  - [epic-1/story-1.4.md](epic-1/story-1.4.md) - Timeout and Concurrency Configuration
- ✅ **epic-2/** Drop-in Proxy Compatibility - **COMPLETE (5 stories)**
  - [epic-2/epic-2.md](epic-2/epic-2.md) - Epic description
  - [epic-2/story-2.1.md](epic-2/story-2.1.md) - Request Routing & Pass-Through Mode
  - [epic-2/story-2.2.md](epic-2/story-2.2.md) - Safety Validation & Request Guards
  - [epic-2/story-2.3.md](epic-2/story-2.3.md) - Error Handling & Transparent Proxying
  - [epic-2/story-2.4.md](epic-2/story-2.4.md) - Structured Logging & Observability
  - [epic-2/story-2.5.md](epic-2/story-2.5.md) - OpenAI Endpoint Compatibility
- ✅ **epic-3/** Core Bidirectional Translation - **COMPLETE (5 stories)**
  - [epic-3/epic-3.md](epic-3/epic-3.md) - Epic description
  - [epic-3/story-3.1.md](epic-3/story-3.1.md) - Chat→Response Request Translation + Foundation
  - [epic-3/story-3.2.md](epic-3/story-3.2.md) - Response→Chat Response Translation
  - [epic-3/story-3.3.md](epic-3/story-3.3.md) - Response→Chat Request Translation
  - [epic-3/story-3.4.md](epic-3/story-3.4.md) - Chat→Response Response Translation
  - [epic-3/story-3.5.md](epic-3/story-3.5.md) - Translation Pipeline Integration & Orchestration
- ✅ **epic-4/** Multi-turn Conversations with State - **COMPLETE (3 stories)**
  - [epic-4/epic-4.md](epic-4/epic-4.md) - Epic description
  - [epic-4/story-4.1.md](epic-4/story-4.1.md) - Redis Integration & Readiness Enhancement
  - [epic-4/story-4.2.md](epic-4/story-4.2.md) - Conversation State Storage with Error Handling
  - [epic-4/story-4.3.md](epic-4/story-4.3.md) - Response→Chat Multi-turn Translation with State Retrieval
- ✅ **epic-5/** Streaming Support - **COMPLETE (3 stories)**
  - [epic-5/epic-5.md](epic-5/epic-5.md) - Epic description
  - [epic-5/story-5.1.md](epic-5/story-5.1.md) - Pass-through Streaming Pipeline
  - [epic-5/story-5.2.md](epic-5/story-5.2.md) - Bidirectional Streaming Translation
  - [epic-5/story-5.3.md](epic-5/story-5.3.md) - Streaming Timeout Configuration & 504 Handling
- ✅ **epic-6/** MVP Feature Set + Compatibility Matrix - **COMPLETE (6 stories)**
  - [epic-6/epic-6.md](epic-6/epic-6.md) - Epic description
  - [epic-6/story-6.1.md](epic-6/story-6.1.md) - Feature Detection & Unsupported Feature Rejection
  - [epic-6/story-6.2.md](epic-6/story-6.2.md) - Vision Support Translation
  - [epic-6/story-6.3.md](epic-6/story-6.3.md) - Structured Outputs Translation
  - [epic-6/story-6.4.md](epic-6/story-6.4.md) - Function Calling Translation
  - [epic-6/story-6.5.md](epic-6/story-6.5.md) - Web Search Translation
  - [epic-6/story-6.6.md](epic-6/story-6.6.md) - Feature Compatibility Matrix & Documentation

**Next Step:** All epics complete! Review stories and begin implementation

---

## Overview

This document provides the complete epic and story breakdown for openai-adapter, decomposing the requirements from the PRD and Architecture into implementable epics and stories.

## Requirements Inventory

### Epic 1: Deploy & Operate the Adapter

**Functional Requirements:**
- FR21: System can load configuration from environment variables at startup
- FR22: System can validate target URL format before accepting requests
- FR23: System can validate required environment variables are present
- FR24: System can fail startup with clear error messages when configuration invalid
- FR25: System can accept model-to-API mapping configuration
- FR26: System can validate model names from incoming requests against configured model-to-API mapping
- FR28: System can be deployed as Docker container
- FR29: System can accept configuration for upstream timeout values
- FR30: System can accept configuration for maximum concurrent connections (default: 1000)
- FR31: System can provide health status via `/health` endpoint (returns 200 OK when adapter process is operational)
- FR32: System can provide readiness status via `/ready` endpoint (returns 200 OK when configuration loaded successfully, storage accessible, and adapter can accept requests)

**Non-Functional Requirements:**
- NFR-P3: Startup Time — Container startup completes in <5 seconds (cold start <5s, warm restart <2s)
- NFR-M1: Configuration Validation — All configuration errors detected at startup
- NFR-SEC1: Credential Isolation — OpenAI API credentials stored only in environment variables
- NFR-C2: Model-to-API Mapping Accuracy — Model detection and API selection accurate
- NFR-C4: Container Platform Compatibility — Docker 20.10+, Kubernetes 1.20+
- NFR-O1: Health Check Responsiveness — `/health` responds in <50ms
- NFR-O2: Readiness Check Accuracy — `/ready` accurate for config+storage accessibility
- NFR-U4: Quick Start Time — First deployment to requests <10 minutes
- NFR-OP1: 12-Factor App Compliance
- NFR-OP2: Resource Requests and Limits — Recommend memory/cpu requests & limits
- NFR-OP3: Signal Handling — SIGTERM graceful; SIGINT immediate
- NFR-OP4: Logging Levels — configurable at startup
- NFR-DP1: Container Deployment — functional state management with clear errors
- NFR-DP2: Multi-Architecture Support — amd64 and arm64
- NFR-DP3: Minimal Base Image — production image <150MB
- NFR-DP4: Configuration Portability — same image across environments

**Note:** FR33 (storage connectivity in readiness) and FR71 (storage connectivity at startup) are deferred to Epic 4 when Redis is introduced.

---

### Epic 2: Drop-in Proxy Compatibility

**Functional Requirements:**
- FR1: System endpoints maintain protocol compatibility with OpenAI API endpoints (drop-in replacement requiring only base URL change)
- FR2: System can receive requests at Response API endpoint (`/v1/responses`)
- FR3: System can receive requests at Chat Completions API endpoint (`/v1/chat/completions`)
- FR4: System can detect model name from incoming request payload
- FR5: System can determine target API format based on model-to-API mapping
- FR10: System can forward requests in pass-through mode when source format matches target format
- FR11: System can forward requests to configured OpenAI endpoint
- FR12: System response format matches OpenAI response format for transparent operation
- FR13: System can reject requests exceeding maximum payload size (10MB limit)
- FR14: System can validate JSON depth during translation mode (100 levels maximum)
- FR27: System can reject requests with unknown model names (400 Bad Request with specific model identification)
- FR34: System can generate request IDs (UUID format) for each incoming request for duplicate detection
- FR35: System can extract request IDs from incoming requests when provided
- FR36: System can reject duplicate request IDs with 400 Bad Request (request IDs must be unique per request)
- FR38: System can extract correlation IDs from incoming Response API requests for OpenAI state tracking
- FR39: System can log routing decisions with request ID and correlation ID
- FR40: System can log translation mode applied (translation or pass-through)
- FR41: System can log request URIs for troubleshooting
- FR42: System can output structured JSON logs to stdout
- FR43: System can pass through OpenAI error responses unchanged (4xx, 5xx) preserving headers and body
- FR45: System can return 400 Bad Request for invalid request format (includes malformed JSON, excessive nesting depth >100 levels, oversized payloads >10MB, duplicate request IDs)
- FR46: System can return 400 Bad Request for unknown model names with specific model identification
- FR47: System can return 500 Internal Server Error for adapter failures (includes malformed OpenAI response handling)
- FR48: System can return 503 Service Unavailable when maximum concurrent connections exceeded
- FR51: System can include request IDs in all error responses
- FR52: System can include error source attribution in error responses (adapter_error vs upstream_error vs storage_error)
- FR53: System can log detailed error information with stack traces for adapter failures

**Non-Functional Requirements:**
- NFR-P2: Pass-Through Latency — Pass-through mode introduces <1ms additional latency beyond network overhead (median <1ms, 99th percentile <5ms)
- NFR-P4: Request Processing Capacity — Handle ≥100 concurrent requests without degradation (P95 latency remains <50ms for translation operations under load)
- NFR-P6: Request Payload Size Limit — Maximum request payload size enforced at 10MB
- NFR-P7: JSON Parsing Resilience — JSON parser validates depth in all modes (max 100 nesting levels)
- NFR-S3: Resource Efficiency — CPU usage <5% idle, <30% during steady-state translation load
- NFR-S4: Maximum Concurrency Limit — Enforce max 1000 concurrent connections (configurable)
- NFR-R1: Availability Target — 99% uptime in test/staging environments
- NFR-R2: Error Transparency — 100% of OpenAI API errors passed through unchanged
- NFR-R3: Graceful Degradation — Adapter failures isolate to individual requests (no cascading failures)
- NFR-M2: Correlation ID Propagation — Every request assigned unique correlation ID, logged in all operations
- NFR-M3: Structured Logging — Logs output as structured JSON with consistent schema
- NFR-M4: Debugging Information — Logs include request URIs, translation decisions, error stack traces
- NFR-SEC2: Network-Level Security — Deployable on private networks without public exposure
- NFR-SEC3: Input Validation — Reject malformed JSON or invalid field types
- NFR-C1: OpenAI API Contract Compliance — Honor OpenAI API contracts for supported features
- NFR-O3: Logging Volume Management — <1MB logs per 1,000 requests at INFO
- NFR-O4: Error Log Protection — stack trace logging protection (post-MVP)
- NFR-U2: Error Message Clarity — Specific problem + resolution guidance
- NFR-U3: Zero Application Changes — Base URL change only

---

### Epic 3: Core Bidirectional Translation

**Functional Requirements:**
- FR6: System can translate Response API requests to Chat Completions API format
- FR7: System can translate Chat Completions API requests to Response API format
- FR8: System can translate Chat Completions API responses to Response API format
- FR9: System can translate Response API responses to Chat Completions API format
- FR57: System can perform field-level translation for supported features with protocol equivalence
- FR58: System can pass through unknown fields in OpenAI responses unchanged for forward compatibility
- FR59: System can log unknown fields detected in responses for monitoring

**Non-Functional Requirements:**
- NFR-P1: Translation Overhead — JSON transformation between API formats completes in <10ms for typical requests (95th percentile <10ms for requests up to 100KB)
- NFR-C5: Translation Accuracy Validation — Round-trip testing maintains functional equivalence
- NFR-M5: Documentation Currency — Translation documentation updated within 1 week of code changes

---

### Epic 4: Multi-turn Conversations with State

**Functional Requirements:**
- FR15: System initiates new conversation session when translating Chat Completions API requests to Response API format
- FR16: System generates unique correlation ID (UUID format) for each new Response API session
- FR17: System sends only current message (not full history) to Response API endpoint
- FR18: System extracts full conversation history from Chat Completions API requests when translating to Response API
- FR19: System persists conversation state across requests to enable multi-turn conversations for Chat Completions → Response API translation
- FR20: System retrieves conversation state from previous requests when processing subsequent messages in same conversation
- FR33: System can validate storage connectivity as part of readiness check (does not probe OpenAI endpoint)
- FR37: System can generate or extract conversation IDs for conversation state tracking (conversation IDs may repeat across requests in same conversation)
- FR49: System can return 503 Service Unavailable when storage unavailable
- FR67: System can store conversation state with automatic expiration (default: 24 hours)
- FR68: System can retrieve conversation state by conversation ID
- FR69: System can update conversation state with new messages and responses
- FR70: System can generate unique conversation IDs when not provided in request
- FR71: System can validate storage connectivity at startup
- FR72: System can handle storage unavailability with clear error responses (503 Service Unavailable)

**Non-Functional Requirements:**
- NFR-S1: Memory Footprint — Adapter operates reliably with 128MB memory allocation
- NFR-S2: Shared State Architecture — Conversation state supports horizontal scaling without session affinity
- NFR-D1: Conversation State Persistence — automatic expiration (24h default)
- NFR-D2: State Storage Reliability — storage outages return 503 without crashes
- NFR-D3: State Storage Security — encrypted in transit to external storage (TLS)

**Note:** This epic enhances the `/ready` endpoint from Epic 1 to include storage connectivity checks (FR33, FR71).

---

### Epic 5: Streaming Support

**Functional Requirements:**
- FR50: System can return 504 Gateway Timeout when upstream timeout exceeded
- FR54: System can time out upstream requests after configured duration (non-streaming: full request-response; streaming: time-to-first-byte + idle timeout semantics)
- FR64: System can translate streaming responses (SSE format) in both pass-through and translation modes

**Non-Functional Requirements:**
- NFR-P5: Upstream Timeout Configuration — Configurable upstream timeouts with streaming-aware semantics (default: 60 seconds)
- NFR-R4: Graceful Shutdown — SIGTERM completes in-flight requests (<30s)

---

### Epic 6: MVP Feature Set

**Functional Requirements:**
- FR44: System can return 422 Unprocessable Entity for unsupported features
- FR55: System can detect feature types in incoming requests (vision, function calling, structured outputs, streaming, etc.)
- FR56: System can validate whether detected features are translatable between API formats
- FR60: System can fail fast with 422 Unprocessable Entity when feature translation not supported
- FR61: System can provide error response indicating which specific feature cannot be translated
- FR62: System can log feature translation attempts with success/failure status
- FR63: System maintains feature support for MVP scope: text generation, vision, structured outputs, function calling, web search (all other listed capabilities explicitly deferred in MVP with 422 Unsupported)
- FR65: System can translate request/response fields for all MVP-supported FR63 features between Response API and Chat Completions API formats
- FR66: System validates feature compatibility at request time and rejects unsupported feature combinations

**Non-Functional Requirements:**
- NFR-C3: Feature Detection Accuracy — Detect unsupported translation scenarios (zero false positives)
- NFR-Q1: Code Coverage — ≥80% unit test coverage
- NFR-Q2: Contract Test Coverage — 100% supported endpoints covered
- NFR-Q3: CI Execution Time — full CI <5 minutes (P50)
- NFR-Q4: Automated Testing — all FRs validated by automated tests (≥95% coverage)

**MVP "fully supported" features:** text generation, vision, structured outputs, function calling, web search

**Post-MVP / deferred (explicit 422 in MVP):** file search, computer use, code interpreter, MCP integration, image generation, reasoning summaries (and any other emerging features)

---

### Summary Counts

- **Total Functional Requirements:** 72 FRs
- **Total Non-Functional Requirements:** 50 NFRs

### Additional Requirements (Cross-Epic)

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

## Epic List

### Epic 1: Deploy & Operate the Adapter (config + health/ready)

DevOps can run the adapter as a container with validated configuration and clear health/readiness.

**FRs covered:** FR21–FR26, FR28–FR30, FR31–FR32

**Note:** FR33 (storage connectivity in readiness) and FR71 (storage connectivity at startup) are deferred to Epic 4 when Redis is introduced.

**Built-in quality/docs (done within epic):** deployment guide + env var reference + config troubleshooting, plus basic tests for config validation.

### Epic 2: Drop-in Proxy Compatibility (routing + safety + observability)

Applications can point their base URL to the adapter and get OpenAI-compatible behavior with strong safety checks, logging, and transparent upstream errors.

**FRs covered:** FR1–FR5, FR10–FR14, FR11–FR12, FR27, FR30, FR34–FR53

**Built-in quality/docs (done within epic):** contract tests for pass-through + error pass-through; logging schema documented.

### Epic 3: Core Bidirectional Translation (non-streaming baseline)

Teams can translate between Response API and Chat Completions API for baseline non-streaming flows.

**FRs covered:** FR6–FR9, FR57–FR59

**Built-in quality/docs (done within epic):** mapping notes + contract tests for baseline translation flows.

### Epic 4: Multi-turn Conversations (Response → Chat) with Shared State

**Stateful Response API clients can work against Chat Completions models across turns**, with conversation history maintained in shared storage.

**FRs covered:** FR15–FR20, FR33, FR37, FR49, FR67–FR72

**Note:** This epic focuses on **Response API → Chat Completions** translation. Chat Completions → Response API is stateless (client provides full messages array) and is covered in Epic 3.

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
