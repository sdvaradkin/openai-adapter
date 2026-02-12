# Epic 4: Multi-turn Conversations with State

**Parent Document:** [Epics Overview](../epics.md)

## Epic Goal (PoC)

Enable Response API → Chat Completions translation for multi-turn conversations by maintaining conversation state in Redis. For PoC, startup fails fast if Redis is unavailable (no graceful fallback). Graceful degradation will be implemented post-PoC.

## User Value

**As a** developer using Response API with a Chat Completions model,  
**I want** the adapter to maintain conversation history across multiple turns,  
**So that** I can use Response API's simple single-message interface while the adapter builds the full messages array required by Chat Completions API.

## Scope

This epic enables **Response API → Chat Completions** translation for multi-turn conversations by:

1. **Redis Integration** - External state storage for horizontal scaling
2. **Conversation State Management** - Store/retrieve conversation history with automatic expiration
3. **Multi-turn Translation** - Build Chat Completions messages array from stored conversation state
4. **Resilient Error Handling (PoC: Fail-Fast)** - Startup fails fast if Redis unavailable; no fallback for PoC

**Out of Scope:** Chat Completions → Response API is stateless (client provides full messages array) and is already covered in Epic 3.

## Technical Context

**Redis Data Model:**
```
conversation:{conversationId} → { messages: Message[] }
response:{responseId} → { conversationId: string, messageCount: number }
``` (Response API → Chat Completions):**
1. Response API request arrives with single message + optional `previous_response_id`
2. If `previous_response_id` present: lookup conversation state in Redis
3. Build Chat Completions messages array from stored history + new message
4. Send messages array to Chat Completions API
5. Store assistant response in conversation state
6. Generate new `response_id` and store pointer
7. Return Response APIge to Response API
5. Store response and update conversation state
6. Return Chat Completions format response

**Dependencies:**
- Enhances `/ready` endpoint from Epic 1 to include Redis connectivity check
- Builds on translation foundation from Epic 3

## Stories

1. [Story 4.1: Redis Integration & Readiness Enhancement](story-4.1.md)
2. [Story 4.2: Response→Chat Multi-turn Translation with State Retrieval
3. [Story 4.3: Chat→Response Multi-turn Translation with Response ID Generation](story-4.3.md)

## Requirements Fulfilled

**Functional Requirements:**
- FR15: Initiate new conversation session for Chat → Response translation
- FR16: Generate unique correlation ID (response_id) for Response API sessions
- FR17: Send only current message to Response API
- FR18: Extract conversation history from Chat Completions requests
- FR19: Persist conversation state across requests
- FR20: Retrieve conversation state for subsequent messages
- FR33: Validate storage connectivity in readiness check
- FR37: Generate conversation IDs for state tracking
- FR49: Return 503 when storage unavailable
- FR67: Store conversation state with automatic expiration (24h default)
- FR68: Retrieve conversation state by conversation ID
- FR69: Update conversation state with new messages
- FR70: Generate unique conversation IDs when not provided
- FR71: Validate storage connectivity at startup
- FR72: Handle storage unavailability with clear error responses

**Non-Functional Requirements:**
- NFR-S1: Memory footprint ≤128MB (normalized state model)
- NFR-S2: Shared state architecture for horizontal scaling
- NFR-D1: Conversation state persistence with 24h TTL
- NFR-D2: Storage outages return 503 without crashes
- NFR-D3: State storage security (TLS encryption in transit)

## Success Criteria

- Response API requests successfully translate to Chat Completions with conversation history
- Multi-turn conversations work via `previous_response_id` lookup
- Conversation state persists across adapter restarts (state in Redis)
- Horizontal scaling supported (no session affinity required)
- Redis unavailability returns 503 with clear error attribution
- `/ready` endpoint includes storage connectivity check
- 24-hour conversation TTL enforced automatically
- Missing/expired `previous_response_id` gracefully falls back to new conversation
- Memory footprint stays within 128MB budget

## Testing Strategy

- Unit tests: Conversation ID generation, state serialization
- Integration tests: Real Redis with testcontainers
- Contract tests: Multi-turn conversation flows
- Error scenarios: Redis down, network failures, TTL expiration
- Performance: State operations within <10ms translation budget
