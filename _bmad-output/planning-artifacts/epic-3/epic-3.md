# Epic 3: Core Bidirectional Translation

## Goal

Teams can translate between Response API and Chat Completions API for baseline non-streaming flows with field-level accuracy and forward compatibility.

## Description

This epic implements the core translation engine that enables bidirectional conversion between OpenAI's Response API and Chat Completions API formats. It provides the translation logic needed to make the adapter useful for model switching, handling request and response transformations in both directions. The epic includes infrastructure for unknown field handling (forward compatibility), translation logging for debugging, comprehensive round-trip testing to ensure functional equivalence, and integration of the translation engines into the complete request/response pipeline.

The translation layer is the technical foundation that enables the adapter's primary value proposition: allowing applications to switch between models using different API formats without code changes.

**Note:** Story 3.5 integrates the translation engines (3.1-3.4) into the complete pipeline with routing. For PoC, local error handling and console.log are used within Story 3.5 (structured error handling deferred to post-PoC Epic 7).

## Functional Requirements Covered

- **FR6:** Translate Response API requests to Chat Completions API format
- **FR7:** Translate Chat Completions API requests to Response API format
- **FR8:** Translate Chat Completions API responses to Response API format
- **FR9:** Translate Response API responses to Chat Completions API format
- **FR57:** Field-level translation with protocol equivalence
- **FR58:** Pass through unknown fields unchanged (forward compatibility)
- **FR59:** Log unknown fields detected in responses

## Non-Functional Requirements Covered

- **NFR-P1:** Translation overhead <10ms for typical requests (95th percentile <10ms for requests up to 100KB)
- **NFR-C5:** Round-trip testing validates functional equivalence
- **NFR-M5:** Translation documentation updated within 1 week of code changes

## Built-in Quality & Documentation

- Translation mapping documentation showing field-by-field equivalence
- Round-trip test suite validating functional equivalence
- Performance benchmarks for translation overhead
- Unknown field handling examples and monitoring guidance

## Stories

1. [Story 3.1: Chat→Response Request Translation + Foundation](story-3.1.md)
2. [Story 3.2: Response→Chat Response Translation](story-3.2.md)
3. [Story 3.3: Response→Chat Request Translation](story-3.3.md)
4. [Story 3.4: Chat→Response Response Translation](story-3.4.md)
5. [Story 3.5: Translation Pipeline Integration & Orchestration](story-3.5.md)

## Dependencies

**Depends on:**
- Epic 1: Container and configuration foundation
- Epic 2: Request routing and pass-through mode

**Enables:**
- Epic 4: Multi-turn conversations (adds state management to these translations)
- Epic 5: Streaming support (adds streaming to these translations)
- Epic 6: Feature-specific translations for MVP features
