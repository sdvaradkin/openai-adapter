# Story 1.2: Environment Configuration & Validation

**Epic:** [Epic 1: Deploy & Operate the Adapter](epic-1.md)

## User Story

**As a** DevOps engineer,  
**I want** the adapter to load and validate configuration from environment variables and files at startup,  
**So that** I get immediate feedback on configuration errors before accepting traffic.

## Acceptance Criteria

**Given** the container is starting with all required environment variables  
**When** configuration loads using env-schema  
**Then** `ADAPTER_TARGET_URL` is loaded and validated as a valid HTTP/HTTPS URL  
**And** `MODEL_API_MAPPING_FILE` is loaded and validated as a file path  
**And** the adapter proceeds to load the mapping file


**Given** model-to-API mapping file is provided via `MODEL_API_MAPPING_FILE` environment variable  
**When** the file path points to a valid, readable file  
**Then** the file is loaded successfully  
**And** the file is parsed as JSON

**When** the mapping file contains valid JSON matching the schema:
```json
{
  "model-name-1": "response" | "chat_completions",
  "model-name-2": "response" | "chat_completions"
}
```
**Then** the mapping is validated successfully  
**And** each model name (key) is validated as unique  
**And** each API type value is validated as either "response" or "chat_completions" (no other values allowed)

**When** any required environment variable is missing (`ADAPTER_TARGET_URL` or `MODEL_API_MAPPING_FILE`)  
**Then** the container fails startup within 5 seconds  
**And** logs clearly identify which variable is missing  
**And** the error message includes resolution guidance

**When** `ADAPTER_TARGET_URL` is not a valid HTTP/HTTPS URL  
**Then** startup fails with error identifying the invalid URL format  
**And** provides example of valid format (e.g., "https://api.openai.com/v1")

**When** `MODEL_API_MAPPING_FILE` points to a non-existent file  
**Then** startup fails with error indicating the file cannot be found  
**And** specifies the exact path that was checked

**When** `MODEL_API_MAPPING_FILE` points to an unreadable file  
**Then** startup fails with permission/access error  
**And** indicates the file permissions issue

**When** the mapping file contains invalid JSON  
**Then** startup fails with JSON parsing error details  
**And** indicates the line/position of the JSON error if available

**When** the mapping file contains invalid API type values (not "response" or "chat_completions")  
**Then** startup fails listing the invalid values and their model names  
**And** specifies the allowed values: "response" or "chat_completions"

**When** the mapping file contains duplicate model names (keys)  
**Then** startup fails indicating duplicate key error  
**And** lists the duplicate model name(s)

**And** all configuration errors are logged as structured JSON with error level  
**And** the process exits with non-zero exit code on configuration failure  
**And** validation completes before the HTTP server starts accepting connections

## Technical Notes

This story implements the core configuration surface required for the adapter to operate. The model-to-API mapping determines routing behavior and must be validated thoroughly at startup to prevent runtime errors.

**API Key Handling:** The adapter operates as a transparent proxy. API keys come from client applications via the `Authorization` header and are passed through to OpenAI without being stored or managed by the adapter (per PRD Security & Authentication section).

**Configuration File Approach:** The mapping is stored in a JSON file (not inline in env var) to support version control, readability, and growing model lists. The file can be mounted via volumes, baked into images, or injected by deployment systems.

## Requirements Fulfilled

- FR21: Load configuration from environment variables at startup
- FR22: Validate target URL format
- FR23: Validate required environment variables are present
- FR24: Fail startup with clear error messages when configuration invalid
- FR25: Accept model-to-API mapping configuration
- FR26: Validate model names from incoming requests against configured mapping (validation structure only, request-time validation in Epic 2)
