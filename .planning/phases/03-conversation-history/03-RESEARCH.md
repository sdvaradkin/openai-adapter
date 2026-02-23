# Phase 3: Conversation History - Research

**Researched:** 2026-02-23
**Domain:** Redis-backed conversation history for Responses API multi-turn support
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### History Reconstruction
- Walk the full chain of previous_response_ids to build complete conversation history (not just one level)
- Reconstruct both user input and assistant output for each turn — full alternating messages[]
- Only Responses API clients get history — Chat Completions clients manage their own messages[]
- Restore conversation history from storage on each request that includes previous_response_id

#### Edge Cases & Failures
- Missing previous_response_id (expired or never stored): treat as new conversation, do not error
- Redis unavailable: degrade gracefully — process request without history (like a new conversation), log warning
- Broken chain (intermediate response missing from Redis): use partial history — reconstruct from the break point forward
- Depth limit: cap chain walk at a reasonable limit (e.g., 50-100 turns), truncate oldest turns beyond the cap

#### Scope of State Stored
- Minimal storage: only user input text and assistant output text per turn — enough to rebuild messages[]
- No tool call results stored (deferred to Phase 4 when tool translation is built)
- No metadata (model name, timestamps, token usage) — keep storage lean
- Use adapter-generated response ID as the Redis key (the ID returned to the Responses API client)

