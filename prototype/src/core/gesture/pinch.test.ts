import { describe, expect, it } from 'vitest';
import type { HandFrame, InputEvent, Vec3 } from '../types';
import { PinchTracker, pinchRatio } from './pinch';

// A hand whose pinch ratio is exactly `r` (aspect 1): palm length 0.2.
function hand(r: number): Vec3[] {
  const lm: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.7, z: 0 };
  lm[9] = { x: 0.5, y: 0.5, z: 0 };
  lm[4] = { x: 0.5 - r * 0.1, y: 0.4, z: 0 };
  lm[8] = { x: 0.5 + r * 0.1, y: 0.4, z: 0 };
  return lm;
}

function run(ratios: Array<number | null>): InputEvent[] {
  const tracker = new PinchTracker();
  return ratios.flatMap((r, i) => {
    const frame: HandFrame = {
      frameId: i,
      captureTime: i * 33,
      hands: r === null ? [] : [{ key: 'Right', handedness: 'Right', score: 1, landmarks: hand(r) }],
    };
    return tracker.update(frame, 1);
  });
}

const types = (evs: InputEvent[]) => evs.map((e) => e.type);

describe('pinchRatio', () => {
  it('is thumb-index distance over palm length', () => {
    expect(pinchRatio(hand(0.3), 1)).toBeCloseTo(0.3, 9);
  });
});

describe('PinchTracker', () => {
  it('needs two confirming frames to start and ignores the hysteresis band', () => {
    expect(types(run([1, 0.2, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 1]))).toEqual([
      'hover', 'hover', 'strokeStart', 'strokeMove', 'strokeMove', 'strokeMove', 'strokeEnd', 'hover', 'hover',
    ]);
  });

  it('flushes held frames when an exit is not confirmed', () => {
    expect(types(run([0.2, 0.2, 0.4, 0.2]))).toEqual(['hover', 'strokeStart', 'strokeMove', 'strokeMove']);
  });

  it('bridges short hand dropouts without breaking the stroke', () => {
    const evs = run([0.2, 0.2, null, null, null, 0.2]);
    expect(types(evs)).toEqual(['hover', 'strokeStart', 'strokeMove']);
  });

  it('ends the stroke once the hand is gone past the grace period', () => {
    const evs = run([0.2, 0.2, null, null, null, null, null]);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'strokeEnd', reason: 'handLost' });
  });

  it('reports mirrored view-space pen positions', () => {
    const [first] = run([1]);
    expect(first).toMatchObject({ type: 'hover', p: { x: 0.5, y: 0.4 } });
  });
});
