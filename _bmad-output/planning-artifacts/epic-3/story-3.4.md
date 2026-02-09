# Story 3.4: Chat→Response Response Translation

**Epic:** [Epic 3: Core Bidirectional Translation](epic-3.md)

## User Story

**As a** Response API client application,  
**I want** Chat Completions API responses translated back to Response API format,  
**So that** I can process responses in the expected format after calling a Chat Completions model.

## Acceptance Criteria

**Given** a Chat Completions API response received from OpenAI  
**When** I translate it to Response API format  
**Then** it maps the choices array structure to Response API response format  
**And** it maps message content and role fields appropriately  
**And** it maps `finish_reason` between formats  
**And** it maps usage data (prompt_tokens, completion_tokens, total_tokens)  
**And** it preserves response metadata (id, created, model)  
**And** it passes through unknown fields unchanged  
**And** it logs any unknown fields detected

**When** translation completes  
**Then** the translation duration is measured and logged  
**And** the duration is <10ms for responses up to 100KB (NFR-P1)

**When** a round-trip test runs: Chat response → translate to Response → translate back to Chat  
**Then** the functional intent is preserved (equivalent behavior)  
**And** the test validates that response content, finish status, and usage are equivalent

**When** combined with Story 3.3 for full round-trip: Response request → Chat request → Chat response → Response response  
**Then** the end-to-end flow produces functionally equivalent results  
**And** the application receives responses in the expected Response API format

### Documentation

**And** the translation mapping documentation includes:  
- Field-by-field mapping table for Chat→Response response translation (see [translation-mapping-reference.md](translation-mapping-reference.md))  
- Examples showing before/after response formats  
- Notes on finish_reason mapping and usage data conversion  
- Performance benchmarks for this translation direction  
- Complete round-trip documentation for Response→Chat→Response flow

**Reference:** See [translation-mapping-reference.md](translation-mapping-reference.md) for complete field mappings with payload examples from OpenAI documentation.

## Technical Notes

**Translation Strategy:**
- Map Chat Completions choices array (typically single choice) to Response API response format
- Convert finish_reason to Response API status values
- Map usage data preserving token counts
- Preserve response metadata (id, created timestamp, model)
- Pass through unknown fields using the foundation from Story 3.1

**Testing:**
- Unit tests for response translation with various finish_reason values
- Performance tests validating <10ms overhead
- Round-trip tests: Chat response → Response → Chat validates equivalence
- Integration with Story 3.3: full Response→Chat→Response round-trip
- Edge cases: multiple choices (use first), different finish reasons, missing usage data, unknown fields

**Performance Target:**
- NFR-P1: <10ms translation for responses up to 100KB (95th percentile)

## Requirements Fulfilled

- FR9: Translate Response API responses to Chat Completions API format
- FR57: Field-level translation with protocol equivalence
- FR58: Pass through unknown fields unchanged
- FR59: Log unknown fields detected
- NFR-P1: Translation overhead <10ms
- NFR-C5: Round-trip testing validates equivalence
- NFR-M5: Translation documentation complete for all directions
