# Story 4.2: Conversation State Storage with Error Handling

**Epic:** [Epic 4: Multi-turn Conversations with State](epic-4.md)

## User Story

**As a** developer,  
**I want** the adapter to persist conversation state in Redis with automatic expiration and resilient error handling,  
**So that** multi-turn conversations work reliably across adapter instances and Redis failures are gracefully handled.

## Acceptance Criteria

**Given** the adapter has an active Redis connection from Story 4.1

### Conversation ID Generation

**When** a new conversation begins (no conversation ID provided)  
**Then** the adapter generates a unique conversation ID  
**And** uses UUID v4 format: `conv_<uuid>`  
**And** logs the generation:
```json
{
  "requestId": "<uuid>",
  "action": "conversation_id_generated",
  "conversationId": "conv_123e4567-e89b-12d3-a456-426614174000"
}
```

**When** a conversation ID is provided in the request  
**Then** the adapter extracts and validates it  
**And** rejects invalid formats with 400 Bad Request  
**And** uses the provided conversation ID for state lookup

### Conversation State Storage

**When** storing a new conversation  
**Then** the adapter creates a Redis key: `conversation:{conversationId}`  
**And** stores the conversation state as JSON:
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello"
    },
    {
      "role": "assistant",
      "content": "Hi there!"
    }
  ]
}
```
**And** sets TTL to `CONVERSATION_STATE_TTL` seconds (default: 86400 = 24 hours)  
**And** logs the storage operation:
```json
{
  "requestId": "<uuid>",
  "action": "conversation_state_stored",
  "conversationId": "conv_123...",
  "messageCount": 2,
  "ttl": 86400
}
```

### Conversation State Retrieval

**When** retrieving conversation state by conversation ID  
**Then** the adapter fetches from Redis: `conversation:{conversationId}`  
**And** parses the JSON to reconstruct message array  
**And** logs the retrieval:
```json
{
  "requestId": "<uuid>",
  "action": "conversation_state_retrieved",
  "conversationId": "conv_123...",
  "messageCount": 2
}
```

**When** conversation ID not found in Redis (expired or never existed)  
**Then** the retrieval function returns null  
**And** the calling code treats this as a new conversation  
**And** creates initial conversation state with the first message  
**And** stores it in Redis with the conversation ID  
**And** logs at debug level:
```json
{
  "requestId": "<uuid>",
  "action": "conversation_initialized",
  "conversationId": "conv_123...",
  "reason": "not_found_in_storage"
}
```

**So that** subsequent turns in the same conversation can retrieve the stored state

### Conversation State Update

**When** updating an existing conversation with new messages  
**Then** the adapter:
1. Retrieves current conversation state
2. Appends new messages to the messages array
3. Stores updated state back to Redis
4. Resets TTL to `CONVERSATION_STATE_TTL` (extends expiration)

**And** logs the update:
```json
{
  "requestId": "<uuid>",
  "action": "conversation_state_updated",
  "conversationId": "conv_123...",
  "previousMessageCount": 2,
  "newMessageCount": 4,
  "ttl": 86400
}
```

### Response ID Pointer Storage

**When** generating a Response API `response_id`  
**Then** the adapter creates a Redis key: `response:{responseId}`  
**And** stores a pointer to the conversation:
```json
{
  "conversationId": "conv_123e4567...",
  "messageCount": 2
}
```
**And** sets TTL to `CONVERSATION_STATE_TTL` seconds  
**And** logs the pointer creation:
```json
{
  "requestId": "<uuid>",
  "action": "response_pointer_stored",
  "responseId": "resp_abc...",
  "conversationId": "conv_123...",
  "messageCount": 2
}
```

### Redis Error Handling - Storage Operations

**When** a Redis `SET` operation fails (connection lost, timeout, etc.)  
**Then** the adapter throws a `StorageError`  
**And** logs the error with full context:
```json
{
  "level": "error",
  "requestId": "<uuid>",
  "action": "redis_set_failed",
  "conversationId": "conv_123...",
  "error": "Connection timeout",
  "stack": "<stack-trace>"
}
```

**When** a Redis `GET` operation fails  
**Then** the adapter throws a `StorageError`  
**And** logs the failure

**When** Redis operations fail during request processing  
**Then** the route handler catches `StorageError`  
**And** returns 503 Service Unavailable:
```json
{
  "error": {
    "type": "storage_unavailable",
    "message": "Failed to access conversation state storage",
    "source": "storage_error"
  },
  "requestId": "<uuid>"
}
```

**And** the error response does NOT expose internal Redis details to the client

### Automatic TTL Management

**When** storing or updating conversation state  
**Then** TTL is automatically set/reset to `CONVERSATION_STATE_TTL`  
**And** expired conversations are automatically cleaned up by Redis  
**And** no manual cleanup logic is required

**When** TTL expires  
**Then** Redis automatically deletes the conversation state  
**And** subsequent requests treat it as a new conversation

### Memory Efficiency (Normalized Storage)

**Given** a 10-turn conversation (20 messages)  
**Then** the adapter stores exactly 20 unique messages once in `conversation:{id}`  
**And** response pointers only contain conversationId + messageCount  
**And** no message duplication occurs  
**And** memory usage scales linearly with conversation length

### Concurrent Access Handling

**When** multiple requests access the same conversation concurrently  
**Then** Redis operations use atomic operations where possible  
**And** last-write-wins for conversation updates (acceptable for MVP)  
**And** no corrupted state due to race conditions

## Technical Notes

**Storage Operations Module:**
```typescript
import Redis from 'ioredis';
import { logger } from '../logger.js';
import { StorageError } from '../types/errors.js';

