# Story 5.2: Bidirectional Streaming Translation

**Epic:** Epic 5 - Streaming Support  
**Story ID:** 5.2  
**Story Points:** 8  
**Priority:** High  
**Depends On:** Story 5.1 (pass-through streaming), Epic 3 (translation logic)

## User Story

**As a** developer consuming the adapter  
**I want** streaming to work when translating between Chat Completions API and Response API  
**So that** I receive incremental results regardless of backend API format

## Acceptance Criteria

1. ✅ **Chat→Response Streaming Translation**
   - Parse Chat Completions SSE events incrementally (line-by-line)
   - Extract delta content from each event
   - Translate to Response API SSE format
   - Stream translated events to client without buffering full response
   - Handle `[DONE]` sentinel correctly

2. ✅ **Response→Chat Streaming Translation**
   - Parse Response API SSE events incrementally
   - Extract delta content from each event
   - Translate to Chat Completions API SSE format
   - Stream translated events to client
   - Handle completion signals correctly

3. ✅ **Incremental Translation**
   - Translate each SSE event independently (no full buffering)
   - Translation overhead <5ms per event (P95)
   - Memory footprint constant regardless of response length

4. ✅ **State Management Integration**
   - For Response→Chat with conversation state: accumulate messages during streaming
   - Store final conversation state after stream completes
   - Handle streaming errors without corrupting state

**PoC Logging:** Use `console.log` with request.id from Fastify (structured logging deferred to post-PoC)

5. ✅ **Error Handling**
   - Translation errors during streaming close stream with error event
   - Log translation failures with event index and request ID
   - Partial streams handled gracefully (no response corruption)

6. ✅ **Observability**
   - Log streaming translation mode: `{streaming: true, mode: "translation", direction: "chat→response"}`
   - Log per-event translation metrics (count, timing)
   - Log stream completion status

## Technical Implementation

### Architecture: Reusing Epic 3 Translation Logic

**Key Design Principle:** Streaming translation reuses the same field-level translation logic from Epic 3, applied incrementally to delta objects instead of full request/response objects.

```typescript
// Epic 3: Translate full response object
function translateChatResponseToResponse(chatResponse: ChatResponse): ResponseAPIResponse {
  return {
    id: chatResponse.id,
    text: chatResponse.choices[0].message.content,
    // ... other field mappings
  };
}

// Epic 5: Translate streaming delta (same field mappings)
function translateChatDeltaToResponse(chatDelta: ChatDelta): ResponseDelta {
  return {
    id: chatDelta.id,
    type: 'content_delta',
    delta: {
      text: chatDelta.choices[0].delta.content || ''
    }
  };
}
```

**Shared Translation Utilities:**
- Field mapping functions (from Epic 3)
- Validation logic (field presence, type checking)
- Unknown field pass-through logic

**Streaming-Specific Logic:**
- SSE event parsing (line-by-line)
- Delta accumulation (for state storage)
- Incremental output formatting

### SSE Parser (Incremental)

```typescript
interface SSEEvent {
  type: 'data' | 'done' | 'error';
  data?: unknown;
  raw?: string;
}

class SSEParser {
  private buffer: string = '';
  
  /**
   * Parse incoming chunk, yield complete events
   * Does NOT buffer full response
   */
  *parseChunk(chunk: Buffer): Generator<SSEEvent> {
    this.buffer += chunk.toString('utf-8');
    const lines = this.buffer.split('\n');
    
    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        currentEvent += line.substring(6);
      } else if (line === '') {
        // Empty line = end of event
        if (currentEvent === '[DONE]') {
          yield { type: 'done' };
        } else if (currentEvent) {
          try {
            yield { type: 'data', data: JSON.parse(currentEvent) };
          } catch (e) {
            yield { type: 'error', raw: currentEvent };
          }
        }
        currentEvent = '';
      }
    }
  }
  
  flush(): SSEEvent | null {
    if (this.buffer === '[DONE]') {
      return { type: 'done' };
    }
    if (this.buffer) {
      try {
        return { type: 'data', data: JSON.parse(this.buffer) };
      } catch {
        return { type: 'error', raw: this.buffer };
      }
    }
    return null;
  }
}
```

### Chat→Response Streaming Translator

