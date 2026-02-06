# Story 1.3: Production Health and Readiness Endpoints

**Epic:** [Epic 1: Deploy & Operate the Adapter](epic-1.md)

## User Story

**As a** platform engineer,  
**I want** production-grade health and readiness endpoints with proper operational checks,  
**So that** orchestration platforms can route traffic only when the adapter is fully operational and ready.

## Acceptance Criteria

**Note:** This story replaces the basic stub `/health` from Story 1.1 with real operational logic and adds the `/ready` endpoint.

### Health Endpoint (`/health`)

**Given** the adapter process is running  
**When** I call `GET /health`  
**Then** it returns HTTP 200 OK with response time <50ms  
**And** `Content-Type: application/json`  
**And** the response body matches this schema:
```json
{
  "status": "ok"
}
```

**And** the health check only verifies the HTTP server is responding  
**And** the health check does NOT verify configuration, storage, or upstream connectivity  
**And** the endpoint ALWAYS returns 200 OK if the process is alive (even if config invalid or storage down)

**Example response:**
```json
{
  "status": "ok"
}
```

### Readiness Endpoint (`/ready`) - All Checks Pass

**Given** the adapter is fully operational (config valid)  
**When** I call `GET /ready`  
**Then** it returns HTTP 200 OK with response time <50ms  
**And** `Content-Type: application/json`  
**And** the response body matches this schema:
```json
{
  "status": "ready",
  "checks": {
    "config": "ok"
  }
}
```

**And** the readiness check verifies:
  - Configuration loaded successfully and is valid
  
**Note:** Storage connectivity check will be added in Epic 4 when Redis is introduced.

**Example successful response:**
```json
{
  "status": "ready",
  "checks": {
    "config": "ok"
  }
}
```

### Readiness Endpoint (`/ready`) - Configuration Invalid

**Given** configuration failed to load or is invalid  
**When** I call `GET /ready`  
**Then** it returns HTTP 503 Service Unavailable  
**And** `Content-Type: application/json`  
**And** the response body matches this schema:
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation failed"
}
```

**Example response:**
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation failed"
}
```

### Readiness Endpoint (`/ready`) - Storage Unavailable

**Given** configuration is valid butConfiguration Invalid

**Given** configuration failed to load or is invalid  
**When** I call `GET /ready`  
**Then** it returns HTTP 503 Service Unavailable  
**And** `Content-Type: application/json`  
**And** the response body matches this schema:
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation failed"
}
```

**Example response:**
```json
{
  "status": "not_ready",
  "checks": {
    "config": "failed"
  },
  "message": "Configuration validation
```

### General Requirements

**And** neither endpoint requires authentication or API keys  
**And** neither endpoint logs requests to standard application logs (to avoid noise)  
**And** both endpoints use consistent JSON response format with proper Content-Type header  
**And** both endpoints handle errors gracefully and never crash or hang  
**And** readiness checks are performed synchronously on each request (no caching)  
**And** health endpoint has no side effects and can be called frequently

**When** orchestration platform (Kubernetes, Docker Compose, etc.) calls these endpoints  
**Then** they can accurately determine when to route traffic to the adapter  
**And** failing readiness causes traffic to be routed away from this instance  
**And** failing health causes the container/process to be restarted

## Technical Notes

**Health vs Readiness Best Practices:**
- **Health (`/health`)**: Answers "Is the process alive?" 
  - Minimal check - only verifies HTTP server responds
  - Always returns 200 if process is running
  - Used for liveness probes (restart dead containers)
  - Format: simple `{"status": "ok"}` 
  
- **Readiness (`/ready`)**: Answers "Can this instance accept traffic?"
  - Comprehensive checks - verifies config and dependencies
  - Returns 200 when ready, 503 when not ready
  - Used for readiness probes (control load balancer routing)
  - Format: includes status and per-check details

**Response Format Design:**
- Health endpoint uses minimal format for speed
- Readiness endpoint includes check breakdown for debugging
- Both use consistent lowercase status values
- Message field in readiness provides human-readable context
- Check values: "ok", "failed"

**MVP Scope (Epic 1):**
- Only config check implemented in this story
- Storage check will be added in Epic 4 when Redis is introduced
- Response schema is designed to support additional checks in the future

**Operational Context:**
- Kubernetes liveness probes use `/health` to restart failed containers
- Kubernetes readiness probes use `/ready` to control Service routing
- During rolling deployments, new pods must pass readiness before receiving traffic
- Failed readiness removes instance from load balancer without killing container
- These patterns enable zero-downtime deployments and automatic recovery

**Performance:**
- Both endpoints must respond in <50ms (readiness probe timeout requirements)
- No caching - checks run fresh on every request for accuracy
- Frequent calls expected (every few seconds by orchestration platform)

**Testing:**
- The acceptance criteria defining API contracts (status codes, response schemas, behaviors) require contract tests or integration tests to verify compliance