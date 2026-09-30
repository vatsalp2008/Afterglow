import { describe, expect, it } from 'vitest';
import type { HandFrame, InputEvent, Vec3 } from '../types.ts';
import type { PenStatus } from './pinch.ts';
import {
  classifyPose,
  DEFAULT_TOOL_GESTURES,
  findToolTransition,
  handShape,
  TOOL_TRANSITIONS,
  toolFsmMermaid,
  ToolGestureTracker,
  type HandPose,
  type ToolFsmState,
  type ToolInput,
} from './tools.ts';

const P = 0.15; // palm length (wrist to middle knuckle), in frame units at aspect 1

interface HandSpec {
  /** Extension of index, middle, ring, little. */
  fingers: [number, number, number, number];
  /** Thumb tip to index knuckle, in palm lengths. */
  thumb: number;
  /** Wrist position in view space (mirrored x). */
  at?: { x: number; y: number };
  /** Extra outward angle of the outer fingers, radians. */
  fan?: number;
  /** Build the other hand (thumb on the other side). */
  mirror?: boolean;
}

/** A synthetic upright hand, palm to the camera, in landmark space (aspect 1). */
function hand({ fingers, thumb, at = { x: 0.5, y: 0.7 }, fan = 0, mirror = false }: HandSpec): Vec3[] {
  const local: Array<[number, number]> = Array.from({ length: 21 }, () => [0, 0]);
  const knuckles: Array<[number, number, number]> = [
    // [knuckle index, x, y] relative to the wrist, in palm lengths (y up)
    [5, -0.3, 0.95],
    [9, 0, 1],
    [13, 0.25, 0.95],
    [17, 0.45, 0.85],
  ];
  const angles = [fan, fan / 3, -fan / 3, -fan]; // y is up, so positive turns toward the index side
  knuckles.forEach(([k, kx, ky], i) => {
    const e = fingers[i]!;
    const a = angles[i]!;
    const tx = e * (kx * Math.cos(a) - ky * Math.sin(a));
    const ty = e * (kx * Math.sin(a) + ky * Math.cos(a));
    local[k] = [kx, ky];
    local[k + 1] = [kx + (tx - kx) / 3, ky + (ty - ky) / 3];
    local[k + 2] = [kx + ((tx - kx) * 2) / 3, ky + ((ty - ky) * 2) / 3];
    local[k + 3] = [tx, ty];
  });
  // Thumb: from its base toward a tip `thumb` palm lengths from the index knuckle, off to the side.
  const tip: [number, number] = [-0.3 - thumb * 0.9, 0.95 - thumb * 0.44];
  local[1] = [-0.2, 0.25];
  local[2] = [-0.4, 0.45];
  local[3] = [(local[2][0] + tip[0]) / 2, (local[2][1] + tip[1]) / 2];
  local[4] = tip;
  const side = mirror ? -1 : 1;
  // View x grows to the right; landmark x is mirrored. Image y grows downward.
  return local.map(([x, y]) => ({ x: 1 - (at.x + side * x * P), y: at.y - y * P, z: 0 }));
}

const POSES: Record<Exclude<HandPose, 'none'> | 'relaxed', HandSpec> = {
  openPalm: { fingers: [2, 2.1, 2, 1.9], thumb: 1, fan: 0.25 },
  fist: { fingers: [0.9, 0.8, 0.8, 0.8], thumb: 0.4 },
  twoFingers: { fingers: [2, 2.1, 0.9, 0.8], thumb: 0.4 },
  frameCorner: { fingers: [2, 0.9, 0.8, 0.8], thumb: 1 },
  // Open but not spread, as a hand hovers between strokes.
  relaxed: { fingers: [1.9, 2, 1.9, 1.8], thumb: 0.6 },
};

const NO_PENS = new Map<string, PenStatus>();
const DRAWING = new Map<string, PenStatus>([['other', { state: 'drawing', ratio: 0.1, fist: false }]]);

type Step = Vec3[][] | ((t: number) => Vec3[][]);

/** Runs frames every `dt` ms from `from` to `to` (exclusive), returning gesture events. */
function run(
  tracker: ToolGestureTracker,
  from: number,
  to: number,
  hands: Step,
  pens: ReadonlyMap<string, PenStatus> = NO_PENS,
  dt = 33,
): Extract<InputEvent, { type: 'gesture' }>[] {
  const out: Extract<InputEvent, { type: 'gesture' }>[] = [];
  for (let t = from; t < to; t += dt) {
    const lms = typeof hands === 'function' ? hands(t) : hands;
    const frame: HandFrame = {
      frameId: t,
      captureTime: t,
      hands: lms.map((landmarks, i) => ({ key: `h${String(i)}`, handedness: 'Right', score: 1, landmarks })),
    };
    for (const e of tracker.update(frame, 1, pens)) if (e.type === 'gesture') out.push(e);
  }
  return out;
}

