# Story 5.3: Streaming Timeout Configuration & 504 Handling

**Epic:** Epic 5 - Streaming Support  
**Story ID:** 5.3  
**Story Points:** 5  
**Priority:** High  
**Depends On:** Story 5.1 (pass-through streaming)

## User Story

**As a** DevOps engineer deploying the adapter  
**I want** streaming-aware timeout configuration (TTFB + idle timeout)  
**So that** streaming requests fail fast when upstream is unresponsive while allowing legitimate long-running streams

## Acceptance Criteria

1. ✅ **Timeout Configuration**
   - System accepts `UPSTREAM_TIMEOUT` env var (non-streaming default: 60s)
   - System accepts `STREAM_TTFB_TIMEOUT` env var (time-to-first-byte default: 60s)
   - System accepts `STREAM_IDLE_TIMEOUT` env var (gap between events default: 300s)
   - Invalid timeout values fail startup with clear error message

2. ✅ **Non-streaming Timeout Enforcement**
   - Requests without `stream: true` time out after `UPSTREAM_TIMEOUT` seconds
   - Return 504 Gateway Timeout when timeout exceeded
   - Include request ID and timeout duration in error response

3. ✅ **Streaming TTFB Timeout**
   - Start TTFB timer when upstream request initiated
   - Return 504 Gateway Timeout if no first byte within `STREAM_TTFB_TIMEOUT`
   - Clear TTFB timer on first SSE event received
   - Log TTFB duration for successful streams

4. ✅ **Streaming Idle Timeout**
   - Start idle timer on first SSE event
   - Reset idle timer on each subsequent SSE event
   - Return 504 Gateway Timeout if gap between events exceeds `STREAM_IDLE_TIMEOUT`
   - Log idle timeout events with last event timestamp

5. ✅ **Graceful Shutdown**
   - SIGTERM waits for in-flight streaming requests to complete (<30s max)
   - Close idle connections immediately on SIGTERM
   - Log shutdown status: requests waiting, timeout countdown
   - SIGINT terminates immediately (development use)

6. ✅ **Error Response Format**
   - 504 responses include request ID, timeout type, and duration
   - Structured logging captures timeout events with context
   - Timeout attribution: `upstream_timeout` error source

## Technical Implementation

### Timeout Configuration

```typescript
interface TimeoutConfig {
  // Non-streaming: full request-response timeout
  requestTimeout: number;
  
  // Streaming: time to first SSE event (headers + first byte)
  streamTTFB: number;
  
  // Streaming: max gap between SSE events
  streamIdleTimeout: number;
}

function loadTimeoutConfig(): TimeoutConfig {
  const config = {
    requestTimeout: parseInt(process.env.UPSTREAM_TIMEOUT || '60', 10),
    streamTTFB: parseInt(process.env.STREAM_TTFB_TIMEOUT || '60', 10),
    streamIdleTimeout: parseInt(process.env.STREAM_IDLE_TIMEOUT || '300', 10)
  };
  
  // Validation
  if (config.requestTimeout <= 0 || config.requestTimeout > 600) {
    console.error(`Invalid UPSTREAM_TIMEOUT: ${config.requestTimeout}. Must be 1-600 seconds.`);
    throw new Error(`Invalid UPSTREAM_TIMEOUT: ${config.requestTimeout}. Must be 1-600 seconds.`);
  }
  if (config.streamTTFB <= 0 || config.streamTTFB > 600) {
    console.error(`Invalid STREAM_TTFB_TIMEOUT: ${config.streamTTFB}. Must be 1-600 seconds.`);
    throw new Error(`Invalid STREAM_TTFB_TIMEOUT: ${config.streamTTFB}. Must be 1-600 seconds.`);
  }
  if (config.streamIdleTimeout <= 0 || config.streamIdleTimeout > 3600) {
    console.error(`Invalid STREAM_IDLE_TIMEOUT: ${config.streamIdleTimeout}. Must be 1-3600 seconds.`);
    throw new Error(`Invalid STREAM_IDLE_TIMEOUT: ${config.streamIdleTimeout}. Must be 1-3600 seconds.`);
  }
  
  return config;
}
```

### Non-streaming Timeout

