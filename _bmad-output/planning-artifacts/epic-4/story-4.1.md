# Story 4.1: Redis Integration & Readiness Enhancement

**Epic:** [Epic 4: Multi-turn Conversations with State](epic-4.md)

## User Story

**As a** DevOps engineer,  
**I want** the adapter to validate Redis connectivity at startup and expose it via the `/ready` endpoint,  
**So that** I can confidently deploy the adapter knowing state storage is operational.

## Acceptance Criteria

**Given** the adapter is configured with `REDIS_URL` environment variable

### Redis Connection Establishment

**When** the adapter starts up  
**Then** it connects to Redis using the configured `REDIS_URL`  
**And** validates connectivity by executing a `PING` command  
**And** logs successful connection:
```json
{
  "level": "info",
  "action": "redis_connected",
  "redisUrl": "redis://redis:6379",
  "timestamp": "2026-02-09T10:00:00.000Z"
}
```

**When** Redis is unreachable at startup  
**Then** the adapter logs connection failure:
```json
{
  "level": "error",
  "action": "redis_connection_failed",
  "error": "Connection refused",
  "timestamp": "2026-02-09T10:00:00.000Z"
}
```
**And** startup fails with exit code 1  
**And** provides clear error message indicating Redis connectivity requirement

### Readiness Endpoint Enhancement

**When** the `/ready` endpoint is called  
**Then** it performs the following checks:
1. Configuration loaded and validated (Epic 1 baseline)
2. Redis connectivity (new check - execute `PING`)

**When** all checks pass  
**Then** returns 200 OK with:
```json
{
  "status": "ready",
  "checks": {
    "configuration": "ok",
    "storage": "ok"
  }
}
```

**When** Redis is unreachable  
**Then** returns 503 Service Unavailable with:
```json
{
  "status": "not_ready",
  "checks": {
    "configuration": "ok",
    "storage": "failed"
  },
  "error": {
    "type": "storage_unavailable",
    "message": "Redis connection failed",
    "source": "storage_error"
  }
}
```

**And** readiness check completes in <100ms (NFR-O2)

### Redis Client Configuration

**Given** the Redis client is initialized  
**Then** it is configured with:
- Connection URL from `REDIS_URL` environment variable
- Connection timeout: 5 seconds
- Retry strategy: 3 attempts with exponential backoff
- Keep-alive enabled for connection pooling
- TLS enabled if REDIS_URL uses `rediss://` protocol

**And** the client supports concurrent operations for horizontal scaling

### Environment Variable Validation

**When** the adapter validates configuration at startup  
**Then** it checks for required Redis environment variables:
- `REDIS_URL` (required) - Redis connection string
- `CONVERSATION_STATE_TTL` (optional, default: 86400) - TTL in seconds

**When** `REDIS_URL` is missing  
**Then** startup fails with clear error message  
**And** logs validation failure

**When** `CONVERSATION_STATE_TTL` is provided but invalid (non-numeric or negative)  
**Then** startup fails with validation error  
**And** logs specific validation failure

### Connection Pooling

**Given** multiple concurrent requests  
**Then** the Redis client maintains a connection pool  
**And** reuses connections across requests  
**And** handles connection failures gracefully with retry logic  
**And** logs connection pool events at debug level

## Technical Notes

**ioredis Configuration:**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL, {
  connectTimeout: 5000,
  retryStrategy: (times) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 100, 3000); // Exponential backoff, max 3s
  },
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  lazyConnect: false // Connect immediately at startup
});

redis.on('connect', () => {
  logger.info({ action: 'redis_connected', redisUrl: process.env.REDIS_URL });
});

redis.on('error', (err) => {
  logger.error({ action: 'redis_error', error: err.message });
});
```

**Readiness Check Implementation:**
```typescript
async function checkRedisConnectivity(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (err) {
    logger.error({ action: 'redis_ping_failed', error: err.message });
    return false;
  }
}
```

**TTL Configuration:**
```typescript
const CONVERSATION_STATE_TTL = parseInt(
  process.env.CONVERSATION_STATE_TTL || '86400',
  10
);

if (isNaN(CONVERSATION_STATE_TTL) || CONVERSATION_STATE_TTL <= 0) {
  throw new ConfigurationError('CONVERSATION_STATE_TTL must be a positive integer');
}
```

## Requirements Fulfilled

- FR33: Validate storage connectivity in readiness check
- FR71: Validate storage connectivity at startup
- NFR-D2: Storage outages return 503 without crashes
- NFR-D3: State storage security (TLS via rediss://)
- NFR-S2: Shared state architecture (connection pooling for horizontal scaling)
- NFR-O2: Readiness check accuracy

## Definition of Done

- Redis client initialized and connected at startup
- Startup fails fast with clear error when Redis unreachable
- `/ready` endpoint includes Redis connectivity check
- Readiness returns 503 when Redis unavailable
- Configuration validates `REDIS_URL` and `CONVERSATION_STATE_TTL`
- Connection pooling enabled for concurrent operations
- TLS support for secure Redis connections
- Unit tests for configuration validation
- Integration tests with real Redis (testcontainers)
- Error scenarios tested (Redis down, network timeout)
