# Story 4.3: Response→Chat Multi-turn Translation with State Retrieval

**Epic:** [Epic 4: Multi-turn Conversations with State](epic-4.md)

## User Story

**As a** developer using Response API with a Chat Completions model,  
**I want** the adapter to translate Response API's single-message requests into Chat Completions format by retrieving stored conversation history,  
**So that** multi-turn conversations work seamlessly despite the API format differences.

## Acceptance Criteria

**Given** the adapter has Redis integration (Story 4.1) and state storage (Story 4.2)  
**And** a request arrives at `/v1/responses` with a model mapped to "chat_completions" API

### First Turn (New Conversation)

**When** a Response API request arrives without `previous_response_id`:
```json
{
  "model": "gpt-3.5-turbo",
  "input": "What is 2+2?"
}
```

**Then** the adapter:
1. Generates a new conversation ID: `conv_<uuid>`
2. Generates a new response_id: `resp_<uuid>`
3. Creates initial messages array with user message:
```json
{
  "messages": [
    { "role": "user", "content": "What is 2+2?" }
  ]
}
```
4. Sends to Chat Completions API:
```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    { "role": "user", "content": "What is 2+2?" }
  ]
}
```

**And** after receiving Chat Completions response, the adapter:
1. Extracts assistant message from response
2. Stores conversation state in Redis: `[user, assistant]`
3. Creates response pointer: `response:{responseId}` → `{conversationId, messageCount: 2}`
4. Translates response back to Response API format
5. Includes `response_id` in the response
6. Returns to client

**And** logs the translation:
```json
{
  "requestId": "<uuid>",
  "action": "response_to_chat_translation",
  "conversationId": "conv_123...",
  "responseId": "resp_abc...",
  "turn": 1,
  "messagesBuilt": 1,
  "messagesStored": 2
}
```

### Subsequent Turns (Continuing Conversation)

**When** a Response API request arrives WITH `previous_response_id`:
```json
{
  "model": "gpt-3.5-turbo",
  "input": "What about 3+3?",
  "previous_response_id": "resp_abc..."
}
```

**Then** the adapter:
1. Looks up `response:{previous_response_id}` in Redis
2. Retrieves `{conversationId: "conv_123...", messageCount: 2}`
3. Retrieves full conversation from `conversation:{conversationId}`
4. Gets stored messages: `[user1, assistant1]`
5. Appends new user message to build messages array:
```json
{
  "messages": [
    { "role": "user", "content": "What is 2+2?" },
    { "role": "assistant", "content": "2+2 equals 4." },
    { "role": "user", "content": "What about 3+3?" }
  ]
}
```
6. Sends to Chat Completions API with full conversation context
7. Generates new response_id: `resp_def...`

**And** after receiving response:
1. Appends assistant response to conversation state
2. Stores updated state: `[user1, assistant1, user2, assistant2]`
3. Creates new response pointer: `response:{resp_def}` → `{conversationId, messageCount: 4}`
4. Resets conversation TTL to 24 hours
5. Returns Response API format with new `response_id`

**And** logs the continuation:
```json
{
  "requestId": "<uuid>",
  "action": "response_to_chat_translation",
  "conversationId": "conv_123...",
  "responseId": "resp_def...",
  "previousResponseId": "resp_abc...",
  "turn": 2,
  "messagesFromStorage": 2,
  "messagesBuilt": 3,
  "totalMessagesStored": 4
}
```

### Previous Response ID Lookup

**When** `previous_response_id` is provided  
**Then** the adapter looks up `response:{previous_response_id}` in Redis  
**And** retrieves the conversation ID and message count

**When** `previous_response_id` is NOT found (expired or invalid)  
**Then** treats as new conversation  
**And** logs a warning:
```json
{
  "level": "warn",
  "requestId": "<uuid>",
  "action": "previous_response_not_found",
  "previousResponseId": "resp_xyz...",
  "reason": "expired_or_invalid",
  "fallback": "starting_new_conversation"
}
```
**And** continues processing as first turn (no conversation history)

### Message Array Construction

**When** building messages array for Chat Completions  
**Then** the adapter:
1. Retrieves stored messages from conversation state
2. Appends new user message from current request
3. Maintains role alternation: user, assistant, user, assistant...
4. Preserves all message content and metadata
5. Validates array structure before sending to Chat Completions

**And** the messages array is constructed in the correct order (oldest to newest)

### Response Translation Back to Response API Format

**When** translating Chat Completions response to Response API  
**Then** the adapter:
1. Extracts assistant message content from choices[0].message
2. Constructs Response API response:
```json
{
  "id": "resp_def...",
  "object": "response",
  "created": <timestamp>,
  "model": "gpt-3.5-turbo",
  "output": "<assistant-content>",
  "usage": { ... }
}
```

**And** uses the generated `response_id` as the `id` field  
**And** preserves usage and other metadata from Chat Completions response  
**And** logs unknown fields if encountered

### Error Handling During Translation

**When** Redis is unavailable during state retrieval  
**Then** returns 503 Service Unavailable (from Story 4.2 error handling)  
**And** request fails gracefully without crashing

**When** conversation state is corrupted or unparseable  
**Then** logs error and treats as new conversation  
**And** continues processing to avoid blocking the request

**When** `previous_response_id` references non-existent conversation  
**Then** warns and treats as new conversation  
**And** client receives valid response (degraded to single-turn)

