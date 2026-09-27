import type { TrackerTiming } from '@afterglow/tracking';
import { describe, expect, it } from 'vitest';
import { BenchCollector } from './trackerBench';

const timing = (captureTime: number, doneAt: number, over: Partial<TrackerTiming> = {}): TrackerTiming => ({
  captureTime,
  hasCaptureTime: true,
  inferenceMs: 8,
  mainThreadMs: 2,
  doneAt,
  droppedFrames: 0,
  skippedFrames: 0,
  ...over,
});

describe('BenchCollector', () => {
  it('summarizes latency, rate, and main-thread cost for a block', () => {
    const c = new BenchCollector(0);
    for (let i = 0; i < 30; i++) c.onTrackerFrame(timing(i * 33, i * 33 + 12));
    const s = c.summarize('worker', 'GPU', 1000);
    expect(s).toMatchObject({ mode: 'worker', frames: 30, latencyP50: 12, mainThreadP95: 2, inferenceP50: 8 });
    expect(s.trackingFps).toBeCloseTo(30, 9);
  });

  it('counts only the drops and skips that happened during the block', () => {
    const c = new BenchCollector(0);
    c.onTrackerFrame(timing(0, 10, { droppedFrames: 4, skippedFrames: 10 }));
    c.onTrackerFrame(timing(33, 43, { droppedFrames: 6, skippedFrames: 13 }));
    expect(c.summarize('main', 'GPU', 100)).toMatchObject({ droppedFrames: 2, skippedFrames: 3 });
  });

  it('measures render jank as the share of frames over 25 ms', () => {
    const c = new BenchCollector(0);
    for (const ms of [16, 17, 16, 40]) c.onRenderFrame(ms);
    const s = c.summarize('main', 'CPU', 100);
    expect(s.slowFrameShare).toBe(0.25);
    expect(s.renderFrameP95).toBe(40);
  });
});
