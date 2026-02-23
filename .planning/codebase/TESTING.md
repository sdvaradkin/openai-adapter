# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**
- Vitest 1.5.3
- Config: `vitest.config.ts` (unit tests), `vitest.integration.config.ts` (integration tests)

**Assertion Library:**
- Built-in vitest assertions via `expect()`

**Run Commands:**
```bash
npm test                          # Run all unit tests once
npm run test:unit                 # Run only unit tests
npm run test:watch                # Run tests in watch mode (interactive)
npm run test:smoke                # Run smoke tests against Docker container
npm run test:regression           # Run regression tests against Docker container
npm run test:integration          # Run both smoke and regression tests
npm run test:all                  # Run unit + integration tests
npm run test:ci                   # Full CI pipeline (lint + build + integration)
npm run lint                      # Check code style with ESLint
npm run format                    # Auto-format with Prettier
```

## Test File Organization

**Location:**
- Unit tests co-located by feature in `tests/unit/` directory
- Integration tests in `tests/integration/` organized by test type
- Mirrored structure follows `src/` organization

**Naming:**
- Both `.test.ts` and `.spec.ts` suffixes used (pattern is flexible)
- Examples: `loader.test.ts`, `error-formatter.spec.ts`, `router.spec.ts`

**Structure:**
```
tests/
├── unit/
│   ├── config/
│   │   ├── file-loader.test.ts
│   │   ├── loader.test.ts
│   │   ├── timeout-concurrency.test.ts
│   │   ├── validation-limits.test.ts
│   │   └── validator.test.ts
│   ├── handlers/
│   │   └── error-formatter.spec.ts
│   ├── routing/
│   │   ├── model-mapper.spec.ts
│   │   └── router.spec.ts
│   ├── translation/
│   │   └── chat-to-response-request.test.ts
│   ├── validation/
│   │   ├── json-depth-validator.spec.ts
│   │   ├── payload-size-validator.spec.ts
│   │   └── validation-errors.spec.ts
│   └── server.test.ts
└── integration/
    ├── smoke/
    │   └── smoke.test.ts
    ├── regression/
    │   ├── concurrency-limiting.test.ts
    │   ├── health-readiness.test.ts
    │   ├── regression.test.ts
    │   └── timeout-concurrency.test.ts
    ├── translation/
    │   └── chat-to-response.test.ts
    └── pass-through.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Feature Name', () => {
  describe('Nested feature context', () => {
    it('should do the expected behavior', () => {
      // Arrange
      const input = 'test';

      // Act
      const result = functionUnderTest(input);

      // Assert
      expect(result).toBe('expected');
    });

    it('should handle error case', () => {
      expect(() => functionUnderTest(null)).toThrow(/error message/);
    });
  });
});
```

**Patterns:**

**Setup/Teardown:**
- `beforeEach` - Reset state before each test (e.g., restore environment, create temp directories)
- `afterEach` - Clean up after each test (e.g., remove temp files, restore mocks)
- `beforeAll` - One-time setup for test suite (e.g., start Docker container)
- `afterAll` - One-time cleanup after all tests (e.g., stop Docker container)

**Example from `tests/unit/config/file-loader.test.ts`:**
```typescript
describe('loadModelMappingFile', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `test-config-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should load and parse valid JSON file', async () => {
    const filePath = join(testDir, 'mapping.json');
    await writeFile(filePath, JSON.stringify({ 'gpt-4': 'response' }));

    const result = await loadModelMappingFile(filePath);

    expect(result).toEqual({ 'gpt-4': 'response' });
  });
});
```

**Assertion Pattern:**
- Single assertion or grouped assertions focused on one behavior per test
- Use `.toThrow()` with regex matcher to validate error messages
- Use `.rejects.toThrow()` for async errors
- Validate both success and error paths

**Example from `tests/unit/config/validator.test.ts`:**
```typescript
it('should specify allowed values in error message', () => {
  const mapping = { 'gpt-4': 'wrong' };

  try {
    validateModelMapping(mapping);
    expect.fail('Should have thrown');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('response');
    expect((error as Error).message).toContain('chat_completions');
  }
});
```

## Mocking

**Framework:** No external mocking library - vitest provides `vi` object

**Patterns:**
- Manual mocks via test setup functions
- Fixture creation for test data
- Environment variable manipulation via `beforeEach`/`afterEach`

**Example from `tests/unit/config/timeout-concurrency.test.ts`:**
```typescript
const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  process.env.ADAPTER_TARGET_URL = 'https://api.openai.com/v1';
  process.env.MODEL_API_MAPPING_FILE = '/app/config/model-mapping.json';
});

