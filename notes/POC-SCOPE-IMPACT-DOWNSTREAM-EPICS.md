# PoC Scope Impact on Downstream Epics

**Date:** 2026-02-12  
**Change:** Sprint Change Proposal - MVP to PoC Pivot  
**Strategy:** Descope observability and performance requirements; focus on functional demo

---

## Summary of Changes

**Descoped from Epic 2:**
- Story 2.3: Request ID Duplicate Detection (via Redis) → DEFERRED
- Story 2.4: Error Attribution with source field → DEFERRED
- Story 2.5: Structured Logging & Observability → DEFERRED

**Revised Approach:**
- Use existing Fastify `request.id` (no redis dedup needed for PoC)
- Pass-through errors unchanged (no source attribution needed for PoC)
- Console logging sufficient (no structured JSON logging required for PoC)

---

## Epic-by-Epic Impact & Mitigation

### Epic 3: Core Bidirectional Translation

**Original Dependency:** Story 3.5 requires 2.4 (Error Handling) + 2.5 (Logging)

**Impact on Stories 3.1-3.4:** NONE - proceed as planned

**Impact on Story 3.5 (Translation Pipeline Integration & Orchestration):**

| Aspect | MVP Approach | PoC Approach | Action |
|--------|--------------|--------------|--------|
| Error handling in translation | Use 2.4 framework | Implement locally in 3.5 | Add try/catch blocks in translation engine |
| Logging translation decisions | Use 2.5 structured logging | Use console.log | `console.log({ action, model, direction, error })` acceptable |
| Error response format | Include `error.source` field | Pass through as-is | Don't add `source: "adapter_error"` |

**PoC Implementation for Story 3.5:**

```typescript
// In translation orchestrator
async function translateRequest(request, sourceFormat, targetFormat) {
  try {
    console.log({ action: 'translation_start', sourceFormat, targetFormat, model: request.body.model });
    
    const translatedRequest = await translateEngine[direction](request);
    
    console.log({ action: 'translation_complete', direction });
    return translatedRequest;
  } catch (err) {
    console.log({ action: 'translation_error', error: err.message });
    
    // Return adapter error (no source field for PoC)
    return {
      statusCode: 500,
      body: {
        error: 'Translation failed'
      }
    };
  }
}
```

**Post-PoC Plan:** When implementing post-MVP observability epic, refactor these local error handling blocks into centralized framework from 2.4/2.5.

---

### Epic 4: Multi-Turn Conversation State Management

**Original Dependency:** Error handling framework (implicit in 2.4)

**Impact on Story 4.1 (Redis Integration & Readiness Enhancement):**

| Aspect | MVP Approach | PoC Approach | Action |
|--------|--------------|--------------|--------|
| Redis unavailable | Graceful fallback, 503 error | Fail startup fast | Exit with error if Redis unavailable |
| Connection pooling | Optimize for high concurrency | Use defaults | No tuning needed |
| Error logging | Structured logging with context | Console output | Log connection failures to console |

**PoC Implementation for Story 4.1:**

```typescript
// At server startup
async function initializeRedis() {
  try {
    const redis = new Redis(REDIS_URL);
    await redis.ping();
    console.log({ action: 'redis_connected' });
    return redis;
  } catch (err) {
    console.error({ action: 'redis_unavailable', error: err.message });
    throw err; // Fail startup - no fallback for PoC
  }
}
```

**Stories 4.2 & 4.3:** Proceed as planned - no logging framework dependency.

**Post-PoC Plan:** Add graceful Redis fallback and connection pooling optimization when implementing production hardening epic.

---

### Epic 5: Streaming Support

**Original Dependency:** Structured logging (2.5) + Request ID tracking (2.3)

**Impact on Stories 5.1-5.3:**

| Aspect | MVP Approach | PoC Approach | Action |
|--------|--------------|--------------|--------|
| Request ID tracking in streams | Use 2.3 ID + logging | Use `request.id` directly (already there) | Access `request.id` from Fastify request object |
| Streaming decision logging | Structured JSON logs | Console output | `console.log({ action, streamMode, model })` acceptable |
| Timeout measurement/logging | Detailed structured logs | Basic indication | Log timeout occurrence, not measurement |

**PoC Implementation for Stories 5.1-5.3:**

```typescript
// In streaming handler
async function handleStreamingResponse(request, response, upstreamResponse) {
  const requestId = request.id; // Already available from Fastify
  
  console.log({ action: 'streaming_start', requestId, model: request.body.model });
  
  try {
    // Stream processing logic
    for await (const chunk of upstreamResponse) {
      response.write(formatChunk(chunk));
    }
    
    console.log({ action: 'streaming_complete', requestId });
  } catch (err) {
    console.log({ action: 'streaming_error', requestId, error: err.message });
    response.code(500).send({ error: 'Streaming failed' });
  }
}
```

**Post-PoC Plan:** Integrate with structured logging framework and add timeout optimization when implementing post-PoC observability epic.

---

### Epic 6: MVP Feature Set + Compatibility Matrix

**No direct dependency on 2.3/2.4/2.5**

**Stories 6.1-6.6:** Proceed as planned

