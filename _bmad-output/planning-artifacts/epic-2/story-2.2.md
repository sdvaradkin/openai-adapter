# Story 2.2: Request Validation & Safety Guards

**Epic:** [Epic 2: Drop-in Proxy Compatibility](epic-2.md)

**Pipeline Context:** This story implements **Stage 2: Validation Layer** from the [Request/Response Pipeline Architecture](../architecture.md#requestresponse-pipeline-architecture).

## User Story

**As a** platform engineer,  
**I want** the adapter to reject malformed and dangerous requests before forwarding to OpenAI,  
**So that** the system is protected from resource exhaustion and provides clear feedback on invalid requests.

## Acceptance Criteria

**Given** the adapter is configured with `MAX_REQUEST_SIZE_MB=10` and `MAX_JSON_DEPTH=100`

**When** a request arrives with payload size exceeding 10MB  
**Then** the adapter rejects the request before parsing or forwarding  
**And** returns 400 Bad Request with error response:
```json
{
  "error": {
    "type": "payload_too_large",
    "message": "Request payload exceeds maximum size of 10MB",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** a request arrives with valid size but JSON nesting depth exceeding 100 levels  
**Then** the adapter rejects the request after JSON parsing  
**And** returns 400 Bad Request with error response:
```json
{
  "error": {
    "type": "json_depth_exceeded",
    "message": "JSON nesting depth exceeds maximum of 100 levels",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** a request arrives with a model name not in the configured mapping  
**Then** the adapter rejects the request  
**And** returns 400 Bad Request with error response:
```json
{
  "error": {
    "type": "unknown_model",
    "message": "Model 'unknown-model-name' not found in configuration",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** a request arrives with malformed JSON  
**Then** Fastify's built-in parser rejects it before reaching handlers  
**And** returns 400 Bad Request (Fastify default behavior)

**And** validation runs in all modes:
- Pass-through mode: Size, depth, and model validation before forwarding
- Translation mode: Size, depth, and model validation before translation (Epic 3)

**And** validation pipeline uses:
- Fastify content-length header check for payload size
- Custom JSON depth validator (recursive traversal or streaming parser)
- Model lookup in mapping loaded from Epic 1 configuration

**And** validation occurs at the earliest possible point:
1. Payload size: Before JSON parsing (via Content-Length header)
2. JSON depth: During or immediately after JSON parsing
3. Model validation: After extracting model from parsed body

**And** validation tests include:
- Requests at boundary (exactly 10MB, exactly 100 depth)
- Requests exceeding limits
- Valid requests within limits
- All three validation types in both pass-through and translation routing paths

## Technical Notes

**Payload Size Validation:**
```typescript
fastify.addHook('preValidation', async (request, reply) => {
  const contentLength = request.headers['content-length'];
  if (contentLength && parseInt(contentLength) > MAX_REQUEST_SIZE_BYTES) {
    throw new ValidationError('payload_too_large', 'Request payload exceeds maximum size');
  }
});
```

**JSON Depth Validation:**
```typescript
function validateJsonDepth(obj: any, maxDepth: number, currentDepth = 0): void {
  if (currentDepth > maxDepth) {
    throw new ValidationError('json_depth_exceeded', `JSON nesting depth exceeds maximum of ${maxDepth}`);
  }
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      validateJsonDepth(obj[key], maxDepth, currentDepth + 1);
    }
  }
}
```

**Model Validation:**
```typescript
const targetApi = modelMapping[request.body.model];
if (!targetApi) {
  throw new ValidationError('unknown_model', `Model '${request.body.model}' not found in configuration`);
}
```

## Requirements Fulfilled

- FR13: Reject requests exceeding 10MB
- FR14: Validate JSON depth (100 levels max)
- FR27: Reject unknown model names (400 Bad Request)
- FR45: Return 400 for invalid requests (malformed JSON, depth, size, duplicate IDs)
- FR46: Return 400 for unknown models with specific identification
- NFR-P6: Enforce 10MB payload limit
- NFR-P7: JSON depth validation in all modes
- NFR-SEC3: Input validation
