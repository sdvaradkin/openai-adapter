# Coding Conventions

**Analysis Date:** 2026-02-19

## Naming Patterns

**Files:**
- Handler functions: `[name].handler.ts` (e.g., `src/handlers/routing.handler.ts`, `src/handlers/pass-through.handler.ts`)
- Utility functions: `[name].ts` (e.g., `src/routing/router.ts`, `src/handlers/error-formatter.ts`)
- Type definitions: `types.ts` (e.g., `src/handlers/types.ts`, `src/config/types.ts`)
- Validators: `[name].validator.ts` or `[name]-validator.ts` (e.g., `src/config/validator.ts`, `src/validation/json-depth-validator.ts`)
- State management: `state.ts` (e.g., `src/config/state.ts`)
- Test files: `[name].test.ts` or `[name].spec.ts` - both patterns used (e.g., `tests/unit/config/loader.test.ts`, `tests/unit/handlers/error-formatter.spec.ts`)

**Functions:**
- camelCase for function names
- PascalCase for class names and factory functions that return instances
- Factory functions prefixed with `create` (e.g., `createRoutingHandler`, `createPassThroughHandler`)
- Getter/query methods use `is`, `has`, `get` prefixes (e.g., `isValidationError`, `hasModel`, `getTargetApi`)
- Async functions use `load` or `validate` prefixes for clarity (e.g., `loadConfiguration`, `loadModelMappingFile`, `loadEnvConfig`)

**Variables:**
- camelCase for all variables (e.g., `activeConnections`, `maxConnections`, `testDir`)
- Constants use UPPER_SNAKE_CASE (e.g., `MAX_DEPTH`, `VALID_API_TYPES`)
- Private class properties use underscore prefix with camelCase (e.g., `private readonly mapping`, `private readonly modelMapper`)
- Unused function parameters prefixed with underscore (e.g., `_reply`, `_key`)

**Types:**
- PascalCase for all type names (e.g., `ValidationError`, `RoutingResult`, `ErrorResponse`)
- Types ending with `Response` for API response objects
- Types ending with `Config` for configuration objects
- Union types use descriptive names (e.g., `RoutingDecision = 'pass-through' | 'translate'`)
- Type constants use UPPER_SNAKE_CASE (e.g., `VALIDATION_ERROR_TYPES`, `VALID_API_TYPES`)

## Code Style

**Formatting:**
- Tool: Prettier 3.2.5
- Settings in `.prettierrc`:
  - Single quotes: `"singleQuote": true`
  - Trailing commas: `"trailingComma": "es5"`
  - Print width: 100 characters

**Linting:**
- Tool: ESLint 8.57.0 with @typescript-eslint/parser
- Config: `.eslintrc.json`
- Key rules:
  - `@typescript-eslint/recommended` - Enforces TypeScript best practices
  - `@typescript-eslint/no-unused-vars` - Error on unused variables, except those prefixed with `_`
  - ESLint + Prettier integration (prettier config extends eslint-config-prettier)

**TypeScript:**
- Strict mode enabled in `tsconfig.json`
- Target: ES2022
- Module format: NodeNext (ESM)
- All files use `.js` extensions in imports (e.g., `import { loadConfiguration } from './config/loader.js';`)

## Import Organization

**Order:**
1. External dependencies/Node built-ins first (e.g., `import Fastify from 'fastify'`, `import { readFile } from 'node:fs/promises'`)
2. Internal type imports with `type` keyword (e.g., `import type { AdapterConfig } from './config/types.js'`)
3. Internal default imports
4. Internal named imports

**Path Aliases:**
- No path aliases configured
- Use relative paths with explicit `.js` extensions

**Example from `src/index.ts`:**
```typescript
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { pathToFileURL } from 'node:url';
import type { AdapterConfig } from './config/types.js';
import { loadConfiguration } from './config/loader.js';
import { getHealth, getReadiness } from './handlers/health.js';
```

## Error Handling

**Patterns:**
- Custom `ValidationError` class for validation failures (in `src/types/validation-errors.ts`)
- ValidationError constructor: `new ValidationError(type, message, source='adapter_error')`
- Type guard function: `isValidationError(error)` - always use this before accessing ValidationError properties
- Error types defined as constants in `VALIDATION_ERROR_TYPES` object
- Use `instanceof Error` checks before accessing `.message` property on generic errors
- Wrap third-party library errors with contextual messages

**Example from `src/handlers/routing.handler.ts`:**
```typescript
if (isValidationError(error)) {
  const errorResponse = formatValidationError(error, request.id);
  return reply.code(400).send(errorResponse);
}
```

