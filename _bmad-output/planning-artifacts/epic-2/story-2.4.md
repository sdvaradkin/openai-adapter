# Story 2.4: Error Handling & Attribution

**Epic:** [Epic 2: Drop-in Proxy Compatibility](epic-2.md)

## User Story

**As a** DevOps engineer,  
**I want** clear error responses that indicate the source of failures (adapter vs OpenAI vs storage),  
**So that** I can quickly diagnose issues and take appropriate action.

## Acceptance Criteria

**Given** the adapter is processing requests with error scenarios

### Upstream Error Pass-Through (100% Transparency)

**When** OpenAI returns a 400, 401, 403, 404, 429, 500, 502, 503, or any other error status  
**Then** the adapter forwards the response unchanged:
- Original status code
- Original response headers
- Original response body (no wrapping, no modification)

**And** the upstream error is logged with request ID but not modified in the response  
**And** clients receive identical error format as if calling OpenAI directly

### Adapter-Generated Errors

**When** the adapter encounters an internal failure (e.g., translation error, internal logic failure)  
**Then** returns 500 Internal Server Error with:
```json
{
  "error": {
    "type": "adapter_error",
    "message": "Internal adapter failure: <specific-error-message>",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** the adapter detects concurrent connections exceed the configured maximum  
**Then** returns 503 Service Unavailable with:
```json
{
  "error": {
    "type": "over_capacity",
    "message": "Maximum concurrent connections exceeded",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```
**And** optionally includes `Retry-After` header

### Error Source Attribution

**When** any adapter-generated error response is returned  
**Then** the response includes:
- `error.type`: Specific error type (e.g., "validation_error", "adapter_error", "over_capacity")
- `error.message`: Human-readable description
- `error.source`: One of "adapter_error", "upstream_error", "storage_error"
- `requestId`: The UUID for correlation

**And** the error source value indicates:
- `"adapter_error"`: Failure in adapter logic (validation, routing, translation, concurrency)
- `"upstream_error"`: Error from OpenAI (only used in logs, not in responses since upstream errors pass through unchanged)
- `"storage_error"`: Redis/state storage unavailable (Epic 4)

### Error Logging

**When** the adapter generates an error response  
**Then** logs the error with:
```json
{
  "level": "error",
  "requestId": "<uuid>",
  "action": "<specific-action>",
  "error": "<error-message>",
  "stack": "<stack-trace>",
  "timestamp": "<iso-8601>"
}
```

**When** upstream returns an error  
**Then** logs at `warn` level with:
```json
{
  "level": "warn",
  "requestId": "<uuid>",
  "action": "upstream_error_received",
  "statusCode": <status>,
  "error": "<brief-description>",
  "timestamp": "<iso-8601>"
}
```
**And** does NOT log full upstream error body (avoid PII/sensitive data)

### Error Handling at Layer Boundaries

**And** validation layer errors throw `ValidationError` caught at route handler  
**And** routing layer errors throw `RoutingError` caught at route handler  
**And** upstream communication errors throw `UpstreamError` caught at route handler  
**And** each layer's errors are caught and converted to appropriate HTTP responses

**And** error handling tests include:
- Upstream 400, 401, 429, 500 pass-through (unchanged)
- Adapter internal error (500)
- Concurrent connection limit exceeded (503)
- Error responses include request ID
- Error source attribution correct for all types
- Stack traces logged for adapter errors

## Technical Notes

**Error Handling Strategy:**

```typescript
// Layer-specific error classes
class ValidationError extends Error {
  constructor(public type: string, message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class UpstreamError extends Error {
  constructor(public statusCode: number, public headers: any, public body: any) {
    super('Upstream error');
    this.name = 'UpstreamError';
  }
}

// Route handler error boundary
try {
  await validateRequest(request);
  const result = await forwardToOpenAI(request);
  return reply.send(result);
} catch (err) {
  if (err instanceof ValidationError) {
    return reply.code(400).send({
      error: {
        type: err.type,
        message: err.message,
        source: 'adapter_error'
      },
      requestId: request.id
    });
  }
  
  if (err instanceof UpstreamError) {
    // Pass through unchanged
    return reply
      .code(err.statusCode)
      .headers(err.headers)
      .send(err.body);
  }
  
  // Unexpected adapter error
  logger.error({
    requestId: request.id,
    action: 'unexpected_error',
    error: err.message,
    stack: err.stack
  });
  
  return reply.code(500).send({
    error: {
      type: 'adapter_error',
      message: `Internal adapter failure: ${err.message}`,
      source: 'adapter_error'
    },
    requestId: request.id
  });
}
```

**Concurrency Limit Enforcement:**
```typescript
let activeRequests = 0;

fastify.addHook('onRequest', async (request, reply) => {
  if (activeRequests >= MAX_CONCURRENT_CONNECTIONS) {
    return reply.code(503).send({
      error: {
        type: 'over_capacity',
        message: 'Maximum concurrent connections exceeded',
        source: 'adapter_error'
      },
      requestId: request.id
    });
  }
  activeRequests++;
});

fastify.addHook('onResponse', async (request, reply) => {
  activeRequests--;
});
```

## Requirements Fulfilled

- FR43: Pass through OpenAI errors unchanged
- FR45: Return 400 for invalid requests (combined with Story 2.2 validation errors)
- FR47: Return 500 for adapter failures
- FR48: Return 503 when max concurrent connections exceeded
- FR51: Include request IDs in all error responses
- FR52: Include error source attribution
- FR53: Log detailed error info with stack traces
- NFR-R2: 100% error transparency (upstream pass-through)
- NFR-R3: Graceful degradation (request isolation)
- NFR-S4: Enforce max concurrent connections
- NFR-U2: Clear error messages
