# Story 3.5: Translation Pipeline Integration & Orchestration

**Epic:** [Epic 3: Core Bidirectional Translation](epic-3.md)

## User Story

**As a** developer working on the adapter,  
**I want** the translation engines integrated into the complete request/response pipeline,  
**So that** requests are translated end-to-end with proper routing, error handling, and observability.

## Acceptance Criteria

### Pipeline Integration

**Given** the routing layer has determined translation is required  
**When** a request enters the translation path  
**Then** the appropriate translator is invoked based on translation direction  
**And** the translator is passed the validated request  
**And** the translation result is passed to the HTTP client for forwarding

**Given** translation is required for both request and response  
**When** processing a complete request/response cycle  
**Then** the same translation direction is used for both (Chat↔Response paired correctly)  
**And** routing decision metadata is preserved throughout the request lifecycle

### Request Translation Integration

**Given** a Chat Completions request targeting a Response API model  
**When** the request reaches the translation integration point  
**Then** it invokes `ChatToResponseTranslator.translateRequest()`  
**And** the translated request is forwarded to OpenAI's `/v1/responses` endpoint  
**And** the translation decision is logged with request ID and direction

**Given** a Response API request targeting a Chat Completions model  
**When** the request reaches the translation integration point  
**Then** it invokes `ResponseToChatTranslator.translateRequest()`  
**And** the translated request is forwarded to OpenAI's `/v1/chat/completions` endpoint  
**And** the translation decision is logged with request ID and direction

**When** request translation completes  
**Then** translation duration is measured and logged  
**And** any unknown fields detected are logged

### Response Translation Integration

**Given** a successful OpenAI response is received for a translated request  
**When** the response reaches the translation integration point  
**Then** it invokes the reverse translator (matching the request translation direction)  
**And** the translated response is returned to the client  
**And** the response translation is logged with duration

**Given** the response contains unknown fields  
**When** translating the response  
**Then** unknown fields are passed through unchanged  
**And** unknown fields are logged for monitoring

### Error Handling During Translation

**PoC Note:** Structured error framework from Story 2.4 is deferred. Story 3.5 implements local error handling with try/catch blocks and `console.log`.

**Given** request translation fails (invalid input, malformed data)  
**When** the translation engine throws an error  
**Then** the adapter returns 500 Internal Server Error  
**And** the response includes request ID  
**And** the error is logged with `console.log({ action: 'translation_error', error: err.message })`  
**And** stack trace logged for debugging

**Given** response translation fails (unexpected OpenAI response format)  
**When** the response translation engine throws an error  
**Then** the adapter returns 500 Internal Server Error  
**And** the response includes request ID and details about malformed response  
**And** the error is logged with `console.log({ action: 'response_translation_error', error: err.message })` with stack trace

**Given** translation succeeds but OpenAI returns an error (4xx/5xx)  
**When** processing the error response  
**Then** the error is passed through unchanged to the client  
**And** no response translation is attempted  
**And** the error is logged with `console.log({ action: 'upstream_error', statusCode })`

### Pass-Through vs Translation Coordination

**Given** pass-through mode is selected by routing  
**When** the request flows through the pipeline  
**Then** translation steps are completely bypassed  
**And** the request is forwarded unchanged  
**And** the response is returned unchanged  
**And** pass-through mode is logged

**Given** translation mode is selected by routing  
**When** the request flows through the pipeline  
**Then** both request and response translation occur  
**And** translation mode is logged with direction

### Pipeline Observability

**Given** any request enters the adapter  
**When** flowing through the pipeline  
**Then** each stage is logged with structured JSON:
```json
{
  "request_id": "uuid",
  "stage": "routing|request_translation|upstream|response_translation|complete",
  "action": "started|completed|failed",
  "timestamp": "ISO8601",
  "duration_ms": 5.2,
  "translation_required": true,
  "translation_direction": "chat_to_response",
  "model": "gpt-4o",
  "unknown_fields": ["field1"]
}
```

**When** translation occurs  
**Then** translation performance is measured and logged  
**And** performance is validated against <10ms target (warn if exceeded)

