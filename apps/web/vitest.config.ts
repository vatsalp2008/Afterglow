import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright specs live in e2e/ and run separately.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