#### Storage & TTL
- 24-hour TTL on all stored conversation data
- Connect via REDIS_URL environment variable (standard redis:// connection string)
- Redis is required — adapter should not start without it configured
- Use a configurable key prefix (default: `oai-adapter:`) to avoid collisions on shared Redis instances

### Claude's Discretion
- Exact Redis data structure (hash, string with JSON, etc.)
- Chain walk implementation details (recursive vs iterative)
- Serialization format for stored messages
- Exact depth limit number within the 50-100 range
- Logging verbosity for degraded-mode warnings

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| HIST-01 | Adapter stores each Response API response in Redis keyed by response ID | ioredis `set(key, value, 'EX', 86400)` immediately after response returned to client; key = `{prefix}{responseId}` |
| HIST-02 | When conversation context is provided (via `previous_response_id` or inline `conversation` field), adapter reconstructs `messages[]` for Chat Completions backend | Iterative chain walk: fetch → prepend to messages[] → follow `previousResponseId` pointer → repeat until null or cap |
| HIST-03 | Conversation history survives process restart (Redis-backed, not in-memory) | ioredis connects to external Redis; no in-memory fallback; startup validates REDIS_URL present |
</phase_requirements>

---

## Summary

Phase 3 adds Redis-backed conversation history to the Responses API → Chat Completions translation path. When a Responses API client sends `previous_response_id`, the adapter must walk the chain of stored responses to reconstruct a full `messages[]` array before proxying to the Chat Completions backend. Each response returned to the client must also be stored in Redis for future turns.

The standard tool for this is **ioredis v5.9.3**, which is 100% TypeScript-native with built-in type declarations and supports all required patterns: TTL via `set(key, value, 'EX', seconds)`, graceful degradation via `lazyConnect + enableOfflineQueue: false`, and retry strategies via `retryStrategy`. The project already has `testcontainers` v11.11.0 installed; adding `@testcontainers/redis` is the correct path for integration tests.

The storage design decision (Claude's discretion) is: use JSON string serialization (`JSON.stringify`) stored as a Redis string. This is the simplest approach for variable-length data with nested structure, supports full conversation turn records, and TTL applies cleanly to individual response keys. A stored turn record contains: `{ userInput, assistantOutput, previousResponseId }` — exactly what's needed to rebuild `messages[]`.

**Primary recommendation:** Use ioredis v5.9.3 with JSON string storage, iterative chain walk (not recursive, avoids stack depth issues), and fail-open degradation (Redis errors log a warning and continue without history).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ioredis | ^5.9.3 | Redis client for Node.js | 100% TypeScript, widely deployed, excellent connection management, supports full Redis command set |

### Supporting (Testing)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testcontainers/redis | ^11.x | Spin up real Redis in tests | Integration tests that need actual Redis behavior (TTL, persistence) |
| testcontainers | 11.11.0 (already installed) | Base container orchestration | Already a devDependency — use existing install |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ioredis | node-redis (v4) | node-redis is also officially supported by Redis, but ioredis has better TypeScript integration and more established Node.js ecosystem usage for this use case |
| ioredis | @fastify/redis plugin | Plugin wraps ioredis but adds coupling to Fastify DI. Direct ioredis usage keeps history module portable and testable without Fastify context |
| JSON string in Redis | Redis Hash | Hash works for flat structures but nested data (input array) requires JSON anyway; string is simpler and TTL works per-key cleanly |

**Installation:**
```bash
npm install ioredis
npm install --save-dev @testcontainers/redis
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── history/
│   ├── redis-client.ts      # Redis connection lifecycle, singleton client
│   ├── conversation-store.ts # Store/retrieve conversation turns
│   └── types.ts             # ConversationTurn, StoredTurn interfaces
├── handlers/
│   └── routing.handler.ts   # Calls store after successful response (modified)
└── config/
    ├── types.ts             # Add redisUrl, keyPrefix, maxChainDepth to AdapterConfig
    └── loader.ts            # Add REDIS_URL, REDIS_KEY_PREFIX env var loading
```

### Pattern 1: Redis Client Singleton with Graceful Degradation
**What:** A single ioredis client instance shared across the app. Uses `lazyConnect: true` so startup doesn't block, `enableOfflineQueue: false` so failed commands reject immediately (not queue forever), and a `retryStrategy` that gives up after N attempts.
**When to use:** Any time Redis unavailability must not crash the adapter.

```typescript
// src/history/redis-client.ts
import { Redis } from 'ioredis';

export function createRedisClient(redisUrl: string): Redis {
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times: number) => {
      // Stop retrying after 3 attempts; return null to stop
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    }
  });

  client.on('error', (err) => {
    // Log but do not crash — graceful degradation is required
    // pino logger access available in Fastify context; here use console for singleton
    console.warn(JSON.stringify({ level: 'warn', msg: 'Redis connection error', error: err.message }));
  });

  return client;
}
```

### Pattern 2: ConversationStore — Store a Turn
**What:** After a successful Responses API response is returned to the client, store the turn immediately using the response ID as key.
**When to use:** At the end of `handleResponseToChatFlow` in `routing.handler.ts`, after `sendProxyResponse`.

```typescript
// src/history/conversation-store.ts
import type { Redis } from 'ioredis';

export interface StoredTurn {
  userInput: string;           // user message content (string form)
  assistantOutput: string;     // assistant reply content
  previousResponseId: string | null; // link to prior turn
}

export async function storeTurn(
  redis: Redis,
  responseId: string,
  turn: StoredTurn,
  keyPrefix: string,
  ttlSeconds: number
): Promise<void> {
  try {
    const key = `${keyPrefix}${responseId}`;
    await redis.set(key, JSON.stringify(turn), 'EX', ttlSeconds);
  } catch (err) {
    // Graceful degradation: log and continue — history loss is preferable to request failure
    console.warn(JSON.stringify({ level: 'warn', msg: 'Failed to store conversation turn', responseId, error: String(err) }));
  }
}
```

### Pattern 3: Chain Walk — Reconstruct messages[]
**What:** Iterative (not recursive) walk of the `previousResponseId` chain. Collects turns in reverse order (newest first), then reverses to get chronological order for `messages[]`.
**When to use:** In `handleResponseToChatFlow` before building the Chat Completions request, when `previous_response_id` is present in the Responses API request.

```typescript
export async function reconstructMessages(
  redis: Redis,
  startResponseId: string,
  keyPrefix: string,
  maxDepth: number
): Promise<Array<{ role: string; content: string }>> {
  const turns: StoredTurn[] = [];
  let currentId: string | null = startResponseId;
  let depth = 0;

  while (currentId !== null && depth < maxDepth) {
    try {
      const raw = await redis.get(`${keyPrefix}${currentId}`);
      if (raw === null) break; // Chain broken — use what we have so far
      const turn = JSON.parse(raw) as StoredTurn;
      turns.push(turn);
      currentId = turn.previousResponseId;
      depth++;
    } catch {
      break; // Redis error — use partial history
    }
  }

  // turns is newest-first; reverse to get chronological order
  turns.reverse();

  const messages: Array<{ role: string; content: string }> = [];
  for (const turn of turns) {
    messages.push({ role: 'user', content: turn.userInput });
    messages.push({ role: 'assistant', content: turn.assistantOutput });
  }
  return messages;
}
```

### Pattern 4: Config Extension for Redis
**What:** Add `REDIS_URL` (required) and `REDIS_KEY_PREFIX` (optional, default `oai-adapter:`) to environment config. Validate presence at startup.

```typescript
// In src/config/types.ts — extend AdapterConfig
export interface AdapterConfig {
  // ... existing fields ...
  redisUrl: string;
  redisKeyPrefix: string;
  conversationTtlSeconds: number;  // default: 86400 (24h)
  conversationMaxDepth: number;    // default: 75 (within 50-100 range)
}
```

### Pattern 5: Startup Validation (REDIS_URL required)
**What:** `REDIS_URL` is required — adapter must refuse to start without it. Validate in `loadEnvConfig()` the same way `ADAPTER_TARGET_URL` is validated.

```typescript
// In src/config/loader.ts env schema
REDIS_URL: {
  type: 'string',
  minLength: 1   // required — env-schema will throw if missing
}
```

### Anti-Patterns to Avoid
- **Recursive chain walk:** Stack overflow risk for deep conversations; always use iterative while-loop.
- **Storing full Responses API response JSON:** Bloated storage; store only `{ userInput, assistantOutput, previousResponseId }`.
- **Blocking startup on Redis ping:** Use `lazyConnect: true`; validate only that `REDIS_URL` is configured, not that Redis is reachable.
- **Failing requests when Redis is down:** All Redis errors in history store/retrieve must be caught and treated as non-fatal warnings.
- **Awaiting history store before sending response:** Store the turn AFTER `sendProxyResponse` returns to avoid adding Redis latency to client response time. Since fire-and-forget risks losing history on process crash, a middle ground is to store the turn before sending the response but with a tight timeout — the 24h TTL means losing a single turn is acceptable. Simpler: await store, but catch and swallow errors.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redis connection management | Custom TCP/retry loop | ioredis connection management | ioredis handles reconnect, offline queue, cluster failover — rolling this is months of debugging |
| TTL expiry | Manual timestamp + cron cleanup | Redis native `EX` option on SET | Atomic, server-side, zero maintenance |
| Serialization | Custom binary format | `JSON.stringify` / `JSON.parse` | Sufficient for flat conversation turns; no performance benefit to custom format at this scale |

**Key insight:** Redis TTL is server-side — entries expire even if the adapter process is down. This is exactly what "survives process restart" (HIST-03) requires.

---

## Common Pitfalls

### Pitfall 1: Redis Connection Blocks Startup
**What goes wrong:** Creating a Redis client with `lazyConnect: false` (the default) causes the client to connect immediately. If Redis is temporarily unreachable, `new Redis(url)` can throw or delay startup.
**Why it happens:** ioredis default behavior connects eagerly.
**How to avoid:** Always pass `lazyConnect: true`. Call `await redis.connect()` explicitly only when needed, or let first command trigger connection.
**Warning signs:** Startup hangs or throws `ECONNREFUSED` during testing.

### Pitfall 2: Offline Queue Accumulation
**What goes wrong:** With default `enableOfflineQueue: true`, commands issued while Redis is disconnected queue indefinitely. When Redis comes back, the flood of queued operations can cause memory spikes.
**Why it happens:** ioredis queues commands by default while reconnecting.
**How to avoid:** Set `enableOfflineQueue: false`. History operations must fail-fast, not wait.
**Warning signs:** Memory growing monotonically while Redis is unreachable.

### Pitfall 3: Extracting User Input for Storage
**What goes wrong:** The Responses API `input` field can be a string OR an array of objects. The chain walk needs to store a string for `userInput`. If input is an array, naive storage breaks reconstruction.
**Why it happens:** `translateResponseToChatRequest` already handles this — but the store layer must decide what to save.
**How to avoid:** When storing a turn, serialize input: if `input` is a string, store it directly. If `input` is an array, store `JSON.stringify(input)` and flag it. During reconstruction, check if `userInput` starts with `[` to detect array form and handle accordingly. Alternatively: store the already-translated `messages[]` array slice for that turn (simpler — avoid double-parsing).
**Warning signs:** Reconstruction produces garbled or missing user messages for array-input turns.

### Pitfall 4: Race Between Response Send and Store
**What goes wrong:** If storage is fire-and-forget (not awaited) and the process crashes immediately after `sendProxyResponse`, the turn is never stored. The next request's chain walk silently breaks.
**Why it happens:** Treating Redis write as non-critical leads to dropping `await`.
**How to avoid:** Await the store (with error handling) before or after sending response. The added latency is acceptable since Redis SET is fast (<1ms locally).
**Warning signs:** Intermittent "missing history" reports even when Redis is healthy.

### Pitfall 5: Key Collisions on Shared Redis
**What goes wrong:** Without a key prefix, response IDs (e.g., `chatcmpl-abc123`) can collide with other apps using the same Redis instance.
**Why it happens:** Forgetting to namespace keys.
**How to avoid:** Always prepend `keyPrefix` (default `oai-adapter:`) to all keys. Make it configurable via `REDIS_KEY_PREFIX` env var.
**Warning signs:** Unexpected data retrieved; history from different services leaking into conversation chains.

### Pitfall 6: TTL Not Set on Store
**What goes wrong:** Calling `redis.set(key, value)` without `'EX', seconds` stores data forever. Redis memory grows unbounded.
**Why it happens:** Forgetting to pass TTL options.
**How to avoid:** Always use `redis.set(key, value, 'EX', ttlSeconds)` — never bare `set(key, value)`.
**Warning signs:** Redis memory grows linearly with request volume.

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### ioredis SET with TTL (24 hours)
```typescript
// Source: ioredis v5 official docs / GitHub
await redis.set(
  `oai-adapter:resp_abc123`,
  JSON.stringify({ userInput: 'Hello', assistantOutput: 'Hi there!', previousResponseId: null }),
  'EX',
  86400  // 24 hours in seconds
);
```

### ioredis GET and parse
```typescript
const raw = await redis.get(`oai-adapter:resp_abc123`);
if (raw !== null) {
  const turn = JSON.parse(raw) as StoredTurn;
}
```

### Graceful Degradation Wrapper
```typescript
// Wraps any Redis operation; returns null on failure
async function safeGet(redis: Redis, key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    // log warning, return null — caller treats as cache miss
    return null;
  }
}
```

### Integrating History into handleResponseToChatFlow
```typescript
// In routing.handler.ts — BEFORE building chatRequest
const body = request.body as Record<string, unknown>;
const previousResponseId = typeof body['previous_response_id'] === 'string'
  ? body['previous_response_id']
  : null;

let priorMessages: Array<{ role: string; content: string }> = [];
if (previousResponseId !== null) {
  priorMessages = await reconstructMessages(
    redis,
    previousResponseId,
    config.redisKeyPrefix,
    config.conversationMaxDepth
  );
}
// Prepend priorMessages before current turn in requestTranslationResult.translated.messages
```

### @testcontainers/redis in vitest integration test
```typescript
// Source: node.testcontainers.org/modules/redis
import { RedisContainer } from '@testcontainers/redis';

let container: StartedRedisContainer;
let redisUrl: string;

beforeAll(async () => {
  container = await new RedisContainer('redis:7-alpine').start();
  redisUrl = container.getConnectionUrl();
}, 30_000);

afterAll(async () => {
  await container?.stop();
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory Map for history | Redis-backed external store | Standard for multi-process apps | Survives restarts, scales horizontally |
| Recursive chain walk | Iterative while-loop | Best practice (stack safety) | No stack overflow at depth 75 |
| @types/ioredis separate package | ioredis ships own TypeScript types | ioredis v5 (2022) | No separate @types install needed |

**Deprecated/outdated:**
- `redis.setex(key, seconds, value)` command: Still works but `redis.set(key, value, 'EX', seconds)` is the modern canonical form and more composable.
- `@types/ioredis`: Do NOT install — ioredis v5 bundles its own declarations, `@types/ioredis` is for v4 and conflicts.

---

## Open Questions

1. **How to extract user input string for storage when `input` is an array**
   - What we know: `translateResponseToChatRequest` handles both string and array input, producing `messages[]`
   - What's unclear: Should the store save the raw `input` field or the already-translated `messages[]` slice?
   - Recommendation: Store the translated messages slice `[{ role: 'user', ... }]` from the request translation result. This avoids re-parsing on reconstruction and keeps the store format consistent regardless of input type.

2. **Storing `instructions` (system message) per turn**
   - What we know: `instructions` maps to a system message prepended before user messages. It may differ per turn.
   - What's unclear: Should each stored turn include the system message, or only user/assistant pairs?
   - Recommendation: Store only user+assistant pairs per turn; the current request's `instructions` is handled fresh each time. This keeps storage minimal per the locked decision.

3. **Response ID source**
   - What we know: The Responses API response has an `id` field (e.g., `chatcmpl-xyz`). This is the key used for storage.
   - What's unclear: The response ID comes from the upstream Chat Completions response (passed through from upstream). Can upstream return a non-unique ID?
   - Recommendation: Use the upstream-provided `id` directly as the Redis key suffix. The 24h TTL + key prefix makes collision risk negligible in practice.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^1.5.3 |
| Config file | `vitest.config.ts` (unit), `vitest.integration.config.ts` (integration) |
| Quick run command | `npm run test:unit` |
| Full suite command | `npm run test:all` |
| Estimated runtime | ~5-10 seconds (unit), ~60+ seconds (integration with Docker) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIST-01 | Response is stored in Redis after being returned | unit (mocked Redis) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-01 | Stored value has correct key, TTL=24h, correct JSON | unit (mocked Redis) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-02 | Chain walk with 1 prior turn produces correct messages[] | unit (mocked Redis) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-02 | Chain walk stops at broken link (missing key) | unit (mocked Redis) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-02 | Chain walk respects maxDepth cap | unit (mocked Redis) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-02 | Redis unavailable → request proceeds without history | unit (mocked Redis throws) | `npx vitest run tests/unit/history/conversation-store.test.ts -x` | ❌ Wave 0 gap |
| HIST-02 | Multi-turn round-trip with real Redis | integration (testcontainers) | `npx vitest run tests/integration/translation/conversation-history.test.ts --config vitest.integration.config.ts` | ❌ Wave 0 gap |
| HIST-03 | History survives simulated restart (data in real Redis) | integration (testcontainers) | `npx vitest run tests/integration/translation/conversation-history.test.ts --config vitest.integration.config.ts` | ❌ Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After every committed task → run: `npm run test:unit`
- **Full suite trigger:** Before merging final task of any plan wave
- **Phase-complete gate:** Full suite green before `/gsd:verify-work` runs
- **Estimated feedback latency per task:** ~5 seconds (unit), ~30 seconds (integration with testcontainers)

### Wave 0 Gaps (must be created before implementation)
- [ ] `tests/unit/history/conversation-store.test.ts` — covers HIST-01, HIST-02 (unit, mocked Redis)
- [ ] `tests/integration/translation/conversation-history.test.ts` — covers HIST-02, HIST-03 (real Redis via testcontainers)
- [ ] Install: `npm install ioredis && npm install --save-dev @testcontainers/redis` — neither ioredis nor @testcontainers/redis is currently installed

---

## Sources

### Primary (HIGH confidence)
- [ioredis GitHub releases](https://github.com/redis/ioredis/releases) — confirmed v5.9.3 as latest (Feb 12, 2026)
- [ioredis official Redis docs page](https://redis.io/docs/latest/develop/clients/ioredis/) — SET/GET patterns, TypeScript support
- [testcontainers for Node.js — Redis module](https://node.testcontainers.org/modules/redis/) — RedisContainer API, `getConnectionUrl()`, vitest globalSetup pattern
- [testcontainers vitest global setup](https://node.testcontainers.org/quickstart/global-setup/) — `setup()`/`teardown()`, `inject()` pattern

### Secondary (MEDIUM confidence)
- [ioredis npm page](https://www.npmjs.com/package/ioredis) — version 5.9.3 confirmed, weekly download stats
- [Redis hash vs JSON storage guide](https://redis.io/docs/latest/develop/ai/redisvl/user_guide/hash_vs_json/) — confirms string/JSON approach better for nested data with per-key TTL
- [ioredis lazyConnect/enableOfflineQueue](https://github.com/redis/ioredis/issues/625) — confirms behavioral semantics of `lazyConnect` + `enableOfflineQueue: false` for graceful degradation

### Tertiary (LOW confidence — single source, unverified via official docs)
- WebSearch finding: retryStrategy returns null to stop reconnection — consistent with multiple sources but not verified against official API docs directly

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — ioredis v5.9.3 confirmed current via GitHub releases; testcontainers Redis module confirmed via official docs
- Architecture: HIGH — patterns derived from codebase analysis + official ioredis docs; chain walk pattern is standard linked-list traversal
- Pitfalls: MEDIUM — lazyConnect/enableOfflineQueue behaviors confirmed; input extraction pitfall derived from codebase analysis (no external source needed)

**Research date:** 2026-02-23
**Valid until:** 2026-03-25 (30 days — ioredis is stable, testcontainers is active but API is stable)
