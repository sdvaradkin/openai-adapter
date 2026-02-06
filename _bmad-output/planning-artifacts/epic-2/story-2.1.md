# Story 2.1: HTTP Routing, Model Detection & Pass-Through

**Epic:** [Epic 2: Drop-in Proxy Compatibility](epic-2.md)

## User Story

**As a** platform engineer,  
**I want** the adapter to route requests intelligently based on model-to-API mapping and forward them in pass-through mode when no translation is needed,  
**So that** I can use the adapter as a drop-in proxy with minimal latency overhead.

## Acceptance Criteria

**Given** the adapter is running with a model-to-API mapping configuration  
**And** the mapping contains entries like `{"gpt-4": "response", "gpt-3.5-turbo": "chat_completions"}`

**When** a request arrives at `/v1/responses` with model `gpt-4`  
**Then** the adapter extracts the model name from the request payload  
**And** determines target API is "response" from the mapping  
**And** detects source format is "response" (from the endpoint)  
**And** routes to pass-through mode (source matches target)

**When** a request arrives at `/v1/chat/completions` with model `gpt-3.5-turbo`  
**Then** the adapter extracts the model name  
**And** determines target API is "chat_completions"  
**And** detects source format is "chat_completions"  
**And** routes to pass-through mode

**When** a request is routed to pass-through mode  
**Then** the adapter forwards the request to the configured OpenAI endpoint with:
- Original HTTP method
- Original request headers (including Authorization)
- Original request body unchanged
- Target URL: `{ADAPTER_TARGET_URL}/v1/{endpoint}`

**And** the adapter forwards the OpenAI response to the client with:
- Original status code
- Original response headers
- Original response body unchanged

**And** pass-through mode introduces <1ms median latency (measured with timestamps around upstream call)

**When** a request arrives at `/v1/responses` with model `gpt-3.5-turbo`  
**Then** the adapter detects source format is "response" but target API is "chat_completions"  
**And** logs a routing decision indicating translation mode required  
**And** returns 501 Not Implemented with message "Translation not yet implemented (Epic 3)" (temporary until Epic 3 complete)

**When** a request arrives at `/v1/chat/completions` with model `gpt-4`  
**Then** the adapter detects source format is "chat_completions" but target API is "response"  
**And** logs routing decision indicating translation mode required  
**And** returns 501 Not Implemented (temporary until Epic 3 complete)

**And** the adapter exposes endpoints:
- `POST /v1/responses` - Response API endpoint
- `POST /v1/chat/completions` - Chat Completions API endpoint

**And** the routing logic uses the HTTP client (undici) configured in Epic 1 for upstream communication

**And** the adapter uses the model-to-API mapping file loaded from `MODEL_API_MAPPING_FILE` environment variable (from Epic 1)

## Technical Notes

**Pass-through Mode Logic:**
1. Extract model from request body
2. Lookup model in mapping to determine target API format
3. Compare source format (from endpoint) with target format
4. If match: direct pipe request → OpenAI → response (zero transformation)
5. If mismatch: route to translation handler (Epic 3)

**Upstream Communication:**
- Use undici for HTTP calls
- Apply timeout from `UPSTREAM_TIMEOUT` config (Epic 1)
- Preserve all headers and body bit-for-bit in pass-through mode

**Endpoint Detection:**
- `/v1/responses` → source format is "response"
- `/v1/chat/completions` → source format is "chat_completions"

This story establishes routing infrastructure. Translation handlers will be integrated in Epic 3.

## Requirements Fulfilled

- FR1: Protocol compatibility (drop-in replacement)
- FR2: Response API endpoint
- FR3: Chat Completions API endpoint
- FR4: Model name detection
- FR5: Target API determination from mapping
- FR10: Pass-through mode when formats match
- FR11: Forward requests to OpenAI
- FR12: Response format matches OpenAI
- NFR-P2: Pass-through latency <1ms
