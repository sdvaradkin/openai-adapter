# Story 2.5: Structured Logging & Observability

**Epic:** [Epic 2: Drop-in Proxy Compatibility](epic-2.md)

## User Story

**As a** DevOps engineer,  
**I want** structured JSON logs with consistent schema and correlation IDs,  
**So that** I can monitor adapter behavior, troubleshoot issues, and build operational dashboards.

## Acceptance Criteria

**Given** the adapter is running with Pino configured for structured logging

**When** the adapter receives any request  
**Then** logs a request start event:
```json
{
  "level": "info",
  "requestId": "<uuid>",
  "action": "request_received",
  "method": "POST",
  "path": "/v1/responses",
  "model": "gpt-4",
  "timestamp": "2026-02-06T10:30:00.123Z"
}
```

**When** the adapter makes a routing decision  
**Then** logs the decision:
```json
{
  "level": "info",
  "requestId": "<uuid>",
  "action": "routing_decision",
  "sourceFormat": "response",
  "targetFormat": "response",
  "mode": "pass_through",
  "model": "gpt-4",
  "timestamp": "2026-02-06T10:30:00.125Z"
}
```
**Or** for translation mode:
```json
{
  "level": "info",
  "requestId": "<uuid>",
  "action": "routing_decision",
  "sourceFormat": "chat_completions",
  "targetFormat": "response",
  "mode": "translation",
  "model": "gpt-4",
  "timestamp": "2026-02-06T10:30:00.125Z"
}
```

**When** the adapter completes a request successfully  
**Then** logs a request completion event:
```json
{
  "level": "info",
  "requestId": "<uuid>",
  "action": "request_completed",
  "statusCode": 200,
  "durationMs": 45,
  "timestamp": "2026-02-06T10:30:00.170Z"
}
```

**When** the adapter forwards a request to OpenAI  
**Then** logs the upstream call:
```json
{
  "level": "debug",
  "requestId": "<uuid>",
  "action": "upstream_request_sent",
  "targetUrl": "https://api.openai.com/v1/responses",
  "timestamp": "2026-02-06T10:30:00.130Z"
}
```

**When** the adapter receives a response from OpenAI  
**Then** logs the upstream response:
```json
{
  "level": "debug",
  "requestId": "<uuid>",
  "action": "upstream_response_received",
  "statusCode": 200,
  "upstreamDurationMs": 42,
  "timestamp": "2026-02-06T10:30:00.172Z"
}
```

**When** a Response API request includes `previous_response_id`  
**Then** logs include the correlation ID:
```json
{
  "level": "info",
  "requestId": "<uuid>",
  "correlationId": "resp_abc123",
  "action": "request_received",
  "path": "/v1/responses",
  "timestamp": "2026-02-06T10:30:00.123Z"
}
```

**And** all log entries:
- Use structured JSON format (Pino)
- Include `requestId` for correlation
- Include `action` field describing the operation
- Include ISO 8601 timestamp
- Output to stdout for container log collection

**And** log levels follow this guidance:
- `error`: Adapter failures, storage unavailable, unexpected errors
- `warn`: Upstream errors, retryable failures
- `info`: Request lifecycle (received, routed, completed), routing decisions
- `debug`: Detailed operation info (upstream calls, translation details - Epic 3)

**And** log configuration supports:
- `LOG_LEVEL` environment variable (default: "info")
- Pretty-printing for development (pino-pretty)
- JSON output for production

**And** logging volume at INFO level is <1MB per 1,000 requests

**And** sensitive data is never logged:
- Authorization headers/tokens
- Request/response payloads (except in debug mode with explicit opt-in)
- User content

**And** tests verify:
- All standard log events emitted
- Request ID present in all logs
- Log schema consistency
- Log volume targets
- Sensitive data excluded

## Technical Notes

**Pino Configuration:**
```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pretty-print in development
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  })
});
```

**Fastify Integration:**
```typescript
const fastify = Fastify({
  logger: logger,
  requestIdLogLabel: 'requestId',
  disableRequestLogging: true // Custom logging
});

// Custom request logging hook
fastify.addHook('onRequest', async (request, reply) => {
  request.log.info({
    action: 'request_received',
    method: request.method,
    path: request.url,
    model: request.body?.model
  });
});

fastify.addHook('onResponse', async (request, reply) => {
  request.log.info({
    action: 'request_completed',
    statusCode: reply.statusCode,
    durationMs: reply.getResponseTime()
  });
});
```

**Correlation ID Logging:**
```typescript
const correlationId = request.body.previous_response_id || null;
const childLogger = correlationId 
  ? request.log.child({ correlationId })
  : request.log;

childLogger.info({ action: 'request_received', ... });
```

## Requirements Fulfilled

- FR39: Log routing decisions with request ID and correlation ID
- FR40: Log translation mode (pass-through vs translation)
- FR41: Log request URIs for troubleshooting
- FR42: Output structured JSON logs to stdout
- FR53: Log detailed error info (covered in Story 2.4, cross-referenced here)
- NFR-M2: Correlation ID propagation
- NFR-M3: Structured logging (JSON schema)
- NFR-M4: Debugging information (URIs, decisions, stack traces)
- NFR-O3: Logging volume <1MB per 1,000 requests at INFO
- NFR-OP4: Configurable log levels
