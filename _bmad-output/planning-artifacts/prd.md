---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type']
inputDocuments: ['product-brief-openai-adapter-2026-02-02.md']
workflowType: 'prd'
briefCount: 1
researchCount: 0
brainstormingCount: 0
projectDocsCount: 0
classification:
  projectType: 'Infrastructure Tool / API Proxy'
  domain: 'DevOps / Infrastructure Tooling'
  complexity: 'Medium'
  projectContext: 'greenfield'
---

# Product Requirements Document - openai-adapter

**Author:** Siarhei
**Date:** 2026-02-03

## Success Criteria

### User Success
- **Independent Operation**: QA and DevOps teams can switch between models without requiring developer assistance
- **Rapid Configuration**: Model switching completed within ~5 minutes via configuration changes only
- **Application Transparency**: Applications remain unaware of the adapter's presence - zero code modifications required

### Technical Success
**Priority 1: Reliability**
- Adapter operates dependably in test/staging environments
- Clear failure modes when issues occur (adapter vs. OpenAI vs. application)
- Graceful degradation when translation not possible

**Priority 2: Correctness**
- API translation maintains functional equivalence between Response API and Chat Completions API
- Request/response transformations preserve intended behavior
- State management for multi-turn conversations handled accurately

**Priority 3: Performance**
- Translation overhead does not negate cost savings from using smaller models
- Pass-through mode introduces minimal latency
- Acceptable response times for test workloads

### Measurable Outcomes
- Model switches completed in ≤5 minutes (configuration-only changes)
- Zero developer escalations for routine model switching tasks
- Application code remains unchanged across model switches

## Product Scope

### MVP - Minimum Viable Product
- **Dual Endpoint Architecture**: 
  - Response API endpoint (`/v1/responses`) with Completions API translation when needed
  - Completions API endpoint (`/v1/chat/completions`) with Response API translation when needed
- **Bidirectional Translation**: Both directions supported (Response ↔ Completions)
- **Pass-Through Mode**: Zero overhead when incoming format matches target model format
- **Deployment**: Docker container with standard packaging
- **Configuration**: Environment variable-based configuration for target OpenAI endpoint and model selection

### Growth Features (Post-MVP)
- **Security**: Authentication, authorization, API key management, TLS/SSL support
- Enhanced observability (structured logging, metrics, tracing)
- Configuration validation and error messaging
- Support for additional OpenAI API endpoints beyond core translation
- Performance optimization for high-volume testing scenarios

### Vision (Future)
- Multi-provider support beyond OpenAI
- Advanced deployment patterns (Kubernetes operators, service mesh integration)
- Translation feature matrix documentation and warnings
- Automated compatibility testing against OpenAI API changes

## User Journeys

> **Note:** The following journeys represent common usage patterns across different team structures. Organizations may have varying workflows, configuration management approaches, and deployment patterns. These examples illustrate core capabilities rather than prescriptive workflows.

### Journey 1: QA Engineer - Cost-Effective Testing

**Persona:** Alex, QA Engineer testing a conversational AI application in staging

**Context:** Alex's team uses Response API in production (gpt-4) but wants to run regression tests with a cheaper model (gpt-3.5-turbo from Completions API) in staging. The application code is written for Response API format.

**Journey:**
Alex opens the staging environment configuration file (staging-config.yaml). They change two values:
1. `OPENAI_API_URL` from `https://api.openai.com/v1` to `http://openai-adapter:8080/v1`
2. `OPENAI_MODEL` from `gpt-4` to `gpt-3.5-turbo`

This takes about 3 minutes. Alex commits the change, and the CI/CD pipeline redeploys staging with the new configuration.

The application makes Response API calls as before, but now they're routed to the adapter. The adapter recognizes that gpt-3.5-turbo requires Completions API format, translates the requests, sends them to OpenAI's Completions endpoint, receives the responses, translates them back to Response API format, and returns them to the application.

**Outcome:** Alex runs the full regression suite against gpt-3.5-turbo, catches a critical issue, and saves the team ~$300 in testing costs. When ready for production validation, Alex simply reverts the config changes to point back to OpenAI's Response API endpoint directly.

### Journey 2: DevOps Engineer - Infrastructure Management

**Persona:** Jordan, DevOps Engineer managing test infrastructure

**Context:** Jordan needs to deploy and maintain the adapter for multiple QA environments without requiring developer assistance for routine model switches.

