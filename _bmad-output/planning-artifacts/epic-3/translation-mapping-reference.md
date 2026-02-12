# Translation Field Mapping Reference

**Version:** 1.0  
**Last Updated:** 2026-02-09  
**Epic:** Epic 3 - Core Bidirectional Translation

## Overview

This document provides the complete field-by-field mapping between OpenAI's Chat Completions API and Response API formats. Use this as the implementation reference for all translation logic.

---

## API Request Comparison

### Chat Completions Request Structure

```json
POST /v1/chat/completions
{
  "model": "gpt-4o",
  "messages": [
    {
      "role": "developer",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "temperature": 1.0,
  "max_tokens": 150,
  "top_p": 1.0,
  "frequency_penalty": 0,
  "presence_penalty": 0,
  "stream": false
}
```

### Response API Request Structure

```json
POST /v1/responses
{
  "model": "gpt-4o",
  "input": [
    {
      "role": "developer",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "temperature": 1.0,
  "max_output_tokens": 150,
  "top_p": 1.0,
  "stream": false,
  "previous_response_id": null
}
```

---

## Request Field Mappings

### Chat Completions → Response API (Request)

| Chat Completions Field | Response API Field | Transformation Logic | Notes |
|------------------------|-------------------|---------------------|--------|
| `messages` (array) | `input` (array) | Direct copy (full messages array) | Response API accepts the same messages format |
| `model` | `model` | Direct copy | Model name unchanged |
| `temperature` | `temperature` | Direct copy | Same range (0-2) |
| `max_tokens` (deprecated) | `max_output_tokens` | Direct copy | Field renamed in Response API |
| `max_completion_tokens` | `max_output_tokens` | Direct copy | Modern Chat field maps to Response field |
| `top_p` | `top_p` | Direct copy | Same range (0-1) |
| `frequency_penalty` | N/A | Drop (unsupported) | Response API doesn't have this field |
| `presence_penalty` | N/A | Drop (unsupported) | Response API doesn't have this field |
| `n` | N/A | Drop (unsupported) | Response API doesn't support multiple completions |
| `stream` | `stream` | Direct copy | Boolean unchanged |
| `stop` | N/A | Drop (unsupported) | Response API doesn't have stop sequences |
| `logprobs` | N/A | Drop (MVP) | Deferred to post-MVP |
| `metadata` | `metadata` | Direct copy | Same structure (16 key-value pairs) |
| `tools` | `tools` | Direct copy for MVP features | See Feature Mapping section |
| `tool_choice` | `tool_choice` | Direct copy | Same structure |
| `response_format` | `text.format` | Map to Response API text format | Structure differs slightly |
| `store` | `store` | Direct copy | Boolean unchanged |
| `service_tier` | `service_tier` | Direct copy | Same values |
| `prompt_cache_key` | `prompt_cache_key` | Direct copy | Same field |
| `user` (deprecated) | `user` (deprecated) | Direct copy | Both APIs deprecate this |
| `safety_identifier` | `safety_identifier` | Direct copy | Same field |

**Conversation State Handling:**
- Chat Completions sends full `messages[]` array with history
- Response API uses `previous_response_id` for state management (handled in Epic 4)
- **For Epic 3 (stateless):** Pass full messages array; state handled in Epic 4

---

### Response API → Chat Completions (Request)

| Response API Field | Chat Completions Field | Transformation Logic | Notes |
|-------------------|------------------------|---------------------|--------|
| `input` (string) | `messages[]` array | Wrap single input as user message in messages array | Chat expects array format |
| `input` (array of items) | `messages[]` array | Convert items to messages array | Multi-item inputs become messages |
| `instructions` | `messages[]` | Add as first message with role "developer" or "system" | Instructions prepended to conversation |
| `model` | `model` | Direct copy | Model name unchanged |
| `temperature` | `temperature` | Direct copy | Same range (0-2) |
| `max_output_tokens` | `max_completion_tokens` | Direct copy | Use modern Chat field |
| `top_p` | `top_p` | Direct copy | Same range (0-1) |
| `stream` | `stream` | Direct copy | Boolean unchanged |
| `metadata` | `metadata` | Direct copy | Same structure |
| `tools` | `tools` | Direct copy for MVP features | See Feature Mapping section |
| `tool_choice` | `tool_choice` | Direct copy | Same structure |
| `text.format` | `response_format` | Map to Chat response_format | Structure differs slightly |
| `store` | `store` | Direct copy | Boolean unchanged |
| `service_tier` | `service_tier` | Direct copy | Same values |
| `prompt_cache_key` | `prompt_cache_key` | Direct copy | Same field |
| `user` (deprecated) | `user` (deprecated) | Direct copy | Both APIs deprecate this |
| `safety_identifier` | `safety_identifier` | Direct copy | Same field |
| `previous_response_id` | N/A | Track for state management | Used in Epic 4 for conversation state |
| `conversation` | N/A | Track for state management | Used in Epic 4 for conversation state |

**Simple Input Example:**
```json
// Response API request
{ "input": "Hello!" }

// Translates to Chat Completions
{ "messages": [{ "role": "user", "content": "Hello!" }] }
```

---

## Response Field Mappings

### Chat Completions → Response API (Response)