### Integration with Epic 3 Translation

**Given** Epic 3 provided baseline Response ↔ Chat translation  
**Then** this story extends it by:
1. Adding conversation state retrieval from Redis
2. Building messages array from stored history
3. Generating and tracking response_ids
4. Managing message array construction for multi-turn context

**And** reuses Epic 3's field-by-field translation logic  
**And** extends it with state persistence

## Technical Notes

**Translation Flow:**
```typescript
async function translateResponseToChat(
  request: ResponseApiRequest,
  requestId: string
): Promise<ChatCompletionsRequest> {
  let messages: Message[] = [];
  let conversationId: string;
  let responseId: string;
  
  // 1. Check for previous_response_id
  if (request.previous_response_id) {
    // Continuing conversation
    const pointer = await retrieveResponsePointer(redis, request.previous_response_id, requestId);
    
    if (pointer) {
      conversationId = pointer.conversationId;
      const storedMessages = await getOrInitializeConversation(redis, conversationId, requestId);
      messages = storedMessages;
      
      logger.info({
        requestId,
        action: 'conversation_continued',
        conversationId,
        previousResponseId: request.previous_response_id,
        messagesFromStorage: messages.length
      });
    } else {
      // Previous response not found - start new
      logger.warn({
        requestId,
        action: 'previous_response_not_found',
        previousResponseId: request.previous_response_id,
        fallback: 'starting_new_conversation'
      });
      conversationId = generateConversationId();
    }
  } else {
    // New conversation
    conversationId = generateConversationId();
    logger.info({
      requestId,
      action: 'new_conversation_started',
      conversationId
    });
  }
  
  // 2. Append new user message
  messages.push({
    role: 'user',
    content: request.input
  });
  
  // 3. Generate new response_id for this turn
  responseId = generateResponseId();
  
  // 4. Build Chat Completions request
  return {
    model: request.model,
    messages,
    // Metadata to pass along for response handling
    _adapterContext: { conversationId, responseId, allMessages: messages }
  };
}

async function handleChatCompletionsResponse(
  response: ChatCompletionsResponse,
  context: { conversationId: string, responseId: string, allMessages: Message[] },
  requestId: string
): Promise<ResponseApiResponse> {
  // 1. Extract assistant message
  const assistantMessage = response.choices[0].message;
  
  // 2. Update conversation state
  const updatedMessages = [...context.allMessages, assistantMessage];
  await storeConversation(redis, context.conversationId, updatedMessages, requestId);
  
  // 3. Store response pointer
  await storeResponsePointer(
    redis,
    context.responseId,
    context.conversationId,
    updatedMessages.length,
    requestId
  );
  
  // 4. Translate to Response API format
  return {
    id: context.responseId,
    object: 'response',
    created: response.created,
    model: response.model,
    output: assistantMessage.content,
    usage: response.usage
  };
}
```

**Response Pointer Storage:**
```typescript
async function storeResponsePointer(
  redis: Redis,
  responseId: string,
  conversationId: string,
  messageCount: number,
  requestId: string
): Promise<void> {
  try {
    const key = `response:${responseId}`;
    const value = JSON.stringify({ conversationId, messageCount });
    const TTL = parseInt(process.env.CONVERSATION_STATE_TTL || '86400', 10);
    
    await redis.setex(key, TTL, value);
    
    logger.info({
      requestId,
      action: 'response_pointer_stored',
      responseId,
      conversationId,
      messageCount,
      ttl: TTL
    });
  } catch (err) {
    logger.error({
      requestId,
      action: 'response_pointer_store_failed',
      responseId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    throw new StorageError('Failed to store response pointer');
  }
}

async function retrieveResponsePointer(
  redis: Redis,
  responseId: string,
  requestId: string
): Promise<{ conversationId: string, messageCount: number } | null> {
  try {
    const key = `response:${responseId}`;
    const data = await redis.get(key);
    
    if (!data) {
      logger.debug({
        requestId,
        action: 'response_pointer_not_found',
        responseId
      });
      return null;
    }
    
    return JSON.parse(data);
  } catch (err) {
    logger.error({
      requestId,
      action: 'response_pointer_retrieval_failed',
      responseId,
      error: err instanceof Error ? err.message : 'Unknown error'
    });
    throw new StorageError('Failed to retrieve response pointer');
  }
}
```

## Requirements Fulfilled

- FR15: Initiate new conversation session (Response → Chat)
- FR16: Generate unique response_id for Response API
- FR17: Build messages array from stored conversation
- FR18: Extract conversation history from Redis
- FR19: Persist conversation state across requests
- FR20: Retrieve conversation state for subsequent messages
- NFR-P1: Translation overhead <10ms (state operations within budget)

## Definition of Done

- Response→Chat translation retrieves conversation state from Redis
- First turn creates new conversation and stores initial state
- Subsequent turns use `previous_response_id` to retrieve history
- Missing/expired `previous_response_id` gracefully falls back to new conversation
- Full messages array constructed for Chat Completions API
- Response pointers track conversation ID and message count
- Response API format preserved in response with generated `response_id`
- Integration with Epic 3 translation foundation
- Unit tests for translation logic with state retrieval
- Integration tests for multi-turn flows (3+ turns)
- Contract tests verify both API format compatibility
- Error scenarios tested (Redis failures, missing pointers, corrupted state)
- Performance tests confirm <10ms overhead
