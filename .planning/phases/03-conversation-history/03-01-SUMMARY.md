---
phase: 03-conversation-history
plan: "01"
subsystem: database
tags: [redis, ioredis, conversation-history, ttl, chain-walk]

# Dependency graph
requires:
  - phase: 02-responses-api-chat-completions-round-trip
    provides: AdapterConfig type and routing handler wiring
provides:
  - Redis conversation store module (src/history/)
  - StoredTurn interface for persistent turn storage
  - createRedisClient factory with graceful degradation
  - storeTurn function — persists turns as JSON with TTL
  - reconstructMessages function — iterative chain walk returning messages[]
  - REDIS_URL required at startup via env-schema
  - Extended AdapterConfig with 4 Redis fields
affects:
  - 03-02 (plan 02 wires storeTurn/reconstructMessages into the routing handler)

# Tech tracking
tech-stack:
  added:
    - ioredis ^5.9.3 (production dependency)
    - "@testcontainers/redis ^11.12.0 (dev dependency)"
  patterns:
    - Graceful degradation on Redis errors — storeTurn swallows errors, reconstructMessages returns partial history
    - Iterative chain walk (not recursive) via previousResponseId pointer
    - JSON string storage in Redis (not Redis hash) — simple get/set with EX TTL
    - lazyConnect + enableOfflineQueue:false pattern for non-blocking Redis setup

key-files:
  created:
    - src/history/types.ts
    - src/history/redis-client.ts
    - src/history/conversation-store.ts
    - tests/unit/history/conversation-store.test.ts
  modified:
    - src/config/types.ts
    - src/config/loader.ts
    - package.json
    - package-lock.json
    - tests/unit/config/loader.test.ts
    - tests/unit/config/validation-limits.test.ts
    - tests/unit/handlers/translation-handler.test.ts
    - tests/integration/translation/round-trip.test.ts
    - tests/integration/translation/responses-round-trip.test.ts
    - tests/integration/translation/chat-to-response.test.ts
    - tests/integration/pass-through.spec.ts
    - tests/integration/validation-flow.spec.ts

key-decisions:
  - "ioredis named export {Redis} required — default import does not work with NodeNext module resolution"
  - "conversation-store.ts uses import type { Redis } from ioredis — type-only import avoids namespace collision"
  - "Existing tests updated to include REDIS_URL in env setup and new AdapterConfig fields (loaders required it)"
  - "maxDepth cap of 75 turns chosen — within the 50-100 range specified in CONTEXT.md"

patterns-established:
  - "Graceful degradation: catch all Redis errors, log warn JSON, never throw from storeTurn or reconstructMessages"
  - "Iterative while-loop chain walk: collect newest-first, reverse for chronological output"
  - "Mock Redis pattern for unit tests: vi.fn() backed Map, no live Redis dependency"

requirements-completed:
  - HIST-01
  - HIST-03

# Metrics
duration: 7min
completed: 2026-02-23
---

# Phase 03 Plan 01: Conversation History — Redis Infrastructure Summary

**Redis-backed conversation store with ioredis, iterative chain-walk reconstruction, and graceful degradation on all Redis errors**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-23T12:38:20Z
- **Completed:** 2026-02-23T12:45:00Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Installed ioredis (prod) and @testcontainers/redis (dev) — full Redis infrastructure ready
- Created `src/history/` module: types, redis-client factory, and conversation store with storeTurn/reconstructMessages
- Added REDIS_URL as required env var (adapter refuses to start without it)
- Extended AdapterConfig with 4 Redis fields (redisUrl, redisKeyPrefix, conversationTtlSeconds, conversationMaxDepth)
- 11 unit tests covering all edge cases — no live Redis required, all pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create Redis infrastructure + conversation store** - `f3a7099` (feat)
2. **Task 2: Create unit tests for conversation store** - `16b17ae` (test)

**Plan metadata:** (docs commit — created at end of plan execution)

## Files Created/Modified

