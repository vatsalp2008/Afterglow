import { describe, expect, it } from 'vitest';
import { toHandFrame } from './handFrame';

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

  it('tolerates a missing handedness entry', () => {
    const frame = toHandFrame({ landmarks: [[landmark(0.5)]], handedness: [] }, 0, 0);
    expect(frame.hands[0]).toMatchObject({ handedness: 'Left', score: 0 });
  });
});