| Chat Completions Field | Response API Field | Transformation Logic | Notes |
|------------------------|-------------------|---------------------|--------|
| `id` | `id` | Direct copy | Unique identifier |
| `object` | `object` | "chat.completion" → "response" | Object type differs |
| `created` | `created_at` | Direct copy | Unix timestamp |
| `model` | `model` | Direct copy | Model name unchanged |
| `choices[]` array | `output[]` array | Map choices to output items | Structure differs |
| `choices[0].message` | `output[0]` (message item) | Extract first choice message | Response API uses items, not choices |
| `choices[0].message.role` | `output[0].role` | Direct copy | "assistant" role |
| `choices[0].message.content` | `output[0].content[]` | Wrap in output_text item | Response API uses typed content array |
| `choices[0].finish_reason` | Implicit in `output[0].status` | "stop" → "completed", "length" → "incomplete" | Response API uses status field |
| `usage.prompt_tokens` | `usage.input_tokens` | Direct copy | Field renamed |
| `usage.completion_tokens` | `usage.output_tokens` | Direct copy | Field renamed |
| `usage.total_tokens` | `usage.total_tokens` | Direct copy | Same field |
| `usage.prompt_tokens_details` | `usage.input_tokens_details` | Direct copy structure | Nested details |
| `usage.completion_tokens_details` | `usage.output_tokens_details` | Direct copy structure | Nested details |
| `system_fingerprint` | N/A | Drop | Response API doesn't have this |
| `service_tier` | `service_tier` | Direct copy | Same field |

**Chat Completions Response Example:**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 8,
    "total_tokens": 17
  }
}
```

**Translates to Response API Response:**
```json
{
  "id": "resp-123",
  "object": "response",
  "created_at": 1677652288,
  "model": "gpt-4o",
  "status": "completed",
  "output": [{
    "type": "message",
    "id": "msg-123",
    "status": "completed",
    "role": "assistant",
    "content": [{
      "type": "output_text",
      "text": "Hello! How can I help you?"
    }]
  }],
  "usage": {
    "input_tokens": 9,
    "output_tokens": 8,
    "total_tokens": 17
  }
}
```

---

### Response API → Chat Completions (Response)

| Response API Field | Chat Completions Field | Transformation Logic | Notes |
|-------------------|------------------------|---------------------|--------|
| `id` | `id` | Direct copy | Unique identifier |
| `object` | `object` | "response" → "chat.completion" | Object type differs |
| `created_at` | `created` | Direct copy | Unix timestamp |
| `model` | `model` | Direct copy | Model name unchanged |
| `output[]` array | `choices[]` array | Map output items to choices | Structure differs |
| `output[0]` (message) | `choices[0].message` | Extract message content | Map to choice format |
| `output[0].role` | `choices[0].message.role` | Direct copy | "assistant" role |
| `output[0].content[]` | `choices[0].message.content` | Extract text from output_text items | Unwrap typed content |
| `output[0].status` | `choices[0].finish_reason` | "completed" → "stop", "incomplete" → "length" | Map status to finish_reason |
| `status` | Implicit from choices | "completed" when all items complete | Top-level status |
| `usage.input_tokens` | `usage.prompt_tokens` | Direct copy | Field renamed |
| `usage.output_tokens` | `usage.completion_tokens` | Direct copy | Field renamed |
| `usage.total_tokens` | `usage.total_tokens` | Direct copy | Same field |
| `usage.input_tokens_details` | `usage.prompt_tokens_details` | Direct copy structure | Nested details |
| `usage.output_tokens_details` | `usage.completion_tokens_details` | Direct copy structure | Nested details |
| `service_tier` | `service_tier` | Direct copy | Same field |

---

## Finish Reason / Status Mapping

| Chat Completions `finish_reason` | Response API `status` | Notes |
|----------------------------------|---------------------|--------|
| `"stop"` | `"completed"` | Normal completion |
| `"length"` | `"incomplete"` | Hit token limit |
| `"tool_calls"` | `"completed"` | Completed with tool calls |
| `"content_filter"` | `"failed"` | Content policy violation |
| `null` (in progress) | `"in_progress"` | Streaming in progress |

---

## Unknown Fields

**Forward Compatibility Strategy:**

Both APIs may add new fields over time. The adapter handles unknown fields as follows:

1. **Detect:** Identify fields not in the known mapping schema
2. **Pass Through:** Copy unknown fields unchanged to the output
3. **Log:** Record unknown fields detected for monitoring

**Example:**
```json
// Input (Chat Completions) with unknown field
{
  "model": "gpt-4o",
  "messages": [...],
  "new_future_field": "some_value"
}

// Output (Response API) preserves unknown field
{
  "model": "gpt-4o",
  "input": "...",
  "new_future_field": "some_value"  // Passed through
}

// Logged
{
  "translation_direction": "chat_to_response",
  "unknown_fields": ["new_future_field"],
  "request_id": "..."
}
```

---

## MVP Feature Support

These features are supported in MVP (Epic 6 will implement feature-specific translation):

- ✅ Text generation (basic `content` field)
- ✅ Vision (image inputs) - MVP
- ✅ Structured outputs (`response_format` / `text.format`)
- ✅ Function calling (`tools`, `tool_choice`)
- ✅ Web search (built-in tool)

**Post-MVP / Deferred:**
- ❌ File search
- ❌ Computer use
- ❌ Code interpreter
- ❌ Audio inputs/outputs
- ❌ MCP integration
- ❌ Image generation
- ❌ Reasoning summaries

---

## Round-Trip Validation

**Functional Equivalence Test:**

1. Start with Chat Completions request
2. Translate to Response API format
3. Translate back to Chat Completions format
4. Verify semantic equivalence (not byte-for-byte equality)

**Expected Differences:**
- Field names differ (e.g., `max_tokens` vs `max_output_tokens`)
- Structure differs (e.g., `choices[]` vs `output[]`)
- Some fields dropped if unsupported
- IDs regenerated

**Semantic Equivalence:**
- Same model
- Same message content
- Same parameters (temperature, top_p, etc.)
- Same user intent preserved
