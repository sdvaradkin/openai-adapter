# Story 6.6: Feature Compatibility Matrix & Documentation

**Epic:** [Epic 6: MVP Feature Set + Compatibility Matrix](epic-6.md)

## User Story (PoC Simplified)

**As a** developer integrating the adapter,  
**I want** clear documentation in the README showing which MVP features are supported,  
**So that** I can quickly understand adapter capabilities.

**PoC Approach:** Create simple README section (not formal compatibility matrix). Formal documentation deferred to post-PoC.

## Acceptance Criteria (PoC Simplified)

### README Feature Support Section

**Given** the adapter supports the complete PoC feature set  
**When** I read the README  
**Then** it includes a "Supported Features" section with:

**Simple Feature List:**
```markdown
## Supported Features (PoC)

The adapter supports the following features for bidirectional translation:

- ✅ **Text Generation** - Core baseline
- ✅ **Vision** - Image URLs and base64 (partial)
- ✅ **Structured Outputs** - Basic JSON schema pass-through
- ✅ **Function Calling** - Tools and tool calls
- ✅ **Web Search** - Via search config
- ✅ **Streaming** - Server-Sent Events (SSE)
- ✅ **Multi-turn Chat** - Via Redis state (Response→Chat only)

Not yet supported:
- ❌ File Search
- ❌ Computer Use
- ❌ Code Interpreter
- ❌ Image Generation
- ❌ MCP Integration
- ❌ Reasoning Summaries

Unsupported features return `422 Unprocessable Entity`.

See [docs/feature-compatibility.md (post-PoC)](docs/feature-compatibility.md) for detailed mapping.
```

**And** provide simple examples for each feature (code blocks, not detailed mapping tables)

**And** include note that detailed documentation is planned post-PoC

## Definition of Done

- README includes "Supported Features" section
- Each feature listed with simple ✅/❌ status
- Simple code examples provided for each feature type
- Note about 422 responses for unsupported features
- Forward reference to post-PoC detailed docs

## Post-PoC Documentation (Future)

The following are deferred to post-PoC and will be implemented as part of post-MVP documentation:

- Per-feature detailed translation documentation
- Field-by-field translation mapping tables
- Error response catalog (422 errors)
- OpenAPI specification updates
- Contract test coverage reports
- Quick start guide
- Migration guide between API formats

These will be delivered in:
- docs/feature-compatibility.md (formal matrix)
- docs/features/*.md (per-feature detailed docs)
- docs/translation-mapping.md (field mappings)
- docs/error-reference.md (complete error catalog)
- docs/quick-start.md (getting started)
- docs/migration-guide.md (migration guidance)

## Requirements Fulfilled (PoC - Simplified)

- FR63: Document MVP feature scope in README (simplified)
- FR65: Document translation for all MVP features (examples only)
- NFR-Q2: Contract test coverage recorded (to be documented post-PoC)
- NFR-Q4: Automated testing coverage indicated (to be detailed post-PoC)
