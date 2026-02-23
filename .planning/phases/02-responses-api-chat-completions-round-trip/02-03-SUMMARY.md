---
phase: 02-responses-api-chat-completions-round-trip
plan: '03'
subsystem: api
tags: [translation, routing, integration-test, responses-api, chat-completions, vitest, typescript]

# Dependency graph
requires:
  - phase: 02-responses-api-chat-completions-round-trip
    plan: '01'
    provides: translateResponseToChatRequest function
  - phase: 02-responses-api-chat-completions-round-trip
    plan: '02'
    provides: translateChatToResponseApiResponse function
provides:
  - Full Responses API → Chat Completions → Responses API round-trip wired in routing handler
  - 10 new tests (4 handler unit + 6 integration round-trip)
affects:
  - Phase 3 (conversation history) can now build on the complete response→chat_completions branch

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Inline fetch+translate cycle in routing handler (mirrors Phase 1 handleChatToResponseFlow)
    - Shared upstream-proxy helpers (buildUpstreamUrl, forwardHeaders, proxyToUpstream, sendProxyResponse)

key-files:
  modified:
    - src/translation/index.ts
    - src/handlers/routing.handler.ts
  created:
    - tests/integration/translation/responses-round-trip.test.ts
    - tests/unit/handlers/translation-handler.test.ts (appended Phase 2 describe block)

key-decisions:
  - "Followed existing handleChatToResponseFlow pattern exactly — separate named function handleResponseToChatFlow with identical error handling structure"
  - "Used shared upstream-proxy helpers rather than inline fetch as the plan template suggested — consistent with Phase 1 refactoring"

patterns-established:
  - "Both translation directions now use the same handler pattern: translate request → proxy to upstream → parse response → translate response → send"

requirements-completed:
  - TRANS-01
  - TRANS-03
  - RESP-02

# Metrics
duration: 3min
completed: 2026-02-23
---

# Phase 2 Plan 03: Wire routing handler and round-trip integration test

**Wired translateResponseToChatRequest and translateChatToResponseApiResponse into the routing handler, replacing the 501 stub with a full response→chat_completions branch. 10 new tests (4 handler unit + 6 integration round-trip) all passing.**

## Performance

- **Duration:** 3 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Exported `translateResponseToChatRequest` and `translateChatToResponseApiResponse` from `src/translation/index.ts`
- Added `handleResponseToChatFlow` function to `src/handlers/routing.handler.ts` — mirrors the Phase 1 `handleChatToResponseFlow` pattern using shared upstream-proxy helpers
- Added 4 handler unit tests covering: happy path, non-JSON upstream, failed response translation, and timeout
- Created 6 integration round-trip tests covering: happy path response shape, request body proof (messages not input), instructions→system message mapping, dropped fields (previous_response_id), max_output_tokens→max_tokens mapping, usage field renaming
- All 346 tests pass (`npm run test:unit`), TypeScript build clean (`npm run build`)

## Files Created/Modified

- `src/translation/index.ts` — Added exports for response-to-chat/request.ts and chat-to-response/response.ts
- `src/handlers/routing.handler.ts` — Added response→chat_completions branch with handleResponseToChatFlow function
- `tests/unit/handlers/translation-handler.test.ts` — Appended 4 Phase 2 handler unit tests
- `tests/integration/translation/responses-round-trip.test.ts` — New file with 6 round-trip integration tests

## Deviations from Plan

- Used shared `upstream-proxy.ts` helpers (buildUpstreamUrl, forwardHeaders, proxyToUpstream, sendProxyResponse) instead of inline fetch — consistent with the existing Phase 1 code that was refactored since the plan was written

## Issues Encountered

None.

## Phase 2 Completion

This plan completes Phase 2. All three plans (02-01, 02-02, 02-03) are done. Both translation directions are now fully wired:
- Phase 1: Chat Completions → Responses API → Chat Completions
- Phase 2: Responses API → Chat Completions → Responses API

---
*Phase: 02-responses-api-chat-completions-round-trip*
*Completed: 2026-02-23*
