# Story 5.1: Pass-through Streaming Pipeline

**Epic:** Epic 5 - Streaming Support  
**Story ID:** 5.1  
**Status:** Ready for Development  
**Points:** 5  
**Priority:** High  
**Depends On:** Epic 2 (routing + pass-through infrastructure)

## User Story

**As a** developer consuming the adapter  
**I want** streaming to work in pass-through mode (when source API format = target API format)  
**So that** I receive incremental SSE events without translation overhead

## Acceptance Criteria

1. ✅ **Streaming Detection**
   - System detects `stream: true` flag in incoming requests
   - System determines if pass-through or translation mode applies
   - Streaming decision logged with request ID

2. ✅ **Pass-through Streaming**
   - When source format = target format AND `stream: true`:
     - Establish upstream connection with streaming headers
     - Pipe SSE events directly to client without buffering
     - Preserve SSE event format unchanged
     - Handle `[DONE]` sentinel correctly

3. ✅ **Timeout Monitoring (Basic)**
   - Track time-to-first-byte (TTFB) for streaming requests
   - Track idle time between SSE events
   - Log timeout warnings (full enforcement in Story 5.3)

4. ✅ **Error Handling**
   - Upstream connection errors pass through to client
   - Adapter errors logged with request ID
   - Connection failures close client stream gracefully

5. ✅ **Observability**
   - Log streaming mode decision: `{streaming: true, mode: "pass-through"}`
   - Log TTFB duration
   - Log event count and completion status
   - Log timeout warnings

## Technical Implementation

### Streaming Detection

```typescript
interface StreamingContext {
  enabled: boolean;
  mode: 'pass-through' | 'translation';
  ttfbTimer: number | null;
  idleTimer: number | null;
  eventCount: number;
}

function detectStreaming(request: FastifyRequest): StreamingContext {
  const streamFlag = request.body?.stream === true;
  const sourceFormat = detectSourceFormat(request);
  const targetFormat = determineTargetFormat(request);
  
  return {
    enabled: streamFlag,
    mode: sourceFormat === targetFormat ? 'pass-through' : 'translation',
    ttfbTimer: null,
    idleTimer: null,
    eventCount: 0
  };
}
```

### Pass-through Streaming Pipeline

```typescript
async function streamPassthrough(
  upstream: Readable,
  reply: FastifyReply,
  context: StreamingContext,
  logger: Logger
) {
  const startTime = Date.now();
  
  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  // Start TTFB timer
  const ttfbTimeout = setTimeout(() => {
    logger.warn({ 
      requestId: context.requestId,
      duration: Date.now() - startTime 
    }, 'Streaming TTFB timeout warning');
  }, config.streamTTFB);
  
  let idleTimeout: NodeJS.Timeout | null = null;
  
  upstream.on('data', (chunk: Buffer) => {
    // Clear TTFB timer on first data
    if (context.eventCount === 0) {
      clearTimeout(ttfbTimeout);
      const ttfb = Date.now() - startTime;
      logger.info({ requestId: context.requestId, ttfb }, 'First byte received');
    }
    
    // Reset idle timer
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      logger.warn({ 
        requestId: context.requestId,
        lastEventAt: Date.now() - startTime 
      }, 'Streaming idle timeout warning');
    }, config.streamIdleTimeout);
    
    // Write chunk to client
    reply.raw.write(chunk);
    context.eventCount++;
  });
  
  upstream.on('end', () => {
    clearTimeout(ttfbTimeout);
    if (idleTimeout) clearTimeout(idleTimeout);
    
    logger.info({
      requestId: context.requestId,
      eventCount: context.eventCount,
      duration: Date.now() - startTime
    }, 'Streaming completed');
    
    reply.raw.end();
  });
  
  upstream.on('error', (error) => {
    clearTimeout(ttfbTimeout);
    if (idleTimeout) clearTimeout(idleTimeout);
    
    logger.error({
      requestId: context.requestId,
      error: error.message,
      eventCount: context.eventCount
    }, 'Upstream streaming error');
    
    reply.raw.end();
  });
}
```

### Routing Integration

```typescript
// In main request handler
if (streamingContext.enabled && streamingContext.mode === 'pass-through') {
  logger.info({ 
    requestId,
    streaming: true,
    mode: 'pass-through' 
  }, 'Routing decision');
  
  const upstreamResponse = await makeUpstreamRequest(translatedRequest, {
    responseType: 'stream'
  });
  
  return streamPassthrough(upstreamResponse.data, reply, streamingContext, logger);
}
```

## Test Cases

