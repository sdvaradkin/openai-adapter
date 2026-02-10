import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/smoke.test.ts', 'tests/regression.test.ts'],
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', 'tests/**', '*.config.*']
    }
  }
});
