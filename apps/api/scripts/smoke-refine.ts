// Refine against the real model, through the same /refine code the studio calls
// (ADR 0016): checks the request format against the live API and measures latency.
//
//   pnpm --filter @afterglow/api smoke:refine                one refine of a sketched house
//   pnpm --filter @afterglow/api smoke:refine -- --runs 10   latency over ten
//
// Needs GEMINI_API_KEY in apps/api/.env. Each run is one request on your Gemini quota.

import { deflateSync, crc32 } from 'node:zlib';
import { appFromEnv } from '../src/app.ts';

const SIZE = 512;

/** A house, roughly, as the studio would send it: dark strokes on white. */
const SKETCH: Array<Array<[number, number]>> = [
  [
    [130, 430],
    [128, 250],
    [256, 120],
    [384, 248],
    [386, 432],
    [130, 430],
  ],
  [
    [220, 430],
    [222, 330],
    [290, 332],
    [292, 430],
  ],
  [
    [150, 260],
    [362, 262],
  ],
];

function segmentDistance(px: number, py: number, [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** An 8-bit grayscale PNG of the sketch, lines about 6 px wide. */
function sketchPng(): Uint8Array {
  const rows: Buffer[] = [];
  for (let y = 0; y < SIZE; y++) {
    const row = Buffer.alloc(SIZE + 1);
    for (let x = 0; x < SIZE; x++) {
      let d = Infinity;
      for (const stroke of SKETCH) {
        for (let i = 1; i < stroke.length; i++)
          d = Math.min(d, segmentDistance(x + 0.5, y + 0.5, stroke[i - 1]!, stroke[i]!));
      }
      row[x + 1] = Math.round(255 * Math.min(1, Math.max(0, d - 2.5)));
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(0, 9); // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const runsArg = process.argv.indexOf('--runs');
const runs = runsArg >= 0 ? Number(process.argv[runsArg + 1]) : 1;
if (!process.env['GEMINI_API_KEY']) {
  console.error('No GEMINI_API_KEY: put it in apps/api/.env (see .env.example).');
  process.exit(1);
}

const app = appFromEnv(process.env);
const png = sketchPng();
const times: number[] = [];
for (let i = 1; i <= runs; i++) {
  const t0 = performance.now();
  const res = await app.request(
    '/refine',
    { method: 'POST', headers: { 'content-type': 'image/png' }, body: png },
    { remoteAddress: 'smoke' },
  );
  const ms = performance.now() - t0;
  const body = (await res.json()) as {
    title?: string;
    paths?: unknown[];
    attempts?: number;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    console.error(`run ${String(i)}: ${String(res.status)} ${body.error ?? ''}: ${body.message ?? ''}`);
    process.exit(1);
  }
  times.push(ms);
  console.log(
    `run ${String(i)}: ${ms.toFixed(0)} ms, "${body.title ?? ''}", ${String(body.paths?.length ?? 0)} paths, ${String(body.attempts)} attempt(s)`,
  );
}
if (runs > 1) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  console.log(`p50 ${at(0.5).toFixed(0)} ms, p95 ${at(0.95).toFixed(0)} ms over ${String(runs)} runs`);
}
