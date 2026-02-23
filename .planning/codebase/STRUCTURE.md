# Codebase Structure

**Analysis Date:** 2026-02-19

## Directory Layout

```
openai-adapter/
├── src/                           # Main application source code
│   ├── config/                    # Configuration loading and validation
│   ├── handlers/                  # HTTP request handlers
│   ├── routing/                   # Routing logic and model mapping
│   ├── translation/               # Translation engine and utilities
│   ├── types/                     # Shared type definitions
│   ├── validation/                # Input validation constraints
│   └── index.ts                   # Server startup and initialization
├── tests/                         # Test suite (mirrors src structure)
│   ├── unit/                      # Unit tests
│   ├── integration/               # Integration and e2e tests
│   └── *.ts                       # Shared test utilities
├── config/                        # Configuration files
├── dist/                          # Compiled JavaScript (generated)
├── docs/                          # Documentation
├── .planning/                     # GSD planning documents
├── .github/                       # GitHub workflows and metadata
├── package.json                   # Node.js dependencies and scripts
├── tsconfig.json                  # TypeScript configuration
├── vitest.config.ts              # Unit test configuration
└── vitest.integration.config.ts  # Integration test configuration
```

## Directory Purposes

**src/config:**
- Purpose: Load and validate configuration from environment and files
- Contains: Configuration types, environment parser, model mapping loader, validator
- Key files:
  - `loader.ts` - Main entry point for configuration loading
  - `types.ts` - AdapterConfig interface and ModelMapping type
  - `validator.ts` - Model mapping validation
  - `state.ts` - Global configuration state for readiness probe

**src/handlers:**
- Purpose: HTTP request handlers (middleware-like functions)
- Contains: Routing dispatch, pass-through forwarding, error formatting, health checks
- Key files:
  - `routing.handler.ts` - Main request dispatcher (validation → routing → execution)
  - `pass-through.handler.ts` - Forward requests to OpenAI API
  - `translation.handler.ts` - Orchestrate translation operations
  - `error-formatter.ts` - Format validation errors to responses
  - `health.ts` - Liveness and readiness probes

**src/routing:**
- Purpose: Routing decision logic
- Contains: Request format detection, model mapping lookup, routing decisions
- Key files:
  - `router.ts` - Class that makes routing decisions
  - `model-mapper.ts` - Maps model names to target API types

**src/translation:**
- Purpose: Transform requests/responses between API formats
- Contains: Chat Completions ↔ Response API translation
- Structure:
  - `index.ts` - Module exports
  - `types.ts` - Translation types and interfaces
  - `chat-to-response/` - Chat Completions → Response API translation
    - `request.ts` - Translation logic and validation
    - `types.ts` - Translation result types
  - `utils/` - Translation support utilities
    - `translation-logger.ts` - Structured logging for translation events
    - `unknown-fields.ts` - Unknown field detection and handling
    - `round-trip-tester.ts` - Test translation reversibility

**src/types:**
- Purpose: Shared type definitions used across modules
- Contains: Validation error types, error constants
- Key files:
  - `validation-errors.ts` - ValidationError class and error type constants

**src/validation:**
- Purpose: Input constraint validation
- Contains: Validators for payload size, JSON depth
- Key files:
  - `json-depth-validator.ts` - Validate JSON nesting depth
  - `payload-size-validator.ts` - Validate request size (enforced by Fastify)

**tests/unit:**
- Purpose: Unit tests for individual functions/classes
- Mirrors src structure: tests/unit/{module}/
- Contains:
  - `config/` - Configuration loading and validation tests
  - `handlers/` - Handler logic tests
  - `routing/` - Router and ModelMapper tests
  - `translation/` - Translation logic tests
  - `validation/` - Validation logic tests

**tests/integration:**
- Purpose: Integration tests with mock OpenAI server
- Contains:
  - `smoke/` - Basic functionality tests
  - `regression/` - Behavior preservation tests
  - `translation/` - Translation integration tests
  - `*.spec.ts` - Validation flow tests

**config:**
- Purpose: Configuration files (JSON model mappings, etc.)
- Contains: Example model mapping files used by tests

**docs:**
- Purpose: Documentation (API specs, design decisions, etc.)
- Contains: Reference materials and design documentation

## Key File Locations

**Entry Points:**
- `src/index.ts`: Server builder (`buildServer()`) and startup (`startServer()`)
- `src/handlers/routing.handler.ts`: Main request router for POST endpoints
- `src/handlers/health.ts`: Health and readiness probes

