---
stepsCompleted: [1, 2, 3]
status: complete
inputDocuments: []
date: 2026-02-02
author: Siarhei
---

# Product Brief: openai-adapter

<!-- Content will be appended sequentially through collaborative workflow steps -->

## Executive Summary

**openai-adapter** is a transparent API translation proxy that enables teams to switch between AI models with incompatible APIs (OpenAI Response API vs Chat Completions API) without changing application code. Deployed as a Docker container, the adapter intelligently translates requests and responses bidirectionally while maintaining pass-through mode when translation isn't needed.

**Zero Production Risk:** Unlike SDK abstraction layers that require refactoring all environments, openai-adapter deploys selectively - add it to dev/test/staging for model flexibility, skip it in production for native performance. Your application uses the same code everywhere; only infrastructure configuration changes.

**The Core Value:** Teams can test production code with cost-effective alternative models by simply pointing to the adapter endpoint. No code changes, no developer involvement, no production overhead.

**Target Users:** DevOps and QA teams who need model flexibility in non-production environments without refactoring applications or accepting production risk.

**vs LangChain/LiteLLM:** They require refactoring everywhere to get flexibility anywhere. openai-adapter provides flexibility anywhere without refactoring anywhere.

---

## Core Vision

### Problem Statement

OpenAI provides two API formats that are functionally similar but protocol-incompatible: the newer Response API and the older Chat Completions API. Different models support different APIs. When an application is built against one API format, switching to a model that only supports the other format requires code changes.

**The Testing Flexibility Gap:** A production application uses GPT-4 via Chat Completions API. The team wants to test with GPT-3.5-turbo in staging to reduce costs, but GPT-3.5 only supports the Response API. The application cannot simply point to a different model - the API formats don't match.

**Current options:**
1. Refactor the application code to use abstraction layers that support both APIs
2. Maintain separate code branches for different models
3. Only test with expensive models that match the production API format

### Problem Impact

**Testing Costs:** Every test run against GPT-4 is expensive. Organizations want to use smaller, cheaper models for functional validation before running final tests with production-grade models. API incompatibility prevents this cost optimization.

**Development Velocity:** Model switching requires developer involvement - code changes, reviews, deployments. QA and DevOps teams cannot independently optimize their test environments.

**Coverage Gaps:** Teams avoid testing with alternative models due to integration complexity, reducing confidence in how the application behaves across different model characteristics.

### Why Existing Solutions Fall Short

**SDK Abstraction Layers (LangChain, LiteLLM):** Solve multi-provider flexibility by wrapping different APIs behind a unified interface. Requires replacing native OpenAI SDK calls throughout the application. The abstraction becomes part of the application code, deployed to all environments. Teams gain provider flexibility but lose the option to use native APIs in production.

**API Gateways (Kong, AWS API Gateway):** Handle routing, authentication, and rate limiting but don't perform semantic translation between different API formats. The Response API and Chat Completions API have different request/response structures that require intelligent conversion logic, not just URL routing.

**Custom Translation Code:** Teams can build their own adapters, but this becomes per-application boilerplate that still requires integrating into the codebase and maintaining across projects.

### Proposed Solution

**openai-adapter** is an HTTP proxy service deployed as a Docker container. Applications change their OpenAI endpoint URL to point to the adapter instead of api.openai.com. The adapter then routes and translates as needed.

**Technical Operation:**

1. **Request Inspection:** Adapter examines incoming API calls to determine format (Response API vs Chat Completions API) and inspects target model requirements

2. **Intelligent Translation:** If formats mismatch, converts request structure, field mappings, and parameters to target API format. Maintains conversation state for multi-turn interactions. Converts response back to expected format.

3. **Pass-Through Mode:** If formats match, forwards request directly with zero processing overhead

4. **Configuration Interface:** Accepts target endpoint and model selection via environment variables or configuration files managed at deployment level

### Key Differentiators

**Infrastructure-Layer Solution:** Operates at network level rather than code level. Application remains coupled to OpenAI SDK without abstraction penalties. Provides flexibility through infrastructure configuration rather than code refactoring.

**Selective Deployment Model:** Can be added to specific environments (dev/test/staging) while production continues using native OpenAI APIs. SDK abstractions operate everywhere once integrated; openai-adapter operates only where deployed.

**Operational Autonomy:** DevOps and QA teams control model selection through infrastructure config without developer involvement. Enables environment optimization without code review cycles.

**Focused Scope:** Purpose-built for OpenAI API translation rather than attempting multi-provider abstraction. Simpler to audit, deploy, and maintain than comprehensive frameworks.

**Zero Lock-In:** Can be removed by changing endpoint URL back to api.openai.com. No code dependencies, no vendor coupling, no migration required.

