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

  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      this.queue.sort((a, b) => a.at - b.at);
      const next = this.queue[0];
      if (!next || next.at > end) break;
      this.queue.shift();
      this.t = next.at;
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
