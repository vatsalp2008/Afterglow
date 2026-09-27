import type { HandFrame, TrackerDelegate, TrackerMode } from '@afterglow/core';

export interface TrackerTiming {
  /** Capture time of the frame (performance timebase), or the callback time when the browser doesn't expose it. */
  captureTime: number;
  hasCaptureTime: boolean;
  /** Time the model spent on this frame. */
  inferenceMs: number;
  /** Main-thread time spent on this frame; the cost that competes with rendering. */
  mainThreadMs: number;
  /** When the result reached the main thread. */
  doneAt: number;
  /** Cumulative camera frames the browser never delivered to us (gaps in presentedFrames). */
  droppedFrames: number;
  /** Cumulative frames skipped because the tracker was still busy with the previous one. */
  skippedFrames: number;
}

export type FrameListener = (frame: HandFrame, timing: TrackerTiming) => void;

/** A source of HandFrames. The studio depends only on this interface. */
export interface HandTracker {
  readonly mode: TrackerMode;
  readonly delegate: TrackerDelegate;
  start(onFrame: FrameListener): void;
  stop(): void;
  close(): void;
}
