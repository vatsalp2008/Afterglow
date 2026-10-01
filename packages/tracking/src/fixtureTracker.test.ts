import type { HandFrame, SessionRecording } from '@afterglow/core';
import { describe, expect, it, vi } from 'vitest';
import { FixtureTracker, type Scheduler } from './fixtureTracker';

class FakeScheduler implements Scheduler {
  private t = 1000;
  private queue: Array<{ at: number; fn: () => void; id: number }> = [];
  private ids = 0;

  now(): number {
    return this.t;
  }

  setTimeout(fn: () => void, ms: number): number {
    const id = ++this.ids;
    this.queue.push({ at: this.t + ms, fn, id });
    return id;
  }

  clearTimeout(id: number): void {
    this.queue = this.queue.filter((q) => q.id !== id);
  }

  /** The page is busy for `ms`: time passes, but no timer runs until the next advance. */
  stall(ms: number): void {
    this.t += ms;
  }

  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const next = this.queue[0];
      if (!next || next.at > end) break;
      this.queue.shift();
      // An overdue timer runs late, at the current time; the clock never goes back.
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = end;
  }
}

const recording: SessionRecording = {
  version: 1,
  meta: {
    userAgent: 'test',
    videoWidth: 640,
    videoHeight: 480,
    fps: 30,
    tracker: 'worker',
    delegate: 'GPU',
    recordedAt: '2026-09-28T00:00:00.000Z',
  },
  frames: [0, 33, 66].map((t, i) => ({ frameId: i, captureTime: t, hands: [] })),
};

function play(opts: { loop?: boolean } = {}) {
  const scheduler = new FakeScheduler();
  const frames: HandFrame[] = [];
  const onEnd = vi.fn();
  const tracker = new FixtureTracker(recording, { ...opts, onEnd, scheduler });
  tracker.start((f) => frames.push(f));
  return { scheduler, frames, onEnd, tracker };
}

describe('FixtureTracker', () => {
  it('replays frames at their recorded times', () => {
    const { scheduler, frames } = play();
    scheduler.advance(40);
    expect(frames.map((f) => [f.frameId, f.captureTime])).toEqual([
      [0, 1000],
      [1, 1033],
    ]);
  });

  it('signals the end of playback once', () => {
    const { scheduler, frames, onEnd } = play();
    scheduler.advance(1000);
    expect(frames).toHaveLength(3);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('loops one frame interval after the last frame', () => {
    const { scheduler, frames, onEnd } = play({ loop: true });
    scheduler.advance(100);
    const times = frames.map((f) => f.captureTime);
    expect(times.slice(0, 3)).toEqual([1000, 1033, 1066]);
    expect(times[3]).toBeCloseTo(1066 + 1000 / 30, 9);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('stops emitting when stopped', () => {
    const { scheduler, frames, tracker } = play();
    scheduler.advance(10);
    tracker.stop();
    scheduler.advance(1000);
    expect(frames).toHaveLength(1);
  });
});

describe('FixtureTracker after a stall', () => {
  it('resumes from the stall instead of replaying the stretch in a burst', () => {
    const { scheduler, frames } = play();
    scheduler.advance(0); // frame 0 at its time
    scheduler.stall(2000); // the page is busy for 2 s
    scheduler.advance(0); // frame 1 runs late
    scheduler.advance(10);
    // Frame 2 hasn't come yet: it keeps its 33 ms spacing after the late frame 1.
    expect(frames.map((f) => f.captureTime)).toEqual([1000, 3000]);
    scheduler.advance(33);
    expect(frames.map((f) => f.captureTime)).toEqual([1000, 3000, 3033]);
  });

  it('plays frames that are only slightly late at their scheduled times', () => {
    const { scheduler, frames } = play();
    scheduler.advance(0);
    scheduler.stall(100);
    scheduler.advance(100);
    expect(frames.map((f) => f.captureTime)).toEqual([1000, 1033, 1066]);
  });
});
