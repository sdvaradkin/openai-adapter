# Story 6.6: Feature Compatibility Matrix & Documentation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** developer integrating the adapter,  
**I want** comprehensive documentation showing exactly which features are supported and how they translate between APIs,  
**So that** I can plan my integration and understand what capabilities are available in MVP.

## Acceptance Criteria

### Feature Compatibility Matrix Document

**Given** the adapter supports the complete MVP feature set  
**When** I access the compatibility matrix documentation  
**Then** it provides a comprehensive markdown document at `docs/feature-compatibility.md` containing:

**Feature Support Table:**
```markdown
| Feature | Status | Chat Completions → Response | Response → Chat | Notes |
|---------|--------|----------------------------|-----------------|-------|
| Text Generation | ✅ Supported | ✅ | ✅ | Core baseline feature |
| Vision | ✅ Supported | ✅ | ✅ | Image URLs and base64 |
| Structured Outputs | ✅ Supported | ✅ | ✅ | JSON schema pass-through |
| Function Calling | ✅ Supported | ✅ | ✅ | Tools and tool calls |
| Web Search | ✅ Supported | ✅ | ✅ | Search config and results |
| Streaming | ✅ Supported | ✅ | ✅ | SSE (from Epic 5) |
| Multi-turn Chat | ✅ Supported | N/A | ✅ | Response→Chat only (Epic 4) |
| File Search | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
| Computer Use | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
| Code Interpreter | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
| MCP Integration | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
| Image Generation | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
| Reasoning Summaries | ❌ MVP Deferred | ❌ | ❌ | Returns 422 |
```

**Feature Details Sections:**
- Overview of each supported feature
- Translation behavior explanation
- Known limitations or constraints
- Example payloads for each feature
- Links to relevant story documentation

**Unsupported Feature Behavior:**
- Clear explanation that unsupported features return 422
- Example 422 error response
- Roadmap indication (post-MVP)

### Per-Feature Translation Documentation

**For each MVP-supported feature, provide detailed docs:**

**Vision Feature Documentation:**
- Image URL format translation examples
- Base64 image handling
- Multi-image scenarios
- Content array structure mapping
- Performance characteristics

**Structured Outputs Documentation:**
- JSON schema preservation approach
- Strict mode handling
- `json_object` vs `json_schema` modes
- Complex nested schema examples

**Function Calling Documentation:**
- Tool definition structure
- `tool_choice` options
- Tool call response mapping
- Multiple function scenarios

**Web Search Documentation:**
- Configuration options
- Search result structure mapping
- Empty results handling
- Forward compatibility approach

### Error Response Catalog

**Provide comprehensive error documentation:**

**422 Unsupported Feature Errors:**
```markdown
### Unsupported Feature (422)

**Trigger:** Request contains feature not supported in MVP

**Response:**
```json
{
  "error": {
    "type": "unsupported_feature",
    "message": "Feature not supported in MVP: file_search",
    "unsupportedFeatures": ["file_search"],
    "supportedFeatures": ["text_generation", "vision", "structured_outputs", "function_calling", "web_search", "streaming"],
    "source": "adapter_error",
    "documentation": "https://github.com/<project>/docs/feature-compatibility.md"
  },
  "requestId": "<uuid>"
}
```

**Resolution:** Remove unsupported feature from request or wait for post-MVP release
```

**And** document all adapter-generated errors related to features

### API Endpoint Compatibility

**Document endpoint support:**

**Supported Endpoints:**
```markdown
### Supported Endpoints

| Endpoint | Method | Description | Features Supported |
|----------|--------|-------------|-------------------|
| `/v1/chat/completions` | POST | Chat Completions API | All MVP features |
| `/v1/responses` | POST | Response API | All MVP features |
| `/health` | GET | Health check | N/A |
| `/ready` | GET | Readiness check | N/A |
```

### Translation Mapping Reference

**Provide field-by-field translation tables:**

**Example for Vision:**
```markdown
### Vision Translation Mapping

#### Image URL Content (Chat → Response)

| Chat Completions Field | Response API Field | Notes |
|----------------------|-------------------|-------|
| `messages[].content[].type: "image_url"` | `input[].type: "image"` | Type name change |
| `image_url.url` | `source.url` | URL preserved |
| `image_url.detail` | `source.detail` | Optional parameter |
```

**And** similar tables for all other features

### Contract Test Coverage Report

**When** all Epic 6 stories are complete  
**Then** generate a test coverage report showing:
- Contract tests for each MVP feature
- Test coverage percentage per feature
- Test scenarios covered
- Integration test results

**Example Report:**
```markdown
### Feature Test Coverage

| Feature | Unit Tests | Contract Tests | Coverage |
|---------|-----------|----------------|----------|
| Text Generation | 15 tests | 8 tests | 95% |
| Vision | 12 tests | 6 tests | 92% |
| Structured Outputs | 10 tests | 5 tests | 90% |
| Function Calling | 14 tests | 7 tests | 93% |
| Web Search | 8 tests | 4 tests | 88% |
| Feature Detection | 18 tests | N/A | 100% |
| 422 Rejection | 10 tests | 6 tests | 100% |
```

### OpenAPI Specification Updates

**Given** the adapter supports all MVP features  
**When** I access the OpenAPI specification  
**Then** it includes:
- Schema definitions for all request/response types
- Feature-specific parameters documented
- Error responses (422) documented
- Example requests for each feature
- Feature compatibility notes

### Quick Start Guide

**Provide a quick start guide showing:**
1. Basic text generation example
2. Vision example (with image URL)
3. Structured output example (with schema)
4. Function calling example (with tool definition)
5. Web search example
6. Handling unsupported features (422)

**Each example includes:**
- Complete request payload
- Expected response format
- Both Chat Completions and Response API versions

### Migration Guide

**For teams migrating between API formats:**
- Checklist of features to verify
- Translation behavior for each feature
- Common gotchas and solutions
- Performance considerations
- State management implications (for multi-turn)

## Technical Notes

**Documentation Structure:**
```
docs/
├── feature-compatibility.md       # Main compatibility matrix
├── features/
│   ├── vision.md                 # Vision feature details
│   ├── structured-outputs.md     # Structured outputs details
│   ├── function-calling.md       # Function calling details
│   └── web-search.md             # Web search details
├── translation-mapping.md         # Field-by-field mappings
├── error-reference.md            # Complete error catalog
├── quick-start.md                # Getting started examples
└── migration-guide.md            # Migration between formats
```

**Documentation Standards:**
- Use OpenAI documentation style and terminology
- Include code examples in JSON format
- Provide both curl and code SDK examples where relevant
- Keep synchronized with implementation
- Include last-updated timestamps

**Testing Documentation:**
- Test coverage report generated from Vitest output
- Contract test results from CI pipeline
- Performance test results for translation overhead

**Documentation Delivery:**
- Static markdown files in repository
- Linked from README.md
- Available in deployed container (optional `/docs` endpoint)
- Referenced in 422 error responses

## Requirements Fulfilled

- FR63: Document MVP feature scope clearly
- FR65: Document translation for all MVP features
- NFR-M5: Translation documentation updated (comprehensive initial version)
- NFR-Q2: Contract test coverage documented (100% supported endpoints)
- NFR-Q4: Automated testing coverage documented (≥95% FRs)
