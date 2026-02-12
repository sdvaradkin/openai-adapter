# Epic 2: Drop-in Proxy Compatibility

## Goal

Applications can point their base URL to the adapter and get OpenAI-compatible behavior with strong safety checks, logging, and transparent upstream errors.

## Description

**PoC Scope:** This epic establishes the adapter as a functional drop-in proxy for OpenAI APIs. It enables applications to switch to the adapter by changing only the base URL, maintaining full protocol compatibility. The epic implements intelligent routing based on model detection and pass-through mode for requests that don't need translation, plus comprehensive validation to protect against malformed requests.

The adapter operates in two routing modes:
- **Pass-through mode**: When source format matches target format (based on model-to-API mapping), requests flow directly to OpenAI
- **Translation mode**: When formats differ, the translation engine (Epic 3) transforms requests/responses bidirectionally

This epic focuses on the core proxy layer: routing and safety validation. Request ID generation (already implemented in Fastify), detailed error attribution, and structured observability are deferred to post-PoC. The actual translation logic is implemented in Epic 3.

**Pipeline Architecture:** See [architecture.md - Request/Response Pipeline Architecture](../architecture.md#requestresponse-pipeline-architecture) for the complete flow diagram showing how routing, validation, error handling, and logging integrate together.

## Functional Requirements Covered

- **FR1-FR5:** Protocol compatibility and model-based routing
- **FR10-FR14:** Pass-through mode and request validation (size/depth limits, safety-focused)
- **FR27:** Unknown model rejection

**PoC Deferred (Post-MVP):**
- FR34-FR36, FR38 (Request ID duplicate detection via Redis) → Deferred
- FR39-FR42, FR53 (Structured logging and observability) → Deferred
- FR43, FR45-FR48, FR51-FR52 (Error attribution and detailed error handling) → Deferred to post-PoC

**Note:** FR58-FR59 (forward compatibility for unknown fields) moved to Epic 3.

## Non-Functional Requirements Covered (PoC Scope)

**Kept (Functional Requirements):**
- **NFR-P6, NFR-P7:** Payload size limit (10MB), JSON depth validation (100 levels) - for safety, not performance target
- **NFR-SEC3:** Input validation for malformed requests
- **NFR-C1:** OpenAI API contract compatibility (requests/responses format match)

**Deferred to Post-PoC (Performance & Operations):**
- NFR-P2: Pass-through latency targets
- NFR-P4: Concurrent request handling targets
- NFR-S1, NFR-S4: Memory and connection pool targets
- NFR-R2, NFR-R3: Error transparency with source attribution
- NFR-M2, NFR-M3, NFR-M4: Structured logging and correlation IDs
- All other performance, scalability, and monitoring NFRs

## Built-in Quality & Documentation

- Functional tests for pass-through mode routing
- Request validation tests (size, depth checks)
- Basic error handling tests (upstream pass-through)
- Integration tests for model-based routing and safety validation

## Stories

1. [Story 2.1: HTTP Routing, Model Detection & Pass-Through](story-2.1.md)
2. [Story 2.2: Request Validation & Safety Guards](story-2.2.md)

**PoC Deferred Stories (Post-PoC Epic 7):**
- Story 2.3: Request ID Duplicate Detection (Redis dedup) → DEFERRED
- Story 2.4: Error Attribution with source field → DEFERRED  
- Story 2.5: Structured Logging & Observability → DEFERRED

**PoC Approach:** Use Fastify's built-in `request.id`, pass-through errors as-is, use `console.log` for logging.
