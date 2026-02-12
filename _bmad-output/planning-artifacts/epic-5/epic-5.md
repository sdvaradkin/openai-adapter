# Epic 5: Streaming Support (SSE) + Streaming-aware Timeouts

**Status:** Ready for Implementation  
**Depends On:** Epic 2 (routing infrastructure), Epic 3 (translation pipeline), Epic 4 (state management for Response→Chat)  
**Blocks:** Epic 6 (complete feature set)

## Epic Goal

Enable streaming responses (SSE format) in both pass-through and translation modes with streaming-aware timeout semantics (time-to-first-byte + idle timeout).

## User Value

**As a** developer consuming the adapter  
**I want** streaming responses to work transparently  
**So that** I can receive incremental results for long-running LLM requests regardless of the backend API format

## Success Criteria

1. ✅ Streaming works in pass-through mode (format-to-format match)
2. ✅ Streaming works in translation mode (Chat↔Response bidirectional)
3. ✅ Timeout semantics honor streaming patterns (TTFB + idle timeout)
4. ✅ 504 Gateway Timeout returned when upstream timeout exceeded
5. ✅ Structured logging captures streaming decisions and timeout events

## Functional Requirements Covered

- **FR50:** System can return 504 Gateway Timeout when upstream timeout exceeded
- **FR54:** System can time out upstream requests after configured duration (non-streaming: full request-response; streaming: time-to-first-byte + idle timeout semantics)
- **FR64:** System can translate streaming responses (SSE format) in both pass-through and translation modes

## Non-Functional Requirements Covered

- **NFR-P5:** Upstream Timeout Configuration — Configurable upstream timeouts with streaming-aware semantics (default: 60 seconds)
- **NFR-R4:** Graceful Shutdown — SIGTERM completes in-flight requests (<30s)

## Architecture Context

### Streaming Flow Pattern

```
Client Request (stream: true)
    ↓
Adapter detects streaming flag
    ↓
┌─────────────────────────────────┐
│ Pass-through Mode:              │
│ Pipe SSE events unchanged       │
└─────────────────────────────────┘
    OR
┌─────────────────────────────────┐
│ Translation Mode:               │
│ Parse each SSE event            │
│ Translate event payload         │
│ Format as target SSE event      │
│ Stream to client                │
└─────────────────────────────────┘
```

### Timeout Semantics

**Non-streaming:**
- Single timeout for entire request-response cycle
- Timeout triggers: no response within configured duration

**Streaming:**
- **Time-to-first-byte (TTFB):** Initial connection/headers timeout
- **Idle timeout:** Gap between SSE events
- Timeout triggers: no first byte within TTFB OR no new event within idle timeout

### Configuration Model

```typescript
interface TimeoutConfig {
  // Non-streaming request timeout (default: 60s)
  requestTimeout: number;
  
  // Streaming: time to first SSE event (default: 60s)
  streamTTFB: number;
  
  // Streaming: max gap between events (default: 300s / 5min)
  streamIdleTimeout: number;
}
```

## Technical Approach

### 1. Pass-through Streaming (Story 5.1)
- Detect `stream: true` in request
- Establish upstream connection with streaming headers
- Pipe SSE events directly to client without buffering
- Apply TTFB + idle timeout monitoring
- Log streaming decision and timeout events

### 2. Translation Streaming (Story 5.2)
- Parse SSE events line-by-line (avoid full buffering)
- Extract `data:` JSON payloads
- Translate each delta/chunk using existing translators
- Format as target API SSE events
- Stream incrementally to client
- Handle `[DONE]` sentinel correctly for both APIs

**PoC Logging:** Use `console.log` for streaming events (structured logger deferred to post-PoC)

### 3. Timeout Implementation (Story 5.3)
- Implement TTFB timer (starts on upstream request)
- Implement idle timer (resets on each SSE event received)
- Return 504 Gateway Timeout when either timer expires
- Graceful shutdown: wait for in-flight streaming requests (<30s max)

## Story Breakdown

### Story 5.1: Pass-through Streaming Pipeline
**Scope:** Streaming works when source format = target format  
**DoR:** Epic 2 pass-through infrastructure complete  
**DoD:** SSE events pipe through unchanged with timeout monitoring

### Story 5.2: Bidirectional Streaming Translation
**Scope:** Chat↔Response streaming translation with incremental processing  
**DoR:** Epic 3 translation logic complete, Story 5.1 complete  
**DoD:** Streaming works in both translation directions

### Story 5.3: Streaming Timeout Configuration & 504 Handling
**Scope:** TTFB + idle timeout enforcement with graceful shutdown  
**DoR:** Story 5.1 complete  
**DoD:** Timeouts configurable, 504 returned on timeout, SIGTERM honored

## Testing Strategy

### Unit Tests
- SSE event parser (line-by-line parsing)
- Timeout timer logic (TTFB, idle reset, expiration)
- Streaming translator (incremental delta translation)

### Contract Tests
- Pass-through streaming: Chat→Chat, Response→Response
- Translation streaming: Chat→Response, Response→Chat
- Timeout scenarios: TTFB timeout, idle timeout, normal completion
- `[DONE]` sentinel handling

### Integration Tests
- Real OpenAI streaming endpoints (testcontainers or mocks)
- Timeout trigger validation
- Graceful shutdown with in-flight streaming requests

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Memory leak from unbounded buffering | HIGH | Line-by-line SSE parsing, no full response buffering |
| Translation latency breaking streaming UX | MEDIUM | Benchmark translation overhead; target <5ms per event |
| Timeout misconfiguration causing false positives | MEDIUM | Document streaming timeout patterns; provide sane defaults |
| Upstream API SSE format changes | LOW | Log unknown SSE events; pass through when unsure |

## Documentation Deliverables

- [ ] Streaming configuration guide (TTFB, idle timeout tuning)
- [ ] SSE event format mapping (Chat↔Response)
- [ ] Timeout behavior matrix (non-streaming vs streaming)
- [ ] Examples: streaming pass-through vs translation

## Dependencies

- **Epic 2:** Request routing and pass-through infrastructure
- **Epic 3:** Translation pipeline (non-streaming baseline)
- **Epic 4:** State management (for Response→Chat multi-turn streaming)

## Out of Scope

- Custom SSE event types (MVP supports OpenAI SSE format only)
- Reconnection/resume logic (client responsibility)
- Backpressure handling beyond Node.js stream defaults
- WebSocket support (SSE only)

## Definition of Done

- [ ] All 3 stories complete with passing tests
- [ ] Pass-through streaming works for both APIs
- [ ] Translation streaming works bidirectionally
- [ ] Timeout configuration documented and tested
- [ ] 504 Gateway Timeout returned on timeout
- [ ] Graceful shutdown tested with streaming requests
- [ ] Structured logs include streaming decisions and timeout events
- [ ] Documentation deliverables complete
