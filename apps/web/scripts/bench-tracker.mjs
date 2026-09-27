// Reproduces the tracker benchmark behind ADR 0003: serves the production build,
// opens it in headless Chrome with a fake webcam showing a real hand, runs
// ?bench=tracker, prints the blocks, and saves the raw results.
//
//   pnpm --filter @afterglow/web bench:tracker            # empty scene
//   pnpm --filter @afterglow/web bench:tracker -- --stress # with 500 strokes on screen
//
// Headless Chrome uses the real GPU on macOS. Results depend on hardware; the
// saved file records the GPU, browser, and settings.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const stress = process.argv.includes('--stress');
const root = fileURLToPath(new URL('..', import.meta.url));
const handVideo = fileURLToPath(new URL('../e2e/assets/hand-640x480.mjpeg', import.meta.url));
const outDir = fileURLToPath(new URL('../../../docs/benchmarks/data/', import.meta.url));

const server = await preview({ root, preview: { host: '127.0.0.1', port: 4392, strictPort: true } });
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : 'chrome',
  headless: true,
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${handVideo}`,
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto(`http://127.0.0.1:4392/?bench=tracker${stress ? '&stress=1' : ''}`);
  await page.getByRole('button', { name: 'Start painting' }).click();
  await page.getByRole('navigation', { name: 'Tools' }).waitFor({ timeout: 60_000 });

  const panel = page.getByRole('region', { name: 'Tracker benchmark' });
  await panel.getByRole('button', { name: 'Run benchmark' }).click();
  const downloadButton = panel.getByRole('button', { name: 'Download results' });
  await downloadButton.waitFor({ timeout: 120_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const f = (v) => (v === null ? '  n/a' : v.toFixed(1).padStart(5));
  console.log(`GPU: ${result.environment.gpu}\nStrokes on screen: ${result.environment.strokes}\n`);
  console.log('tracker  fps   latency p50/p95  inference  main p50/p95  render p95  slow   skipped');
  for (const b of result.blocks) {
    console.log(
      `${b.mode.padEnd(7)} ${b.trackingFps.toFixed(1).padStart(5)}  ${f(b.latencyP50)} / ${f(b.latencyP95)}     ` +
        `${f(b.inferenceP50)}    ${f(b.mainThreadP50)} / ${f(b.mainThreadP95)}   ${f(b.renderFrameP95)}   ` +
        `${(b.slowFrameShare * 100).toFixed(1).padStart(4)}%  ${String(b.skippedFrames).padStart(4)}`,
    );
  }
  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}tracker-${stress ? 'stress-' : ''}${result.environment.recordedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nSaved ${file}`);
} finally {
  await browser.close();
  await server.close();
}
