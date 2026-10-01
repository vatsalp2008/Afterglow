// Replays a recorded session through the same HandTracker interface as the
// camera trackers, at its original timing. Used to inspect fixtures in the
// studio and to drive end-to-end tests with deterministic hand input.

import type { SessionRecording } from '@afterglow/core';
import type { FrameListener, HandTracker } from './types';

export interface Scheduler {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

const browserScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle);
  },
};

/**
 * A frame delivered this late means the page stalled (seconds of shader compilation on
 * software WebGL, say). Playback then resumes from that moment instead of replaying the
 * stalled stretch in a burst, which would pass through whole gestures too fast to see.
 */
export const STALL_MS = 250;

export interface FixtureTrackerOptions {
  /** Start over after the last frame. */
  loop?: boolean;
  /** Called once when playback reaches the end (never, when looping). */
  onEnd?: () => void;
  scheduler?: Scheduler;
}

export class FixtureTracker implements HandTracker {
  readonly mode = 'fixture' as const;
  readonly delegate = 'none' as const;
  private readonly scheduler: Scheduler;
  private handle: number | null = null;
  private index = 0;
  private startedAt = 0;
  private frameId = 0;

  constructor(
    private readonly recording: SessionRecording,
    private readonly opts: FixtureTrackerOptions = {},
  ) {
    this.scheduler = opts.scheduler ?? browserScheduler;
  }

  start(onFrame: FrameListener): void {
    this.stop();
    this.index = 0;
    this.startedAt = this.scheduler.now();
    this.scheduleNext(onFrame);
  }

  stop(): void {
    if (this.handle !== null) this.scheduler.clearTimeout(this.handle);
    this.handle = null;
  }

  close(): void {
    this.stop();
  }

  private scheduleNext(onFrame: FrameListener): void {
    const frames = this.recording.frames;
    let frame = frames[this.index];
    if (!frame) {
      const last = frames[frames.length - 1];
      if (!this.opts.loop || !last) {
        this.handle = null;
        this.opts.onEnd?.();
        return;
      }
      // Continue one typical frame interval after the last frame.
      const interval = this.recording.meta.fps > 0 ? 1000 / this.recording.meta.fps : 33;
      this.startedAt += last.captureTime + interval;
      this.index = 0;
      frame = frames[0]!;
    }
    let due = this.startedAt + frame.captureTime;
    const current = frame;
    this.handle = this.scheduler.setTimeout(
      () => {
        const doneAt = this.scheduler.now();
        if (doneAt - due > STALL_MS) {
          // Later frames keep their recorded spacing from here.
          this.startedAt += doneAt - due;
          due = doneAt;
        }
        onFrame(
          { frameId: this.frameId++, captureTime: due, hands: current.hands },
          {
            captureTime: due,
            // Replay time, not a camera capture.
            hasCaptureTime: false,
            inferenceMs: 0,
            mainThreadMs: 0,
            doneAt,
            droppedFrames: 0,
            skippedFrames: 0,
          },
        );
        this.index += 1;
        this.scheduleNext(onFrame);
      },
      Math.max(0, due - this.scheduler.now()),
    );
  }
}
