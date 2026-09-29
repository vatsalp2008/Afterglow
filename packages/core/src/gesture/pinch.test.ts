import { describe, expect, it } from 'vitest';
import type { HandFrame, InputEvent, Vec3 } from '../types.ts';
import {
  DEFAULT_PINCH,
  fingerExtension,
  findTransition,
  PEN_TRANSITIONS,
  penFsmMermaid,
  pinchMeasure,
  pinchRatio,
  PinchTracker,
  readsAsFist,
  type PenFsmState,
  type PenInput,
  type PinchConfig,
} from './pinch.ts';

// A hand whose fingertip ratio is exactly `r` (aspect 1, palm length 0.2). The index
// finger points straight up from its tip, so the segment distance equals the tip distance.
function hand(r: number): Vec3[] {
  const lm: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.7, z: 0 };
  lm[9] = { x: 0.5, y: 0.5, z: 0 };
  lm[4] = { x: 0.5 - r * 0.1, y: 0.4, z: 0 };
  lm[8] = { x: 0.5 + r * 0.1, y: 0.4, z: 0 };
  lm[7] = { x: 0.5 + r * 0.1, y: 0.35, z: 0 };
  lm[6] = { x: 0.5 + r * 0.1, y: 0.3, z: 0 };
  // Middle, ring, and little fingers extended (twice their knuckle's distance from the wrist): not a fist.
  for (const tip of [12, 16, 20]) lm[tip] = { x: 0.5, y: 0.3, z: 0 };
  return lm;
}

// A pinch with the middle, ring, and little fingers curled, as if holding a pen. The index
// still reaches out to the thumb (extension 1.5).
function penGrip(): Vec3[] {
  const lm = hand(0.1);
  for (const tip of [12, 16, 20]) lm[tip] = { x: 0.5, y: 0.55, z: 0 }; // curled back toward the palm
  return lm;
}

// A fist: every finger curled, the thumb pressed on the curled index (so it reads closed).
function fist(): Vec3[] {
  const lm = penGrip();
  lm[8] = { x: 0.51, y: 0.6, z: 0 }; // index tip half the knuckle's distance from the wrist
  lm[4] = { x: 0.49, y: 0.6, z: 0 };
  return lm;
}

const frame = (i: number, landmarks: Vec3[]): HandFrame => ({
  frameId: i,
  captureTime: i * 33,
  hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks }],
});

// Mechanics are tested against a fixed configuration, independent of the tuned defaults.
const LEGACY: PinchConfig = {
  ...DEFAULT_PINCH,
  enter: 0.25,
  exit: 0.35,
  enterFrames: 2,
  exitFrames: 2,
  exitMs: 0,
  rejoinMs: 0,
  segmentWeight: 0,
  fistBelow: 1.4,
};

function run(ratios: Array<number | null>, config: PinchConfig = LEGACY, dt = 33): InputEvent[] {
  const tracker = new PinchTracker(config);
  return ratios.flatMap((r, i) => {
    const frame: HandFrame = {
      frameId: i,
      captureTime: i * dt,
      hands: r === null ? [] : [{ key: 'Right', handedness: 'Right', score: 1, landmarks: hand(r) }],
    };
    return tracker.update(frame, 1);
  });
}

const types = (evs: InputEvent[]) => evs.map((e) => e.type);

