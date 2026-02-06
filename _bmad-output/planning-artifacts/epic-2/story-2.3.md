# Story 2.3: Request ID Management & Duplicate Detection

**Epic:** [Epic 2: Drop-in Proxy Compatibility](epic-2.md)

## User Story

**As a** DevOps engineer,  
**I want** every request to have a unique identifier for correlation and duplicate requests to be rejected,  
**So that** I can trace request flows through logs and prevent duplicate processing.

## Acceptance Criteria

**Given** the adapter is running with the `@fastify/request-id` plugin registered

**When** a request arrives at any endpoint without a request ID in headers  
**Then** the adapter generates a new UUID v4 request ID  
**And** stores the ID as `request.id` for the entire request lifecycle  
**And** the ID is available to all handlers, middleware, and logging

**When** a request arrives with an `X-Request-ID` header  
**Then** the adapter extracts the request ID from the header  
**And** uses it as `request.id` for the request lifecycle  
**And** validates it is a valid UUID format

**When** a request is processed successfully  
**Then** the adapter stores the request ID in Redis with key `request:{requestId}`  
**And** sets TTL to 3600 seconds (1 hour)  
**And** value can be a simple marker like `"1"` or timestamp

**When** a request arrives with a request ID that already exists in Redis  
**Then** the adapter detects the duplicate  
**And** returns 400 Bad Request with error response:
```json
{
  "error": {
    "type": "duplicate_request_id",
    "message": "Request ID has already been processed",
    "source": "adapter_error"
  },
  "requestId": "<duplicate-uuid>"
}
```

**When** a request arrives at `/v1/responses` endpoint  
**Then** the adapter extracts `previous_response_id` from the request body if present  
**And** logs it as correlation ID for tracking conversation continuity  
**And** the correlation ID is separate from the request ID (used for state lookup in Epic 4)

**And** request ID generation/extraction happens before any other processing  
**And** request ID is included in all log entries (Story 2.5)  
**And** request ID is included in all adapter-generated error responses (Story 2.4)

**And** Redis operations for duplicate detection:
- Use Redis from Epic 1 configuration
- Handle Redis unavailable gracefully (logged warning, proceed without duplicate check if Redis down)
- Key pattern: `request:{requestId}`
- TTL: 3600 seconds (1 hour, sufficient for duplicate detection window)

**And** tests include:
- Request ID auto-generation
- Request ID extraction from header
- Duplicate request rejection
- Redis unavailable scenario (warning logged, request proceeds)
- Correlation ID extraction from Response API requests

## Technical Notes

**Request ID Plugin:**
```typescript
import requestId from '@fastify/request-id';
fastify.register(requestId, {
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId'
});
```

**Duplicate Detection:**
```typescript
async function checkDuplicateRequest(requestId: string): Promise<boolean> {
  try {
    const exists = await redis.exists(`request:${requestId}`);
    if (exists) return true;
    
    await redis.set(`request:${requestId}`, '1', 'EX', 3600);
    return false;
  } catch (err) {
    logger.warn({ requestId, action: 'duplicate_check_failed', error: err.message });
    return false; // Proceed if Redis unavailable
  }
}
```

**Correlation ID Extraction:**
```typescript
// For Response API requests
const correlationId = request.body.previous_response_id || null;
logger.info({ requestId: request.id, correlationId, action: 'request_received' });
```

**ID Taxonomy:**
- **Request ID** (`requestId`): Adapter-generated UUID for this specific request. Used for logging, tracing, duplicate detection.
- **Correlation ID** (`previous_response_id`): OpenAI business-level ID for conversation continuity. Used for state lookup (Epic 4).
- These are distinct concepts serving different purposes.

## Requirements Fulfilled

- FR34: Generate request IDs (UUID) for each request
- FR35: Extract request IDs from headers when provided
- FR36: Reject duplicate request IDs (400 Bad Request)
- FR38: Extract correlation IDs from Response API requests
- NFR-M2: Correlation ID propagation (request ID propagates through all logs/errors)
