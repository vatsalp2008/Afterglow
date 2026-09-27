// Collects per-block metrics for comparing trackers (see ADR 0003).

import type { TrackerDelegate, TrackerMode } from '@afterglow/core';
import type { TrackerTiming } from '@afterglow/tracking';
import { percentile } from './telemetry';

export interface BlockSummary {
  mode: TrackerMode;
  delegate: TrackerDelegate;
  durationMs: number;
  frames: number;
  trackingFps: number;
  latencyP50: number | null;
  latencyP95: number | null;
  inferenceP50: number | null;
  mainThreadP50: number | null;
  mainThreadP95: number | null;
  renderFrameP95: number | null;
  /** Share of rendered frames that took longer than 25 ms (visible jank at 60 Hz). */
  slowFrameShare: number;
  droppedFrames: number;
  skippedFrames: number;
}

const SLOW_FRAME_MS = 25;

export class BenchCollector {
  private latency: number[] = [];
  private inference: number[] = [];
  private mainThread: number[] = [];
  private renderIntervals: number[] = [];
  private firstDropped: number | null = null;
  private firstSkipped: number | null = null;
  private lastDropped = 0;
  private lastSkipped = 0;

  constructor(private readonly startedAt: number) {}

  onTrackerFrame(t: TrackerTiming): void {
    this.latency.push(t.doneAt - t.captureTime);
    this.inference.push(t.inferenceMs);
    this.mainThread.push(t.mainThreadMs);
    this.firstDropped ??= t.droppedFrames;
    this.firstSkipped ??= t.skippedFrames;
    this.lastDropped = t.droppedFrames;
    this.lastSkipped = t.skippedFrames;
  }

  onRenderFrame(intervalMs: number): void {
    this.renderIntervals.push(intervalMs);
  }

  summarize(mode: TrackerMode, delegate: TrackerDelegate, now: number): BlockSummary {
    const durationMs = now - this.startedAt;
    const slow = this.renderIntervals.filter((ms) => ms > SLOW_FRAME_MS).length;
    return {
      mode,
      delegate,
      durationMs,
      frames: this.latency.length,
      trackingFps: durationMs > 0 ? (this.latency.length * 1000) / durationMs : 0,
      latencyP50: percentile(this.latency, 50),
      latencyP95: percentile(this.latency, 95),
      inferenceP50: percentile(this.inference, 50),
      mainThreadP50: percentile(this.mainThread, 50),
      mainThreadP95: percentile(this.mainThread, 95),
      renderFrameP95: percentile(this.renderIntervals, 95),
      slowFrameShare: this.renderIntervals.length > 0 ? slow / this.renderIntervals.length : 0,
      droppedFrames: this.lastDropped - (this.firstDropped ?? 0),
      skippedFrames: this.lastSkipped - (this.firstSkipped ?? 0),
    };
  }
}