**Configuration:**
- `src/config/loader.ts`: Load and parse configuration
- `src/config/types.ts`: Configuration type definitions
- `tsconfig.json`: TypeScript compilation settings

**Core Logic:**
- `src/routing/router.ts`: Routing decision algorithm
- `src/translation/chat-to-response/request.ts`: Translation implementation
- `src/handlers/pass-through.handler.ts`: OpenAI API forwarding

**Testing:**
- `tests/unit/`: Unit test suite (mirrors src/)
- `tests/integration/`: Integration tests with real server
- `vitest.config.ts`: Test runner configuration
- `vitest.integration.config.ts`: Integration test configuration

## Naming Conventions

**Files:**
- Handler files: `.handler.ts` suffix (e.g., `routing.handler.ts`, `translation.handler.ts`)
- Spec/test files: `.spec.ts` or `.test.ts` suffix
- Index files: `index.ts` for module exports
- Types-only files: No special suffix, convention is `types.ts`
- Utilities: `utils/` prefix directory with descriptive name

**Directories:**
- Feature directories: Lowercase hyphenated (e.g., `chat-to-response`, `json-depth`)
- Module directories: Lowercase plural (e.g., `handlers`, `utils`, `tests`)

**Functions:**
- Handler creators: `create*Handler()` (e.g., `createRoutingHandler()`)
- Classes: PascalCase (e.g., `Router`, `ModelMapper`, `ValidationError`)
- Regular functions: camelCase
- Type guards: `is*()` prefix (e.g., `isValidationError()`)

**Variables:**
- Configuration: camelCase (e.g., `modelMapping`, `targetUrl`)
- Endpoints: kebab-case in paths, camelCase in strings
- Error types: UPPER_CASE constants (e.g., `VALIDATION_ERROR_TYPES.INVALID_MODEL_FIELD`)

**Types:**
- Interfaces: PascalCase (e.g., `AdapterConfig`, `RoutingResult`)
- Unions: PascalCase or descriptive (e.g., `ApiType`, `RoutingDecision`)
- Enums: Not used; use const objects or unions
- Type aliases: PascalCase (e.g., `ModelMapping`)

## Where to Add New Code

**New Feature (e.g., Response → Chat translation):**
- Primary code: `src/translation/response-to-chat/request.ts`
- Types: `src/translation/response-to-chat/types.ts`
- Utilities: Add to `src/translation/utils/` if new helpers needed
- Tests: `tests/unit/translation/response-to-chat.spec.ts`
- Integration: `tests/integration/translation/response-to-chat.test.ts`

**New Handler (e.g., webhook processing):**
- Implementation: `src/handlers/{name}.handler.ts`
- Types: Inline or in `src/handlers/types.ts` if shared
- Tests: `tests/unit/handlers/{name}.spec.ts`
- Register: Add route in `src/index.ts` buildServer()

**New Validation Constraint:**
- Implementation: `src/validation/{name}-validator.ts`
- Types: Define in file or reference from `src/types/validation-errors.ts`
- Tests: `tests/unit/validation/{name}-validator.spec.ts`
- Call from: `src/handlers/routing.handler.ts` (early in request pipeline)

**New Utility Module:**
- Implementation: `src/{feature}/utils/{name}.ts`
- Tests: `tests/unit/{feature}/utils/{name}.spec.ts`
- Export from: `src/{feature}/index.ts` (barrel file)

**Configuration Changes:**
- Types: Add to `src/config/types.ts` AdapterConfig interface
- Loading: Add parsing in `src/config/loader.ts` loadConfiguration()
- Validation: Add check in `src/config/validator.ts` validateModelMapping()

## Special Directories

**dist/:**
- Purpose: Compiled JavaScript output
- Generated: Yes, by `npm run build` (tsc)
- Committed: No
- Content: Mirrors src/ structure after TypeScript compilation

**node_modules/:**
- Purpose: Dependencies
- Generated: Yes, by `npm install`
- Committed: No

**.planning/codebase/:**
- Purpose: GSD planning documents
- Generated: No (manually created by analysis tools)
- Committed: Yes

**.github/workflows/:**
- Purpose: CI/CD pipeline definitions
- Contains: GitHub Actions workflow YAML files
- Committed: Yes

**config/:**
- Purpose: Configuration files for running the adapter
- Contains: Example model mappings (JSON files)
- Committed: Yes (examples), No (runtime configs with secrets)

---

*Structure analysis: 2026-02-19*
