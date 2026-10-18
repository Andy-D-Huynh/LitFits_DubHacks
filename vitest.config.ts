import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'fixtures/**/*.test.ts',
      'apps/web/lib/**/*.test.ts',
      'apps/extension/src/**/*.test.ts',
    ],
  },
});
