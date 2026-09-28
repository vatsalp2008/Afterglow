import { describe, expect, it } from 'vitest';
import { packResult, toHandFrame } from './handFrame';

const landmark = (x: number) => ({ x, y: 0.5, z: 0, visibility: 0.9 });
const category = (categoryName: string, score = 0.9) => [{ categoryName, score, index: 0, displayName: '' }];

describe('toHandFrame', () => {
  it('swaps MediaPipe handedness labels for the unmirrored frame', () => {
    const frame = toHandFrame({ landmarks: [[landmark(0.2)]], handedness: [category('Left')] }, 7, 1234);
    expect(frame).toEqual({
      frameId: 7,
      captureTime: 1234,
      hands: [{ key: 'Right', handedness: 'Right', score: 0.9, landmarks: [{ x: 0.2, y: 0.5, z: 0 }] }],
    });
  });

  it('gives duplicate labels distinct keys', () => {
    const frame = toHandFrame(
      { landmarks: [[landmark(0.2)], [landmark(0.7)]], handedness: [category('Right'), category('Right')] },
      0,
      0,
    );
    expect(frame.hands.map((h) => h.key)).toEqual(['Left', 'Left#1']);
  });

  it('carries world landmarks through, and packs them for the worker', () => {
    const world = [{ x: 0.01, y: 0.02, z: -0.03, visibility: 1 }];
    const packed = packResult({
      landmarks: [[landmark(0.4)]],
      handedness: [category('Left')],
      worldLandmarks: [world],
    });
    expect(packed.worldLandmarks).toEqual([[{ x: 0.01, y: 0.02, z: -0.03 }]]);
    expect(toHandFrame(packed, 0, 0).hands[0]?.world).toEqual([{ x: 0.01, y: 0.02, z: -0.03 }]);
  });

  it('tolerates a missing handedness entry', () => {
    const frame = toHandFrame({ landmarks: [[landmark(0.5)]], handedness: [] }, 0, 0);
    expect(frame.hands[0]).toMatchObject({ handedness: 'Left', score: 0 });
  });
});

describe('packResult', () => {
  it('strips a result to plain landmarks and the top handedness category', () => {
    const packed = packResult({
      landmarks: [[landmark(0.3)]],
      handedness: [[...category('Left', 0.8), ...category('Right', 0.2)]],
    });
    expect(packed).toEqual({
      landmarks: [[{ x: 0.3, y: 0.5, z: 0 }]],
      handedness: [[{ categoryName: 'Left', score: 0.8 }]],
    });
    expect(toHandFrame(packed, 0, 0).hands[0]?.handedness).toBe('Right');
  });
});