**Journey:**
Jordan pulls the openai-adapter Docker image and reviews the environment variables needed:
- `ADAPTER_TARGET_URL` (OpenAI's base URL)
- `ADAPTER_TARGET_MODEL` (which model to use)
- `OPENAI_API_KEY` (for authenticating to OpenAI)

Jordan adds the adapter to the docker-compose.yml for staging:

```yaml
openai-adapter:
  image: openai-adapter:latest
  environment:
    ADAPTER_TARGET_URL: https://api.openai.com/v1
    ADAPTER_TARGET_MODEL: gpt-3.5-turbo
    OPENAI_API_KEY: ${OPENAI_API_KEY}
  ports:
    - "8080:8080"
```

Jordan deploys the stack and verifies the adapter is running. When QA needs to switch models, Jordan updates the environment variables and restarts the container - no code changes, no developer escalations.

**Outcome:** Jordan maintains the adapter alongside other infrastructure components using standard DevOps practices. Model switches are routine infrastructure changes, not development tasks.

### Journey 3: Developer - Debugging Through the Adapter

**Persona:** Sam, Backend Developer troubleshooting a test failure

**Context:** QA reports that tests are failing in staging but passing locally. The staging environment uses the adapter with gpt-3.5-turbo, while local development uses gpt-4 directly.

**Journey:**
Sam reviews the staging logs and sees the adapter's request/response flow. The adapter logs show:
- Incoming request (Response API format)
- Translation decision (needs Completions API format)
- Outgoing request to OpenAI (Completions API format)
- Incoming response from OpenAI
- Translation back to Response API format
- Final response to application

Sam identifies that a specific prompt feature works differently between Response and Completions APIs. The adapter's logs made it clear where the translation occurred and what transformations were applied.

**Outcome:** Sam understands the issue isn't with the adapter or the application code - it's a legitimate difference in how the two APIs handle a specific feature. Sam updates the test expectations and documents the API difference for the team.

### Journey Requirements Summary

From these journeys, we identify these core requirements:
- **Simple configuration switching**: Environment variables or config files for URL and model changes
- **Transparent operation**: Application code remains unchanged
- **Standard deployment**: Docker container with conventional configuration patterns
- **Clear logging**: Visibility into translation decisions and transformations
- **Low operational overhead**: No specialized knowledge required for routine operations
- **Debuggability**: Logs that help developers understand adapter behavior when issues arise

## Domain-Specific Requirements

### Security & Authentication
- **MVP Scope**: Authentication and authorization are explicitly out of scope for MVP
- **API Key Handling**: The adapter operates as a transparent proxy - API keys are passed through from the application to OpenAI without storage or management by the adapter
- **TLS/SSL**: Not required for MVP (test/staging environments)
- **Post-MVP Considerations**: Authentication, authorization, and API key management will be addressed in growth phase

### Operational Requirements

**Logging & Observability:**
- Structured logging with correlation ID tracking (extract from incoming requests when available)
- Log routing decisions made by the adapter:
  - API translation applied (Response ↔ Completions)
  - Pass-through mode (no translation)
- Log request URIs for troubleshooting
- **Excluded from logs**: Request/response payloads (avoid verbose logging)
- **Post-MVP**: Integration with monitoring tools (Prometheus, Datadog, etc.)

**Health & Readiness:**
- `/health` endpoint for container health checks
- `/ready` endpoint for readiness probes
- Standard HTTP responses for container orchestration

**Configuration Management:**
- Environment variable-based configuration:
  - `ADAPTER_TARGET_URL`: Target OpenAI base URL
  - `ADAPTER_TARGET_MODEL`: Model selection for translation routing
- Configuration loaded at container startup
- No hot-reload required for MVP

### Error Handling & Reliability

**Error Pass-Through Philosophy:**
- The adapter is **fully optional** by design
- Applications already implement retry logic for OpenAI API calls
- Adapter passes errors through transparently without duplicating retry mechanisms
- Clean separation of concerns: adapter handles translation, application handles resilience

**Timeout Strategy:**
- Adapter → OpenAI timeout: 30-60 seconds (reasonable bound to prevent infinite hangs)
- No automatic retry logic in adapter (applications handle retries)
- Clear error messages when timeouts occur

**Out of Scope for MVP:**
- Graceful degradation strategies
- Circuit breaker patterns
- Automatic failover

### Deployment & Infrastructure

**Docker Deployment:**
- Standard Docker container packaging
- Environment variable configuration
- Health/readiness endpoints for orchestration

**Resource Constraints:**
- Memory: 128MB allocation
- CPU: Minimal (I/O-bound workload, primarily JSON translation)
- Optimized for test/staging environment workloads

**Out of Scope for MVP:**
- Service discovery integration
- Load balancing strategies
- Kubernetes operators
- Advanced deployment patterns

### Performance Expectations

**Throughput & Concurrency:**
- Minimal translation overhead (target: <10ms for JSON transformation)
- Performance suitable for test environment workloads
- Specific throughput targets to be validated during implementation

**Latency:**
- Pass-through mode: Near-zero overhead
- Translation mode: Minimal added latency from JSON transformation

### Compliance & Standards
- No specific regulatory requirements (infrastructure tooling for internal use)
- Standard DevOps practices for container security and deployment
- Follows OpenAI API compatibility standards

## Infrastructure Proxy - Technical Architecture

### Endpoint Specifications

**MVP Endpoints:**
- `/v1/responses` - Response API endpoint with bidirectional translation support
- `/v1/chat/completions` - Chat Completions API endpoint with bidirectional translation support
- `/health` - Container health check endpoint (returns 200 OK when adapter is operational)
- `/ready` - Container readiness probe endpoint (returns 200 OK when adapter can accept requests)

**Translation Routing Logic:**

1. Incoming request arrives at adapter endpoint (e.g., `/v1/responses`)
2. Adapter extracts **model name from request payload** (not from config)
3. Adapter checks static **model-to-API mapping** configuration
4. Mapping determines target API format (Response API vs Chat Completions API)
5. Adapter compares source format (from endpoint) vs target format (from mapping):
   - **If formats match** → Pass-through mode (zero translation, minimal latency)
   - **If formats differ** → Apply translation (transform request/response structures)
6. Forward translated request to real OpenAI endpoint (`ADAPTER_TARGET_URL`)

**Post-MVP Enhancements:**
- Dynamic endpoint routing for OpenAI API version evolution (e.g., support `/v2/` when released)
- Auto-discovery of model capabilities from OpenAI API metadata
- Support for additional OpenAI endpoints beyond core translation pair
- Configurable model mapping updates without redeployment

### State Management Architecture

**Critical Requirement:** The adapter bridges fundamentally different conversation paradigms:

**API Paradigm Differences:**
- **Response API**: Stateful - uses correlation IDs to maintain server-side conversation context
- **Chat Completions API**: Stateless - requires full conversation history in every request

**Response API → Chat Completions Translation:**

**Adapter Behavior:**
1. Extract correlation ID from incoming Response API request
2. Retrieve conversation history from persistent state storage (keyed by correlation ID)
3. Append new message to conversation buffer
4. Construct complete message array for Chat Completions format
5. Send full conversation context to OpenAI Chat Completions endpoint
6. Receive response from OpenAI
7. Store updated conversation in state storage
8. Return response in Response API format (single message, not full history)

**Chat Completions → Response API Translation:**

**Adapter Behavior:**
1. Receive Chat Completions request with full message array
2. Hash conversation history to detect existing conversations
3. Check state storage for matching conversation hash
4. **If hash found:** Retrieve cached correlation ID, send only new message(s) to Response API
5. **If hash not found:** New conversation detected
   - Generate new correlation ID
   - Initialize conversation state in Response API
   - Cache conversation hash → correlation ID mapping
6. Return response with correlation ID for future requests

**State Storage Requirements:**

**MVP Requirements:**
- **Persistent state storage** for durability and horizontal scaling capability
- **TTL-based expiration** for conversation cleanup (configurable, default suitable for test environments)
- **Conversation hash → correlation ID mapping** for continuation detection
- **Message history storage** keyed by correlation ID

**Known Limitations (MVP):**
- Conversation hash matching optimized for sequential message additions
- Batch message additions or conversation edits may create new conversation context (hash miss)
- Hash misses require conversation history replay (see architecture phase for detailed approach)
- Logged warnings when hash misses occur for debugging

**→ Architecture Phase Decisions Required:** 
- State storage technology selection (Redis, database, or alternative)
- Detailed conversation history replay strategy for hash miss scenarios
- State persistence and replication approach

**Post-MVP Enhancements:**
- High availability state storage configuration
- Intelligent prefix matching to detect partial conversation matches
- Optimized history replay strategies for batch message scenarios
- Configurable state strictness modes (fast vs correct)
- State migration tools for storage upgrades

### Data Schemas & API Translation

**Feature Compatibility Matrix:**

**MVP - Common Features (Full Translation Support):**
- ✅ Text generation
- ✅ Vision
- ✅ Structured Outputs
- ✅ Function calling
- ✅ Web search
- ✅ File search
- ✅ Computer use
- ✅ Code interpreter
- ✅ MCP (Model Context Protocol)
- ✅ Image generation
- ✅ Reasoning summaries

**Post-MVP - Emerging Features:**
- Audio support (currently "Coming soon" in Response API as of 2026)
- New capabilities as OpenAI releases them

**Translation Strategy:**

**For Common Features:**
- Direct field mapping between API formats
- Preserve semantic meaning across transformations
- Validate transformed output maintains functional equivalence

**For Unsupported Features:**
- **Fail fast**: Return specific error immediately (no silent failures)
- HTTP 422 Unprocessable Entity with detailed error body
- Log unsupported feature attempt with request details

**Request Validation (MVP):**
- Validate JSON structure before translation attempt
- Check required fields exist for target API format
- Reject malformed requests with clear error messages
- **No deep semantic validation** - trust application to send valid OpenAI requests

**Translation Documentation (MVP Requirement):**
- Complete field mapping documentation for both translation directions
- Feature compatibility matrix with explicit support status
- Known limitations and edge cases
- Example request/response pairs for each translation scenario
- Migration guide for applications switching between APIs

**Post-MVP Enhancements:**
- Permissive translation mode with best-effort fallbacks
- Logged warnings for partial translations
- Feature detection and capability negotiation
- Automatic schema validation against OpenAI specifications

### Configuration Management

**Environment Variables:**

**Required Configuration:**
- `ADAPTER_TARGET_URL` - Real OpenAI API base URL
- `STATE_STORAGE_URL` - Connection string for state storage system
- `MODEL_API_MAPPING` - Model name to API type mapping (format TBD in architecture phase)

**Optional Configuration:**
- `CONVERSATION_TTL` - State expiration time in seconds (default suitable for test environments)
- `UPSTREAM_TIMEOUT` - OpenAI request timeout in seconds (default: 60)
- `LOG_LEVEL` - Logging verbosity (default: INFO)

**Model-to-API Mapping Configuration:**
- Maps model names to API types (Response API vs Chat Completions API)
- Can be provided as environment variable or configuration file
- Format and loading mechanism determined in architecture phase

**Configuration Loading:**
- Loaded at container startup
- Validation on startup with clear error messages
- No hot-reload for MVP (requires container restart)

**Post-MVP:**
- Hot-reload for configuration changes
- Configuration validation API endpoint
- Dynamic model mapping updates
- Environment-specific configuration profiles

### Error Handling & Error Codes

**Error Classification:**

**1. OpenAI Errors (Transparent Pass-Through):**
- All HTTP 4xx/5xx responses from OpenAI API passed through unchanged
- Examples: 401 Unauthorized, 429 Too Many Requests, 500 Internal Server Error
- **Adapter Action**: Forward entire response to application (headers + body)
- **Logging**: Log pass-through decision with correlation ID

**2. Translation Errors (Adapter-Generated):**

**Unsupported Feature:**
- HTTP 422 Unprocessable Entity
- Response indicates which feature cannot be translated
- Includes source and target API information

**Invalid Request:**
- HTTP 400 Bad Request
- Response indicates validation failure details
- Specifies missing or malformed fields

**3. Adapter Internal Errors:**
- HTTP 500 Internal Server Error
- Response indicates adapter-side failure
- Includes correlation ID for debugging
- **Logging**: Full error details with stack trace

**4. Upstream Timeout:**
- HTTP 504 Gateway Timeout
- Response indicates timeout occurred waiting for OpenAI
- Includes configured timeout value

**Error Handling Philosophy:**
- Adapter is **fully optional** - applications must handle errors independently
- No retry logic in adapter (applications already implement retries for OpenAI)
- Clear error attribution (adapter vs OpenAI vs application)
- Correlation IDs for end-to-end debugging

### API Versioning Strategy

**MVP Approach:**
- **Fixed endpoint paths**: `/v1/responses` and `/v1/chat/completions`
- OpenAI API version implicitly v1 (from `ADAPTER_TARGET_URL`)
- Static URL structure for predictable behavior
- Applications switch base URL from OpenAI to adapter

**Version Configuration:**
- Target API version embedded in `ADAPTER_TARGET_URL` environment variable
- To support v2 in future: Update URL configuration, no code changes required

**Post-MVP Evolution:**
- Dynamic endpoint routing (mirror OpenAI's URL structure automatically)
- Support multiple API versions simultaneously
- Version negotiation based on request headers
- Backward compatibility mode for deprecated API versions

### Testing Strategy

**Unit Tests (60% of test coverage):**
- Translation logic for both directions (Response ↔ Chat Completions)
- State management operations (store, retrieve, expiration)
- Error handling paths
- Configuration parsing and validation
- Model-to-API mapping lookups
- Correlation ID generation and tracking

**Contract Tests (30% of test coverage):**
- **Scope**: Validate adapter honors OpenAI API contracts
- **Approach**: Mock OpenAI responses, verify adapter behavior
- **Happy Paths**:
  - Valid Response API request → proper translation → Chat Completions format
  - Valid Chat Completions request → proper translation → Response API format
  - Pass-through mode (no translation needed)
- **Error Scenarios**:
  - 400 Bad Request (malformed input)
  - 401 Unauthorized (authentication failure)
  - 422 Unprocessable Entity (unsupported feature)
  - 429 Too Many Requests (rate limiting)
  - 500 Internal Server Error (OpenAI failure)
  - 504 Gateway Timeout (timeout scenario)
- **Execution**: Fast, run on every commit in CI

**Integration Tests (10% of test coverage):**
- **Scope**: End-to-end validation with real OpenAI API
- **Happy Path**: Complete translation flow with actual API calls
- **Error Pass-Through**: Verify one error scenario passes through correctly (e.g., 401)
- **Execution**: Before releases, may use OpenAI sandbox/test environment

**Test Execution Order:**
1. Unit tests (fastest feedback)
2. Contract tests (verify API compliance)
3. Integration tests (validate end-to-end correctness)

**Post-MVP Testing:**
- Performance tests (latency, throughput benchmarks)
- Load tests (concurrent request handling)
- Chaos testing (failure injection scenarios)
- Extended integration coverage (exhaustive feature matrix)
- Regression suite for production issues

### Documentation Requirements

**MVP Documentation:**

**1. OpenAPI/Swagger Specification:**
- Complete API specification for both endpoints
- Request/response schemas
- Error response formats
- Example requests for all scenarios

**2. Translation Documentation (Complete for MVP):**
- Field-by-field mapping for Response API → Chat Completions
- Field-by-field mapping for Chat Completions → Response API
- Feature compatibility matrix with explicit support status
- Known limitations and edge cases
- State management behavior explanation

**3. Deployment Guide:**
- Docker deployment instructions
- Environment variable reference
- State storage setup requirements
- Health check configuration
- Logging configuration

**4. Quick Start Guide:**
- 5-minute setup walkthrough
- Configuration examples for common scenarios
- Troubleshooting guide

**5. Error Code Reference:**
- Complete list of adapter-generated error codes
- Explanation of pass-through vs adapter errors
- Debugging recommendations per error type

**Developer Experience:**
- **No custom SDK required** - applications use existing OpenAI clients
- **Zero code changes** - only configuration changes (base URL swap)
- **Drop-in replacement** - adapter maintains OpenAI API compatibility

**Post-MVP Documentation:**
- Architecture decision records
- Performance tuning guide
- Advanced configuration patterns
- Migration guides for API version upgrades

### Implementation Considerations

**Technology Constraints:**
- **Core Operation**: JSON transformation between API formats
- **Architecture Pattern**: HTTP proxy/middleware
- **Performance Profile**: I/O-bound workload
- **Memory Footprint**: Target 128MB for container allocation
- **Concurrency Model**: Handle multiple simultaneous translations

**Deployment Architecture:**
- **Single Docker container** for adapter service
- **External state storage dependency** (technology TBD in architecture phase)
- **12-factor app compliance** (config via environment, stateless container)
- **Standard container orchestration** compatibility (Docker Compose, Kubernetes)

**Non-Functional Requirements:**
- **Startup time**: < 5 seconds
- **Translation overhead**: < 10ms for JSON transformation
- **Pass-through latency**: < 1ms additional overhead
- **Resource efficiency**: Minimal CPU usage (JSON parsing only)

**Operational Characteristics:**
- **Logging**: Structured JSON logs to stdout
- **Observability**: Health/ready endpoints for monitoring
- **Graceful shutdown**: Complete in-flight requests before termination
- **Error isolation**: Adapter failures don't cascade to OpenAI

