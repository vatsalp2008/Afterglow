import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4391;
const isCI = Boolean(process.env['CI']);
const handVideo = fileURLToPath(new URL('./e2e/assets/hand-640x480.mjpeg', import.meta.url));
// Software WebGL, so rendering works on GPU-less CI machines.
const softwareGl = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // CI renders WebGL in software and stalls for seconds at a time; tests in parallel starve each other.
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Locally, use the installed Chrome instead of downloading a browser; CI installs Playwright's Chromium.
    ...(isCI ? {} : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /camera\.spec\.ts/,
      use: { launchOptions: { args: softwareGl } },
    },
    {
      name: 'camera',
      testMatch: /camera\.spec\.ts/,
      // Each test runs MediaPipe on the GPU; side by side they starve each other of frames.
      fullyParallel: false,
      use: {
        permissions: ['camera'],
        launchOptions: {
          args: [
            ...(isCI ? softwareGl : []),
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${handVideo}`,
          ],
        },
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
