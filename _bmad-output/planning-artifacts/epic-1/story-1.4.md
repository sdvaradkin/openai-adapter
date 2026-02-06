# Story 1.4: Timeout and Concurrency Configuration

**Epic:** [Epic 1: Deploy & Operate the Adapter](epic-1.md)

## User Story

**As a** DevOps engineer,  
**I want** configurable upstream timeouts and connection limits,  
**So that** I can tune the adapter for my infrastructure and protect against overload.

## Acceptance Criteria

**Given** the container is configured with environment variables  
**When** `UPSTREAM_TIMEOUT_SECONDS` is set to a positive integer value  
**Then** that value is used for upstream request timeout (applies to OpenAI API calls)  
**And** the timeout is validated as a positive integer during startup  
**And** if not set, defaults to 60 seconds

**When** `MAX_CONCURRENT_CONNECTIONS` is set to a positive integer value  
**Then** that value is used as the maximum concurrent connection limit  
**And** the limit is validated as a positive integer during startup  
**And** if not set, defaults to 1000

**When** `UPSTREAM_TIMEOUT_SECONDS` is set to an invalid value (negative, zero, or non-numeric)  
**Then** startup fails with clear error message  
**And** the error indicates the valid range expected (positive integer)  
**And** provides example of valid value (e.g., "60")

**When** `MAX_CONCURRENT_CONNECTIONS` is set to an invalid value (negative, zero, or non-numeric)  
**Then** startup fails with clear error message  
**And** the error indicates the valid range expected (positive integer)  
**And** provides example of valid value (e.g., "1000")

**When** the adapter is operational and concurrent connection limit is reached  
**Then** new incoming requests receive 503 Service Unavailable  
**And** the response includes clear error message indicating max connections exceeded  
**And** the response includes request ID for tracking

**When** existing connections complete and fall below the limit  
**Then** new requests are accepted normally again  
**And** the adapter does not require restart to resume accepting connections

**And** timeout configuration is logged at startup (structured JSON)  
**And** concurrency configuration is logged at startup (structured JSON)  
**And** all timeout/concurrency configuration errors are logged with error level

## Technical Notes

**Timeout Configuration:**
- This story covers the configuration surface only
- Actual timeout enforcement for non-streaming and streaming requests is implemented in Epic 5 (Streaming Support story)
- The timeout value is loaded, validated, and made available to request handlers

**Concurrency Limits:**
- Fastify has built-in connection limiting via `connectionLimit` option
- When limit is reached, new connections are rejected immediately with 503
- This protects the adapter from resource exhaustion under load
- Helps maintain performance characteristics within NFR targets

**Optional Configuration:**
- Both settings are optional with sensible defaults
- Defaults are chosen based on test/staging environment use cases
- Production deployments may tune these based on their infrastructure

**Testing:**
- Configuration validation can be tested with unit tests (different env var values, verify startup behavior)
- Concurrency limiting requires integration tests (simulate concurrent connections, verify 503 behavior)
- The acceptance criteria defining API contracts and runtime behaviors require contract/integration tests to verify compliance

## Requirements Fulfilled

- FR29: Accept configuration for upstream timeout values
- FR30: Accept configuration for maximum concurrent connections (default: 1000)
- FR48: Return 503 Service Unavailable when maximum concurrent connections exceeded
- NFR-P5: Upstream timeout configuration with configurable values (default: 60 seconds)
- NFR-S4: Maximum concurrency limit enforced (default 1000, configurable)
