# Story 3.3: Response→Chat Request Translation

**Epic:** [Epic 3: Core Bidirectional Translation](epic-3.md)

## User Story

**As a** Response API client application,  
**I want** my requests translated to Chat Completions API format,  
**So that** I can use Chat Completions models without changing my application code.

## Acceptance Criteria

**Given** a Response API request with a single message  
**When** I translate it to Chat Completions API format  
**Then** it wraps the single message into a messages array structure  
**And** it maps the `role` and `content` fields appropriately  
**And** it maps the `model` field to Chat Completions format  
**And** it maps parameters: `temperature`, `max_tokens`, `top_p`, etc.  
**And** it passes through unknown fields unchanged  
**And** it logs any unknown fields detected

**Given** a Response API request with a `correlation_id` field  
**When** translating to Chat Completions format  
**Then** it extracts and preserves the correlation ID for state tracking (foundation for Epic 4)  
**And** it logs the correlation ID for OpenAI state association

**When** translation completes  
**Then** the translation duration is measured and logged  
**And** the duration is <10ms for requests up to 100KB (NFR-P1)

**When** a round-trip test runs: Response request → translate to Chat → translate back to Response  
**Then** the functional intent is preserved (equivalent behavior)  
**And** the test validates that the message wrapping/unwrapping is correct

### Documentation

**And** the translation mapping documentation includes:  
- Field-by-field mapping table for Response→Chat request translation (see [translation-mapping-reference.md](translation-mapping-reference.md))  
- Examples showing before/after request formats  
- Notes on message array wrapping (single message → array)  
- Notes on correlation_id extraction for state tracking  
- Performance benchmarks for this translation direction

**Reference:** See [translation-mapping-reference.md](translation-mapping-reference.md) for complete field mappings with payload examples from OpenAI documentation.

## Technical Notes

**Translation Strategy:**
- Wrap the single Response API message into a Chat Completions messages array
- Map common parameters between formats
- Extract correlation_id if present (used for state tracking in Epic 4)
- Pass through unknown fields using the foundation from Story 3.1

**Correlation ID Handling:**
- Extract `correlation_id` from Response API request if present
- Log correlation ID for future state management (Epic 4)
- This is the simpler direction (no history extraction needed)

**Testing:**
- Unit tests for request translation with various message formats
- Performance tests validating <10ms overhead
- Round-trip tests: Response request → Chat → Response validates equivalence
- Edge cases: missing correlation_id, unknown fields

**Performance Target:**
- NFR-P1: <10ms translation for requests up to 100KB (95th percentile)

## Requirements Fulfilled

- FR6: Translate Response API requests to Chat Completions API format
- FR57: Field-level translation with protocol equivalence
- FR58: Pass through unknown fields unchanged
- FR59: Log unknown fields detected
- NFR-P1: Translation overhead <10ms
- NFR-C5: Round-trip testing validates equivalence
