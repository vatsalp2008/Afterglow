import { defineConfig, devices } from '@playwright/test';

const PORT = 4391;
const isCI = Boolean(process.env['CI']);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Locally, use the installed Chrome instead of downloading a browser; CI installs Playwright's Chromium.
        ...(isCI ? {} : { channel: 'chrome' }),
        // Software WebGL, so rendering works the same on GPU-less CI machines.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    // Serves the production build; turbo runs `build` before `test:e2e`.
    command: `pnpm exec vite preview --host 127.0.0.1 --port ${String(PORT)} --strictPort`,
    url: `http://127.0.0.1:${String(PORT)}`,
    reuseExistingServer: !isCI,
  },
});