describe('pinch measures', () => {
  it('pinchRatio is thumb-index distance over palm length', () => {
    expect(pinchRatio(hand(0.3), 1)).toBeCloseTo(0.3, 9);
  });

  it('pinchMeasure equals the tip ratio when the segment is no closer', () => {
    expect(pinchMeasure(hand(0.3), 1, 1.6)).toBeCloseTo(0.3, 9);
  });

  it('pinchMeasure reads a thumb pressed on the fingertip pad as closed', () => {
    const lm = hand(0.1);
    // A long last segment (7 to 8), with the thumb pressed against its middle, far from the tip.
    lm[6] = { x: 0.51, y: 0.05, z: 0 };
    lm[7] = { x: 0.51, y: 0.15, z: 0 };
    lm[4] = { x: 0.505, y: 0.28, z: 0 };
    expect(pinchRatio(lm, 1)).toBeGreaterThan(0.3);
    expect(pinchMeasure(lm, 1, 1.6)).toBeLessThan(0.1);
    expect(pinchMeasure(lm, 1, 0)).toBeCloseTo(pinchRatio(lm, 1), 9);
  });

  it('ignores a thumb resting against the middle segment, as in a relaxed hand', () => {
    const lm = hand(0.6);
    lm[6] = { x: 0.56, y: 0.2, z: 0 };
    lm[7] = { x: 0.56, y: 0.3, z: 0 };
    lm[8] = { x: 0.56, y: 0.35, z: 0 };
    lm[4] = { x: 0.555, y: 0.22, z: 0 }; // against the middle segment (6 to 7), not the pad
    expect(pinchMeasure(lm, 1, 1.2)).toBeGreaterThan(0.4);
  });

  it('fingerExtension tells an open hand from a fist', () => {
    expect(fingerExtension(hand(0.3), 1)).toBeCloseTo(2, 9);
    expect(fingerExtension(fist(), 1)).toBeLessThan(1.4);
  });

  it('is infinite for a degenerate palm', () => {
    const lm = hand(0.2);
    lm[0] = { ...lm[9]! };
    expect(pinchMeasure(lm, 1, 1.6)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('PinchTracker', () => {
  it('needs two confirming frames to start and ignores the hysteresis band', () => {
    expect(types(run([1, 0.2, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 1]))).toEqual([
      'hover',
      'hover',
      'strokeStart',
      'strokeMove',
      'strokeMove',
      'strokeMove',
      'strokeEnd',
      'hover',
      'hover',
    ]);
  });

  it('flushes held frames when an exit is not confirmed', () => {
    expect(types(run([0.2, 0.2, 0.4, 0.2]))).toEqual(['hover', 'strokeStart', 'strokeMove', 'strokeMove']);
  });

  it('requires more frames to release than to start when configured', () => {
    const cfg = { ...LEGACY, exitFrames: 3 };
    expect(types(run([0.2, 0.2, 0.4, 0.4, 0.2], cfg))).toEqual([
      'hover',
      'strokeStart',
      'strokeMove',
      'strokeMove',
      'strokeMove',
    ]);
    expect(types(run([0.2, 0.2, 0.4, 0.4, 0.4], cfg))).toEqual(['hover', 'strokeStart', 'strokeEnd', 'hover']);
  });

  it('can require a minimum release duration regardless of frame rate', () => {
    const cfg = { ...LEGACY, exitFrames: 1, exitMs: 100 };
    // At 33 ms per frame: 4 open frames span 99 ms (not enough); the 5th is at 132 ms.
    expect(types(run([0.2, 0.2, 0.4, 0.4, 0.4, 0.4], cfg, 33))).not.toContain('strokeEnd');
    expect(types(run([0.2, 0.2, 0.4, 0.4, 0.4, 0.4, 0.4], cfg, 33)).slice(-2)).toEqual(['strokeEnd', 'hover']);
    // At 60 ms per frame, the 3rd open frame is already 120 ms after the first.
    expect(types(run([0.2, 0.2, 0.4, 0.4, 0.4], cfg, 60)).slice(-2)).toEqual(['strokeEnd', 'hover']);
  });

  it('resumes the same stroke when the fingers close again within the rejoin window', () => {
    const cfg = { ...LEGACY, rejoinMs: 150 };
    // Release confirmed at t = 132: pen up. It closes again at t = 198, within 150 ms.
    const evs = run([0.2, 0.2, 0.2, 0.4, 0.4, 1, 0.2, 0.2], cfg);
    expect(evs.filter((e) => e.type === 'strokeStart')).toHaveLength(1);
    expect(evs.filter((e) => e.type === 'strokeEnd')).toHaveLength(0);
    expect(types(evs).slice(-2)).toEqual(['strokeMove', 'strokeMove']);
  });

  it('ends the stroke when the rejoin window runs out', () => {
    const cfg = { ...LEGACY, rejoinMs: 100 };
    // Lifted at t = 132; the window has run out by t = 264.
    const evs = run([0.2, 0.2, 0.2, 0.4, 0.4, 1, 1, 1, 1], cfg);
    expect(evs.filter((e) => e.type === 'strokeEnd')).toEqual([expect.objectContaining({ reason: 'release', t: 264 })]);
  });

  it('needs a fresh confirmation to start again after the rejoin window', () => {
    const cfg = { ...LEGACY, rejoinMs: 50 };
    const evs = run([0.2, 0.2, 0.4, 0.4, 1, 1, 0.2, 0.2], cfg);
    expect(types(evs).filter((t) => t !== 'hover' && t !== 'strokeMove')).toEqual([
      'strokeStart',
      'strokeEnd',
      'strokeStart',
    ]);
  });

  it('keeps the pen up while lifted, and closes a lifted stroke on reset', () => {
    const tracker = new PinchTracker({ ...LEGACY, rejoinMs: 500 });
    [0.2, 0.2, 0.4, 0.4].forEach((r, i) =>
      tracker.update(
        { frameId: i, captureTime: i * 33, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: hand(r) }] },
        1,
      ),
    );
    expect(tracker.status().get('R')?.state).toBe('hover');
    expect(tracker.reset(200)).toEqual([{ type: 'strokeEnd', t: 200, handKey: 'R', reason: 'handLost' }]);
  });

  it('starts on the first closed frame when one frame is enough', () => {
    expect(types(run([0.2], { ...LEGACY, enterFrames: 1 }))).toEqual(['strokeStart']);
  });

  it('never starts a stroke from a fist, and reports it', () => {
    const tracker = new PinchTracker(LEGACY);
    const evs = [0, 1, 2, 3].flatMap((i) =>
      tracker.update(
        { frameId: i, captureTime: i * 33, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: fist() }] },
        1,
      ),
    );
    expect(evs.filter((e) => e.type === 'strokeStart')).toHaveLength(0);
    expect(tracker.status().get('R')).toMatchObject({ state: 'hover', fist: true });
  });

  it('ends a stroke when the hand closes into a fist', () => {
    const tracker = new PinchTracker(LEGACY);
    const frames = [hand(0.1), hand(0.1), fist(), fist()];
    const evs = frames.flatMap((lm, i) =>
      tracker.update(
        { frameId: i, captureTime: i * 33, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: lm }] },
        1,
      ),
    );
    expect(evs.filter((e) => e.type === 'strokeEnd')).toEqual([expect.objectContaining({ reason: 'release' })]);
  });

  it('reads a fist as a fist, but not a pinch with the other fingers curled', () => {
    expect(readsAsFist(fist(), 1)).toBe(true);
    expect(readsAsFist(penGrip(), 1)).toBe(false);
    expect(readsAsFist(hand(0.1), 1)).toBe(false);
    expect(readsAsFist(fist(), 1, { fistBelow: 0, fistIndexBelow: 1.1 })).toBe(false);
  });

  it('draws a pinch made with the other fingers curled', () => {
    const tracker = new PinchTracker(LEGACY);
    const evs = [0, 1, 2].flatMap((i) => tracker.update(frame(i, penGrip()), 1));
    expect(evs.filter((e) => e.type === 'strokeStart')).toHaveLength(1);
  });

  it("won't start a stroke from a hand mostly outside the frame", () => {
    const off = hand(0.1).map((q) => ({ ...q, x: q.x + 0.52 })); // all but the thumb tip past the right edge
    expect(off.filter((q) => q.x > 1).length).toBeGreaterThan(DEFAULT_PINCH.maxOutside);
    const tracker = new PinchTracker(LEGACY);
    expect([0, 1, 2].flatMap((i) => tracker.update(frame(i, off), 1)).some((e) => e.type === 'strokeStart')).toBe(
      false,
    );
    // A hand with only its wrist out of view still draws.
    const low = hand(0.1);
    low[0] = { x: 0.5, y: 1.02, z: 0 };
    const t2 = new PinchTracker({ ...LEGACY });
    expect([0, 1, 2].flatMap((i) => t2.update(frame(i, low), 1)).some((e) => e.type === 'strokeStart')).toBe(true);
  });

  it('lets a fist pinch when the gate is disabled', () => {
    const tracker = new PinchTracker({ ...LEGACY, fistBelow: 0 });
    const evs = [0, 1].flatMap((i) =>
      tracker.update(
        { frameId: i, captureTime: i * 33, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: fist() }] },
        1,
      ),
    );
    expect(evs.filter((e) => e.type === 'strokeStart')).toHaveLength(1);
  });

  it('bridges short hand dropouts without breaking the stroke', () => {
    const evs = run([0.2, 0.2, null, null, null, 0.2]);
    expect(types(evs)).toEqual(['hover', 'strokeStart', 'strokeMove']);
  });

  it('ends the stroke once the hand is gone past the grace period', () => {
    const evs = run([0.2, 0.2, null, null, null, null, null]);
    expect(evs[evs.length - 1]).toMatchObject({ type: 'strokeEnd', reason: 'handLost' });
  });

  it('ends a stroke that was mid-release when the hand is lost', () => {
    const evs = run([0.2, 0.2, 0.4, null, null, null, null, null]);
    expect(evs.filter((e) => e.type === 'strokeEnd')).toEqual([expect.objectContaining({ reason: 'handLost' })]);
  });

  it('forgets a hovering hand silently when it leaves', () => {
    const tracker = new PinchTracker(LEGACY);
    const frames = [1, null, null, null, null, null].map((r, i): HandFrame => ({
      frameId: i,
      captureTime: i * 33,
      hands: r === null ? [] : [{ key: 'Right', handedness: 'Right', score: 1, landmarks: hand(r) }],
    }));
    const evs = frames.flatMap((f) => tracker.update(f, 1));
    expect(types(evs)).toEqual(['hover']);
    expect(tracker.status().size).toBe(0);
  });

  it('reports mirrored view-space pen positions and the pen state', () => {
    const tracker = new PinchTracker(LEGACY);
    const [first] = tracker.update(
      { frameId: 0, captureTime: 0, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: hand(1) }] },
      1,
    );
    expect(first).toMatchObject({ type: 'hover', p: { x: 0.5, y: 0.4 } });
    expect(tracker.status().get('R')).toMatchObject({ state: 'hover', ratio: 1, fist: false });
  });

  it('ends open strokes on reset', () => {
    const tracker = new PinchTracker(LEGACY);
    for (let i = 0; i < 3; i++) {
      tracker.update(
        { frameId: i, captureTime: i * 33, hands: [{ key: 'R', handedness: 'Right', score: 1, landmarks: hand(0.1) }] },
        1,
      );
    }
    expect(tracker.reset(100)).toEqual([{ type: 'strokeEnd', t: 100, handKey: 'R', reason: 'handLost' }]);
    expect(tracker.status().size).toBe(0);
  });
});

describe('transition table', () => {
  const states: PenFsmState[] = ['hover', 'pressing', 'drawing', 'releasing', 'lifted'];
  const inputs: PenInput[] = ['closed', 'between', 'open', 'lost'];

  it('has exactly one row for every state, input, and confirmation', () => {
    for (const from of states) {
      for (const input of inputs) {
        for (const confirmed of [true, false]) {
          const rows = PEN_TRANSITIONS.filter(
            (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
          );
          expect(rows, `${from} + ${input} (${String(confirmed)})`).toHaveLength(1);
        }
      }
    }
  });

  it('throws for a state with no rows', () => {
    expect(() => findTransition('gone', 'closed', false)).toThrow('No pen transition');
  });

  it('renders as a Mermaid state diagram', () => {
    const diagram = penFsmMermaid();
    expect(diagram.startsWith('stateDiagram-v2\n')).toBe(true);
    expect(diagram).toContain('pressing --> drawing: closed (confirmed) / start');
    expect(diagram).toContain('drawing --> [*]: lost / lose');
  });
});