```typescript
async function streamChatToResponse(
  upstream: Readable,
  reply: FastifyReply,
  context: StreamingContext,
  logger: Logger
) {
  const parser = new SSEParser();
  const startTime = Date.now();
  
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  upstream.on('data', (chunk: Buffer) => {
    for (const event of parser.parseChunk(chunk)) {
      const translationStart = Date.now();
      
      if (event.type === 'done') {
        reply.raw.write('data: [DONE]\n\n');
        context.eventCount++;
      } else if (event.type === 'data') {
        try {
          // REUSE Epic 3 translation logic for delta objects
          const responseEvent = translateChatDeltaToResponse(event.data);
          const sseFormatted = `data: ${JSON.stringify(responseEvent)}\n\n`;
          reply.raw.write(sseFormatted);
          
          context.eventCount++;
          
          const translationDuration = Date.now() - translationStart;
          if (translationDuration > 5) {
            console.log({ 
              action: 'slow_streaming_translation_warning',
              requestId: request.id,  // From Fastify
              eventIndex: context.eventCount,
              durationMs: translationDuration 
            });
          }
        } catch (error) {
          console.log({
            action: 'streaming_translation_error',
            requestId: request.id,  // From Fastify
            eventIndex: context.eventCount,
            error: error.message
          });
          
          reply.raw.write(`data: ${JSON.stringify({ error: 'Translation error' })}\n\n`);
          reply.raw.end();
          return;
        }
      }
    }
  });
  
  upstream.on('end', () => {
    const finalEvent = parser.flush();
    if (finalEvent) {
      // Handle any remaining buffered data
      reply.raw.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
    }
    
    logger.info({
      requestId: context.requestId,
      eventCount: context.eventCount,
      duration: Date.now() - startTime
    }, 'Streaming translation completed');
    
    reply.raw.end();
  });
  
  upstream.on('error', (error) => {
    logger.error({
      requestId: context.requestId,
      error: error.message,
      eventCount: context.eventCount
    }, 'Upstream streaming error');
    
    reply.raw.end();
  });
}
```

### Response→Chat Streaming Translator

```typescript
async function streamResponseToChat(
  upstream: Readable,
  reply: FastifyReply,
  context: StreamingContext & { conversationId?: string },
  logger: Logger
) {
  const parser = new SSEParser();
  const accumulatedMessages: Message[] = [];
  
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  upstream.on('data', (chunk: Buffer) => {
    for (const event of parser.parseChunk(chunk)) {
      if (event.type === 'done') {
        // Store accumulated conversation state if needed
        if (context.conversationId && accumulatedMessages.length > 0) {
          storeConversationState(context.conversationId, accumulatedMessages)
            .catch(err => logger.error({ error: err.message }, 'Failed to store conversation state'));
        }
        
        reply.raw.write('data: [DONE]\n\n');
      } else if (event.type === 'data') {
        try {
          const chatEvent = translateResponseDeltaToChat(event.data);
          
          // Accumulate for state storage
          if (context.conversationId) {
            accumulateMessage(accumulatedMessages, chatEvent);
          }
          
          const sseFormatted = `data: ${JSON.stringify(chatEvent)}\n\n`;
          reply.raw.write(sseFormatted);
          context.eventCount++;
        } catch (error) {
          logger.error({ error: error.message }, 'Streaming translation error');
          reply.raw.write(`data: ${JSON.stringify({ error: 'Translation error' })}\n\n`);
          reply.raw.end();
          return;
        }
      }
    }
  });
  
  upstream.on('end', () => {
    logger.info({
      requestId: context.requestId,
      conversationId: context.conversationId,
      eventCount: context.eventCount,
      messagesAccumulated: accumulatedMessages.length
    }, 'Streaming translation completed');
    
    reply.raw.end();
  });
  
  upstream.on('error', (error) => {
    logger.error({ error: error.message }, 'Upstream streaming error');
    reply.raw.end();
  });
}
```

### Delta Translation Functions (Reuse Epic 3 Logic)