### Unit Tests

```typescript
describe('Streaming Detection', () => {
  it('detects streaming flag in Chat Completions request', () => {
    const request = { body: { stream: true, model: 'gpt-4' } };
    const context = detectStreaming(request);
    expect(context.enabled).toBe(true);
  });
  
  it('detects pass-through mode when formats match', () => {
    const request = { 
      url: '/v1/chat/completions',
      body: { stream: true, model: 'gpt-4' } 
    };
    const context = detectStreaming(request);
    expect(context.mode).toBe('pass-through');
  });
  
  it('detects translation mode when formats differ', () => {
    const request = { 
      url: '/v1/chat/completions',
      body: { stream: true, model: 'claude-3.5-sonnet' } // Maps to Response API
    };
    const context = detectStreaming(request);
    expect(context.mode).toBe('translation');
  });
});

describe('Pass-through Streaming', () => {
  it('pipes SSE events unchanged to client', async () => {
    const upstreamEvents = [
      'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"id":"1","choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n'
    ];
    
    const mockUpstream = createMockStream(upstreamEvents);
    const mockReply = createMockReply();
    
    await streamPassthrough(mockUpstream, mockReply, context, logger);
    
    expect(mockReply.chunks).toEqual(upstreamEvents);
  });
  
  it('tracks event count correctly', async () => {
    const upstreamEvents = [
      'data: {"delta":{"content":"A"}}\n\n',
      'data: {"delta":{"content":"B"}}\n\n'
    ];
    
    const context = { eventCount: 0 };
    await streamPassthrough(createMockStream(upstreamEvents), mockReply, context, logger);
    
    expect(context.eventCount).toBe(2);
  });
});
```

### Contract Tests

```typescript
describe('Chat→Chat Pass-through Streaming', () => {
  it('successfully streams Chat Completions request to Chat Completions backend', async () => {
    const request = {
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      }
    };
    
    const response = await adapter.inject(request);
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    
    const events = parseSSE(response.rawPayload);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toBe('[DONE]');
  });
});

describe('Response→Response Pass-through Streaming', () => {
  it('successfully streams Response API request to Response API backend', async () => {
    const request = {
      url: '/v1/responses',
      body: {
        model: 'claude-3.5-sonnet',
        text: 'Hello',
        stream: true
      }
    };
    
    const response = await adapter.inject(request);
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');
    
    const events = parseSSE(response.rawPayload);
    expect(events.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

```typescript
describe('Pass-through Streaming Integration', () => {
  it('streams from real OpenAI endpoint', async () => {
    // Uses testcontainers or mock OpenAI server
    const mockOpenAI = await startMockOpenAIServer({
      streamingEnabled: true
    });
    
    const adapter = createAdapter({
      targetUrl: mockOpenAI.url,
      modelMapping: { 'gpt-4': 'chat' }
    });
    
    const response = await adapter.inject({
      url: '/v1/chat/completions',
      body: { 
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Count to 5' }],
        stream: true
      }
    });
    
    const events = parseSSEStream(response.rawPayload);
    
    expect(events.length).toBeGreaterThan(1);
    expect(events[events.length - 1]).toBe('[DONE]');
    
    await mockOpenAI.stop();
  });
});
```

## Edge Cases

1. **Empty Stream:** Upstream returns `[DONE]` immediately
   - **Expected:** Client receives `[DONE]`, no error
   
2. **Connection Drop Mid-stream:** Upstream disconnects after N events
   - **Expected:** Client stream closes gracefully, event count logged
   
3. **Non-streaming Request:** `stream: false` or omitted
   - **Expected:** Buffered response (existing logic), not this pipeline

4. **Malformed SSE Event:** Upstream sends invalid SSE format
   - **Expected:** Pass through unchanged (transparency), log warning

## Performance Considerations

- **Memory:** No buffering—stream chunks written immediately
- **Latency:** <1ms per event (pipe overhead only)
- **Throughput:** Limited by network, not adapter logic

## Documentation Updates

- [ ] Add streaming detection to routing decision docs
- [ ] Document pass-through streaming flow
- [ ] Add SSE format notes (OpenAI Chat + Response API)
- [ ] Update logging schema with streaming fields

## Definition of Done

- [ ] Code implemented and reviewed
- [ ] Unit tests passing (streaming detection, event piping)
- [ ] Contract tests passing (Chat→Chat, Response→Response streaming)
- [ ] Integration test with mock OpenAI streaming endpoint
- [ ] Logging captures streaming decisions and event counts
- [ ] Documentation updated
- [ ] Merged to main branch
