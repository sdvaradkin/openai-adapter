# Story 6.2: Vision Support Translation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** developer using vision-capable models,  
**I want** the adapter to translate image inputs correctly between Response API and Chat Completions API formats,  
**So that** I can use vision features regardless of which API format my target model uses.

## Acceptance Criteria

### Vision Feature Validation

**Given** a request with vision content detected by Story 6.1  
**When** vision translation begins  
**Then** the adapter validates image format requirements:
- Image URLs must be valid HTTP/HTTPS URLs or data URIs
- Base64 data URIs must match format: `data:image/[type];base64,[data]`
- Supported image types: jpeg, png, gif, webp

**When** vision validation encounters invalid image formats  
**Then** the adapter returns 400 Bad Request with clear error message:
```json
{
  "error": {
    "type": "invalid_image_format",
    "message": "Invalid image format: missing required field 'url'",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

### Chat Completions → Response API Vision Translation

**Given** a Chat Completions API request with vision content:
```json
{
  "model": "gpt-4-vision",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What's in this image?"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/image.jpg",
            "detail": "high"
          }
        }
      ]
    }
  ],
  "max_tokens": 300
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "model": "gpt-4-vision",
  "input": [
    {
      "type": "text",
      "text": "What's in this image?"
    },
    {
      "type": "image",
      "source": {
        "type": "url",
        "url": "https://example.com/image.jpg",
        "detail": "high"
      }
    }
  ],
  "max_tokens": 300
}
```

**And** the translation correctly maps:
- Chat `content` array → Response `input` array
- Chat `type: "image_url"` → Response `type: "image"`
- Chat `image_url.url` → Response `source.url`
- Chat `image_url.detail` → Response `source.detail`

### Response API → Chat Completions Vision Translation

**Given** a Response API request with vision content:
```json
{
  "model": "gpt-4-vision",
  "input": [
    {
      "type": "text",
      "text": "Describe this image"
    },
    {
      "type": "image",
      "source": {
        "type": "url",
        "url": "https://example.com/photo.png"
      }
    }
  ]
}
```

**When** translating to Chat Completions format  
**Then** the translator produces:
```json
{
  "model": "gpt-4-vision",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Describe this image"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "https://example.com/photo.png"
          }
        }
      ]
    }
  ]
}
```

**And** the translation correctly maps:
- Response `input` array → Chat `content` array
- Response `type: "image"` → Chat `type: "image_url"`
- Response `source.url` → Chat `image_url.url`
- Response `source.detail` → Chat `image_url.detail` (if present)

### Vision Response Translation

**Given** an OpenAI response containing vision-related content  
**When** translating the response between formats  
**Then** the adapter preserves vision-specific response fields  
**And** maps response structure appropriately:
- Response API `output` → Chat Completions `choices[0].message.content`
- Chat Completions `choices[0].message.content` → Response API `output`

### Multi-Image Support

**Given** a request with multiple images in the content array  
**When** translating between formats  
**Then** all images are preserved in order  
**And** text and image content items maintain their relative positions

**Example Chat → Response with multiple images:**
```json
// Chat Completions input
{
  "content": [
    {"type": "text", "text": "Compare these images"},
    {"type": "image_url", "image_url": {"url": "https://example.com/img1.jpg"}},
    {"type": "image_url", "image_url": {"url": "https://example.com/img2.jpg"}}
  ]
}

// Response API output
{
  "input": [
    {"type": "text", "text": "Compare these images"},
    {"type": "image", "source": {"type": "url", "url": "https://example.com/img1.jpg"}},
    {"type": "image", "source": {"type": "url", "url": "https://example.com/img2.jpg"}}
  ]
}
```

### Base64 Image Support

**Given** a request with base64-encoded images  
**When** translating between formats  
**Then** base64 data is preserved correctly:

**Chat → Response:**
```json
// Chat format
{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,..."}}

// Response format
{"type": "image", "source": {"type": "base64", "data": "...", "media_type": "image/jpeg"}}
```

**Response → Chat:**
```json
// Response format
{"type": "image", "source": {"type": "base64", "data": "...", "media_type": "image/png"}}

// Chat format
{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
```

### Logging

**When** vision feature is used  
**Then** the adapter logs vision-specific information:
```json
{
  "requestId": "<uuid>",
  "event": "vision_translation",
  "direction": "chat_to_response",
  "imageCount": 2,
  "hasBase64Images": false,
  "translationDuration": 5
}
```

## Technical Notes

**Vision Translation Mapping:**
- Chat Completions uses `content` array with mixed text/image items
- Response API uses `input` array with mixed text/image items
- Key difference: `image_url` wrapper vs direct `image` type
- Detail parameter: `auto`, `low`, `high` (maps directly)

**Image URL Formats:**
- HTTP/HTTPS URLs: Direct mapping between formats
- Base64 data URLs: Requires parsing and reconstruction
- Parse `data:image/[type];base64,[data]` format

**Validation:**
- Validate URL format (not URL accessibility)
- Validate base64 data URI structure
- Image data is NOT downloaded/validated (pass-through)

**Translation Performance:**
- Vision translation should add <5ms overhead
- Base64 parsing may add slight overhead for large images
- Image data is NOT downloaded/validated (pass-through)

**Testing:**
- Contract tests for URL-based images
- Contract tests for base64 images
- Multi-image scenarios
- Round-trip tests: Chat → Response → Chat
- Edge cases: missing detail, invalid formats
- Performance tests with large base64 payloads
- Validation tests for malformed image references

**Integration:**
- Extends translation infrastructure from Epic 3
- Reuses `TranslationUtils.handleUnknownFields()` for forward compatibility
- Integrates with feature detection from Story 6.1

## Requirements Fulfilled

- FR63: System maintains feature support for vision (MVP scope)
- FR65: Translate request/response fields for vision feature between formats
- FR66: Validate feature compatibility at request time (via Story 6.1 integration)
- NFR-P1: Translation overhead <10ms for typical requests