```typescript
/**
 * Translate Chat Completions delta to Response API delta
 * DESIGN: Reuses field mapping logic from Epic 3 translateChatToResponse
 */
function translateChatDeltaToResponse(chatDelta: any): any {
  // Chat format: { id, object: "chat.completion.chunk", choices: [{ delta: { content } }] }
  // Response format: { id, type: "content_delta", delta: { text } }
  
  const choice = chatDelta.choices?.[0];
  if (!choice?.delta) return chatDelta; // Pass through if unexpected format
  
  // REUSE: Same field mapping as Epic 3 (choices[0].message.content → text)
  // But applied to delta.content instead of message.content
  return {
    id: chatDelta.id,
    type: 'content_delta',
    delta: {
      text: choice.delta.content || ''
    }
  };
}

/**
 * Translate Response API delta to Chat Completions delta
 * DESIGN: Reuses field mapping logic from Epic 3 translateResponseToChat
 */
function translateResponseDeltaToChat(responseDelta: any): any {
  // Response format: { id, type: "content_delta", delta: { text } }
  // Chat format: { id, object: "chat.completion.chunk", choices: [{ delta: { content } }] }
  
  if (responseDelta.type !== 'content_delta') {
    return responseDelta; // Pass through non-content deltas
  }
  
  // REUSE: Same field mapping as Epic 3 (text → choices[0].message.content)
  // But applied to delta.text instead of full text
  return {
    id: responseDelta.id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: 'unknown', // Will be enriched from request context
    choices: [{
      index: 0,
      delta: {
        content: responseDelta.delta?.text || ''
      },
      finish_reason: null
    }]
  };
}

/**
 * SHARED UTILITY: Extract field mapping logic from Epic 3
 * Example refactoring to maximize reuse:
 */
const FieldMappings = {
  // Chat → Response
  chatContentToResponseText: (chatObj: any) => 
    chatObj.choices?.[0]?.message?.content || chatObj.choices?.[0]?.delta?.content || '',
  
  // Response → Chat
  responseTextToChatContent: (responseObj: any) =>
    responseObj.text || responseObj.delta?.text || ''
};

```

## Test Cases

### Unit Tests

```typescript
describe('SSE Parser', () => {
  it('parses complete SSE events from chunks', () => {
    const parser = new SSEParser();
    const chunk1 = Buffer.from('data: {"content":"Hello"}\n');
    const chunk2 = Buffer.from('\ndata: {"content":"World"}\n\n');
    
    const events1 = Array.from(parser.parseChunk(chunk1));
    const events2 = Array.from(parser.parseChunk(chunk2));
    
    expect(events1).toHaveLength(0); // Incomplete event
    expect(events2).toHaveLength(2); // Both events complete
  });
  
  it('handles [DONE] sentinel', () => {
    const parser = new SSEParser();
    const chunk = Buffer.from('data: [DONE]\n\n');
    
    const events = Array.from(parser.parseChunk(chunk));
    
    expect(events).toEqual([{ type: 'done' }]);
  });
  
  it('handles split events across chunks', () => {
    const parser = new SSEParser();
    const chunk1 = Buffer.from('data: {"cont');
    const chunk2 = Buffer.from('ent":"Hi"}\n\n');
    
    Array.from(parser.parseChunk(chunk1)); // Buffers incomplete
    const events = Array.from(parser.parseChunk(chunk2));
    
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ content: 'Hi' });
  });
});

describe('Chat→Response Delta Translation', () => {
  it('translates Chat delta to Response delta', () => {
    const chatDelta = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      choices: [{
        delta: { content: 'Hello' },
        index: 0
      }]
    };
    
    const responseDelta = translateChatDeltaToResponse(chatDelta);
    
    expect(responseDelta).toEqual({
      id: 'chatcmpl-123',
      type: 'content_delta',
      delta: { text: 'Hello' }
    });
  });
  
  it('handles empty content delta', () => {
    const chatDelta = {
      id: 'chatcmpl-123',
      choices: [{ delta: {} }]
    };
    
    const responseDelta = translateChatDeltaToResponse(chatDelta);
    
    expect(responseDelta.delta.text).toBe('');
  });
});

describe('Response→Chat Delta Translation', () => {
  it('translates Response delta to Chat delta', () => {
    const responseDelta = {
      id: 'resp-123',
      type: 'content_delta',
      delta: { text: 'World' }
    };
    
    const chatDelta = translateResponseDeltaToChat(responseDelta);
    
    expect(chatDelta.choices[0].delta.content).toBe('World');
    expect(chatDelta.object).toBe('chat.completion.chunk');
  });
});
```

### Contract Tests