const TTL = parseInt(process.env.CONVERSATION_STATE_TTL || '86400', 10);

export async function storeConversation(
  redis: Redis,
  conversationId: string,
  messages: Message[],
  requestId: string
): Promise<void> {
  try {
    const key = `conversation:${conversationId}`;
    const value = JSON.stringify({ messages });
    
    await redis.setex(key, TTL, value);
    
    logger.info({
      requestId,
      action: 'conversation_state_stored',
      conversationId,
      messageCount: messages.length,
      ttl: TTL
    });
  } catch (err) {
    logger.error({
      requestId,
      action: 'redis_set_failed',
      conversationId,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined
    });
    throw new StorageError('Failed to store conversation state');
  }
}

export async function retrieveConversation(
  redis: Redis,
  conversationId: string,
  requestId: string
): Promise<Message[] | null> {
  try {
    const key = `conversation:${conversationId}`;
    const data = await redis.get(key);
    
    if (!data) {
      logger.debug({
        requestId,
        action: 'conversation_not_found',
        conversationId,
        note: 'Will be initialized as new conversation'
      });
      return null;
    }
    
    const state = JSON.parse(data);
    
    logger.info({
      requestId,
      action: 'conversation_state_retrieved',
      conversationId,
      messageCount: state.messages.length
    });
    
    return state.messages;
  } catch (err) {
    logger.error({
      requestId,
      action: 'redis_get_failed',
      conversationId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    throw new StorageError('Failed to retrieve conversation state');
  }
}

export async function getOrInitializeConversation(
  redis: Redis,
  conversationId: string,
  requestId: string
): Promise<Message[]> {
  const existingMessages = await retrieveConversation(redis, conversationId, requestId);
  
  if (existingMessages !== null) {
    return existingMessages;
  }
  
  // Not found - initialize as new conversation
  logger.debug({
    requestId,
    action: 'conversation_initialized',
    conversationId,
    reason: 'not_found_in_storage'
  });
  
  // Return empty array; calling code will add first message and store
  return [];
}

export function generateConversationId(): string {
  return `conv_${crypto.randomUUID()}`;
}

export function generateResponseId(): string {
  return `resp_${crypto.randomUUID()}`;
}
```

**Error Handling in Route Handler:**
```typescript
try {
  const conversationId = request.body.conversationId || generateConversationId();
  
  // Get existing conversation or initialize as empty
  const existingMessages = await getOrInitializeConversation(redis, conversationId, request.id);
  
  // Add new user message
  const allMessages = [...existingMessages, newUserMessage];
  
  // ... forward to OpenAI and get response
  
  // Add assistant response
  const updatedMessages = [...allMessages, assistantMessage];
  
  // Store the complete conversation (works for both new and existing conversations)
  await storeConversation(redis, conversationId, updatedMessages, request.id);
  
} catch (err) {
  if (err instanceof StorageError) {
    return reply.code(503).send({
      error: {
        type: 'storage_unavailable',
        message: 'Failed to access conversation state storage',
        source: 'storage_error'
      },
      requestId: request.id
    });
  }
  throw err; // Re-throw unexpected errors
}
```

## Requirements Fulfilled

- FR37: Generate conversation IDs for state tracking
- FR49: Return 503 when storage unavailable
- FR67: Store conversation state with automatic expiration (24h)
- FR68: Retrieve conversation state by conversation ID
- FR69: Update conversation state with new messages
- FR70: Generate unique conversation IDs when not provided
- FR72: Handle storage unavailability with clear error responses
- NFR-S1: Memory footprint (normalized storage model)
- NFR-S2: Shared state for horizontal scaling
- NFR-D1: Conversation state persistence with TTL
- NFR-D2: Storage outages return 503 without crashes

## Definition of Done

- Conversation ID generation (UUID v4 format)
- Store conversation state with automatic TTL
- Retrieve conversation state by ID
- Update conversation state with new messages
- Response ID pointer storage and retrieval
- All Redis operations wrapped with error handling
- 503 Service Unavailable returned when Redis fails
- No message duplication (normalized storage)
- Unit tests for all storage operations
- Integration tests with real Redis (testcontainers)
- Error scenarios tested (Redis down, parse failures, expired conversations)
- Performance: operations complete within <10ms budget
