# Phase 2: Responses API → Chat Completions Round-Trip - Research

**Researched:** 2026-02-19
**Domain:** Bidirectional API translation — Responses API request → Chat Completions upstream → Responses API response
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRANS-01 | Adapter translates Response API request body to Chat Completions format when model targets `chat_completions` | Field mapping table (below) confirms the full mapping; `ResponseApiRequest` type and `detectUnknownResponseFields` utility already exist in codebase, covering most required work |
| TRANS-03 | Unknown/unmappable fields are dropped and logged (best-effort), request is not failed | `logUnknownFields` + `detectUnknownResponseFields` already exist; DROPPED_FIELDS pattern from Phase 1 is the model to follow; new dropped-fields set needed for Response→Chat direction |
| RESP-02 | Adapter translates Chat Completions response body to Response API format for Response API clients | Chat Completions response shape (choices, finish_reason, usage) maps to Responses API output array (output_text, stop_reason, usage); new translation function needed mirroring Phase 1 `translateResponseApiToChatResponse` |
</phase_requirements>

---

## Summary

Phase 2 implements the mirror direction of Phase 1: where Phase 1 handled Chat Completions clients talking to Responses API backends, Phase 2 handles Responses API clients talking to Chat Completions backends. The adapter must: (1) translate Responses API request bodies into Chat Completions request bodies before forwarding upstream, (2) translate Chat Completions response bodies back into Responses API response shapes before returning to the client.

The codebase already contains most of the scaffolding needed. The translation types (`ResponseApiRequest`, `ChatCompletionsRequest`), the unknown-fields utilities (`detectUnknownResponseFields`, `isDroppedField`, `logUnknownFields`), and the routing infrastructure are all in place. What is missing is: a `translateResponseToChatRequest` function (request direction), a `translateChatToResponseApiResponse` function (response direction), wiring of the `response → chat_completions` branch in the routing handler (currently returning 501), and round-trip integration tests.

The work naturally splits into two sequential plans matching Phase 1's structure: Plan 02-01 (TDD — write the pure translation functions with unit tests), Plan 02-02 (wire into routing handler + integration test). No new libraries are required. The entire phase operates within the existing Fastify/Vitest/TypeScript stack.

**Primary recommendation:** Follow Phase 1's pattern exactly — pure translation functions in `src/translation/response-to-chat/` for requests and `src/translation/chat-to-response/` for responses, same `{ success, translated?, error? }` result shape, same logging utilities, same `vi.stubGlobal('fetch', ...)` integration test pattern.

---

## Standard Stack

### Core (no additions needed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| TypeScript | 5.5.4 | All source code | Already in project |
| Fastify | 4.28.1 | HTTP server, request routing | Already in project |
| Vitest | 1.5.3 | Unit and integration tests | Already in project |
| pino (via Fastify) | 8.21.0 | Structured logging | Already in project |

No new libraries are needed for this phase. All tooling is inherited from Phase 1.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline fetch+translate in routing handler | Dedicated handler class | Project pattern is inline fetch+translate; classes would break consistency |
| Separate logging module | Direct pino calls | `translation-logger.ts` utilities already exist; use them |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Recommended Project Structure

The new files mirror Phase 1's structure:

```
src/
├── translation/
│   ├── response-to-chat/
│   │   ├── types.ts       (EXISTS — ResponseApiResponse, ResponseToChatTranslationResult)
│   │   └── response.ts    (EXISTS — translateResponseApiToChatResponse)
│   ├── chat-to-response/
│   │   ├── types.ts       (EXISTS — ChatToResponseTranslationResult)
│   │   └── request.ts     (EXISTS — translateChatToResponse)
│   │   └── response.ts    (NEW — translateChatToResponseApiResponse)   ← RESP-02
│   ├── response-to-chat/  (partially exists)
│   │   └── request.ts     (NEW — translateResponseToChatRequest)       ← TRANS-01
│   └── index.ts           (UPDATE — add new exports)

tests/
├── unit/
│   └── translation/
│       ├── response-to-chat-request.test.ts   (NEW — TRANS-01 unit tests)
│       └── chat-to-response-response.test.ts  (NEW — RESP-02 unit tests)
├── unit/handlers/
│   └── translation-handler.test.ts            (UPDATE — add response→chat cases)
└── integration/
    └── translation/
        └── responses-round-trip.test.ts       (NEW — full round-trip integration test)
```

