
# Story 3.1 Translation Implementation Guide

## Overview

Story 3.1 implements the foundational translation infrastructure and the first translation direction: **Chat Completions → Response API Request Translation**.

This guide documents the implementation patterns, utilities, and integration points that can be reused for the remaining translation directions (Stories 3.2-3.5).

---

## Architecture

### Translation Module Structure

```
src/translation/
├── index.ts                          # Module exports
├── types.ts                          # Core translation types
├── utils/
│   ├── unknown-fields.ts             # Unknown field detection & pass-through
│   ├── translation-logger.ts         # Structured logging
│   └── round-trip-tester.ts          # Functional equivalence testing
└── chat-to-response/
    ├── types.ts                      # Chat→Response specific types
    └── request.ts                    # Request translation logic
```

### Handler Integration

```
src/handlers/
├── routing.handler.ts                # Routing logic (MODIFIED for translation)
├── translation.handler.ts            # Translation orchestration (NEW)
└── pass-through.handler.ts           # Existing pass-through logic
```

---

## Core Utilities

### 1. Unknown Fields Utility (`utils/unknown-fields.ts`)

**Purpose:** Identifies fields not in the known schema and enables forward compatibility

**Key Functions:**
- `detectUnknownChatFields()` - Finds unknown fields in Chat Completions requests
- `detectUnknownResponseFields()` - Finds unknown fields in Response API requests
- `isDroppedField()` - Checks if field is explicitly unsupported (not passed through)

**Known Fields Sets:**
- Chat Completions: model, messages, temperature, max_tokens, etc.
- Response API: model, input, instructions, temperature, max_output_tokens, etc.
- Dropped Fields: frequency_penalty, presence_penalty, n, stop, logprobs (intentionally excluded)

**Usage Example:**
```typescript
const { unknownFields, cleanedPayload } = detectUnknownChatFields(request);
if (unknownFields.length > 0) {
  logger.debug(`Unknown fields: ${unknownFields.join(', ')}`);
}
```

### 2. Translation Logger (`utils/translation-logger.ts`)

**Purpose:** Provides structured logging for all translation operations

**Key Functions:**
- `logTranslation()` - Logs translation completion or failure
- `logUnknownFields()` - Logs detected unknown fields
- `logTranslationError()` - Logs translation errors with context
- `createTranslationLogEntry()` - Creates structured log entry

**Log Entry Structure:**
```json
{
  "requestId": "correlation-id",
  "translationDirection": "chat_to_response",
  "mode": "translate",
  "unknownFields": ["custom_field"],
  "timestamp": "2026-02-12T15:30:45.123Z",
  "success": true
}
```

**Usage Example:**
```typescript
const entry = createTranslationLogEntry(
  requestId, 'chat_to_response', 'translate',
  unknownFields, success, error
);
logTranslation(logger, entry);
```

### 3. Round-Trip Tester (`utils/round-trip-tester.ts`)

**Purpose:** Validates functional equivalence through round-trip translation

**Semantic Equivalence Criteria:**
- Model: Must match exactly
- Content: Must match exactly
- Parameters: Must match exactly (temperature, max_tokens, top_p, stream)

**Key Functions:**
- `testChatToResponseRoundTrip()` - Tests Chat→Response→Chat round-trip
- `testResponseToChatRoundTrip()` - Tests Response→Chat→Response round-trip
- `formatRoundTripResult()` - Formats results for readability

**Usage Example:**
```typescript
const roundTripResult = testChatToResponseRoundTrip(
  originalChat,
  translatedResponse,
  backTranslatedChat
);

if (roundTripResult.success) {
  console.log('✓ Round-trip passed with semantic equivalence');
} else {
  console.log(formatRoundTripResult(roundTripResult));
}
```

---

## Translation Implementation: Chat→Response

### Field Mapping Reference

| Chat Field | Response Field | Mapping Logic |
|-----------|----------------|-------|
| `model` | `model` | Direct copy |
| `messages[]` | `input` | Direct copy (full messages array) |
| `temperature` | `temperature` | Direct copy |
| `max_tokens` or `max_completion_tokens` | `max_output_tokens` | Renamed field |
| `top_p` | `top_p` | Direct copy |
| `stream` | `stream` | Direct copy |
| `tools` | `tools` | Direct copy |
| `tool_choice` | `tool_choice` | Direct copy |
| `response_format` | `text.format` | Nested structure change |
| `metadata` | `metadata` | Direct copy |
| *(unknown)* | *(passed through)* | Forward compatibility |
| frequency_penalty, presence_penalty, n, stop | *(dropped)* | Not passed through |