- `src/history/types.ts` - StoredTurn interface (userInput, assistantOutput, previousResponseId)
- `src/history/redis-client.ts` - createRedisClient factory with lazyConnect, retryStrategy, error event handler
- `src/history/conversation-store.ts` - storeTurn (JSON+TTL, no-throw) and reconstructMessages (iterative walk, partial history on broken chain)
- `src/config/types.ts` - Extended AdapterConfig with 4 Redis fields
- `src/config/loader.ts` - REDIS_URL required in schema, optional prefix/TTL/depth vars, loadConfiguration returns Redis fields
- `tests/unit/history/conversation-store.test.ts` - 11 test cases with mock Redis
- `tests/unit/config/loader.test.ts` - Added REDIS_URL to beforeEach, added REDIS_URL required test
- `tests/unit/config/validation-limits.test.ts` - Added REDIS_URL to beforeEach
- `tests/unit/handlers/translation-handler.test.ts` - Added new AdapterConfig fields to testConfig
- `tests/integration/translation/*.test.ts` - Added new AdapterConfig fields to all testConfig objects
- `tests/integration/*.spec.ts` - Added new AdapterConfig fields to testConfig

## Decisions Made

- Used `import { Redis } from 'ioredis'` (named export) — default import causes TypeScript namespace collision with NodeNext module resolution
- Used `import type { Redis }` in conversation-store.ts — type-only import keeps module boundaries clean
- maxDepth default set to 75 (within the 50-100 range from CONTEXT.md)
- JSON string storage (not Redis hash) — keeps get/set interface simple and TTL applies to the whole turn atomically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ioredis import pattern for NodeNext module resolution**
- **Found during:** Task 1 (npm run build)
- **Issue:** `import Redis from 'ioredis'` (default import) failed with "Cannot use namespace 'Redis' as a type" and "This expression is not constructable" in NodeNext mode
- **Fix:** Changed to `import { Redis } from 'ioredis'` (named export) in redis-client.ts; `import type { Redis } from 'ioredis'` in conversation-store.ts
- **Files modified:** src/history/redis-client.ts, src/history/conversation-store.ts
- **Verification:** npm run build passes cleanly
- **Committed in:** f3a7099 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed existing tests broken by REDIS_URL now being required**
- **Found during:** Task 1 (running test suite after config changes)
- **Issue:** Adding REDIS_URL to required env-schema fields broke existing loader.test.ts and validation-limits.test.ts which didn't set REDIS_URL in test env
- **Fix:** Added `process.env.REDIS_URL = 'redis://localhost:6379'` to beforeEach in affected test files; added new test verifying REDIS_URL is required
- **Files modified:** tests/unit/config/loader.test.ts, tests/unit/config/validation-limits.test.ts
- **Verification:** All 347+ tests pass
- **Committed in:** f3a7099 (Task 1 commit)

**3. [Rule 2 - Missing Critical] Updated AdapterConfig testConfig objects across all test files**
- **Found during:** Task 1 (post-implementation review)
- **Issue:** Multiple test files instantiate `AdapterConfig` objects missing the 4 new required fields — would cause TypeScript errors and potential runtime issues if tsc ever runs on tests
- **Fix:** Added modelMappingFile, redisUrl, redisKeyPrefix, conversationTtlSeconds, conversationMaxDepth to all testConfig objects
- **Files modified:** tests/unit/handlers/translation-handler.test.ts, tests/integration/translation/*.test.ts, tests/integration/*.spec.ts
- **Verification:** npm run test:unit passes (358 tests, 1 skipped)
- **Committed in:** f3a7099 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the import pattern deviation documented above.

## User Setup Required

**Redis is now required.** To run the adapter, set `REDIS_URL` in the environment:
```
REDIS_URL=redis://localhost:6379
```

For local development, start Redis via Docker:
```
docker run -d -p 6379:6379 redis:7-alpine
```

No dashboard configuration required.

## Next Phase Readiness

- `src/history/` module is complete and fully tested — ready for Plan 02 wiring
- Plan 02 will import `storeTurn` and `reconstructMessages` from `src/history/conversation-store.js`
- Plan 02 will import `createRedisClient` from `src/history/redis-client.js`
- The routing handler needs to: (1) call reconstructMessages when previous_response_id is present, (2) call storeTurn after successful response

---
*Phase: 03-conversation-history*
*Completed: 2026-02-23*
