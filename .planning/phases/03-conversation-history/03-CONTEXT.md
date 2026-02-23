# Phase 3: Conversation History - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Redis-backed multi-turn conversation history for Responses API clients hitting Chat Completions backends. The adapter stores each response and reconstructs full messages[] arrays when `previous_response_id` is provided. Only covers Responses API → Chat Completions direction. Tool call history is out of scope (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### History Reconstruction
- Walk the full chain of previous_response_ids to build complete conversation history (not just one level)
- Reconstruct both user input and assistant output for each turn — full alternating messages[]
- Only Responses API clients get history — Chat Completions clients manage their own messages[]
- Restore conversation history from storage on each request that includes previous_response_id

### Edge Cases & Failures
- Missing previous_response_id (expired or never stored): treat as new conversation, do not error
- Redis unavailable: degrade gracefully — process request without history (like a new conversation), log warning
- Broken chain (intermediate response missing from Redis): use partial history — reconstruct from the break point forward
- Depth limit: cap chain walk at a reasonable limit (e.g., 50-100 turns), truncate oldest turns beyond the cap

### Scope of State Stored
- Minimal storage: only user input text and assistant output text per turn — enough to rebuild messages[]
- No tool call results stored (deferred to Phase 4 when tool translation is built)
- No metadata (model name, timestamps, token usage) — keep storage lean
- Use adapter-generated response ID as the Redis key (the ID returned to the Responses API client)

### Storage & TTL
- 24-hour TTL on all stored conversation data
- Connect via REDIS_URL environment variable (standard redis:// connection string)
- Redis is required — adapter should not start without it configured
- Use a configurable key prefix (default: `oai-adapter:`) to avoid collisions on shared Redis instances

### Claude's Discretion
- Exact Redis data structure (hash, string with JSON, etc.)
- Chain walk implementation details (recursive vs iterative)
- Serialization format for stored messages
- Exact depth limit number within the 50-100 range
- Logging verbosity for degraded-mode warnings

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for Redis-backed conversation storage.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-conversation-history*
*Context gathered: 2026-02-23*
