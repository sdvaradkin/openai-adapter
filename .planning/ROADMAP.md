# Roadmap: OpenAI Adapter

## Overview

The adapter already handles routing and partial request translation. The remaining work delivers full round-trips per endpoint direction: first Chat Completions clients talking to Responses API backends, then Responses API clients talking to Chat Completions backends. Once both directions work end-to-end, Redis-backed conversation history enables stateful multi-turn support, tool/function call schemas are translated best-effort in both directions, and the deployment is hardened for production. Each phase delivers a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Chat Completions → Responses API Round-Trip** - A Chat Completions client can send a request and receive a correctly shaped Chat Completions response from a Responses API backend (completed 2026-02-19)
- [ ] **Phase 2: Responses API → Chat Completions Round-Trip** - A Responses API client can send a request and receive a correctly shaped Responses API response from a Chat Completions backend (stateless — new conversation each time)
- [ ] **Phase 3: Conversation History** - Redis-backed multi-turn history reconstructed for Chat Completions backends
- [ ] **Phase 4: Tool Translation** - Chat Completions and Responses API tool schemas mapped best-effort in both directions
- [ ] **Phase 5: Production Hardening and Verification** - Startup health checks, timeout coverage, integration tests, and SDK compatibility

## Phase Details

### Phase 1: Chat Completions → Responses API Round-Trip
**Goal**: A Chat Completions client can send a request to a model backed by the Responses API and receive a valid, correctly shaped Chat Completions response — the full round-trip works end-to-end
**Depends on**: Nothing (brownfield; outbound Chat→Response translation is partially in place)
**Requirements**: TRANS-02, RESP-01
**Success Criteria** (what must be TRUE):
  1. A Chat Completions client sends a request to the adapter targeting a `response`-format model and receives a response shaped as a Chat Completions response object (not a Responses API object)
  2. The request body is translated to a valid Responses API request before it is forwarded upstream — the upstream does not receive a Chat Completions payload
  3. Core response fields (choices, message content, finish reason) are present and correctly mapped in the returned Chat Completions response
  4. The round-trip is covered by a unit or integration test that exercises both the request translation and the response translation together
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Implement Responses API response to Chat Completions response translation (TDD)
- [ ] 01-02-PLAN.md — Wire response translation into routing handler and write round-trip integration test

### Phase 2: Responses API → Chat Completions Round-Trip
**Goal**: A Responses API client can send a request to a model backed by Chat Completions and receive a valid, correctly shaped Responses API response — stateless (new conversation each call, no history)
**Depends on**: Phase 1
**Requirements**: TRANS-01, TRANS-03, RESP-02
**Success Criteria** (what must be TRUE):
  1. A Responses API client sends a request to the adapter targeting a `chat_completions`-format model and receives a response shaped as a Responses API response object (not a Chat Completions object)
  2. The request body is translated to a valid Chat Completions request before it is forwarded upstream — the upstream does not receive a Responses API payload
  3. Core response fields (output, message content, finish reason) are present and correctly mapped in the returned Responses API response
  4. Fields that cannot be mapped are silently dropped and a log entry is written — the request is not failed
  5. The round-trip is covered by a unit or integration test that exercises both the request translation and the response translation together
**Plans**: 3 plans

Plans:
- [ ] 02-01-PLAN.md — Implement Responses API request to Chat Completions request translation with drop+log for unmappable fields (TDD)
- [ ] 02-02-PLAN.md — Implement Chat Completions response to Responses API response translation (TDD)
- [ ] 02-03-PLAN.md — Wire both translation functions into routing handler and write round-trip integration test

### Phase 3: Conversation History
**Goal**: Responses API clients can use `previous_response_id` for multi-turn conversations even when the backend is a Chat Completions model — the adapter reconstructs the full message history transparently
**Depends on**: Phase 2
**Requirements**: HIST-01, HIST-02, HIST-03
**Success Criteria** (what must be TRUE):
  1. A Responses API client setting `previous_response_id` on a second turn receives a coherent reply that incorporates context from the first turn
  2. Conversation history is available after the adapter process restarts (Redis-backed, not in-memory)
  3. Each Responses API response is stored in Redis keyed by its response ID immediately after it is returned to the client
  4. A request providing an inline `conversation` field or `previous_response_id` results in a `messages[]` array forwarded to the Chat Completions backend that includes all prior turns
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Redis infrastructure, conversation store module, and unit tests
- [ ] 03-02-PLAN.md — Wire history into routing handler and create integration tests with real Redis

### Phase 4: Tool Translation
**Goal**: Tool and function call definitions pass through the adapter correctly when clients and backends use different API formats, covering the common schemas without failing on exotic ones
**Depends on**: Phase 2
**Requirements**: TOOL-01, TOOL-02
**Success Criteria** (what must be TRUE):
  1. A Chat Completions client that sends `tools[]` / `tool_choice` to a `response`-format model has those translated to Responses API `tools[]` — the model receives a valid tool definition
  2. A Responses API client that sends `tools[]` targeting a `chat_completions`-format model has those translated to Chat Completions `tools[]` / `tool_choice`
  3. A tool schema that cannot be mapped is dropped with a log warning — the request is not failed
**Plans**: TBD

### Phase 5: Production Hardening and Verification
**Goal**: The adapter fails fast on misconfiguration, handles connection and response timeouts correctly, and end-to-end integration tests confirm that an OpenAI SDK client can use both endpoints without modification
**Depends on**: Phase 4
**Requirements**: HARD-01, HARD-02, TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Starting the adapter with an unreachable upstream URL prints a clear error and exits non-zero — it does not start silently
  2. A request to an upstream that accepts the connection but never responds is aborted by the adapter within the configured timeout (connection establishment timeout, not just response timeout)
  3. The integration test suite exercises both translation directions end-to-end and passes in CI
  4. An OpenAI SDK client pointed at the adapter can call both `POST /v1/chat/completions` and `POST /v1/responses` without any client-side modification
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Chat Completions → Responses API Round-Trip | 2/2 | Complete   | 2026-02-19 |
| 2. Responses API → Chat Completions Round-Trip | 3/3 | Complete   | 2026-02-23 |
| 3. Conversation History | 0/2 | Not started | - |
| 4. Tool Translation | 0/? | Not started | - |
| 5. Production Hardening and Verification | 0/? | Not started | - |