```typescript
describe('Chat→Response Streaming Translation', () => {
  it('translates streaming Chat response to Response format', async () => {
    const mockUpstream = createMockChatStream([
      { id: '1', choices: [{ delta: { content: 'Hello' } }] },
      { id: '1', choices: [{ delta: { content: ' world' } }] },
      '[DONE]'
    ]);
    
    const response = await adapter.inject({
      url: '/v1/responses',
      body: { 
        model: 'gpt-4', // Maps to Chat, translate Chat→Response
        text: 'Say hello',
        stream: true
      }
    });
    
    const events = parseSSEStream(response.rawPayload);
    
    expect(events[0].type).toBe('content_delta');
    expect(events[0].delta.text).toBe('Hello');
    expect(events[1].delta.text).toBe(' world');
    expect(events[events.length - 1]).toBe('[DONE]');
  });
});

describe('Response→Chat Streaming Translation', () => {
  it('translates streaming Response to Chat format', async () => {
    const mockUpstream = createMockResponseStream([
      { id: '1', type: 'content_delta', delta: { text: 'Hi' } },
      { id: '1', type: 'content_delta', delta: { text: ' there' } },
      '[DONE]'
    ]);
    
    const response = await adapter.inject({
      url: '/v1/chat/completions',
      body: {
        model: 'claude-3.5-sonnet', // Maps to Response, translate Response→Chat
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      }
    });
    
    const events = parseSSEStream(response.rawPayload);
    
    expect(events[0].object).toBe('chat.completion.chunk');
    expect(events[0].choices[0].delta.content).toBe('Hi');
    expect(events[1].choices[0].delta.content).toBe(' there');
  });
});
```

### Integration Tests

```typescript
describe('Streaming Translation Integration', () => {
  it('maintains translation correctness across full stream', async () => {
    const mockOpenAI = await startMockOpenAIServer({
      streamingEnabled: true,
      responseChunks: 50 // Long stream
    });
    
    const response = await adapter.inject({
      url: '/v1/responses',
      body: {
        model: 'gpt-4',
        text: 'Count to 50',
        stream: true
      }
    });
    
    const events = parseSSEStream(response.rawPayload);
    
    // Verify all events translated correctly
    for (const event of events) {
      if (event !== '[DONE]') {
        expect(event.type).toBe('content_delta');
        expect(event.delta).toHaveProperty('text');
      }
    }
    
    await mockOpenAI.stop();
  });
  
  it('stores conversation state after streaming completes', async () => {
    const redis = await startTestRedis();
    
    const response = await adapter.inject({
      url: '/v1/chat/completions',
      body: {
        model: 'claude-3.5-sonnet',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      }
    });
    
    await response.rawPayload.end(); // Wait for stream completion
    
    // Verify conversation state stored
    const conversationId = extractConversationId(response.headers);
    const state = await redis.get(`conversation:${conversationId}`);
    
    expect(state).toBeDefined();
    expect(JSON.parse(state).messages).toHaveLength(2); // User + assistant
    
    await redis.stop();
  });
});
```

## Edge Cases

1. **Very Short Stream:** Single event + `[DONE]`
   - **Expected:** Translate both events correctly

2. **Very Long Stream:** 1000+ events
   - **Expected:** Constant memory usage, all events translated

3. **Split Event Across Chunks:** JSON spans multiple TCP packets
   - **Expected:** Parser buffers and completes event correctly

4. **Translation Error Mid-stream:** Event N fails to translate
   - **Expected:** Log error, send error event, close stream

5. **State Storage Failure During Streaming:** Redis down
   - **Expected:** Stream completes, log storage error (don't fail request)

## Performance Targets

- **Translation Latency:** <5ms per event (P95)
- **Memory:** Constant footprint regardless of stream length
- **Throughput:** Same as pass-through (network-limited)

## Documentation Updates

- [ ] Add streaming translation flow diagrams
- [ ] Document delta format mappings (Chat↔Response)
- [ ] Add SSE event examples for both directions
- [ ] Update translation mapping reference with streaming deltas

## Definition of Done

- [ ] Code implemented and reviewed
- [ ] Unit tests passing (parser, delta translation)
- [ ] Contract tests passing (both translation directions)
- [ ] Integration tests with mock streaming endpoints
- [ ] Performance benchmarks meet targets (<5ms per event)
- [ ] State management integration tested
- [ ] Documentation updated
- [ ] Merged to main branch