const names = (evs: Array<{ name: string }>) => evs.map((e) => e.name);

const frameOf = (t: number, lms: Vec3[][]): HandFrame => ({
  frameId: t,
  captureTime: t,
  hands: lms.map((landmarks, i) => ({ key: `h${String(i)}`, handedness: 'Right', score: 1, landmarks })),
});

describe('handShape and classifyPose', () => {
  it.each(Object.entries(POSES))('recognizes %s', (pose, spec) => {
    expect(classifyPose(handShape(hand(spec), 1))).toBe(pose === 'relaxed' ? 'none' : pose);
  });

  it('measures extension, thumb spread, and index rise', () => {
    const s = handShape(hand(POSES.frameCorner), 1);
    expect(s.index).toBeCloseTo(2, 6);
    expect(s.middle).toBeCloseTo(0.9, 6);
    expect(s.thumbSpread).toBeCloseTo(Math.hypot(0.9, 0.44), 6);
    expect(s.indexRise).toBeCloseTo((Math.atan2(0.95, 0.3) * 180) / Math.PI, 6);
  });

  it('rejects a sideways L as a frame corner', () => {
    const sideways = hand(POSES.frameCorner).map((p) => ({ x: 0.5 + (p.y - 0.5), y: 0.5 - (p.x - 0.5), z: 0 }));
    expect(classifyPose(handShape(sideways, 1))).toBe('none');
  });
});

