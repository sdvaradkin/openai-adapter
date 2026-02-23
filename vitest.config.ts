import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/integration/smoke/**',
      '**/tests/integration/regression/**',
      '**/tests/integration/translation/conversation-history.test.ts'
    ],
    environment: 'node',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['dist/**', 'tests/**', '*.config.*']
    }
  }
});
