# Epic 1: Deploy & Operate the Adapter

## Goal

DevOps can run the adapter as a container with validated configuration and clear health/readiness.

## Description

This epic establishes the operational foundation for the openai-adapter. It provides DevOps and platform engineers with everything needed to deploy, configure, and monitor the adapter in production environments. The epic covers container packaging, configuration management with fail-fast validation, and operational endpoints for health monitoring and readiness checks.

## Functional Requirements Covered

- **FR21-FR26:** Configuration loading and validation (env vars, model-to-API mapping)
- **FR28:** Docker container deployment
- **FR29:** Upstream timeout configuration
- **FR30:** Maximum concurrent connections configuration
- **FR31-FR32:** Health and readiness endpoints (config check only)

**Note:** FR33 (storage connectivity in readiness) and FR71 (storage connectivity at startup) are deferred to Epic 4 when Redis is introduced.

## Built-in Quality & Documentation

- Deployment guide with environment variable reference
- Readiness endpoint and storage troubleshooting documentation
- Basic tests for configuration validation
- CI/CD pipeline setup

## Stories

1. [Story 1.1: Container Build Pipeline with Hello World](story-1.1.md)
2. [Story 1.2: Environment Configuration & Validation](story-1.2.md)
3. [Story 1.3: Production Health and Readiness Endpoints](story-1.3.md)
4. [Story 1.4: Timeout and Concurrency Configuration](story-1.4.md)