```typescript
async function makeUpstreamRequest(
  request: TranslatedRequest,
  config: TimeoutConfig,
  logger: Logger
): Promise<Response> {
  const startTime = Date.now();
  
  try {
    const response = await axios.post(request.url, request.body, {
      headers: request.headers,
      timeout: config.requestTimeout * 1000, // Convert to milliseconds
      validateStatus: () => true // Accept all status codes
    });
    
    console.log({
      action: 'upstream_request_completed',
      requestId: request.id,
      durationMs: Date.now() - startTime,
      statusCode: response.status
    });
    
    return response;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log({
        action: 'upstream_timeout',
        requestId: request.id,
        timeoutSeconds: config.requestTimeout,
        durationMs: Date.now() - startTime
      });
      
      throw new TimeoutError('upstream_timeout', config.requestTimeout);
    }
    throw error;
  }
}
```

### Streaming TTFB Timeout

```typescript
async function streamWithTimeouts(
  upstream: Readable,
  reply: FastifyReply,
  context: StreamingContext,
  config: TimeoutConfig,
  logger: Logger
) {
  const startTime = Date.now();
  let firstByteReceived = false;
  let lastEventTime = Date.now();
  
  // TTFB timeout
  const ttfbTimer = setTimeout(() => {
    if (!firstByteReceived) {
      console.log({
        action: 'streaming_ttfb_timeout',
        requestId: context.requestId,
        timeoutSeconds: config.streamTTFB,
        durationMs: Date.now() - startTime
      });
      
      // Send 504 to client
      if (!reply.sent) {
        reply.status(504).send({
          error: {
            message: 'Gateway Timeout: No response from upstream within TTFB timeout',
            type: 'upstream_timeout',
            timeout_type: 'ttfb',
            timeout_duration: config.streamTTFB,
            request_id: context.requestId
          }
        });
      }
      
      upstream.destroy();
    }
  }, config.streamTTFB * 1000);
  
  // Idle timeout (reset on each event)
  let idleTimer: NodeJS.Timeout | null = null;
  
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    
    idleTimer = setTimeout(() => {
      console.log({
        action: 'streaming_idle_timeout',
        requestId: context.requestId,
        timeoutSeconds: config.streamIdleTimeout,
        lastEventAtMs: lastEventTime,
        idleDurationMs: Date.now() - lastEventTime
      });
      
      // Close stream gracefully
      reply.raw.write(`data: ${JSON.stringify({ 
        error: 'Stream idle timeout exceeded' 
      })}\n\n`);
      reply.raw.end();
      
      upstream.destroy();
    }, config.streamIdleTimeout * 1000);
  };
  
  upstream.on('data', (chunk: Buffer) => {
    if (!firstByteReceived) {
      firstByteReceived = true;
      clearTimeout(ttfbTimer);
      
      const ttfb = Date.now() - startTime;
      console.log({
        action: 'streaming_first_byte_received',
        requestId: context.requestId,
        ttfbMs: ttfb
      }, 'First byte received');
      
      // Start idle timer after first byte
      resetIdleTimer();
    } else {
      // Reset idle timer on subsequent events
      lastEventTime = Date.now();
      resetIdleTimer();
    }
    
    // Process chunk (existing logic)
    reply.raw.write(chunk);
  });
  
  upstream.on('end', () => {
    clearTimeout(ttfbTimer);
    if (idleTimer) clearTimeout(idleTimer);
    
    logger.info({
      requestId: context.requestId,
      duration: Date.now() - startTime,
      eventCount: context.eventCount
    }, 'Streaming completed successfully');
    
    reply.raw.end();
  });
  
  upstream.on('error', (error) => {
    clearTimeout(ttfbTimer);
    if (idleTimer) clearTimeout(idleTimer);
    
    logger.error({
      requestId: context.requestId,
      error: error.message
    }, 'Upstream streaming error');
    
    if (!reply.sent) {
      reply.status(500).send({
        error: {
          message: 'Upstream streaming error',
          type: 'upstream_error',
          request_id: context.requestId
        }
      });
    }
  });
}
```

### Graceful Shutdown