### Translation Function

**Location:** `src/translation/chat-to-response/request.ts`

**Main Function:** `translateChatToResponse()`

```typescript
export function translateChatToResponse(
  request: unknown,
  options: ChatToResponseTranslationOptions
): ChatToResponseTranslationResult
```

**Return Type:**
```typescript
interface ChatToResponseTranslationResult {
  success: boolean;
  translated?: ResponseApiRequest;  // Output if successful
  error?: string;
  unknownFields: string[];           // Unknown fields detected
  multi_turn_detected: boolean;       // Flag for conversation history
}
```

### Multi-Turn Detection

When a Chat request contains multiple messages (conversation history):
1. Flag `multi_turn_detected` is set to true
2. The full messages array is passed through to Response API
3. Log entry documents the detection for downstream state management (Epic 4)

**Example:**
```typescript
const chatRequest = {
  model: 'gpt-4',
  messages: [
    { role: 'user', content: 'First message' },
    { role: 'assistant', content: 'Response' },
    { role: 'user', content: 'Last message' }
  ]
};

const result = translateChatToResponse(chatRequest, { requestId });
// result.translated.input === chatRequest.messages
// result.multi_turn_detected === true
```

---

## Integration: Translation Handler

**Location:** `src/handlers/translation.handler.ts`

**Main Function:** `handleChatToResponseTranslation()`

**Responsibilities:**
1. Validate request format
2. Invoke translation logic
3. Log translation with metadata
4. Return result

**Usage in Routing Handler:**
```typescript
const translationResult = handleChatToResponseTranslation(
  request.log,
  request.id,
  request.body
);

if (!translationResult.success) {
  return reply.code(400).send({
    error: 'Translation Error',
    message: translationResult.error
  });
}

// Forward translated request
return passThroughHandler(
  { ...request, body: translationResult.translated },
  reply
);
```

---

## Routing Integration

**File Modified:** `src/handlers/routing.handler.ts`

**Integration Points:**

1. **Import translation handler:**
   ```typescript
   import { handleChatToResponseTranslation } from './translation.handler.js';
   ```

2. **Route translation direction:**
   ```typescript
   if (
     routingResult.sourceFormat === 'chat_completions' &&
     routingResult.targetFormat === 'response'
   ) {
     const translationResult = handleChatToResponseTranslation(...);
   }
   ```

3. **Forward translated request:**
   ```typescript
   return passThroughHandler(
     { ...request, body: translationResult.translated },
     reply
   );
   ```

**Decision Flow:**
```
Client Request
    ↓
Routing Decision (model → determine format mapping)
    ├─ Pass-through → Forward as-is to OpenAI
    └─ Translate → Transform format, then forward
    └─ Chat→Response: Map model, messages array, parameters
```

---

## Testing Strategy

### Unit Tests

**Coverage:** 56 tests across all utilities and translation logic

**Test Files:**
- `tests/unit/translation/unknown-fields.test.ts` - 11 tests
- `tests/unit/translation/round-trip-tester.test.ts` - 11 tests
- `tests/unit/translation/chat-to-response-request.test.ts` - 34 tests

**Key Test Scenarios:**
- Basic field mapping
- Multi-turn detection
- Unknown field handling
- System/developer role mapping
- Error handling (missing model, empty messages)
- Field dropping (unsupported fields)
- Forward compatibility (unknown fields pass through)
- Round-trip equivalence

**Running Tests:**
```bash
npm test -- tests/unit/translation --run
```

### Integration Tests

**Location:** `tests/integration/translation/chat-to-response.test.ts`

**Test Scenarios:**
- End-to-end Chat→Response routing
- Request validation
- Large payload handling
- Error handling with request ID correlation
- Endpoint handling (/v1/chat/completions and /v1/responses)

**Running Integration Tests:**
```bash
npm test -- tests/integration/translation --run
```

---

## Error Handling

### Translation Errors

Translation can fail due to:

1. **Invalid Request Format:**
   - Request is not an object
   - Missing required `model` field
   - Missing `messages` array
   - Invalid message content type

2. **Validation Errors:**
   - Model not found in mapping (handled by Router)
   - JSON depth exceeded (handled by prevalidation)

3. **Processing Errors:**
   - Unexpected errors during field mapping
   - Type coercion failures

### Error Response Format

```json
{
  "error": "Translation Error",
  "message": "Messages array is required and must contain at least one message",
  "requestId": "req-12345"
}
```

### Logging Pattern

All errors are logged with context:
```typescript
logTranslation(logger, {
  requestId,
  translationDirection: 'chat_to_response',
  mode: 'translate',
  success: false,
  error: errorMessage
});
```

---

## Extension Points for Future Stories

### Story 3.2: Response→Chat Request Translation

**Reuse Patterns:**
- Same `TranslationLogger` for consistent logging
- Same `unknown-fields` detection logic
- Follow same `CalcToResponseTranslationHandler` pattern

**Implementation in routing handler:**
```typescript
} else if (
  routingResult.sourceFormat === 'response' &&
  routingResult.targetFormat === 'chat_completions'
) {
  const translationResult = handleResponseToChatTranslation(...);
  return passThroughHandler(
    { ...request, body: translationResult.translated },
    reply
  );
}
```

### Story 3.3: Response Translation (Chat→Response Response, Response→Chat Response)

**Reuse:** Response translation handlers will follow the same pattern, just with response-specific field mappings.

### Story 3.4: Pipeline Integration & Optimization

**Lever Points:**
- Translation cache (if same request patterns repeat)
- Translation mode optimization (detect patterns requiring translation)

### Story 3.5: Monitoring & Observability

**Metrics Already Captured:**
- Unknown fields detected (forward compatibility tracking)
- Multi-turn conversation frequency

---

## Code Examples

### Example 1: Simple Translation

```typescript
import { translateChatToResponse } from '../translation/index.js';

const chatRequest = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello!' }
  ],
  temperature: 0.7,
  max_tokens: 100
};

const result = translateChatToResponse(chatRequest, { requestId: 'req-123' });

if (result.success) {
  console.log('Translated:', result.translated);
  console.log('Unknown fields:', result.unknownFields);
} else {
  console.error('Translation failed:', result.error);
}
```

### Example 2: Round-Trip Validation

```typescript
import { testChatToResponseRoundTrip } from '../translation/index.js';

const originalChat = { /* Chat request */ };
const translatedResponse = translateChatToResponse(originalChat, { requestId });
const backTranslatedChat = translateResponseToChat(translatedResponse, { requestId });

const roundTripResult = testChatToResponseRoundTrip(
  originalChat,
  translatedResponse.translated,
  backTranslatedChat.translated
);

console.log(formatRoundTripResult(roundTripResult));
```

---

## Troubleshooting

### Unknown Fields Not Detected

**Symptoms:** Custom fields not appearing in `unknownFields` array

**Causes:**
- Field is in the known fields set (intended)
- Field is a dropped field (intentional exclusion)
- Payload not reaching `detectUnknownChatFields()`

**Debug:**
```typescript
const { unknownFields } = detectUnknownChatFields(request);
logger.debug(`Unknown: ${unknownFields}`, `Known: ${getKnownChatFields()}`);
```

### Round-Trip Equivalence Failures

**Symptom:** Round-trip test fails for semantically equivalent requests

**Common Causes:**
1. **max_tokens vs max_completion_tokens:** Both map to max_output_tokens, back-translate may choose different name
2. **Missing optional fields:** System message not present in Chat format may not round-trip
3. **Dropped fields:** frequency_penalty, etc. are intentionally lost

**Solution:**
- Verify only comparing model, content, and core parameters
- Understand semantic vs structural equivalence
- Check `formatRoundTripResult()` for detailed differences

---

## References

- [Translation Mapping Reference](../planning-artifacts/epic-3/translation-mapping-reference.md) - Complete field mappings
- [Epic 3: Core Bidirectional Translation](../planning-artifacts/epic-3/epic-3.md) - Epic overview
- [Story 3.1 Requirements](./3-1-chat-response-request-translation-foundation.md) - Detailed acceptance criteria
