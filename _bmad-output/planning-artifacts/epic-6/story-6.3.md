# Story 6.3: Structured Outputs Translation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** developer requiring structured JSON outputs,  
**I want** the adapter to translate `response_format` parameters correctly between Response API and Chat Completions API formats,  
**So that** I can enforce JSON schemas on responses regardless of which API format my target model uses.

## Acceptance Criteria

### Structured Output Feature Validation

**Given** a request with structured output detected by Story 6.1  
**When** structured output translation begins  
**Then** the adapter validates schema requirements:
- `response_format.json_schema.schema` must be present when `type: "json_schema"`
- Schema must be valid JSON object (not null or primitive)
- Schema size must be <100KB

**When** structured output validation encounters invalid schema format  
**Then** the adapter returns 400 Bad Request:
```json
{
  "error": {
    "type": "invalid_response_format",
    "message": "Invalid JSON schema format: missing required field 'schema'",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** the schema exceeds reasonable size limits (>100KB)  
**Then** the adapter returns 400 Bad Request:
```json
{
  "error": {
    "type": "schema_too_large",
    "message": "JSON schema exceeds maximum size of 100KB",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

### Structured Output Feature Detection

**Given** a request with structured output requirements  
**When** the feature detector from Story 6.1 analyzes the request  
**Then** it detects `structuredOutputs: true` when the request contains:
- `response_format` parameter with `type: "json_schema"`
- Or `response_format` parameter with `type: "json_object"`

### Chat Completions → Response API Structured Output Translation

**Given** a Chat Completions API request with JSON schema:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Generate user profile"}],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "user_profile",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "age": {"type": "number"}
        },
        "required": ["name", "age"],
        "additionalProperties": false
      }
    }
  }
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "input": "Generate user profile",
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "user_profile",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "age": {"type": "number"}
        },
        "required": ["name", "age"],
        "additionalProperties": false
      }
    }
  }
}
```

**And** the `response_format` parameter is preserved exactly  
**And** the JSON schema structure is maintained unchanged

### Response API → Chat Completions Structured Output Translation

**Given** a Response API request with JSON schema:
```json
{
  "model": "gpt-4",
  "input": "Create event object",
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "calendar_event",
      "schema": {
        "type": "object",
        "properties": {
          "title": {"type": "string"},
          "date": {"type": "string"}
        },
        "required": ["title", "date"]
      }
    }
  }
}
```

**When** translating to Chat Completions format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Create event object"}],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "calendar_event",
      "schema": {
        "type": "object",
        "properties": {
          "title": {"type": "string"},
          "date": {"type": "string"}
        },
        "required": ["title", "date"]
      }
    }
  }
}
```

**And** the `response_format` parameter is preserved exactly  
**And** the JSON schema structure is maintained unchanged

### JSON Object Mode Translation

**Given** a request with simple JSON object mode (no schema):
```json
{
  "response_format": {"type": "json_object"}
}
```

**When** translating between formats  
**Then** the `response_format` parameter is preserved as-is  
**And** works identically in both Chat Completions and Response API

### Structured Output Response Translation

**Given** an OpenAI response with structured JSON output  
**When** translating the response between formats  
**Then** the JSON content is preserved exactly

**Chat Completions response:**
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "{\"name\": \"John Doe\", \"age\": 30}"
      }
    }
  ]
}
```

**Response API equivalent:**
```json
{
  "output": "{\"name\": \"John Doe\", \"age\": 30}"
}
```

**And** the JSON string content is NOT parsed or modified during translation

### Complex Schema Translation

**Given** a request with complex nested JSON schema:
```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "complex_object",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "users": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {"type": "number"},
                "tags": {
                  "type": "array",
                  "items": {"type": "string"}
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**When** translating between formats  
**Then** the entire schema structure is preserved  
**And** nested objects and arrays maintain their structure  
**And** validation rules (required, additionalProperties, etc.) are preserved

### Strict Mode Handling

**When** a schema includes `"strict": true`  
**Then** the strict flag is preserved in translation  
**And** the adapter logs that strict mode is enabled

**When** a schema includes `"strict": false` or omits the flag  
**Then** the strict flag is preserved as-is or omitted in translation

### Logging

**When** structured output feature is used  
**Then** the adapter logs structured output information:
```json
{
  "requestId": "<uuid>",
  "event": "structured_output_translation",
  "direction": "chat_to_response",
  "schemaName": "user_profile",
  "strictMode": true,
  "schemaSize": 256,
  "translationDuration": 3
}
```

## Technical Notes

**Structured Output Translation Strategy:**
- `response_format` parameter maps 1:1 between formats (same structure)
- JSON schema is passed through unchanged (no transformation needed)
- Both APIs support identical schema syntax (OpenAI standard)
- Validation happens on OpenAI side, not in adapter

**Schema Handling:**
- Do NOT validate schema correctness (OpenAI handles this)
- Do NOT modify schema structure
- Pass through unknown schema properties (forward compatibility)
- Preserve schema exactly as provided

**Performance:**
- Schema translation adds <2ms overhead (simple pass-through)
- Large schemas (>10KB) may add slight JSON parsing time
- Schema is NOT validated or processed, only copied

**Testing:**
- Contract tests for `json_schema` mode
- Contract tests for `json_object` mode
- Complex nested schema tests
- Round-trip tests: Chat → Response → Chat with schema preservation
- Strict mode tests
- Large schema performance tests
- Invalid schema error handling tests

**Integration:**
- Extends translation infrastructure from Epic 3
- Reuses `TranslationUtils.handleUnknownFields()` for schema properties
- Integrates with feature detection from Story 6.1

## Requirements Fulfilled

- FR63: System maintains feature support for structured outputs (MVP scope)
- FR65: Translate request/response fields for structured outputs feature between formats
- FR66: Validate feature compatibility at request time (via Story 6.1 integration)
- NFR-P1: Translation overhead <10ms for typical requests
