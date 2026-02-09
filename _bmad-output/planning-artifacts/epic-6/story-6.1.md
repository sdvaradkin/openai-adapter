# Story 6.1: Feature Detection & Unsupported Feature Rejection

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story

**As a** platform engineer,  
**I want** the adapter to detect features in incoming requests and reject unsupported features with clear 422 responses,  
**So that** unsupported features fail fast with actionable error messages, and supported features can proceed to their specific validation and translation logic.

## Acceptance Criteria

### Feature Detection Infrastructure

**Given** the adapter receives a request at any endpoint  
**When** the feature detector analyzes the request  
**Then** it identifies all features present in the request payload

**When** analyzing a request for features  
**Then** the detector checks for:
- **Vision:** `messages` array contains content with `type: "image_url"`
- **Structured Outputs:** `response_format` parameter with `type: "json_schema"`
- **Function Calling:** `tools` array or `tool_choice` parameter present
- **Web Search:** Request contains web search-specific parameters
- **Streaming:** `stream: true` parameter
- **File Search:** `tools` array contains tool with `type: "file_search"`
- **Computer Use:** `tools` array contains tool with `type: "computer_20241022"` or similar
- **Code Interpreter:** `tools` array contains tool with `type: "code_interpreter"`
- **Image Generation:** Request to image generation endpoints or parameters
- **Reasoning:** `reasoning` parameters or related fields

**And** the detector returns a structured `DetectedFeatures` object containing:
```typescript
{
  vision: boolean,
  structuredOutputs: boolean,
  functionCalling: boolean,
  webSearch: boolean,
  streaming: boolean,
  fileSearch: boolean,
  computerUse: boolean,
  codeInterpreter: boolean,
  imageGeneration: boolean,
  reasoning: boolean,
  textGeneration: boolean  // default: true if no special features detected
}
```

### Unsupported Feature Rejection (422 Responses)

**Given** the adapter has detected unsupported features in a request  
**When** validation processes the request (after existing validation from Epic 2)  
**Then** it checks each detected feature against the MVP support matrix

**When** one or more detected features are NOT in the MVP-supported list  
**Then** the adapter returns HTTP 422 Unprocessable Entity immediately  
**And** the response body contains:
```json
{
  "error": {
    "type": "unsupported_feature",
    "message": "Feature not supported in MVP: <feature_name>",
    "unsupportedFeatures": ["<feature_name>"],
    "supportedFeatures": ["text_generation", "vision", "structured_outputs", "function_calling", "web_search", "streaming"],
    "source": "adapter_error",
    "documentation": "https://github.com/<project>/docs/feature-compatibility.md"
  },
  "requestId": "<uuid>"
}
```

**When** multiple unsupported features are detected  
**Then** the error response lists all unsupported features:
```json
{
  "error": {
    "type": "unsupported_features",
    "message": "Multiple features not supported in MVP: file_search, code_interpreter",
    "unsupportedFeatures": ["file_search", "code_interpreter"],
    "supportedFeatures": ["text_generation", "vision", "structured_outputs", "function_calling", "web_search", "streaming"],
    "source": "adapter_error",
    "documentation": "https://github.com/<project>/docs/feature-compatibility.md"
  },
  "requestId": "<uuid>"
}
```

**When** all detected features are in the MVP-supported list (text, vision, structured outputs, function calling, web search, streaming)  
**Then** validation passes  
**And** the request proceeds to feature-specific validation and translation  
**And** detected features are logged with request ID

**Note:** Feature-specific validation (e.g., valid image URL format for vision, valid schema for structured outputs) is handled within each feature's translation story (Stories 6.2-6.5).

### Feature-Specific Rejection Messages

**When** a request contains file search (`tools` with `type: "file_search"`)  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: file_search. This feature is planned for post-MVP release."`

**When** a request contains computer use (`tools` with `type: "computer_20241022"`)  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: computer_use. This feature is planned for post-MVP release."`

**When** a request contains code interpreter (`tools` with `type: "code_interpreter"`)  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: code_interpreter. This feature is planned for post-MVP release."`

**When** a request contains image generation parameters or endpoints  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: image_generation. This feature is planned for post-MVP release."`

**When** a request contains reasoning parameters  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: reasoning. This feature is planned for post-MVP release."`

**When** a request contains MCP (Model Context Protocol) parameters  
**Then** the adapter returns 422 with message: `"Feature not supported in MVP: mcp. This feature is planned for post-MVP release."`