describe('held gestures', () => {
  it('opens the menu once, after an open palm is held still for 400 ms', () => {
    const tracker = new ToolGestureTracker();
    const evs = run(tracker, 0, 2000, [hand(POSES.openPalm)]);
    expect(names(evs)).toEqual(['openMenu']);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(400);
    expect(evs[0]!.t).toBeLessThan(450);
    expect(evs[0]!.handKey).toBe('h0');
  });

  it('does not open the menu for a relaxed open hand', () => {
    expect(run(new ToolGestureTracker(), 0, 2000, [hand(POSES.relaxed)])).toEqual([]);
  });

  it('waits for a wandering palm to settle', () => {
    const tracker = new ToolGestureTracker();
    // Drifting 0.3 palm lengths per 100 ms (the stillness limit) for a second, then still:
    // the hold keeps restarting, and completes 400 ms after the last restart.
    const evs = run(tracker, 0, 2000, (t) => [
      hand({ ...POSES.openPalm, at: { x: 0.3 + Math.min(t, 1000) * 0.00045, y: 0.7 } }),
    ]);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(1300);
    expect(evs[0]!.t).toBeLessThan(1450);
  });

  it('ignores an open hand that is closing into a pinch', () => {
    const tracker = new ToolGestureTracker();
    // The thumb sweeps in over 600 ms: spread enough for a palm the whole time, but changing shape.
    const evs = run(tracker, 0, 600, (t) => [hand({ ...POSES.openPalm, thumb: 1.6 - t / 1000 })]);
    expect(evs).toEqual([]);
  });

  it('pauses after a fist is held for 300 ms', () => {
    const evs = run(new ToolGestureTracker(), 0, 1000, [hand(POSES.fist)]);
    expect(names(evs)).toEqual(['pause']);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(300);
  });

  it('fires again only after the pose ends and the cooldown passes', () => {
    const tracker = new ToolGestureTracker();
    const fist = [hand(POSES.fist)];
    const first = run(tracker, 0, 1000, fist);
    // Released for less than the cooldown: the fist that follows is ignored.
    run(tracker, 1000, 1400, []);
    const blocked = run(tracker, 1400, 1700, fist);
    run(tracker, 1700, 2600, []);
    const again = run(tracker, 2600, 3200, fist);
    expect(names(first)).toEqual(['pause']);
    expect(blocked).toEqual([]);
    expect(names(again)).toEqual(['pause']);
  });

  it("doesn't open the menu as the hand relaxes out of a fist", () => {
    const tracker = new ToolGestureTracker();
    const evs = [...run(tracker, 0, 1000, [hand(POSES.fist)]), ...run(tracker, 1000, 1700, [hand(POSES.openPalm)])];
    expect(names(evs)).toEqual(['pause']);
  });

  it('keeps a hold through a misread frame, but never completes on one', () => {
    const tracker = new ToolGestureTracker();
    // Misread at 132 ms, mid-hold, and at 330 ms, the first frame past the 300 ms hold.
    const evs = run(tracker, 0, 800, (t) => (t === 132 || t === 330 ? [] : [hand(POSES.fist)]));
    expect(names(evs)).toEqual(['pause']);
    expect(evs[0]!.t).toBe(363);
  });

  it('frames with both hands to refine, thumbs together', () => {
    const tracker = new ToolGestureTracker();
    const left = hand({ ...POSES.frameCorner, mirror: true, at: { x: 0.3, y: 0.7 } });
    // The right hand's thumb tip meets the left hand's.
    const leftThumb = { x: 1 - left[4]!.x, y: left[4]!.y };
    const probe = hand({ ...POSES.frameCorner, at: { x: 0.7, y: 0.7 } });
    const shift = { x: leftThumb.x - (1 - probe[4]!.x), y: leftThumb.y - probe[4]!.y };
    const right = hand({ ...POSES.frameCorner, at: { x: 0.7 + shift.x, y: 0.7 + shift.y } });
    const evs = run(tracker, 0, 1500, [left, right]);
    expect(names(evs)).toEqual(['refine']);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(500);
    // Apart, the same two corners aren't a frame.
    const apart = hand({ ...POSES.frameCorner, at: { x: 0.9, y: 0.7 } });
    expect(run(new ToolGestureTracker(), 0, 1500, [left, apart])).toEqual([]);
  });

  it('ignores a hand mostly outside the frame', () => {
    const edge = hand({ ...POSES.fist, at: { x: 0.02, y: 0.7 } });
    expect(edge.filter((p) => p.x > 1).length).toBeGreaterThan(DEFAULT_TOOL_GESTURES.maxOutside);
    expect(run(new ToolGestureTracker(), 0, 1000, [edge])).toEqual([]);
  });

  it('never fires while a hand is drawing, and drops the hold', () => {
    const tracker = new ToolGestureTracker();
    expect(run(tracker, 0, 1000, [hand(POSES.fist)], DRAWING)).toEqual([]);
    // The hold starts over once drawing stops.
    const evs = run(tracker, 1000, 1500, [hand(POSES.fist)]);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(1300);
  });

  it('tells where the menu gesture was made, and how big the hand is', () => {
    const evs = run(new ToolGestureTracker(), 0, 800, [hand({ ...POSES.openPalm, at: { x: 0.3, y: 0.7 } })]);
    const e = evs[0]!;
    // The palm center sits above the wrist (view space), and the palm is 0.15 frame heights long.
    expect(e.at!.x).toBeCloseTo(0.3 + 0.08 * P, 2);
    expect(e.at!.y).toBeLessThan(0.7);
    expect(e.palm).toBeCloseTo(P, 6);
  });

  it('latches the pose held when the menu closes, so it fires only once it ends', () => {
    const tracker = new ToolGestureTracker();
    const f = [hand(POSES.fist)];
    // The fist that closed the menu, still held: it must not also pause.
    run(tracker, 0, 150, f);
    tracker.latch(frameOf(150, f), 1);
    expect(tracker.fsmState).toBe('active');
    expect(run(tracker, 150, 1500, f)).toEqual([]);
    // Released, cooled down, and made again: now it pauses.
    run(tracker, 1500, 2400, []);
    expect(names(run(tracker, 2400, 2800, f))).toEqual(['pause']);
  });

  it('starts the cooldown on latch when no pose is held', () => {
    const tracker = new ToolGestureTracker();
    tracker.latch(frameOf(0, []), 1);
    expect(tracker.fsmState).toBe('cooling');
    const evs = run(tracker, 33, 1500, [hand(POSES.fist)]);
    expect(evs[0]!.t).toBeGreaterThanOrEqual(800 + 300);
  });

  it('resets', () => {
    const tracker = new ToolGestureTracker();
    run(tracker, 0, 200, [hand(POSES.fist)]);
    expect(tracker.fsmState).toBe('holding');
    tracker.reset();
    expect(tracker.fsmState).toBe('ready');
    expect(run(tracker, 200, 450, [hand(POSES.fist)])).toEqual([]);
  });
});