**Example from `src/config/loader.ts`:**
```typescript
if (error instanceof Error) {
  if ('code' in error && error.code === 'ENOENT') {
    throw new Error(`Model mapping file not found at path: ${filePath}...`);
  }
}
```

## Logging

**Framework:** Fastify's built-in pino logger

**Patterns:**
- Access logger via `request.log` in route handlers
- Use structured logging with object payloads: `request.log.info({ action: 'routing_decision', model: ... })`
- Log levels: `info` (default), `warn` (warnings), `error` (errors), `debug` (detailed info)
- Include `action` field for tracing operation flows
- Silence logs for health/readiness endpoints: `request.log.level = 'silent'`
- Use JSON format for console output in production, pretty format optional via `LOG_PRETTY=1`

**Example from `src/index.ts`:**
```typescript
request.log.info({
  action: 'routing_decision',
  endpoint,
  model: routingResult.model,
  source_format: routingResult.sourceFormat,
  target_format: routingResult.targetFormat,
  decision: routingResult.decision
});
```

## Comments

**When to Comment:**
- JSDoc comments on all exported functions and classes
- JSDoc on public methods and properties
- Inline comments for non-obvious logic or complex algorithms
- Comments explaining "why" not "what" - code should be self-documenting for simple operations

**JSDoc/TSDoc:**
- Format: Use `/** ... */` style
- Include `@param` for parameters with type and description
- Include `@returns` for return type and description
- Include `@throws` for errors that can be thrown
- Use full descriptions (not abbreviations)

**Example from `src/routing/router.ts`:**
```typescript
/**
 * Extract model name from request body
 * Works for both response and chat_completions formats
 * Both formats have model at request.body.model
 * @param body The request body
 * @returns The model name
 * @throws Error if model field is missing or invalid
 */
extractModel(body: unknown): string {
```

**Example from `src/validation/json-depth-validator.ts`:**
```typescript
/**
 * Calculate the maximum nesting depth of a JSON object
 * Depth counting: primitives = 0, { prop: primitive } = 1, { prop: { nested: primitive } } = 2, etc.
 * @param obj The object to analyze
 * @returns The maximum nesting depth
 */
function calculateMaxDepth(obj: unknown): number {
```

## Function Design

**Size:**
- Most functions 10-50 lines
- Longer functions (100+ lines) broken into smaller helper functions
- Example: `loadConfiguration` in `src/config/loader.ts` orchestrates multiple steps but delegates to helper functions

**Parameters:**
- Prefer simple parameters over large configuration objects when count < 3
- Use object parameters for functions with 4+ parameters
- Use readonly/const patterns to prevent accidental mutation

**Return Values:**
- Functions return typed values (no implicit `any`)
- Async functions return `Promise<T>` with explicit type
- Factory functions return instances with explicit typing
- Void returns for side-effect-only functions (e.g., logging)

**Example from `src/config/loader.ts`:**
```typescript
export function parseIntegerEnvVar(
  value: string | undefined,
  variableName: string,
  defaultValue: number,
  minValue: number = 1
): number {
```

## Module Design

**Exports:**
- Use named exports for functions and classes
- Use `export type` for type-only exports to reduce bundle size
- Module-level functions are pure when possible
- Classes used for encapsulation and state management

**Barrel Files:**
- Not used - import directly from source files
- Example: `import { loadConfiguration } from './config/loader.js'` not from `./config/index.js`

**Example from `src/routing/router.ts` - class-based module:**
```typescript
export class Router {
  constructor(private readonly modelMapper: ModelMapper) {}

  detectSourceFormat(path: string): ApiType { ... }
  extractModel(body: unknown): string { ... }
  validateModel(model: string): void { ... }
  routingDecision(path: string, body: unknown): RoutingResult { ... }
}
```

**Example from `src/handlers/error-formatter.ts` - function-based module:**
```typescript
export interface ErrorResponse { ... }

export function formatValidationError(
  validationError: ValidationError,
  requestId: string
): ErrorResponse { ... }

export function isValidationErrorResponse(error: unknown): error is ValidationError { ... }
```

## Type Patterns

**Type Guards:**
- Use `error instanceof ValidationError` for custom error types
- Use `typeof value !== 'object' || value === null` for null checks
- Create dedicated type guard functions for complex checks
- Always check `error instanceof Error` before accessing `.message` on caught errors

**Example from `src/types/validation-errors.ts`:**
```typescript
export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}
```

**Immutability:**
- Use `readonly` for properties that should not change
- Use `as const` for literal type inference on constants
- Constructor parameters are often assigned directly to `readonly` properties

---

*Convention analysis: 2026-02-19*
