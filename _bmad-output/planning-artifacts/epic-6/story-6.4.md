# Story 6.4: Function Calling Translation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** developer using function calling capabilities,  
**I want** the adapter to translate tool definitions and tool calls correctly between Response API and Chat Completions API formats,  
**So that** I can use function calling regardless of which API format my target model uses.

## Acceptance Criteria

### Function Calling Feature Validation

**Given** a request with function calling detected by Story 6.1  
**When** function calling translation begins  
**Then** the adapter validates tool requirements:
- Each tool in `tools` array must have `type` field
- Function tools must have `function.name` field
- Function names must be valid identifiers
- `tool_choice` if specific function must reference existing tool

**When** function calling validation encounters invalid tool format  
**Then** the adapter returns 400 Bad Request:
```json
{
  "error": {
    "type": "invalid_tool_definition",
    "message": "Invalid tool definition: missing required field 'function.name'",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** tool_choice references non-existent function  
**Then** the adapter passes the request through (OpenAI will validate)  
**And** logs a warning about potential tool_choice mismatch

### Function Calling Feature Detection

**Given** a request with function calling capabilities  
**When** the feature detector from Story 6.1 analyzes the request  
**Then** it detects `functionCalling: true` when the request contains:
- `tools` array with function definitions
- `tool_choice` parameter (auto, required, none, or specific function)

### Chat Completions → Response API Function Calling Translation

**Given** a Chat Completions API request with function definitions:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "What's the weather in Boston?"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "City name"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "input": "What's the weather in Boston?",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get current weather for a location",
        "parameters": {
          "type": "object",
          "properties": {
            "location": {"type": "string", "description": "City name"},
            "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
          },
          "required": ["location"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

**And** the `tools` array is preserved with all function definitions  
**And** the `tool_choice` parameter is preserved as-is

### Response API → Chat Completions Function Calling Translation

**Given** a Response API request with function definitions:
```json
{
  "model": "gpt-4",
  "input": "Calculate 15% tip on $50",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculate",
        "parameters": {
          "type": "object",
          "properties": {
            "operation": {"type": "string"},
            "numbers": {"type": "array", "items": {"type": "number"}}
          }
        }
      }
    }
  ],
  "tool_choice": "required"
}
```

**When** translating to Chat Completions format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Calculate 15% tip on $50"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculate",
        "parameters": {
          "type": "object",
          "properties": {
            "operation": {"type": "string"},
            "numbers": {"type": "array", "items": {"type": "number"}}
          }
        }
      }
    }
  ],
  "tool_choice": "required"
}
```

**And** the `tools` array is preserved exactly  
**And** the `tool_choice` parameter is preserved as-is

### Tool Choice Options Translation

**When** `tool_choice` is set to "auto"  
**Then** it is preserved as "auto" in both directions

**When** `tool_choice` is set to "none"  
**Then** it is preserved as "none" in both directions

**When** `tool_choice` is set to "required"  
**Then** it is preserved as "required" in both directions

**When** `tool_choice` specifies a specific function:
```json
{
  "tool_choice": {
    "type": "function",
    "function": {"name": "get_weather"}
  }
}
```
**Then** the specific function choice is preserved exactly in both directions

### Function Call Response Translation (Chat → Response)

**Given** a Chat Completions response with tool calls:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_abc123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": "{\"location\": \"Boston\", \"unit\": \"fahrenheit\"}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "output": {
    "tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\": \"Boston\", \"unit\": \"fahrenheit\"}"
        }
      }
    ]
  },
  "stop_reason": "tool_calls"
}
```

**And** tool call IDs are preserved  
**And** function arguments are preserved as JSON strings (not parsed)  
**And** finish_reason maps to stop_reason

### Function Call Response Translation (Response → Chat)

**Given** a Response API response with tool calls:
```json
{
  "output": {
    "tool_calls": [
      {
        "id": "call_xyz789",
        "type": "function",
        "function": {
          "name": "calculate",
          "arguments": "{\"operation\": \"multiply\", \"numbers\": [50, 0.15]}"
        }
      }
    ]
  },
  "stop_reason": "tool_calls"
}
```

**When** translating to Chat Completions format  
**Then** the translator produces:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": null,
        "tool_calls": [
          {
            "id": "call_xyz789",
            "type": "function",
            "function": {
              "name": "calculate",
              "arguments": "{\"operation\": \"multiply\", \"numbers\": [50, 0.15]}"
            }
          }
        ]
      },
      "finish_reason": "tool_calls"
    }
  ]
}
```

**And** stop_reason maps to finish_reason  
**And** content is set to null when tool_calls present

### Multiple Function Definitions

**Given** a request with multiple function definitions  
**When** translating between formats  
**Then** all functions are preserved in order  
**And** each function definition is translated correctly

**Example with 3 functions:**
```json
{
  "tools": [
    {"type": "function", "function": {"name": "get_weather", ...}},
    {"type": "function", "function": {"name": "get_time", ...}},
    {"type": "function", "function": {"name": "search_web", ...}}
  ]
}
```

**And** all three function definitions are preserved across translation

### Multiple Tool Calls in Response

**Given** a response with multiple tool calls  
**When** translating between formats  
**Then** all tool calls are preserved in order  
**And** each tool call maintains its ID and arguments

### Logging

**When** function calling feature is used  
**Then** the adapter logs function calling information:
```json
{
  "requestId": "<uuid>",
  "event": "function_calling_translation",
  "direction": "chat_to_response",
  "functionCount": 2,
  "toolChoice": "auto",
  "translationDuration": 4
}
```

**When** a response contains tool calls  
**Then** the adapter logs:
```json
{
  "requestId": "<uuid>",
  "event": "tool_call_response",
  "toolCallCount": 1,
  "functionNames": ["get_weather"]
}
```

## Technical Notes

**Function Calling Translation Strategy:**
- `tools` array maps 1:1 between formats (same structure in both APIs)
- `tool_choice` parameter maps 1:1 (same options in both APIs)
- Function call responses have different field names but identical structure
- Arguments are JSON strings, not parsed objects (pass through as-is)

**Field Mappings:**
- Request: `tools` and `tool_choice` → identical in both formats
- Response: `finish_reason/stop_reason` mapping
- Response: `message.tool_calls` (Chat) ↔ `output.tool_calls` (Response)

**Performance:**
- Function calling translation adds <5ms overhead
- Large function definitions (many tools) may add slight overhead
- Arguments strings are NOT parsed or validated

**Testing:**
- Contract tests for single function definition
- Contract tests for multiple functions
- Contract tests for all tool_choice modes
- Contract tests for tool call responses
- Round-trip tests with function definitions and calls
- Complex parameter schema tests
- Error handling tests for invalid formats

**Integration:**
- Extends translation infrastructure from Epic 3
- Reuses `TranslationUtils.handleUnknownFields()` for function parameters
- Integrates with feature detection from Story 6.1

## Requirements Fulfilled

- FR63: System maintains feature support for function calling (MVP scope)
- FR65: Translate request/response fields for function calling feature between formats
- FR66: Validate feature compatibility at request time (via Story 6.1 integration)
- NFR-P1: Translation overhead <10ms for typical requests
