# Story 3.1: Chat→Response Request Translation + Foundation

**Epic:** [Epic 3: Core Bidirectional Translation](epic-3.md)

## User Story

**As a** developer working on the translation engine,  
**I want** the foundational translation infrastructure plus the first translation direction (Chat Completions → Response API requests),  
**So that** I have the patterns, utilities, and tests to implement the remaining translation directions consistently.

## Acceptance Criteria

### Translation Foundation

**Given** the adapter needs to handle unknown OpenAI fields in any translation  
**When** I implement the unknown field handler utility  
**Then** it can identify fields not in the known mapping schema  
**And** it passes through unknown fields unchanged to the output  
**And** it returns a list of unknown fields detected for logging

**When** I implement the translation logging framework  
**Then** it logs translation decisions as structured JSON  
**And** it includes request ID, translation direction, mode (pass-through vs translate), and unknown fields detected  
**And** it logs translation timing (start, end, duration in milliseconds)

**When** I implement translation performance measurement  
**Then** it measures translation duration for each request  
**And** it can validate performance against NFR-P1 (<10ms for typical requests)

**When** I implement the round-trip test harness  
**Then** it can validate functional equivalence: request → translate → translate back → compare  
**And** it provides clear diff output when round-trip fails  
**And** it can test with various input sizes (small, medium, large up to 100KB)

### Chat Completions → Response API Request Translation

**Given** a Chat Completions API request with a messages array  
**When** I translate it to Response API format  
**Then** it extracts only the most recent message (last in the messages array)  
**And** it maps the `role` field appropriately  
**And** it maps the `content` field appropriately  
**And** it maps the `model` field to Response API format  
**And** it maps parameters: `temperature`, `max_tokens`, `top_p`, etc.  
**And** it passes through unknown fields unchanged  
**And** it logs any unknown fields detected

**Given** a Chat Completions request with multiple messages (conversation history)  
**When** translating to Response API  
**Then** it extracts only the current message (last in array)  
**And** it does NOT send the full conversation history to Response API  
**And** it logs this as a multi-turn conversation requiring state (logging foundation for Epic 4)

**When** translation completes  
**Then** the translation duration is measured and logged  
**And** the duration is <10ms for requests up to 100KB (NFR-P1)

**When** a round-trip test runs: Chat request → translate to Response → translate back to Chat  
**Then** the functional intent is preserved (equivalent behavior, allowing for format differences)  
**And** the test documents which fields are semantically equivalent vs structurally different

### Documentation

**And** the translation mapping documentation includes:  
- Field-by-field mapping table for Chat→Response request translation (see [translation-mapping-reference.md](translation-mapping-reference.md))  
- Examples showing before/after request formats  
- Notes on conversation history handling (single message extraction)  
- Performance benchmarks for this translation direction  
- Unknown field handling examples

**Reference:** See [translation-mapping-reference.md](translation-mapping-reference.md) for complete field mappings with payload examples from OpenAI documentation.

## Technical Notes

**Translation Strategy:**
- Extract the last message from the `messages` array for Response API (does not accept history)
- Map common parameters between formats (model, temperature, max_tokens, etc.)
- Pass through unknown fields to preserve forward compatibility
- Log conversation history presence (foundation for Epic 4 state management)

**Foundation Components:**
- `TranslationUtils.handleUnknownFields()` - detects and passes through unknown fields
- `TranslationLogger` - structured logging for translation events
- `PerformanceMonitor` - measures translation duration
- `RoundTripTester` - validates functional equivalence

**Testing:**
- Unit tests for translation logic with various message formats
- Performance tests validating <10ms overhead
- Round-trip tests: Chat request → Response → Chat validates equivalence
- Edge cases: empty messages, missing fields, unknown fields

**Performance Target:**
- NFR-P1: <10ms translation for requests up to 100KB (95th percentile)

## Requirements Fulfilled

- FR7: Translate Chat Completions API requests to Response API format
- FR57: Field-level translation with protocol equivalence
- FR58: Pass through unknown fields unchanged
- FR59: Log unknown fields detected
- NFR-P1: Translation overhead <10ms
- NFR-C5: Round-trip testing validates equivalence
- NFR-M5: Translation documentation (foundation)
