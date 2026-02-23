# Requirements: OpenAI Adapter

**Defined:** 2026-02-19
**Core Value:** Any OpenAI-compatible client can talk to any model regardless of which API format that model natively supports — with no changes to the client.

## v1 Requirements

### Translation — Request Layer

- [x] **TRANS-01**: Adapter translates Response API request body to Chat Completions format when model targets `chat_completions`
- [x] **TRANS-02**: Adapter translates Chat Completions request body to Response API format when model targets `response`
- [x] **TRANS-03**: Unknown/unmappable fields are dropped and logged (best-effort), request is not failed

### Translation — Response Layer

- [x] **RESP-01**: Adapter translates Response API response body to Chat Completions format for Chat Completions clients
- [x] **RESP-02**: Adapter translates Chat Completions response body to Response API format for Response API clients

### Conversation History

- [ ] **HIST-01**: Adapter stores each Response API response in Redis keyed by response ID
- [ ] **HIST-02**: When conversation context is provided (via `previous_response_id` or inline `conversation` field), adapter reconstructs `messages[]` for Chat Completions backend
- [ ] **HIST-03**: Conversation history survives process restart (Redis-backed, not in-memory)

### Tool / Function Call Translation

- [ ] **TOOL-01**: Chat Completions `tools[]` / `tool_choice` mapped to Response API `tools[]` on best-effort basis
- [ ] **TOOL-02**: Response API `tools[]` mapped to Chat Completions `tools[]` / `tool_choice` on best-effort basis

### Production Hardening

- [ ] **HARD-01**: Upstream URL reachability validated at startup (fail fast, not at request time)
- [ ] **HARD-02**: Connection timeout covers both connection establishment and response (not just response)

### Quality

- [ ] **TEST-01**: Integration tests cover both translation directions end-to-end (smoke + regression)
- [ ] **TEST-02**: OpenAI SDK client works against both endpoints without modification

## v2 Requirements

### Streaming

- **STREAM-01**: Adapter translates streamed (SSE) responses in Chat→Response direction
- **STREAM-02**: Adapter translates streamed (SSE) responses in Response→Chat direction

### Observability

- **OBS-01**: Metrics endpoint exposing request counts, translation errors, Redis latency
- **OBS-02**: Alerting on upstream error rate threshold

## Out of Scope

| Feature | Reason |
|---------|--------|
| Streaming translation | High complexity, deferred to v2 — pass-through works for non-translated requests |
| OAuth / credential management | Auth headers pass through unchanged; not the adapter's responsibility |
| Multi-model fan-out / load balancing | Single upstream target per deployment |
| Full tool translation fidelity | Complex/exotic tool schemas are best-effort; strict fidelity is v2 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRANS-02 | Phase 1 | Complete |
| RESP-01 | Phase 1 | Complete |
| TRANS-01 | Phase 2 | Complete |
| TRANS-03 | Phase 2 | Complete |
| RESP-02 | Phase 2 | Complete |
| HIST-01 | Phase 3 | Pending |
| HIST-02 | Phase 3 | Pending |
| HIST-03 | Phase 3 | Pending |
| TOOL-01 | Phase 4 | Pending |
| TOOL-02 | Phase 4 | Pending |
| HARD-01 | Phase 5 | Pending |
| HARD-02 | Phase 5 | Pending |
| TEST-01 | Phase 5 | Pending |
| TEST-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0 (coverage complete)

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 after roadmap restructure*