### Feature Detection Logging

**When** feature detection completes  
**Then** the adapter logs the detection result as structured JSON:
```json
{
  "requestId": "<uuid>",
  "event": "feature_detection",
  "timestamp": "<ISO8601>",
  "detectedFeatures": {
    "vision": false,
    "structuredOutputs": true,
    "functionCalling": false,
    "webSearch": false,
    "streaming": false,
    "textGeneration": true
  },
  "validationResult": "passed" | "rejected",
  "unsupportedFeatures": []  // populated if rejected
}
```

**When** a request is rejected due to unsupported features  
**Then** the adapter logs the rejection as structured JSON:
```json
{
  "requestId": "<uuid>",
  "event": "feature_rejection",
  "timestamp": "<ISO8601>",
  "statusCode": 422,
  "unsupportedFeatures": ["file_search"],
  "detectedFeatures": {
    "textGeneration": true,
    "fileSearch": true
  },
  "endpoint": "/v1/chat/completions",
  "model": "gpt-4"
}
```

**And** the log severity is `warn` (not error, since this is expected behavior)

### Integration with Existing Pipeline

**Given** the adapter has the validation pipeline from Epic 2 (Story 2.2)  
**When** integrating feature detection and rejection  
**Then** feature detection runs AFTER:
- Request size validation (10MB limit)
- JSON depth validation (100 levels)
- Model name validation

**And** BEFORE:
- Feature-specific validation (Stories 6.2-6.5)
- Translation or pass-through execution

**And** feature rejection uses the same error handling infrastructure as Epic 2 (Story 2.4)  
**And** includes request ID correlation for debugging

### Performance and Safety

**When** unsupported features are detected  
**Then** rejection happens in <1ms (fail-fast before expensive operations)  
**And** no state is created in Redis or other storage  
**And** no upstream API calls are made

**And** the adapter correctly identifies ALL post-MVP features:
- file_search
- computer_use (any variant: `computer_20241022`, etc.)
- code_interpreter
- mcp (Model Context Protocol)
- image_generation
- reasoning

**And** zero false positives: MVP-supported features are never incorrectly rejected (NFR-C3)

## Technical Notes

**Feature Detection Strategy:**
- Pure function that takes request payload and returns `DetectedFeatures`
- No side effects (logging handled separately)
- Fast execution (<1ms for typical requests)
- Extensible design for adding new features post-MVP

**Rejection Handler Implementation:**
- Reuse error response formatting from Story 2.4
- Map `DetectedFeatures` to user-friendly feature names
- Provide actionable error messages with documentation link
- Maintain consistency with OpenAI error response format

**Feature Support Matrix (MVP):**
```typescript
const MVP_SUPPORTED_FEATURES = [
  'textGeneration',
  'vision',
  'structuredOutputs',
  'functionCalling',
  'webSearch',
  'streaming'  // from Epic 5
];

const POST_MVP_FEATURES = [
  'fileSearch',
  'computerUse',
  'codeInterpreter',
  'mcp',
  'imageGeneration',
  'reasoning'
];

const FEATURE_DISPLAY_NAMES = {
  fileSearch: 'file_search',
  computerUse: 'computer_use',
  codeInterpreter: 'code_interpreter',
  imageGeneration: 'image_generation',
  reasoning: 'reasoning',
  mcp: 'mcp'
};
```

**Validation Pipeline Integration:**
- Extend existing validation middleware from Epic 2
- Add feature detection step to validation chain
- Reuse error handling infrastructure from Story 2.4
- Feature-specific validation deferred to Stories 6.2-6.5

**Testing:**
- Unit tests for feature detector with various request payloads
- Contract tests for each unsupported feature type
- Multi-feature rejection tests
- False positive tests (ensure supported features not rejected)
- Integration tests with validation pipeline
- Performance tests ensuring <1ms detection and rejection
- Error response format validation

## Requirements Fulfilled

- FR44: Return 422 Unprocessable Entity for unsupported features
- FR55: Detect feature types in incoming requests
- FR56: Validate whether detected features are translatable (for MVP vs post-MVP)
- FR60: Fail fast with 422 when feature translation not supported
- FR61: Provide error response indicating which specific feature cannot be translated
- FR62: Log feature translation attempts with success/failure status
- FR63: Maintain feature support for MVP scope (by explicitly rejecting non-MVP features)
- FR66: Validate feature compatibility at request time
- NFR-C3: Feature Detection Accuracy (zero false positives)
