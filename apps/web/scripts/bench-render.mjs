// Runs the render benchmark (?bench=render) in headless Chrome at pixel ratio 2, prints
// the results, and saves them next to the other benchmark data.
//
//   pnpm --filter @afterglow/web bench:render                 # current code
//   pnpm --filter @afterglow/web bench:render -- --label before
//
// Headless Chrome uses the real GPU on macOS; the saved file records the GPU and browser.
// Animation frames are capped at 60 Hz, so the CPU+GPU column is the one that shows headroom.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const labelAt = process.argv.indexOf('--label');
const label = labelAt > 0 ? process.argv[labelAt + 1] : null;
const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../../../docs/benchmarks/data/', import.meta.url));

const server = await preview({ root, preview: { host: '127.0.0.1', port: 4393, strictPort: true } });
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome', headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    acceptDownloads: true,
  });
  page.on('pageerror', (e) => console.error(`[page] ${e.message}`));
  await page.goto('http://127.0.0.1:4393/?bench=render');
  await page.getByRole('button', { name: 'Paint with a mouse instead' }).click();
  const panel = page.getByRole('region', { name: 'Render benchmark' });
  await panel.getByRole('button', { name: 'Run benchmark' }).click();
  const downloadButton = panel.getByRole('button', { name: 'Download results' });
  await downloadButton.waitFor({ timeout: 180_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), downloadButton.click()]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));

  const f = (v) => (v === null ? '  n/a' : v.toFixed(1).padStart(5));
  console.log(`GPU: ${result.environment.gpu}\nViewport: ${result.environment.viewport}\n`);
  console.log('strokes  frame p50/p95  slow   cpu p50/p95   cpu+gpu p50/p95  draws  triangles');
  for (const s of result.scenes) {
    console.log(
      `${String(s.strokes).padStart(7)}  ${f(s.intervalP50)} / ${f(s.intervalP95)}  ${(s.slowShare * 100).toFixed(1).padStart(4)}%  ` +
        `${f(s.costP50)} / ${f(s.costP95)}   ${f(s.syncedP50)} / ${f(s.syncedP95)}    ${String(s.calls).padStart(5)}  ${String(s.triangles).padStart(9)}`,
    );
  }
  const e = result.erase;
  if (e) {
    console.log(
      `\nerase across ${String(e.strokesBefore)} strokes (${String(e.steps)} steps, ${String(e.strokesAfter)} after): ` +
        `step p50/p95 ${f(e.eraseP50)} / ${f(e.eraseP95)} ms, following frames p95 ${f(e.frameP95)} ms`,
    );
  }
  console.log(
    `live stroke rebuild: ${result.live.map((l) => `${String(l.points)} pts ${l.rebuildMs.toFixed(2)} ms`).join(', ')}`,
  );
  if (result.sparks)
    console.log(
      `sparks: ${String(result.sparks.particles)} particles, update ${result.sparks.updateMs.toFixed(2)} ms per frame`,
    );
  const l = result.latency;
  if (l)
    console.log(`ink latency (${l.source}): p50 ${f(l.p50)} ms, p95 ${f(l.p95)} ms over ${String(l.samples)} frames`);

  mkdirSync(outDir, { recursive: true });
  const when = String(result.environment.recordedAt).slice(0, 19).replace(/[:T]/g, '-');
  const file = `${outDir}render-${label ? `${label}-` : ''}${when}.json`;
  writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nSaved ${file}`);
} finally {
  await browser.close();
  await server.close();
}
