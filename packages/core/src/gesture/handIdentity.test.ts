import { describe, expect, it } from 'vitest';
import type { HandFrame, Handedness, TrackedHand } from '../types.ts';
import { HandIdentity } from './handIdentity.ts';

/** A hand whose 21 landmarks all sit at (x, y); aspect 1 keeps the math readable. */
function hand(x: number, y: number, handedness: Handedness = 'Right', score = 0.9): TrackedHand {
  return {
    key: handedness,
    handedness,
    score,
    landmarks: Array.from({ length: 21 }, () => ({ x, y, z: 0 })),
  };
}

function track(frames: TrackedHand[][]): HandFrame[] {
  const identity = new HandIdentity();
  return frames.map((hands, i) => identity.assign({ frameId: i, captureTime: i * 33, hands }, 1));
}

const keys = (frames: HandFrame[]) => frames.map((f) => f.hands.map((h) => h.key));

describe('HandIdentity', () => {
  it('keeps one identity when MediaPipe flips the label', () => {
    const out = track([[hand(0.5, 0.5, 'Right')], [hand(0.51, 0.5, 'Left')], [hand(0.52, 0.5, 'Right')]]);
    expect(keys(out)).toEqual([['hand-1'], ['hand-1'], ['hand-1']]);
  });

  it('smooths a one-frame handedness flip', () => {
    const out = track([
      [hand(0.5, 0.5, 'Right')],
      [hand(0.5, 0.5, 'Right')],
      [hand(0.5, 0.5, 'Left')],
      [hand(0.5, 0.5, 'Right')],
    ]);
    expect(out.map((f) => f.hands[0]?.handedness)).toEqual(['Right', 'Right', 'Right', 'Right']);
  });

  it('tells two hands apart by position even when both are labeled Right', () => {
    const out = track([
      [hand(0.2, 0.5, 'Right'), hand(0.8, 0.5, 'Left')],
      [hand(0.81, 0.5, 'Right'), hand(0.21, 0.5, 'Right')],
    ]);
    expect(keys(out)).toEqual([
      ['hand-1', 'hand-2'],
      ['hand-2', 'hand-1'],
    ]);
  });

  it('merges one hand detected twice, keeping the higher score', () => {
    const [f] = track([[hand(0.5, 0.5, 'Left', 0.6), hand(0.53, 0.5, 'Right', 0.95)]]);
    expect(f?.hands).toHaveLength(1);
    expect(f?.hands[0]).toMatchObject({ key: 'hand-1', handedness: 'Right', score: 0.95 });
  });

  it('keeps an identity through a short gap near where the hand left', () => {
    const out = track([[hand(0.5, 0.5)], [], [], [hand(0.6, 0.5)]]);
    expect(keys(out)).toEqual([['hand-1'], [], [], ['hand-1']]);
  });

  it('allows more movement the longer a hand was missing', () => {
    // 0.45 is beyond one frame's reach (0.25) but within reach after one missing frame (0.5).
    const out = track([[hand(0.2, 0.5)], [], [hand(0.65, 0.5)]]);
    expect(keys(out)).toEqual([['hand-1'], [], ['hand-1']]);
  });

  it('gives a new identity after the grace period', () => {
    const frames: TrackedHand[][] = [[hand(0.5, 0.5)], ...Array.from({ length: 16 }, () => []), [hand(0.5, 0.5)]];
    const out = track(frames);
    expect(out[out.length - 1]?.hands[0]?.key).toBe('hand-2');
  });

  it('gives a new identity to a hand that appears too far away', () => {
    const out = track([[hand(0.1, 0.5)], [hand(0.9, 0.5)]]);
    expect(keys(out)).toEqual([['hand-1'], ['hand-2']]);
  });

  it('forgets everything on reset', () => {
    const identity = new HandIdentity();
    identity.assign({ frameId: 0, captureTime: 0, hands: [hand(0.5, 0.5)] }, 1);
    identity.reset();
    const f = identity.assign({ frameId: 1, captureTime: 33, hands: [hand(0.5, 0.5)] }, 1);
    expect(f.hands[0]?.key).toBe('hand-2');
  });
});