**Key observation:** The existing `src/translation/response-to-chat/` directory contains `types.ts` and `response.ts` (for Phase 1, translating Responses API _responses_ to Chat format). Phase 2 needs `src/translation/response-to-chat/request.ts` (translating Responses API _requests_ to Chat format). The naming is consistent: the directory name indicates the translation direction (`response-to-chat`), and the file name indicates whether it handles the request leg or the response leg.

Similarly, `src/translation/chat-to-response/` contains `request.ts` (Phase 1, translating Chat _requests_ to Responses API format). Phase 2 needs `src/translation/chat-to-response/response.ts` (translating Chat _responses_ to Responses API format).

### Pattern 1: Pure Translation Function (no-throw, result object)

This is the established Phase 1 pattern. Every translation function returns a structured result:

```typescript
// Source: src/translation/response-to-chat/response.ts (Phase 1 example)
export function translateResponseApiToChatResponse(
  response: unknown
): ResponseToChatTranslationResult {
  try {
    if (typeof response !== 'object' || response === null) {
      return { success: false, error: 'Response must be a valid object' };
    }
    // ... field mapping ...
    return { success: true, translated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
```

Apply this pattern to both new translation functions. Never throw — always return `{ success: false, error: '...' }`.

### Pattern 2: Unknown Fields — Drop + Log (TRANS-03)

The established pattern from `src/translation/chat-to-response/request.ts`:

```typescript
// Detect unknown fields
const { unknownFields, cleanedPayload } = detectUnknownResponseFields(responseApiRequest);

// Pass through non-dropped unknowns (forward compatibility)
for (const field of unknownFields) {
  if (!isDroppedField(field)) {
    (chatRequest as Record<string, unknown>)[field] = cleanedPayload[field];
  }
}

// Log unknowns via existing utility
if (unknownFields.length > 0) {
  logUnknownFields(logger, requestId, 'response_to_chat', unknownFields);
}
```

TRANS-03 requires that unknown/unmappable fields are **dropped and logged**, not failed. The distinction from Phase 1's Chat→Response direction: unknown fields in the request were passed through (forward compatibility). For TRANS-03, explicitly unmappable fields (those with no Chat Completions equivalent) must be dropped, not forwarded. A new `DROPPED_RESPONSE_FIELDS` set must be defined in `unknown-fields.ts` for fields that are Responses API-only with no Chat equivalent.

### Pattern 3: Inline Fetch+Translate in Routing Handler

The Phase 1 pattern for the `chat_completions → response` branch (lines 64-207 of `routing.handler.ts`) is the exact template to follow for the `response → chat_completions` branch:

```typescript
} else if (
  routingResult.sourceFormat === 'response' &&
  routingResult.targetFormat === 'chat_completions'
) {
  // 1. Translate Responses API request → Chat Completions request
  const requestTranslationResult = handleResponseToChatTranslation(
    request.log, request.id, request.body
  );
  if (!requestTranslationResult.success) { return reply.code(400)... }

  // 2. Build upstream URL for chat/completions
  const upstreamUrl = `${config.targetUrl.replace(/\/$/, '')}/v1/chat/completions`;

  // 3. Forward headers (skip host, content-length, transfer-encoding)
  // 4. AbortController + timeout
  // 5. fetch(upstreamUrl, { method: 'POST', body: JSON.stringify(translated), signal })
  // 6. Read + parse response body
  // 7. translateChatToResponseApiResponse(parsedBody) → result
  // 8. If translation fails → 502
  // 9. Forward upstream headers + return 200 with translated body
}
```

### Anti-Patterns to Avoid