```typescript
class AdapterServer {
  private server: FastifyInstance;
  private inFlightRequests: Set<string> = new Set();
  private isShuttingDown = false;
  
  async start() {
    // Register signal handlers
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.immediateShutdown());
    
    await this.server.listen({ port: 3000, host: '0.0.0.0' });
  }
  
  private async gracefulShutdown() {
    this.isShuttingDown = true;
    const shutdownStart = Date.now();
    const maxWait = 30000; // 30 seconds
    
    this.server.log.info({
      inFlightRequests: this.inFlightRequests.size
    }, 'Graceful shutdown initiated');
    
    // Stop accepting new requests
    this.server.server.close();
    
    // Wait for in-flight requests
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - shutdownStart;
      
      if (this.inFlightRequests.size === 0) {
        clearInterval(checkInterval);
        this.server.log.info('All requests completed, shutting down');
        process.exit(0);
      } else if (elapsed > maxWait) {
        clearInterval(checkInterval);
        this.server.log.warn({
          remainingRequests: this.inFlightRequests.size
        }, 'Shutdown timeout, forcing exit');
        process.exit(1);
      } else {
        this.server.log.info({
          remainingRequests: this.inFlightRequests.size,
          elapsed: Math.floor(elapsed / 1000),
          maxWait: Math.floor(maxWait / 1000)
        }, 'Waiting for in-flight requests');
      }
    }, 1000);
  }
  
  private immediateShutdown() {
    this.server.log.warn('Immediate shutdown (SIGINT)');
    process.exit(0);
  }
  
  trackRequest(requestId: string) {
    this.inFlightRequests.add(requestId);
  }
  
  completeRequest(requestId: string) {
    this.inFlightRequests.delete(requestId);
  }
}
```

## Test Cases

### Unit Tests

```typescript
describe('Timeout Configuration', () => {
  it('loads valid timeout configuration', () => {
    process.env.UPSTREAM_TIMEOUT = '90';
    process.env.STREAM_TTFB_TIMEOUT = '120';
    process.env.STREAM_IDLE_TIMEOUT = '600';
    
    const config = loadTimeoutConfig();
    
    expect(config.requestTimeout).toBe(90);
    expect(config.streamTTFB).toBe(120);
    expect(config.streamIdleTimeout).toBe(600);
  });
  
  it('fails on invalid UPSTREAM_TIMEOUT', () => {
    process.env.UPSTREAM_TIMEOUT = '700'; // Over max
    
    expect(() => loadTimeoutConfig()).toThrow('Invalid UPSTREAM_TIMEOUT');
  });
  
  it('uses defaults when env vars not set', () => {
    delete process.env.UPSTREAM_TIMEOUT;
    delete process.env.STREAM_TTFB_TIMEOUT;
    delete process.env.STREAM_IDLE_TIMEOUT;
    
    const config = loadTimeoutConfig();
    
    expect(config.requestTimeout).toBe(60);
    expect(config.streamTTFB).toBe(60);
    expect(config.streamIdleTimeout).toBe(300);
  });
});

describe('Non-streaming Timeout', () => {
  it('returns 504 when upstream timeout exceeded', async () => {
    const slowUpstream = createSlowMockUpstream(90 * 1000); // 90s delay
    const config = { requestTimeout: 5 }; // 5s timeout
    
    await expect(
      makeUpstreamRequest(request, config, logger)
    ).rejects.toThrow(TimeoutError);
  });
});

describe('Streaming TTFB Timeout', () => {
  it('triggers timeout when no first byte received', async () => {
    const frozenUpstream = createFrozenStream(); // Never sends data
    const config = { streamTTFB: 2 }; // 2s TTFB timeout
    
    const reply = createMockReply();
    await streamWithTimeouts(frozenUpstream, reply, context, config, logger);
    
    // Wait for timeout
    await sleep(2500);
    
    expect(reply.statusCode).toBe(504);
    expect(reply.body.error.timeout_type).toBe('ttfb');
  });
  
  it('clears TTFB timer on first byte', async () => {
    const slowStartStream = createStream({
      firstByteDelay: 1000, // 1s to first byte
      eventInterval: 100
    });
    const config = { streamTTFB: 5 }; // 5s TTFB timeout (won't trigger)
    
    const reply = createMockReply();
    await streamWithTimeouts(slowStartStream, reply, context, config, logger);
    
    await sleep(2000);
    
    expect(reply.statusCode).toBe(200); // No timeout
  });
});

describe('Streaming Idle Timeout', () => {
  it('triggers timeout when gap between events exceeds idle timeout', async () => {
    const stuckStream = createStream({
      events: [{ data: 'event1' }],
      thenFreeze: true // Send one event, then stop
    });
    const config = { streamIdleTimeout: 2 }; // 2s idle timeout
    
    const reply = createMockReply();
    await streamWithTimeouts(stuckStream, reply, context, config, logger);
    
    await sleep(2500);
    
    const lastChunk = reply.chunks[reply.chunks.length - 1];
    expect(lastChunk).toContain('Stream idle timeout exceeded');
  });
  
  it('resets idle timer on each event', async () => {
    const steadyStream = createStream({
      eventInterval: 1000, // Event every 1s
      eventCount: 5
    });
    const config = { streamIdleTimeout: 3 }; // 3s idle timeout (won't trigger)
    
    const reply = createMockReply();
    await streamWithTimeouts(steadyStream, reply, context, config, logger);
    
    await sleep(6000); // 5 events over 5 seconds
    
    expect(reply.statusCode).toBe(200); // No timeout
    expect(context.eventCount).toBe(5);
  });
});
```

