import { describe, expect, it } from 'vitest';
import { FIRST_FRAME_MS, STALL_MS, TrackingWatchdog } from './trackingWatchdog';

/** Checks once per 16 ms rendered frame from `from` to `to`, and says whether it ever stalled. */
function runChecks(w: TrackingWatchdog, from: number, to: number, frameEvery?: number): boolean {
  let stalled = false;
  for (let t = from; t <= to; t += 16) {
    if (frameEvery && t % frameEvery < 16) w.frame(t);
    stalled ||= w.stalled(t);
  }
  return stalled;
}

describe('TrackingWatchdog', () => {
  it('waits long for the first frame, while the model warms up', () => {
    const w = new TrackingWatchdog();
    w.start(0);
    expect(runChecks(w, 0, FIRST_FRAME_MS - 100)).toBe(false);
    expect(runChecks(w, FIRST_FRAME_MS - 84, FIRST_FRAME_MS + 100)).toBe(true);
  });

  it('notices frames stopping once they flow', () => {
    const w = new TrackingWatchdog();
    w.start(0);
    expect(runChecks(w, 0, 2000, 33)).toBe(false);
    expect(runChecks(w, 2016, 2000 + STALL_MS - 100)).toBe(false);
    expect(runChecks(w, 2000 + STALL_MS - 84, 2000 + STALL_MS + 200)).toBe(true);
  });

  it('gives slow tracking room in proportion to its pace', () => {
    const w = new TrackingWatchdog();
    w.start(0);
    // A frame every 1.5 s, as on a machine without a GPU: never stopped.
    expect(runChecks(w, 0, 30_000, 1504)).toBe(false);
  });

  it('doesn’t count time the page itself was stalled', () => {
    const w = new TrackingWatchdog();
    w.start(0);
    runChecks(w, 0, 1000, 33);
    // Ten seconds without a rendered frame, then frames resume at once.
    expect(w.stalled(11_000)).toBe(false);
    w.frame(11_010);
    expect(runChecks(w, 11_016, 12_000, 33)).toBe(false);
  });

  it('starts over when the page comes back into view', () => {
    const w = new TrackingWatchdog();
    w.start(0);
    runChecks(w, 0, 1000, 33);
    w.resume(60_000);
    expect(runChecks(w, 60_000, 60_000 + STALL_MS - 100)).toBe(false);
  });
});
