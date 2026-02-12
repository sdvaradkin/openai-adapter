# Architecture Decisions: Session Management & Protocol Bridging

**Date**: February 3, 2026  
**Source**: BMAD Sync Meeting Transcript  
**Project**: OpenAI Adapter Service

## Executive Summary

The adapter service must bridge between **stateless** (Chat Completion) and **stateful** (Responses API) protocols. This requires explicit session management infrastructure, including persistent storage to maintain conversation continuity across protocol boundaries.

---

## Problem Statement

### The Core Challenge

When integrating different LLM API protocols, a fundamental architectural mismatch exists:

- **Chat Completion Protocol**: Stateless - no session concept, full history passed with each request
- **Responses API Protocol**: Stateful - requires session IDs to maintain conversation continuity

**Critical Question**: How does the adapter determine that an incoming stateless request is a continuation of an existing stateful session?

---

## Protocol Architecture Analysis

### Stateless Protocol (Chat Completion)

**Characteristics**:
- No session identifier in request/response
- Client sends complete conversation history with every request
- Server doesn't maintain state between requests
- Each request is independent

**Implications**:
- Simple server implementation
- Client responsible for state management
- High bandwidth usage (full history every time)
- No server-side conversation tracking

### Stateful Protocol (Responses API)

**Characteristics**:
- Session ID required to continue conversations
- Server maintains conversation state
- Client only sends new messages, not full history
- Explicit session lifecycle management

**Implications**:
- Complex server implementation
- Server responsible for state management
- Lower bandwidth usage
- Built-in conversation tracking

---

## Architecture Solution

### Database Requirement

**Decision**: Use PostgreSQL for session state management

**Rationale**:
- Need to track which stateless requests belong to which stateful sessions
- Must store conversation history for protocols that don't provide it
- Session mapping requires persistent storage
- Allows recovery and debugging of conversation flows

### Session Mapping Strategy

#### For Stateless → Stateful Translation

When receiving a **Chat Completion** request (stateless):

1. **Extract Context Identifiers**
   - Look for conversation history patterns
   - Identify user/client identifiers if available
   - Check for custom headers or metadata

2. **Session Lookup**
   - Query database for existing session matching context
   - Consider time-based session expiration
   - Handle ambiguous cases (new vs. continuation)

3. **Session Creation/Continuation**
   - If existing session found: retrieve session ID, append new message
   - If new conversation: create new session, store initial context
   - Update session state in database

4. **Forward to Stateful API**
   - Call Responses API with session ID
   - Store response for future reference
   - Return formatted response to client

#### For Stateful → Stateless Translation

When receiving a **Responses API** call (stateful):

1. **Session Resolution**
   - Extract session ID from request
   - Retrieve full conversation history from database

2. **History Compilation**
   - Build complete message array from stored history
   - Include all previous messages in chronological order
   - Add new message to array

3. **Forward to Stateless API**
   - Call Chat Completion with full history
   - Store new message and response in session history
   - Return response to client

---

## Implementation Considerations

### Database Schema (Conceptual)

```sql
-- Sessions table
sessions (
  session_id UUID PRIMARY KEY,
  protocol VARCHAR(50),          -- 'chat-completion' or 'responses-api'
  created_at TIMESTAMP,
  last_activity TIMESTAMP,
  metadata JSONB                 -- user_id, client_id, etc.
)

-- Messages table
messages (
  message_id UUID PRIMARY KEY,
  session_id UUID REFERENCES sessions,
  role VARCHAR(20),              -- 'user', 'assistant', 'system'
  content TEXT,
  timestamp TIMESTAMP,
  sequence_number INTEGER
)

-- Protocol mappings table
protocol_mappings (
  mapping_id UUID PRIMARY KEY,
  source_protocol VARCHAR(50),
  target_protocol VARCHAR(50),
  source_session_id UUID,
  target_session_id UUID,
  created_at TIMESTAMP
)
```

### Session Lifecycle Management

**Session Expiration**:
- Time-based expiration (e.g., 24 hours of inactivity)
- Explicit session closure via API
- Cleanup jobs for orphaned sessions

**Concurrency Handling**:
- Lock sessions during active requests
- Handle race conditions for simultaneous requests
- Queue management for high-load scenarios

### Edge Cases & Error Handling

1. **Ambiguous Session Identification**
   - Default: create new session
   - Option: return error requesting explicit session ID
   - Heuristic-based matching with confidence scores

2. **Session Not Found**
   - Return clear error message
   - Option to auto-create if applicable
   - Logging for debugging

3. **Protocol Feature Mismatch**
   - Document unsupported features per protocol
   - Graceful degradation where possible
   - Clear error messages for incompatible features

---

## Alternative Approaches (Considered & Rejected)

### 1. Always Create New Sessions

**Approach**: Create fresh session for every request

**Pros**:
- Simple implementation
- No state tracking needed

**Cons**:
- **Breaks conversation continuity** (critical flaw)
- Responses API expects conversation history
- Defeats purpose of adapter service

**Decision**: ❌ Rejected

### 2. Client-Side Session Management Only

**Approach**: Require clients to always send session IDs

**Pros**:
- Simpler server implementation
- Clear session boundaries

**Cons**:
- Breaks compatibility with stateless clients
- Defeats purpose of protocol bridging
- Not transparent to clients

**Decision**: ❌ Rejected

### 3. In-Memory Session Storage

**Approach**: Use Redis or in-memory cache only

**Pros**:
- Faster than database
- Simpler queries

**Cons**:
- Data loss on restart
- Difficult debugging
- No long-term conversation history

**Decision**: ⚠️ Consider as caching layer over PostgreSQL

---

## Related Architectural Decisions

### Optional Deployment

**Context**: The adapter can be deployed selectively per environment

**Benefits**:
- Production: may not need adapter
- Test/Dev: valuable for protocol flexibility
- Cost optimization through selective deployment

### Microservices Approach

**Decision**: Separate adapter service vs. monolithic integration

**Benefits**:
- Independent scaling
- Isolated failure domain
- Flexible deployment options
- Technology-specific optimization

### Protocol Feature Parity

**Challenge**: Not all features supported across protocols

**Examples**:
- Server-side tools (MCP) not in Chat Completion
- Streaming differences between protocols
- Built-in tools (web search, file search) availability varies

**Strategy**:
- Document feature matrix
- Implement common subset first
- Postpone protocol-specific features
- Graceful degradation for unsupported features

---

## Open Questions & Future Considerations

1. **Session Identification Heuristics**
   - What metadata best identifies conversation continuity?
   - Machine learning for session matching?

2. **Multi-Protocol Sessions**
   - Can single session span multiple protocols?
   - Protocol switching mid-conversation?

3. **Conversation History Management**
   - Token limits for stored history
   - Summarization strategies for long conversations
   - History pruning algorithms

4. **Performance Optimization**
   - Caching strategies
   - Database query optimization
   - Connection pooling

5. **Security & Privacy**
   - Session data encryption
   - User data isolation
   - Compliance requirements (GDPR, etc.)

---

## References

- BMAD Sync Meeting: February 3, 2026
- Chat Completion API Documentation
- Responses API Documentation
- Session Management Best Practices

---

## Revision History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-02-04 | 1.0 | Initial document from meeting transcript | AI Analysis |