afterEach(() => {
  process.env = originalEnv;
});
```

**What to Mock:**
- Environment variables (use `beforeEach` to save/restore)
- Filesystem operations (use `node:fs/promises` with temporary directories)
- Process state (restore after each test)

**What NOT to Mock:**
- Core library functions (Fastify, pino logger) - use real instances
- Type constructors (ValidationError) - use real instances
- Pure functions - call directly
- Business logic under test - call directly

## Fixtures and Factories

**Test Data:**
- Constants defined inline in test files
- Reusable test data extracted to test setup functions

**Example from `tests/unit/handlers/error-formatter.spec.ts`:**
```typescript
it('should correctly format all defined error types', () => {
  const errorTypes = [
    { type: VALIDATION_ERROR_TYPES.PAYLOAD_TOO_LARGE, message: 'Too large' },
    { type: VALIDATION_ERROR_TYPES.JSON_DEPTH_EXCEEDED, message: 'Too deep' },
    { type: VALIDATION_ERROR_TYPES.UNKNOWN_MODEL, message: 'Unknown' },
    { type: VALIDATION_ERROR_TYPES.INVALID_MODEL_FIELD, message: 'Invalid' }
  ];

  for (const { type, message } of errorTypes) {
    const error = new ValidationError(type, message);
    const formatted = formatValidationError(error, 'id');
    expect(formatted.error.type).toBe(type);
  }
});
```

**Location:**
- Fixtures defined at top of test file
- Temporary files created in `tmpdir()` for file I/O tests
- Cleanup handled in `afterEach` hooks

## Coverage

**Requirements:** Not enforced by CI (no coverage thresholds)

**View Coverage:**
```bash
npm run test -- --coverage
```

**Configuration in `vitest.config.ts`:**
```typescript
coverage: {
  reporter: ['text', 'json', 'html'],
  exclude: ['dist/**', 'tests/**', '*.config.*']
}
```

## Test Types

**Unit Tests:**
- Location: `tests/unit/`
- Scope: Individual functions, classes, and modules
- Examples: Config validation, error formatting, routing logic
- No external services or network calls
- Run with: `npm run test:unit`

**Integration Tests:**
- Location: `tests/integration/`
- Scope: Multiple components working together or with external systems

**Smoke Tests:**
- Location: `tests/integration/smoke/smoke.test.ts`
- Scope: Docker container health checks
- What they test: Server startup, health endpoint responsiveness
- Run with: `npm run test:smoke`
- Container setup pattern:
  ```typescript
  beforeAll(async () => {
    const imageName = process.env.DOCKER_IMAGE || 'openai-adapter:test';
    container = await new GenericContainer(imageName)
      .withExposedPorts(3000)
      .withEnvironment({ /* env vars */ })
      .withWaitStrategy(Wait.forLogMessage('Server listening at'))
      .withStartupTimeout(30_000)
      .start();
  }, 60_000);

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });
  ```

**Regression Tests:**
- Location: `tests/integration/regression/`
- Scope: Known bugs and edge cases
- What they test: Concurrency limiting, timeout handling, request validation
- Run with: `npm run test:regression`
- Uses testcontainers for Docker isolation

**E2E Tests:**
- Not separate E2E test suite - integration tests serve this purpose
- Tests run against containerized instance via HTTP

## Common Patterns

**Async Testing:**
- Use `async`/`await` in test functions
- Use `.rejects` for promise rejection testing
- Set timeout for long-running tests (integration tests use `60_000` ms in config)

```typescript
it('should load configuration asynchronously', async () => {
  const config = await loadConfiguration();
  expect(config.targetUrl).toBeDefined();
});

it('should throw on missing file', async () => {
  await expect(loadModelMappingFile('/nonexistent.json')).rejects.toThrow(/not found/);
});
```

**Error Testing:**
- Wrap throws in `expect(() => ...).toThrow()`
- Test both error type and message with regex matcher
- For multiple error cases, loop through test cases

```typescript
it('should reject invalid API type', () => {
  const mapping = { 'gpt-4': 'invalid_type' };
  expect(() => validateModelMapping(mapping)).toThrow(/Invalid API type/);
  expect(() => validateModelMapping(mapping)).toThrow(/gpt-4/);
});

it('should reject multiple invalid API types and list them all', () => {
  const mapping = {
    'gpt-4': 'respond',
    'gpt-3.5': 'chat'
  };

  expect(() => validateModelMapping(mapping)).toThrow(/Invalid API type/);
  expect(() => validateModelMapping(mapping)).toThrow(/gpt-4/);
  expect(() => validateModelMapping(mapping)).toThrow(/gpt-3.5/);
});
```

**Type Testing:**
- Test type guard functions with various input types
- Verify instanceof checks work correctly

```typescript
describe('isValidationErrorResponse', () => {
  it('should return true for ValidationError instances', () => {
    const error = new ValidationError(VALIDATION_ERROR_TYPES.UNKNOWN_MODEL, 'Not found');
    expect(isValidationErrorResponse(error)).toBe(true);
  });

  it('should return false for non-Error values', () => {
    expect(isValidationErrorResponse('string')).toBe(false);
    expect(isValidationErrorResponse(42)).toBe(false);
    expect(isValidationErrorResponse(null)).toBe(false);
    expect(isValidationErrorResponse({})).toBe(false);
  });
});
```

**HTTP Testing Pattern (Integration):**
- Use built-in `fetch()` API for HTTP requests
- Test response status, headers, and JSON body
- Example from `tests/integration/smoke/smoke.test.ts`:
  ```typescript
  it('responds to health endpoint', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ status: 'ok' });
  });
  ```

---

*Testing analysis: 2026-02-19*