- **Throwing from translation functions:** Must return `{ success: false }` — never throw. The routing handler's outer try/catch is for network/timeout errors only.
- **Calling passThroughHandler for translated path:** The `response → chat_completions` branch owns its own fetch cycle, exactly like the `chat_completions → response` branch. Do not delegate to passThroughHandler.
- **Failing on unknown fields:** TRANS-03 explicitly requires best-effort. Unknown fields are dropped+logged, the request continues.
- **Defining new types instead of extending existing ones:** `ResponseApiRequest` and `ChatCompletionsRequest` types already exist in `src/translation/types.ts`. Use and extend them, not redefine.

---

## Field Mapping Tables

### TRANS-01: Responses API Request → Chat Completions Request

| Responses API Field | Chat Completions Field | Mapping Rule | Notes |
|---------------------|------------------------|--------------|-------|
| `model` | `model` | Direct copy | Required |
| `input` (string) | `messages` | Wrap in `[{ role: 'user', content: input }]` | When input is a string |
| `input` (array of message objects) | `messages` | Direct copy (same format) | Arrays of `{role, content}` pass through |
| `instructions` | `messages[0]` with role `system` | Prepend system message | Only if `instructions` is present |
| `temperature` | `temperature` | Direct copy | Optional |
| `max_output_tokens` | `max_tokens` | Direct copy | Optional |
| `top_p` | `top_p` | Direct copy | Optional |
| `stream` | `stream` | Direct copy | Optional |
| `tools` | `tools` | Direct copy | Optional |
| `tool_choice` | `tool_choice` | Direct copy | Optional |
| `text.format` | `response_format.type` | Unwrap from `text` object | Optional |
| `metadata` | `metadata` | Direct copy | Optional |
| `previous_response_id` | (DROPPED) | No Chat Completions equivalent | Log + drop |
| `store` | (DROPPED) | No Chat Completions equivalent | Log + drop |
| `reasoning` | (DROPPED) | No Chat Completions equivalent | Log + drop |
| `reasoning_effort` | (DROPPED) | No Chat Completions equivalent | Log + drop |
| `background` | (DROPPED) | No Chat Completions equivalent | Log + drop |
| `truncation` | (DROPPED) | No Chat Completions equivalent | Log + drop |

**Critical: `input` field handling.** The Responses API `input` field is polymorphic:
- A plain `string` → wrap in `[{ role: 'user', content: string }]`
- An array of message objects (same format as Chat Completions `messages`) → pass through directly
- Other shapes → best-effort or log+drop

**Critical: `instructions` handling.** If `instructions` is present, prepend `{ role: 'system', content: instructions }` to the messages array before the user input. This is the standard mapping per the Responses API migration guide.

### RESP-02: Chat Completions Response → Responses API Response

| Chat Completions Field | Responses API Field | Mapping Rule | Notes |
|------------------------|---------------------|--------------|-------|
| `id` | `id` | Direct copy | Fallback to empty string |
| `'chat.completion'` | `object` | Always `'response'` | Hard-coded |
| `model` | `model` | Direct copy | Fallback to empty string |
| `choices[0].message.content` | `output[0].content[0].text` | Wrap in output_text content item | |
| `choices[0].message.role` | `output[0].role` | Direct copy | Default `'assistant'` |
| `choices[0].finish_reason` | `stop_reason` | Via `mapFinishReason()` | Reverse of Phase 1 mapping |
| `usage.prompt_tokens` | `usage.input_tokens` | Direct copy | Optional |
| `usage.completion_tokens` | `usage.output_tokens` | Direct copy | Optional |
| `usage.total_tokens` | `usage.total_tokens` | Direct copy | Optional |

**finish_reason → stop_reason mappings (reverse of Phase 1):**

| Chat `finish_reason` | Responses API `stop_reason` |
|---------------------|------------------------------|
| `stop` | `end_turn` |
| `length` | `max_tokens` |
| `tool_calls` | `tool_calls` |
| anything else | `end_turn` (safe default) |

**Responses API output array structure:**