### Contract Tests

```typescript
describe('Timeout Error Responses', () => {
  it('returns 504 with request ID on non-streaming timeout', async () => {
    const adapter = createAdapter({
      targetUrl: 'http://slow-upstream',
      timeoutConfig: { requestTimeout: 1 }
    });
    
    const response = await adapter.inject({
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }]
      }
    });
    
    expect(response.statusCode).toBe(504);
    expect(response.json().error).toMatchObject({
      type: 'upstream_timeout',
      timeout_type: 'request',
      request_id: expect.any(String)
    });
  });
  
  it('returns 504 with request ID on streaming TTFB timeout', async () => {
    const adapter = createAdapter({
      targetUrl: 'http://frozen-upstream',
      timeoutConfig: { streamTTFB: 2 }
    });
    
    const response = await adapter.inject({
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        stream: true
      }
    });
    
    expect(response.statusCode).toBe(504);
    expect(response.json().error.timeout_type).toBe('ttfb');
  });
});
```

### Integration Tests

```typescript
describe('Graceful Shutdown', () => {
  it('waits for in-flight streaming requests to complete', async () => {
    const adapter = createAdapter();
    await adapter.start();
    
    // Start long-running streaming request
    const streamPromise = adapter.inject({
      url: '/v1/chat/completions',
      body: { model: 'gpt-4', messages: [], stream: true }
    });
    
    // Send SIGTERM
    process.emit('SIGTERM');
    
    // Wait for stream to complete
    const response = await streamPromise;
    
    expect(response.statusCode).toBe(200);
    expect(adapter.isShutdown).toBe(true);
  });
  
  it('forces shutdown after 30s max wait', async () => {
    const adapter = createAdapter();
    await adapter.start();
    
    // Start stuck streaming request
    const frozenStream = adapter.inject({
      url: '/v1/chat/completions',
      body: { model: 'frozen-model', messages: [], stream: true }
    });
    
    // Send SIGTERM
    const shutdownStart = Date.now();
    process.emit('SIGTERM');
    
    // Wait for forced shutdown
    await sleep(31000);
    
    expect(adapter.isShutdown).toBe(true);
    expect(Date.now() - shutdownStart).toBeGreaterThan(30000);
  });
});
```

## Edge Cases

1. **Zero Timeout Configuration:** `UPSTREAM_TIMEOUT=0`
   - **Expected:** Startup fails with validation error

2. **Extremely Large Timeout:** `STREAM_IDLE_TIMEOUT=10000`
   - **Expected:** Startup fails (max 3600s enforced)

3. **Timeout During Translation:** Translation logic slower than idle timeout
   - **Expected:** If translation takes >idle timeout per event, timeout triggers (indicates performance issue)

4. **Multiple SIGTERM Signals:** SIGTERM sent repeatedly
   - **Expected:** First SIGTERM initiates graceful shutdown, subsequent signals ignored

5. **SIGTERM During Startup:** Signal before server ready
   - **Expected:** Immediate exit (no requests in flight)

## Performance Considerations

- **Timer Overhead:** Minimal (<1ms per request for timer setup/teardown)
- **Shutdown Latency:** <1s for clean shutdown, up to 30s max with in-flight requests

## Documentation Updates

- [ ] Add timeout configuration to environment variables reference
- [ ] Document timeout behavior: non-streaming vs streaming
- [ ] Add troubleshooting guide for timeout tuning
- [ ] Document graceful shutdown behavior

## Definition of Done

- [ ] Code implemented and reviewed
- [ ] Unit tests passing (timeout config, TTFB, idle timeout)
- [ ] Contract tests passing (timeout error responses)
- [ ] Integration tests passing (graceful shutdown)
- [ ] Configuration validation tested (invalid values fail startup)
- [ ] Documentation updated (env vars, timeout semantics)
- [ ] Merged to main branch
