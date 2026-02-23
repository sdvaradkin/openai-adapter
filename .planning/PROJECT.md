# OpenAI Adapter

## What This Is

An OpenAI-compatible HTTP proxy that sits between API clients and backend models, transparently translating between the Chat Completions API format and the Responses API format in both directions. Clients can use whichever API format they prefer and the adapter routes to whatever format the target model actually supports.

## Core Value

Any OpenAI-compatible client can talk to any model regardless of which API format that model natively supports — with no changes to the client.

## Requirements

### Validated

- ✓ HTTP server accepting POST `/v1/responses` and POST `/v1/chat/completions` — existing
- ✓ Model-based routing: pass-through when source == target format, translate when they differ — existing
- ✓ Chat→Response request body translation — existing (partial)
- ✓ Request validation: payload size limit, JSON depth limit, model existence check — existing
- ✓ Config loading from environment variables + JSON model-mapping file — existing
- ✓ Health (`GET /health`) and readiness (`GET /ready`) endpoints — existing
- ✓ Containerized deployment via Docker (distroless, non-root) — existing
- ✓ Structured JSON logging via Pino — existing

### Active

- [ ] Response→Chat request translation (currently returns 501) — complete the missing direction
- [ ] Chat→Response response body translation — translate response payloads, not just requests
- [ ] Response→Chat response body translation — translate response payloads in the reverse direction
- [ ] Conversation history management — when `previous_response_id` is set, adapter stores and reconstructs prior turns as `messages[]` for Chat Completions backend (Redis-backed)
- [ ] Tool/function call translation (best-effort) — map Chat Completions `tools[]` ↔ Responses API `tools[]`, drop or error on untranslatable schemas
- [ ] Production hardening — upstream connection health check at startup, improved timeout handling

### Out of Scope

- Streaming / SSE translation — deferred to v2 (pass-through works for non-translated requests)
- Full tool translation fidelity — complex tool schemas are best-effort only
- OAuth or credential management — auth headers pass through unchanged
- Multi-model fan-out or load balancing — single upstream target per deployment

## Context

The Chat Completions API (`POST /v1/chat/completions`) is the established OpenAI format. The Responses API (`POST /v1/responses`) is newer and supports stateful multi-turn conversations via `previous_response_id`. Some models only support one format. The adapter bridges the gap.

The conversation history feature is the most architecturally novel piece: when a Responses API client sets `previous_response_id`, the adapter must retrieve previously stored responses from Redis and reconstruct the full `messages[]` array before forwarding to a Chat Completions backend — and store each response for future turns.

Existing codebase: TypeScript 5.5, Fastify 4.28, Node.js 20, Vitest, testcontainers. 251 unit tests + 14 integration tests currently passing.

## Constraints

- **Tech stack**: TypeScript strict mode, Fastify, Node.js 20 — no runtime changes
- **Storage**: Redis for conversation history (survives restarts, scales across instances)
- **Non-streaming first**: Streaming translation is v2; buffered responses only for translated requests
- **Text priority**: Text content must translate correctly; tool/function calls are best-effort

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Best-effort field mapping for unknown fields | Drop unmappable fields + log, don't fail the request | — Pending |
| Redis for conversation history | Survives restarts, scales horizontally vs. in-memory | — Pending |
| Non-streaming translation first | Reduces scope, streaming is passthrough-only for now | — Pending |
| Tools translation: best-effort | Common cases handled, exotic schemas dropped with log | — Pending |

---
*Last updated: 2026-02-19 after initialization*