### End-to-End Integration Tests

**Given** the complete pipeline is implemented  
**When** running end-to-end tests  
**Then** the following flows are validated:

1. **Chat → Response (Request + Response)**
   - Chat request → translate → Response API call → translate response → Chat response
   - Verify request fields correctly mapped
   - Verify response fields correctly mapped
   - Verify round-trip semantic equivalence

2. **Response → Chat (Request + Response)**
   - Response request → translate → Chat API call → translate response → Response response
   - Verify request fields correctly mapped
   - Verify response fields correctly mapped
   - Verify round-trip semantic equivalence

3. **Pass-through (both endpoints)**
   - Chat request for Chat model → no translation → Chat response
   - Response request for Response model → no translation → Response response
   - Verify <1ms overhead

4. **Error scenarios**
   - Invalid translation input → 500 with attribution
   - OpenAI error during translated request → pass-through unchanged
   - Malformed OpenAI response → 500 with details

### PoC Logging Pattern (Console.log)

**For PoC implementation, use simple console.log pattern across all stages:**

```typescript
// Translation start
console.log({ 
  action: 'translation_start', 
  requestId: request.id, 
  direction: 'chat_to_response', 
  model: request.body.model 
});

// Translation complete
console.log({ 
  action: 'translation_complete', 
  requestId: request.id, 
  durationMs: endTime - startTime 
});

// Translation error (local try/catch)
console.log({ 
  action: 'translation_error', 
  requestId: request.id, 
  error: err.message 
});
```

**Post-PoC:** Refactor these console.log calls to centralized Pino logger from Epic 7.

## Technical Notes

**Pipeline Architecture Reference:**
See [architecture.md - Request/Response Pipeline Architecture](_bmad-output/planning-artifacts/architecture.md#requestresponse-pipeline-architecture) for complete flow diagram and integration points.

**Integration Points:**

1. **RouteHandler → Translation Decision**
   ```typescript
   const routingDecision = await routeHandler.determineRoute(request);
   // Returns: { requiresTranslation: boolean, direction: string, targetEndpoint: string }
   ```

2. **Translation Invocation**
   ```typescript
   if (routingDecision.requiresTranslation) {
     const translator = translatorFactory.getTranslator(routingDecision.direction);
     const translatedRequest = await translator.translateRequest(request.body);
     // Continue with forwarding...
   }
   ```

3. **Response Translation**
   ```typescript
   if (routingDecision.requiresTranslation && isSuccessResponse(openaiResponse)) {
     const translator = translatorFactory.getTranslator(routingDecision.direction);
     const translatedResponse = await translator.translateResponse(openaiResponse.body);
     return translatedResponse;
   }
   ```

**Error Handling Strategy:**
- Wrap translation calls in try-catch
- Distinguish translation errors from OpenAI errors
- Include error attribution in all error responses
- Log stack traces for adapter errors only (not upstream errors)

**Performance Monitoring:**
- Measure each pipeline stage separately
- Log warnings if translation exceeds 10ms
- Track pass-through overhead (<1ms target)

**Dependencies:**
- Requires Stories 3.1-3.4 (translation engines) to be complete
- Requires Epic 2 Story 2.1 (routing logic) to be complete
- Stories 2.3 and 2.4 are deferred to post-PoC; implement local error handling in this story
- Story 2.5 is deferred to post-PoC; use `console.log` for PoC logging

**Testing Approach:**
- Unit tests for integration logic (mocked translators)
- Integration tests with real translator instances
- End-to-end tests with OpenAI API (or mocked)
- Performance tests validating latency targets
- Error scenario tests (invalid inputs, upstream failures)

## Requirements Fulfilled

- FR1-FR5: Drop-in proxy with translation integration
- FR6-FR9: Bidirectional translation (orchestration)
- FR10-FR12: Forwarding and response format consistency
- FR40-FR42: Translation logging and observability
- FR47: Adapter failure error handling
- NFR-P1: Translation overhead <10ms (validated)
- NFR-P2: Pass-through latency <1ms (validated)