describe('swipes', () => {
  const vee = (x: number) => [hand({ ...POSES.twoFingers, at: { x, y: 0.7 } })];
  /** Two fingers held at `from`, then moved to `to` over `ms`, then held. */
  const swipe = (start: number, from: number, to: number, ms: number) => (t: number) =>
    vee(from + (to - from) * Math.min(1, Math.max(0, (t - start) / ms)));

  it('undoes on a swipe left and redoes on a swipe right', () => {
    expect(names(run(new ToolGestureTracker(), 0, 1000, swipe(300, 0.7, 0.35, 300)))).toEqual(['undo']);
    expect(names(run(new ToolGestureTracker(), 0, 1000, swipe(300, 0.35, 0.7, 300)))).toEqual(['redo']);
  });

  it('ignores the hand returning within a second', () => {
    const tracker = new ToolGestureTracker();
    const evs = [
      ...run(tracker, 0, 800, swipe(300, 0.7, 0.35, 300)),
      // Back to the right 300 ms after the swipe ends.
      ...run(tracker, 800, 2000, swipe(900, 0.35, 0.7, 300)),
    ];
    expect(names(evs)).toEqual(['undo']);
  });

  it('counts an opposite swipe after a second as a new swipe', () => {
    const tracker = new ToolGestureTracker();
    const evs = [
      ...run(tracker, 0, 800, swipe(300, 0.7, 0.35, 300)),
      ...run(tracker, 800, 2600, swipe(1800, 0.35, 0.7, 300)),
    ];
    expect(names(evs)).toEqual(['undo', 'redo']);
  });

  it('repeats in the same direction after returning', () => {
    const tracker = new ToolGestureTracker();
    const evs = [
      ...run(tracker, 0, 800, swipe(300, 0.7, 0.35, 300)),
      ...run(tracker, 800, 1500, swipe(900, 0.35, 0.7, 400)),
      ...run(tracker, 1500, 2300, swipe(1600, 0.7, 0.35, 300)),
    ];
    expect(names(evs)).toEqual(['undo', 'undo']);
  });

  it('ignores slow, short, or vertical moves', () => {
    expect(run(new ToolGestureTracker(), 0, 4000, swipe(300, 0.7, 0.35, 3000))).toEqual([]);
    expect(run(new ToolGestureTracker(), 0, 1000, swipe(300, 0.7, 0.6, 300))).toEqual([]);
    const vertical = (t: number) => [
      hand({
        ...POSES.twoFingers,
        at: {
          x: 0.5 + Math.min(1, Math.max(0, (t - 300) / 300)) * 0.1,
          y: 0.9 - Math.min(1, Math.max(0, (t - 300) / 300)) * 0.4,
        },
      }),
    ];
    expect(run(new ToolGestureTracker(), 0, 1000, vertical)).toEqual([]);
  });

  it('only swipes with two fingers up', () => {
    const palm = (t: number) => [
      hand({ ...POSES.relaxed, at: { x: 0.7 - Math.min(1, Math.max(0, (t - 300) / 300)) * 0.35, y: 0.7 } }),
    ];
    expect(run(new ToolGestureTracker(), 0, 1000, palm)).toEqual([]);
  });
});

describe('TOOL_TRANSITIONS', () => {
  const states: ToolFsmState[] = ['ready', 'holding', 'active', 'cooling'];
  const inputs: ToolInput[] = ['same', 'other', 'none', 'drawing'];

  it('has exactly one row for every state, input, and confirmation', () => {
    for (const from of states) {
      for (const input of inputs) {
        for (const confirmed of [false, true]) {
          const rows = TOOL_TRANSITIONS.filter(
            (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
          );
          expect(rows, `${from} ${input} ${String(confirmed)}`).toHaveLength(1);
          expect(findToolTransition(from, input, confirmed)).toBe(rows[0]);
        }
      }
    }
  });

  it('fires only when a hold completes, and resets whenever a hand draws', () => {
    expect(TOOL_TRANSITIONS.filter((r) => r.actions.includes('activate'))).toEqual([
      expect.objectContaining({ from: 'holding', input: 'same', confirmed: true, to: 'active' }),
    ]);
    for (const r of TOOL_TRANSITIONS.filter((row) => row.input === 'drawing')) expect(r.to).toBe('ready');
  });

  it('renders as a Mermaid diagram', () => {
    const m = toolFsmMermaid();
    expect(m).toMatch(/^stateDiagram-v2\n/);
    expect(m).toContain('holding --> active: same (confirmed) / activate');
    expect(m).not.toContain('ready --> ready');
  });
});
