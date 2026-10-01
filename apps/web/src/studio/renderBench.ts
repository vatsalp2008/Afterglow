// The render benchmark (?bench=render): how much each frame costs as the canvas fills
// up, what an eraser gesture and a growing live stroke cost, and how long ink takes to
// reach the screen. See docs/benchmarks.md.

import { percentile } from './telemetry';

/** Frames slower than this miss 60 Hz with some margin. */
export const SLOW_FRAME_MS = 20;

export interface FrameSamples {
  /** Time between animation frames, ms. */
  interval: number[];
  /** CPU time spent in each frame, ms. */
  cost: number[];
}

export interface SceneResult {
  strokes: number;
  /** Animation-frame interval; capped by the display, so it shows when frames are missed, not headroom. */
  intervalP50: number | null;
  intervalP95: number | null;
  /** Share of frames slower than SLOW_FRAME_MS. */
  slowShare: number;
  /** CPU time per frame. */
  costP50: number | null;
  costP95: number | null;
  /** CPU plus GPU time per frame: render, then wait for the GPU to finish. The real headroom. */
  syncedP50: number | null;
  syncedP95: number | null;
  calls: number;
  triangles: number;
  geometries: number;
}

export interface EraseResult {
  steps: number;
  strokesBefore: number;
  strokesAfter: number;
  /** Time to erase one step and swap in the pieces, ms. */
  eraseP50: number | null;
  eraseP95: number | null;
  /** CPU time of the frames that follow, which rebuild the changed geometry, ms. */
  frameP95: number | null;
}

export interface LiveResult {
  points: number;
  /** Median time to rebuild a live stroke of this length, which happens once per input frame, ms. */
  rebuildMs: number;
}

export interface SparksResult {
  particles: number;
  /** Median CPU time to move every particle and upload them, per frame, ms. */
  updateMs: number;
}

export interface LatencyResult {
  source: string;
  samples: number;
  p50: number | null;
  p95: number | null;
}

export interface RenderBenchResult {
  environment: Record<string, unknown>;
  scenes: SceneResult[];
  erase: EraseResult | null;
  live: LiveResult[];
  sparks: SparksResult | null;
  latency: LatencyResult | null;
}

export function summarizeScene(
  strokes: number,
  free: FrameSamples,
  synced: FrameSamples,
  counts: { calls: number; triangles: number; geometries: number },
): SceneResult {
  return {
    strokes,
    intervalP50: percentile(free.interval, 50),
    intervalP95: percentile(free.interval, 95),
    slowShare: free.interval.length ? free.interval.filter((v) => v > SLOW_FRAME_MS).length / free.interval.length : 0,
    costP50: percentile(free.cost, 50),
    costP95: percentile(free.cost, 95),
    syncedP50: percentile(synced.cost, 50),
    syncedP95: percentile(synced.cost, 95),
    ...counts,
  };
}

export function median(values: readonly number[]): number {
  return percentile(values, 50) ?? 0;
}
