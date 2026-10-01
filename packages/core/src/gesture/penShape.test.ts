import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../types.ts';
import { DEFAULT_PEN_SHAPE, handSize, PenShape } from './penShape.ts';

/**
 * A hand (aspect 1) whose palm is `size` long, its knuckle line `size / 1.56` wide and
 * turned `turn` radians from horizontal, all inside the frame unless `shift` moves it out.
 */
function hand(size: number, turn = 0, shift = 0): Vec3[] {
  const lm: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0.5 + shift, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5 + shift, y: 0.5 + size / 2, z: 0 };
  lm[9] = { x: 0.5 + shift, y: 0.5 - size / 2, z: 0 };
  const half = size / 1.56 / 2;
  lm[5] = { x: 0.5 + shift - Math.cos(turn) * half, y: 0.5 - Math.sin(turn) * half, z: 0 };
  lm[17] = { x: 0.5 + shift + Math.cos(turn) * half, y: 0.5 + Math.sin(turn) * half, z: 0 };
  return lm;
}

/** Feeds frames every 33 ms from `from` for `ms`, returning the last result and the time after. */
function feed(shape: PenShape, lm: Vec3[], from: number, ms: number, drawing = false) {
  let out = shape.update(lm, 1, from, drawing);
  let t = from + 33;
  for (; t < from + ms; t += 33) out = shape.update(lm, 1, t, drawing);
  return { out, t };
}

describe('handSize', () => {
  it('takes the larger of palm length and scaled knuckle width', () => {
    expect(handSize(hand(0.15), 1, 1.56)).toBeCloseTo(0.15, 6);
    // Turned edge-on, the knuckles foreshorten but the palm length holds.
    const edgeOn = hand(0.15);
    edgeOn[5] = { x: 0.5, y: 0.5, z: 0 };
    edgeOn[17] = { x: 0.51, y: 0.5, z: 0 };
    expect(handSize(edgeOn, 1, 1.56)).toBeCloseTo(0.15, 6);
  });
});

describe('PenShape depth', () => {
  it('starts at normal width wherever the hand is', () => {
    expect(new PenShape().update(hand(0.25), 1, 0, false).depth).toBe(1);
    expect(new PenShape().update(hand(0.08), 1, 0, false).depth).toBe(1);
  });

  it('thickens when the hand comes closer than usual, during a stroke', () => {
    const shape = new PenShape();
    const { t } = feed(shape, hand(0.15), 0, 1000);
    const { out } = feed(shape, hand(0.2), t, 2000, true);
    // The usual size holds still while drawing.
    expect(out.depth).toBeCloseTo((0.2 / 0.15) ** DEFAULT_PEN_SHAPE.exponent, 6);
  });

  it('settles back to normal width once the hand stays at its new distance', () => {
    const shape = new PenShape();
    const { t } = feed(shape, hand(0.15), 0, 1000);
    const { out } = feed(shape, hand(0.2), t, 20_000);
    expect(out.depth).toBeCloseTo(1, 2);
  });

  it("doesn't learn from a hand partly out of the frame", () => {
    const shape = new PenShape();
    const { t } = feed(shape, hand(0.15), 0, 1000);
    feed(shape, hand(0.3, 0, 0.6), t, 10_000);
    expect(shape.update(hand(0.15), 1, t + 10_000, false).depth).toBeCloseTo(1, 6);
  });

  it('clamps', () => {
    const shape = new PenShape();
    shape.update(hand(0.1), 1, 0, false);
    expect(shape.update(hand(0.6), 1, 33, true).depth).toBe(DEFAULT_PEN_SHAPE.maxDepth);
    expect(shape.update(hand(0.02), 1, 66, true).depth).toBe(DEFAULT_PEN_SHAPE.minDepth);
  });
});

describe('PenShape nib angle', () => {
  it('follows the knuckle line, mirrored like the view', () => {
    const level = new PenShape().update(hand(0.15), 1, 0, false).angle!;
    // From the index knuckle (5) to the little finger's (17): left to right in the image, right to left on screen.
    expect(Math.abs(Math.cos(level))).toBeCloseTo(1, 6);
    const tilted = new PenShape().update(hand(0.15, Math.PI / 6), 1, 0, false).angle!;
    expect(Math.abs(Math.sin(tilted))).toBeCloseTo(0.5, 6);
  });

  it('keeps its last angle while the hand is edge-on', () => {
    const shape = new PenShape();
    const before = shape.update(hand(0.15, Math.PI / 6), 1, 0, false).angle;
    const edgeOn = hand(0.15, Math.PI / 6);
    edgeOn[17] = { ...edgeOn[5]!, x: edgeOn[5]!.x + 0.01 };
    expect(shape.update(edgeOn, 1, 33, false).angle).toBe(before);
    expect(new PenShape().update(edgeOn, 1, 0, false).angle).toBeUndefined();
  });
});
