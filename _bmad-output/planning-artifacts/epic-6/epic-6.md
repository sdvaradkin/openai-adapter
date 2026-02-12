# Epic 6: MVP Feature Set + Compatibility Matrix

## Goal

The adapter explicitly supports the MVP feature set with full translation and rejects unsupported features safely with clear 422 responses.

## Description

This epic implements feature detection, validation, and translation for the five MVP-supported features: text generation, vision, structured outputs, function calling, and web search. It establishes a feature compatibility framework that validates incoming requests, ensures translation support exists, and provides explicit 422 rejection for post-MVP features (file search, computer use, code interpreter, MCP integration, image generation, reasoning summaries).

The feature detection layer integrates with the existing validation pipeline from Epic 2, adding feature-level validation before translation. Each supported feature receives dedicated translation logic extending the core translation infrastructure from Epic 3. The epic includes comprehensive contract tests for each feature and produces a static compatibility matrix document that serves as the definitive reference for what the adapter supports.

This epic completes the MVP by making the adapter feature-aware, ensuring it handles only what it can translate correctly, and providing clear feedback when features are unsupported.

## Functional Requirements Covered

- **FR44:** Return 422 Unprocessable Entity for unsupported features
- **FR55:** Detect feature types in incoming requests (vision, function calling, structured outputs, streaming, etc.)
- **FR56:** Validate whether detected features are translatable between API formats
- **FR60:** Fail fast with 422 when feature translation not supported
- **FR61:** Provide error response indicating which specific feature cannot be translated
- **FR62:** Log feature translation attempts with success/failure status
- **FR63:** Maintain feature support for MVP scope: text generation, vision, structured outputs, function calling, web search
- **FR65:** Translate request/response fields for all MVP-supported features between Response API and Chat Completions API formats
- **FR66:** Validate feature compatibility at request time and reject unsupported feature combinations

## Non-Functional Requirements Covered

- **NFR-C3:** Feature Detection Accuracy — Detect unsupported translation scenarios (zero false positives)
- **NFR-Q1:** Code Coverage — ≥80% unit test coverage
- **NFR-Q2:** Contract Test Coverage — 100% supported endpoints covered
- **NFR-Q3:** CI Execution Time — full CI <5 minutes (P50)
- **NFR-Q4:** Automated Testing — all FRs validated by automated tests (≥95% coverage)

## Built-in Quality & Documentation

- Feature compatibility matrix document (static markdown)
- Per-feature translation documentation with examples
- Contract tests for all MVP-supported features
- Feature detection test coverage report
- 422 error response catalog

## Stories

1. [Story 6.1: Feature Detection & Unsupported Feature Rejection](story-6.1.md)
2. [Story 6.2: Vision Support Translation](story-6.2.md)
3. [Story 6.3: Structured Outputs Translation](story-6.3.md)
4. [Story 6.4: Function Calling Translation](story-6.4.md)
5. [Story 6.5: Web Search Translation](story-6.5.md)
6. [Story 6.6: Feature Compatibility Matrix & README Documentation](story-6.6.md) - **PoC: Simple README section instead of formal matrix**

**Note:** Feature-specific validation logic is included within each feature's translation story (6.2-6.5).

## Dependencies

**Depends on:**
- Epic 1: Configuration and container foundation
- Epic 2: Validation pipeline and error handling infrastructure
- Epic 3: Core translation infrastructure and utilities

**Enables:**
- Complete MVP feature set
- Production readiness for supported use cases
- Clear boundaries for post-MVP features