```json
{
  "output": [
    {
      "id": "msg_xxx",
      "type": "message",
      "role": "assistant",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "text": "...",
          "annotations": []
        }
      ]
    }
  ],
  "status": "completed",
  "object": "response"
}
```

Note: `output[0].id` can be synthesized (e.g., `'msg_' + response.id`) or set to empty string if the source Chat Completions response has no message ID. The `status: 'completed'` and `annotations: []` fields should be included to match the real Responses API shape.

---

## New Types Needed

### For `src/translation/response-to-chat/request.ts` (TRANS-01)

```typescript
// Result type for Response API → Chat Completions request translation
export interface ResponseToChatRequestTranslationResult {
  success: boolean;
  translated?: ChatCompletionsRequest;  // from src/translation/types.ts
  error?: string;
  unknownFields: string[];
}

// Options
export interface ResponseToChatRequestTranslationOptions {
  requestId: string;
}
```

### For `src/translation/chat-to-response/response.ts` (RESP-02)

```typescript
// Responses API response shape (full, not the subset from Phase 1)
export interface ResponsesApiFullResponse {
  id: string;
  object: string;  // always 'response'
  model: string;
  output: ResponseApiOutputItem[];
  stop_reason: string;
  status: string;  // always 'completed'
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
}

// Result type
export interface ChatToResponseApiTranslationResult {
  success: boolean;
  translated?: ResponsesApiFullResponse;
  error?: string;
}
```

**Note:** `ResponseApiOutputItem` already exists in `src/translation/response-to-chat/types.ts`. Import from there or move to `src/translation/types.ts` for shared use.

---

## New DROPPED_FIELDS for Response→Chat Direction

Add to `src/translation/utils/unknown-fields.ts`:

```typescript
// Fields that are Responses API-only with no Chat Completions equivalent
const DROPPED_RESPONSE_FIELDS = new Set([
  'previous_response_id',  // Phase 3 concern — no Chat equivalent
  'store',                 // Stateless phase — no Chat equivalent
  'reasoning',             // Reasoning models only
  'reasoning_effort',      // Reasoning models only
  'background',            // Async mode — no Chat equivalent
  'truncation',            // Responses API-specific
  'include',               // Responses API-specific include hints
  'user',                  // User tracking — no Chat equivalent (or pass through)
]);
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unknown field detection | Custom field scanner | `detectUnknownResponseFields` (already in `unknown-fields.ts`) | Already handles nested `text.*` fields |
| Dropped field check | Custom set lookup | `isDroppedField` (existing) | Consistent behavior across directions |
| Translation logging | Custom log call | `logTranslation`, `logUnknownFields`, `createTranslationLogEntry` (existing) | Structured format, consistent correlation |
| HTTP fetch with timeout | Custom AbortController | Copy pattern from `routing.handler.ts` lines 112-207 | Already handles 504, 502, non-JSON upstream responses |
| Integration test server | New Fastify setup | `buildServer({ config: testConfig })` from `src/index.ts` | Proven pattern from Phase 1 round-trip tests |
| Fetch mocking | MSW or nock | `vi.stubGlobal('fetch', vi.fn())` | Already in use, no new dependencies |

**Key insight:** The utilities, types, patterns, and test infrastructure from Phase 1 cover all the hard problems. The Phase 2 work is primarily field mapping logic and routing handler wiring, not infrastructure.

---

## Common Pitfalls

### Pitfall 1: The `input` field polymorphism

**What goes wrong:** Treating `input` as always an array of message objects. In practice, Responses API clients often pass `input` as a plain string (e.g., `"What is the weather?"`).

**Why it happens:** The Responses API allows `input` to be either a `string` or an `Array`. Chat Completions requires an array of `{role, content}` message objects.

**How to avoid:** In `translateResponseToChatRequest`, check `typeof input === 'string'` and wrap it: `messages = [{ role: 'user', content: input }]`. If input is an array, pass it through directly (the array format is compatible).

**Warning signs:** Tests that only test array input will miss this. Write specific tests for string input.

### Pitfall 2: Missing `instructions` → system message mapping

**What goes wrong:** Responses API clients often use `instructions` for system-level guidance. If this is dropped silently, the Chat Completions call gets no system prompt.

**Why it happens:** `instructions` is a top-level Responses API field with no direct Chat Completions equivalent (it maps to a system message).

**How to avoid:** When `instructions` is present, prepend `{ role: 'system', content: instructions }` to the `messages` array, before user input messages.

**Warning signs:** A Responses API client that relies on `instructions` for system prompts gets unexpected model behavior.

### Pitfall 3: Naming collision with existing Phase 1 result types

**What goes wrong:** Phase 1 already created `ResponseToChatTranslationResult` for the _response_ direction. Phase 2 needs a result type for the _request_ direction in the same `response-to-chat/` directory.

**Why it happens:** The directory is named for the translation direction, but now needs both request and response translation types.

**How to avoid:** Name the new type distinctly: `ResponseToChatRequestTranslationResult` (note: `Request` in the name). Keep it in `response-to-chat/request.ts` alongside the function it serves.

### Pitfall 4: The routing handler already has `translateResponseApiToChatResponse` imported for Phase 1

**What goes wrong:** The routing handler imports `translateResponseApiToChatResponse` for the `chat_completions → response` branch. Phase 2 adds new imports for `response → chat_completions`. Import naming must not collide.

**Why it happens:** Two translation functions in the handler now, different directions.

**How to avoid:** Use clear, directional names: `translateResponseToChatRequest` (TRANS-01) and `translateChatToResponseApiResponse` (RESP-02). Import both from `translation/index.js`.

### Pitfall 5: The existing routing handler's 501 stub is in the `else` branch

**What goes wrong:** The `else` branch (line 209-224 of routing.handler.ts) catches ALL unimplemented translation directions. Adding the `response → chat_completions` case means inserting a new `else if` before the final `else`.

**Why it happens:** The `else` is a catch-all for "not implemented" — must become a fallthrough only for genuinely unimplemented directions.

**How to avoid:** Insert the new `else if (routingResult.sourceFormat === 'response' && routingResult.targetFormat === 'chat_completions')` block before the existing `else`. The existing `else` (501) remains for future directions.

### Pitfall 6: Responses API response shape requires `output` as an array, not `output_text`

**What goes wrong:** Returning `{ output_text: '...' }` instead of the proper `output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '...' }] }]` array shape.

**Why it happens:** The Azure/OpenAI Responses API response has both `output` (array) and `output_text` (convenience string). Clients may rely on either. The canonical field is the `output` array.

**How to avoid:** Always construct the full `output` array structure. Include `status: 'completed'` and `annotations: []` to match the real API shape that clients may be expecting. Verify unit tests assert the `output[0].content[0].text` path, not just `output_text`.

---

## Code Examples

Verified patterns based on existing codebase and confirmed API shapes:

### Request translation function signature (TRANS-01)

```typescript
// src/translation/response-to-chat/request.ts
export function translateResponseToChatRequest(
  request: unknown,
  _options: ResponseToChatRequestTranslationOptions
): ResponseToChatRequestTranslationResult {
  try {
    if (typeof request !== 'object' || request === null) {
      return { success: false, error: 'Request must be a valid object', unknownFields: [] };
    }

    const responseRequest = request as Record<string, unknown>;
    const model = responseRequest.model;
    if (typeof model !== 'string' || model.length === 0) {
      return { success: false, error: 'Model field is required', unknownFields: [] };
    }

    // Detect unknown fields first (before building output)
    const { unknownFields } = detectUnknownResponseFields(responseRequest);

    // Build messages array from input
    let messages: Array<{ role: string; content: string }> = [];

    // Handle instructions → system message
    if (typeof responseRequest.instructions === 'string') {
      messages.push({ role: 'system', content: responseRequest.instructions });
    }

    // Handle input field (string or array)
    const input = responseRequest.input;
    if (typeof input === 'string') {
      messages.push({ role: 'user', content: input });
    } else if (Array.isArray(input)) {
      messages = [...messages, ...input as Array<{ role: string; content: string }>];
    } else {
      return { success: false, error: 'input field is required', unknownFields };
    }

    const chatRequest: ChatCompletionsRequest = { model, messages };

    // Map optional fields
    if (typeof responseRequest.temperature === 'number') chatRequest.temperature = responseRequest.temperature;
    if (typeof responseRequest.max_output_tokens === 'number') chatRequest.max_tokens = responseRequest.max_output_tokens;
    if (typeof responseRequest.top_p === 'number') chatRequest.top_p = responseRequest.top_p;
    if (typeof responseRequest.stream === 'boolean') chatRequest.stream = responseRequest.stream;

    // Map text.format → response_format
    if (typeof responseRequest.text === 'object' && responseRequest.text !== null) {
      const text = responseRequest.text as Record<string, unknown>;
      if (typeof text.format === 'string') {
        chatRequest.response_format = { type: text.format };
      }
    }

    return { success: true, translated: chatRequest, unknownFields };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), unknownFields: [] };
  }
}
```

### Response translation function signature (RESP-02)

```typescript
// src/translation/chat-to-response/response.ts
export function translateChatToResponseApiResponse(
  response: unknown
): ChatToResponseApiTranslationResult {
  try {
    if (typeof response !== 'object' || response === null) {
      return { success: false, error: 'Response must be a valid object' };
    }
    const chatResp = response as Record<string, unknown>;

    // Validate choices array
    if (!Array.isArray(chatResp.choices) || chatResp.choices.length === 0) {
      return { success: false, error: 'Response choices array is missing or empty' };
    }
    const firstChoice = chatResp.choices[0] as Record<string, unknown>;
    const message = firstChoice.message as Record<string, unknown>;

    const content = typeof message.content === 'string' ? message.content : null;
    if (content === null) {
      return { success: false, error: 'Response contains no extractable text content' };
    }

    const role = typeof message.role === 'string' ? message.role : 'assistant';
    const id = typeof chatResp.id === 'string' ? chatResp.id : '';

    const translated: ResponsesApiFullResponse = {
      id,
      object: 'response',
      model: typeof chatResp.model === 'string' ? chatResp.model : '',
      output: [
        {
          id: `msg_${id}`,
          type: 'message',
          role,
          status: 'completed',
          content: [{ type: 'output_text', text: content, annotations: [] }]
        }
      ],
      stop_reason: mapFinishReason(firstChoice.finish_reason as string | undefined),
      status: 'completed'
    };

    // Map usage
    if (typeof chatResp.usage === 'object' && chatResp.usage !== null) {
      const u = chatResp.usage as Record<string, unknown>;
      translated.usage = {
        input_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0,
        output_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
        total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0
      };
    }

    return { success: true, translated };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function mapFinishReason(finishReason: string | undefined): string {
  switch (finishReason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'tool_calls': return 'tool_calls';
    default: return 'end_turn';
  }
}
```

### Integration test pattern (mocked fetch)

```typescript
// tests/integration/translation/responses-round-trip.test.ts
describe('Responses API → Chat Completions → Responses API round-trip (mocked upstream)', () => {
  let app: FastifyInstance;
  const testConfig: AdapterConfig = {
    targetUrl: 'https://api.openai.com',
    modelMapping: { 'gpt-3.5-turbo': 'chat_completions' },
    maxRequestSizeBytes: 10485760,
    maxJsonDepth: 100,
    upstreamTimeoutSeconds: 30,
    maxConcurrentConnections: 1000
  };

  beforeEach(async () => {
    app = buildServer({ config: testConfig, logger: false });
    await app.ready();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('happy path: Responses API client gets Responses API response from chat_completions-format model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: vi.fn().mockResolvedValue(JSON.stringify(makeChatCompletionsBody()))
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/v1/responses',
      headers: { 'content-type': 'application/json' },
      payload: { model: 'gpt-3.5-turbo', input: 'Hello' }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.object).toBe('response');
    expect(Array.isArray(body.output)).toBe(true);
    expect(body.output[0].content[0].text).toBe('Hi there!');
    expect(body.output[0].role).toBe('assistant');
    expect(body.stop_reason).toBe('end_turn');
    expect(body.choices).toBeUndefined();  // Must NOT have Chat Completions fields
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pass-through only (501 for unimplemented directions) | Full bidirectional translation | Phase 2 introduces | Responses API clients can now use Chat Completions backends |
| `input` treated as array-only | `input` treated as string OR array | Phase 2 implementation | Covers real-world Responses API usage patterns |
| No `instructions` mapping | `instructions` → prepended system message | Phase 2 implementation | System prompts work for Responses API clients |

**Deprecated/outdated:**
- The 501 stub in routing.handler.ts `else` branch: will remain but should only trigger for genuinely unimplemented directions (not `response → chat_completions` after Phase 2)

---

## Open Questions

1. **What to do with Responses API `input` that is an array of non-message items (e.g., function_call_output, mcp_approval_response)**
   - What we know: The Responses API supports complex input arrays with types like `function_call_output`, `mcp_approval_response`, etc.
   - What's unclear: Should these be passed through to Chat Completions (where they're meaningless), dropped, or cause a translation failure?
   - Recommendation: For Phase 2 (stateless, non-streaming), only handle `{role, content}` message objects in the input array. Any input item that is not a standard message should be silently dropped per TRANS-03 (drop+log). This keeps Phase 2 focused on the basic case; Phase 4 (Tool Translation) will handle more complex types.

2. **Should `output[0].id` be synthesized or omitted in RESP-02?**
   - What we know: The real Responses API response includes `output[0].id` (e.g., `'msg_67cb...'`). Chat Completions responses have no equivalent message ID.
   - What's unclear: Whether clients rely on `output[0].id` for anything.
   - Recommendation: Synthesize a deterministic ID from the Chat Completions response ID: `'msg_' + (chatResponse.id ?? '')`. This is non-empty and consistent. Document as synthetic in code comments.

3. **Is `annotations: []` required in `content` items?**
   - What we know: The Azure Responses API documentation shows `annotations: []` in all output_text content items.
   - What's unclear: Whether the OpenAI production API always includes it.
   - Recommendation: Include `annotations: []` to match the observed API shape. A Responses API client parsing `content[0].annotations` would get an empty array (safe) rather than undefined (potentially unsafe).

---

## Sources

### Primary (HIGH confidence)

- **Codebase direct inspection** — `src/translation/`, `src/handlers/routing.handler.ts`, `src/translation/utils/unknown-fields.ts`, `src/translation/types.ts`, `tests/integration/translation/round-trip.test.ts` — full read, all Phase 1 patterns confirmed
- **Azure OpenAI Responses API documentation** (fetched 2026-02-19) — Full Responses API response shape confirmed including `output` array structure, `output_text` content type, `usage.input_tokens`/`output_tokens`, `status: 'completed'`, `stop_reason` field name
- **Phase 1 VERIFICATION.md** — Phase 1 patterns confirmed as passing (289 tests, 0 failures)
- **REQUIREMENTS.md** — Requirement IDs TRANS-01, TRANS-03, RESP-02 confirmed and their descriptions quoted exactly

### Secondary (MEDIUM confidence)

- **OpenAI migration guide search results** — Confirmed `instructions → system message` mapping, `max_output_tokens → max_tokens` mapping, `previous_response_id` has no Chat equivalent
- **Chat Completions API documentation search results** — Confirmed `finish_reason` values: `stop`, `length`, `tool_calls`, `content_filter`

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tooling confirmed from Phase 1
- Architecture: HIGH — patterns directly observed in Phase 1 implementation
- Field mappings: HIGH — both API shapes confirmed from official Azure docs + codebase inspection
- Pitfalls: HIGH — identified from direct codebase analysis and API shape differences

**Research date:** 2026-02-19
**Valid until:** 2026-05-19 (stable API specs; field mappings unlikely to change)