**Story 6.6 (Feature Compatibility Matrix & Documentation):** For PoC, create simple README section instead of formal documentation. Elevate to detailed compatibility matrix in post-MVP.

---

## PoC Logging Standards

Since structured logging is descoped, adopt simple console logging for all epics:

**Basic Event Structure:**
```typescript
console.log({
  action: string,      // e.g., 'routing_decision', 'translation_start', 'error'
  requestId?: string,  // Use request.id when available
  model?: string,      // Model name being processed
  error?: string,      // Error message (if applicable)
  direction?: string,  // 'chat_to_response' | 'response_to_chat' (translation only)
  statusCode?: number  // HTTP status (errors only)
});
```

**Example logging across epics:**

```typescript
// Epic 2 (Routing)
console.log({ action: 'routing_decision', requestId: request.id, model, sourceFormat, targetFormat, mode: 'pass-through' });

// Epic 3 (Translation)
console.log({ action: 'translation_start', requestId: request.id, direction: 'chat_to_response', model });

// Epic 4 (State)
console.log({ action: 'state_stored', requestId: request.id, conversationId });

// Epic 5 (Streaming)
console.log({ action: 'streaming_start', requestId: request.id, model });

// Errors (all epics)
console.log({ action: 'error', requestId: request.id, error: err.message, statusCode: 500 });
```

---

## Post-PoC Observability Epic (Future)

After PoC demo, create new epic to implement:

**Epic 7: PoC → MVP Hardening: Observability & Performance**

Stories:
1. **7.1:** Centralized Request ID Management
   - Implement Story 2.3 (redis duplicate detection)
   - Replaces console.log patterns across all epics
   
2. **7.2:** Structured Logging Framework
   - Implement Story 2.5 (structured JSON logging)
   - Refactor all `console.log` to structured logger
   
3. **7.3:** Error Attribution & Diagnostics
   - Implement Story 2.4 (error source field)
   - Add detailed error context to all error responses
   
4. **7.4:** Performance Optimization & Monitoring
   - Implement NFR-P1 through NFR-P5 targets
   - Add latency measurements and monitoring

---

## Development Guidance for Each Epic

### For Epic 3 Dev Team:
- Stories 3.1-3.4: Implement translation engines with basic error handling
- Story 3.5: Don't wait for 2.4/2.5; implement local error handling and `console.log`
- Post-PoC: Refactor error handling when centralized framework available

### For Epic 4 Dev Team:
- Fail fast if Redis unavailable (don't implement fallback)
- Use console logging (no structured logging needed)
- Post-PoC: Add graceful degradation and connection pooling optimization

### For Epic 5 Dev Team:
- Use `request.id` directly from Fastify
- Use console logging for streaming events
- Post-PoC: Integrate with structured logger and add timeout optimization

### For Epic 6 Dev Team:
- Stories 6.1-6.5: Implement feature detection and translation as planned
- Story 6.6: Create simple README section (not formal matrix)
- Post-PoC: Elevate to detailed compatibility matrix

---

## Success Criteria for PoC

✅ **Functional:**
- Routing works (model-based, pass-through mode)
- Translation works (bidirectional, basic features)
- State persists (multi-turn conversations)
- Streaming works (both directions)
- Features translate (vision, functions, structured outputs)

⚠️ **Non-Functional (PoC Relaxed):**
- Errors don't crash adapter (basic error handling)
- Console output shows request flow (basic visibility)
- Container builds and runs (basic deployment)
- Config loads from environment (basic configuration)

❌ **Not Required for PoC:**
- <1ms pass-through latency
- <10ms translation overhead
- 100+ concurrent requests
- 128MB memory footprint
- Structured JSON logging
- Error source attribution
- Request ID deduplication

---

## Handoff to Post-PoC Sprint

**Action Items for Sprint Master/PM:**

1. ✅ Approve PoC scope (this document)
2. ✅ Brief all dev teams on logging standards (simple console output)
3. ✅ Update acceptance criteria for upcoming stories (no performance targets)
4. ⏳ Schedule post-PoC planning session (Epic 7: Observability & Performance)
5. ⏳ Prepare Epic 7 stories after PoC demo

**Post-PoC Success Criteria:**
- PoC demo successful (all functional features working)
- Refactoring plan clear (console.log → structured logger)
- Performance baselines captured (for post-MVP targets)
- Team ready to implement observability and optimization epic

---

## Questions & Clarifications

**Q: What if Redis is unavailable during PoC?**  
A: Startup fails. No fallback for PoC. Team must ensure Redis is available in test environment.

**Q: Can we add logging later without breaking code?**  
A: Yes. `console.log` calls are independent; can replace with structured logger calls in post-PoC epic without breaking functionality.

**Q: Should we remove request ID entirely?**  
A: No. Keep using `request.id` (already implemented in Fastify). Don't add Redis duplicate detection logic.

**Q: What about error format changes?**  
A: PoC errors don't include `source` field. Post-PoC epic will add it. Current code can pass errors as-is.

**Q: Can we optimize performance during PoC?**  
A: Yes, if it doesn't delay delivery. But don't target specific NFR thresholds. Focus on functional correctness.
