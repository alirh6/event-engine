import { defineConfig } from 'vitest/config';

// Engine-only test configuration. The dashboard (client/) has its own
// vitest.config.ts with the `@/` alias; this include keeps `npm test` at the
// repository root from reaching into it.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
