# Story 6.5: Web Search Translation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** developer using web search capabilities,  
**I want** the adapter to translate web search parameters and results correctly between Response API and Chat Completions API formats,  
**So that** I can use web search features regardless of which API format my target model uses.

## Acceptance Criteria

### Web Search Feature Validation

**Given** a request with web search detected by Story 6.1  
**When** web search translation begins  
**Then** the adapter validates web search configuration:
- `max_results` if present must be a positive number
- `recency` if present must be one of: "recent", "week", "month", "year"
- `domains` if present must be array of valid domain strings

**When** web search translation encounters invalid configuration  
**Then** the adapter returns 400 Bad Request:
```json
{
  "error": {
    "type": "invalid_web_search_config",
    "message": "Invalid web search configuration: max_results must be a positive number",
    "source": "adapter_error"
  },
  "requestId": "<uuid>"
}
```

**When** web search results contain unexpected fields  
**Then** the adapter passes through unknown fields unchanged (forward compatibility)  
**And** logs the presence of unknown web search result fields

### Web Search Feature Detection

**Given** a request with web search capabilities  
**When** the feature detector from Story 6.1 analyzes the request  
**Then** it detects `webSearch: true` when the request contains:
- `web_search` parameter set to `true` or with configuration object
- Or web search-specific tool in `tools` array

### Chat Completions → Response API Web Search Translation

**Given** a Chat Completions API request with web search enabled:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "What are the latest AI developments?"}],
  "web_search": true
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "input": "What are the latest AI developments?",
  "web_search": true
}
```

**And** the `web_search` parameter is preserved as-is

**Given** a Chat Completions request with web search configuration:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Search for climate data"}],
  "web_search": {
    "enabled": true,
    "max_results": 5,
    "recency": "recent"
  }
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "input": "Search for climate data",
  "web_search": {
    "enabled": true,
    "max_results": 5,
    "recency": "recent"
  }
}
```

**And** all web search configuration parameters are preserved

### Response API → Chat Completions Web Search Translation

**Given** a Response API request with web search enabled:
```json
{
  "model": "gpt-4",
  "input": "Find recent news about space exploration",
  "web_search": true
}
```

**When** translating to Chat Completions format  
**Then** the translator produces:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Find recent news about space exploration"}],
  "web_search": true
}
```

**And** the `web_search` parameter is preserved as-is

**Given** a Response API request with web search configuration:
```json
{
  "model": "gpt-4",
  "input": "Search quantum computing papers",
  "web_search": {
    "enabled": true,
    "domains": ["arxiv.org", "scholar.google.com"]
  }
}
```

**When** translating to Chat Completions format  
**Then** all web search configuration is preserved:
```json
{
  "model": "gpt-4",
  "messages": [{"role": "user", "content": "Search quantum computing papers"}],
  "web_search": {
    "enabled": true,
    "domains": ["arxiv.org", "scholar.google.com"]
  }
}
```

### Web Search Response Translation (Chat → Response)

**Given** a Chat Completions response with web search results:
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Based on recent sources, AI developments include...",
        "web_search_results": [
          {
            "title": "Latest AI Breakthrough",
            "url": "https://example.com/article1",
            "snippet": "Researchers announce new...",
            "relevance_score": 0.95
          }
        ]
      },
      "finish_reason": "stop"
    }
  ]
}
```

**When** translating to Response API format  
**Then** the translator produces:
```json
{
  "output": "Based on recent sources, AI developments include...",
  "web_search_results": [
    {
      "title": "Latest AI Breakthrough",
      "url": "https://example.com/article1",
      "snippet": "Researchers announce new...",
      "relevance_score": 0.95
    }
  ],
  "stop_reason": "stop"
}
```

**And** web search results are moved to top-level in Response API format  
**And** all result fields are preserved

### Web Search Response Translation (Response → Chat)

**Given** a Response API response with web search results:
```json
{
  "output": "Climate data shows...",
  "web_search_results": [
    {
      "title": "Climate Report 2026",
      "url": "https://climate.org/report",
      "snippet": "Annual climate data reveals...",
      "published_date": "2026-01-15"
    },
    {
      "title": "Temperature Trends",
      "url": "https://data.org/trends",
      "snippet": "Global temperature trends..."
    }
  ],
  "stop_reason": "stop"
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
        "content": "Climate data shows...",
        "web_search_results": [
          {
            "title": "Climate Report 2026",
            "url": "https://climate.org/report",
            "snippet": "Annual climate data reveals...",
            "published_date": "2026-01-15"
          },
          {
            "title": "Temperature Trends",
            "url": "https://data.org/trends",
            "snippet": "Global temperature trends..."
          }
        ]
      },
      "finish_reason": "stop"
    }
  ]
}
```

**And** web search results are nested under message in Chat format  
**And** all result fields are preserved including optional fields

### Web Search Configuration Options

**When** web search configuration includes any of these parameters  
**Then** they are preserved across translation:
- `enabled`: boolean
- `max_results`: number
- `recency`: "recent" | "week" | "month" | "year"
- `domains`: array of strings (allowed domains)
- `exclude_domains`: array of strings (blocked domains)
- `search_depth`: "basic" | "thorough"

### Empty Web Search Results

**Given** a response where web search found no results  
**When** translating between formats  
**Then** `web_search_results` is an empty array: `[]`  
**And** the adapter logs that web search returned no results

### Logging

**When** web search feature is used  
**Then** the adapter logs web search information:
```json
{
  "requestId": "<uuid>",
  "event": "web_search_translation",
  "direction": "chat_to_response",
  "webSearchEnabled": true,
  "webSearchConfig": {
    "max_results": 5,
    "recency": "recent"
  },
  "translationDuration": 2
}
```

**When** a response contains web search results  
**Then** the adapter logs:
```json
{
  "requestId": "<uuid>",
  "event": "web_search_results",
  "resultCount": 3,
  "hasSearchResults": true
}
```

## Technical Notes

**Web Search Translation Strategy:**
- `web_search` parameter maps 1:1 between formats (same structure)
- Search results have different positions in response structure:
  - Chat: nested under `message.web_search_results`
  - Response: top-level `web_search_results`
- All search result fields pass through unchanged

**Field Mappings:**
- Request: `web_search` → identical in both formats
- Response: `message.web_search_results` (Chat) ↔ `web_search_results` (Response)
- Result fields: preserved exactly (title, url, snippet, relevance_score, published_date, etc.)

**Forward Compatibility:**
- Pass through unknown web search configuration options
- Pass through unknown web search result fields
- Log unknown fields for monitoring

**Performance:**
- Web search translation adds <2ms overhead
- Search results array is not parsed, only repositioned
- Configuration object is shallow-copied

**Testing:**
- Contract tests for simple web search enabled
- Contract tests for web search with configuration
- Contract tests for search results (single and multiple)
- Contract tests for empty search results
- Round-trip tests with search config and results
- Unknown field pass-through tests
- Error handling tests for invalid configuration

**Integration:**
- Extends translation infrastructure from Epic 3
- Reuses `TranslationUtils.handleUnknownFields()` for search config and results
- Integrates with feature detection from Story 6.1

## Requirements Fulfilled

- FR63: System maintains feature support for web search (MVP scope)
- FR65: Translate request/response fields for web search feature between formats
- FR66: Validate feature compatibility at request time (via Story 6.1 integration)
- FR58: Pass through unknown fields unchanged (for search results)
- NFR-P1: Translation overhead <10ms for typical requests
