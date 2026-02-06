# Epic 2: Drop-in Proxy Compatibility

## Goal

Applications can point their base URL to the adapter and get OpenAI-compatible behavior with strong safety checks, logging, and transparent upstream errors.

## Description

This epic establishes the adapter as a production-grade drop-in proxy for OpenAI APIs. It enables applications to switch to the adapter by changing only the base URL, maintaining full protocol compatibility. The epic implements intelligent routing based on model detection, pass-through mode for efficiency when no translation is needed, comprehensive validation to protect against malformed requests, transparent error pass-through from upstream, and structured observability for troubleshooting and monitoring.

The adapter operates in two routing modes:
- **Pass-through mode**: When source format matches target format (based on model-to-API mapping), requests flow directly to OpenAI with <1ms overhead
- **Translation mode**: When formats differ, the translation engine (Epic 3) transforms requests/responses bidirectionally

This epic focuses on the operational proxy layer: routing, safety, logging, and error handling. The actual translation logic is deferred to Epic 3.

## Functional Requirements Covered

- **FR1-FR5:** Protocol compatibility and model-based routing
- **FR10-FR14:** Pass-through mode and request validation (size/depth limits)
- **FR27:** Unknown model rejection
- **FR34-FR36, FR38:** Request ID generation, extraction, duplicate detection
- **FR39-FR42, FR53:** Structured logging and observability
- **FR43, FR45-FR48, FR51-FR52:** Error handling with source attribution

**Note:** FR58-FR59 (forward compatibility for unknown fields) moved to Epic 3.

## Non-Functional Requirements Covered

- **NFR-P2:** Pass-through latency <1ms
- **NFR-P4, NFR-S4:** Concurrent request handling (100+), max connections (1000)
- **NFR-P6, NFR-P7:** Payload size limit (10MB), JSON depth validation (100 levels)
- **NFR-R2, NFR-R3:** Error transparency and graceful degradation
- **NFR-M2, NFR-M3, NFR-M4:** Correlation ID propagation, structured logging, debugging info
- **NFR-SEC3:** Input validation
- **NFR-C1:** OpenAI API contract compliance

## Built-in Quality & Documentation

- Contract tests for pass-through mode and error pass-through
- Logging schema documentation
- Request validation tests (size, depth, duplicate IDs)
- Error handling tests for all adapter error types

## Stories

1. [Story 2.1: HTTP Routing, Model Detection & Pass-Through](story-2.1.md)
2. [Story 2.2: Request Validation & Safety Guards](story-2.2.md)
3. [Story 2.3: Request ID Management & Duplicate Detection](story-2.3.md)
4. [Story 2.4: Error Handling & Attribution](story-2.4.md)
5. [Story 2.5: Structured Logging & Observability](story-2.5.md)
