import { describe, expect, it } from 'vitest';
import type { HandFrame, InputEvent, Vec2, Vec3 } from '../types.ts';
import {
  DEFAULT_MENU,
  findMenuTransition,
  levelLayout,
  MENU_TRANSITIONS,
  MenuController,
  menuFsmMermaid,
  palmInCanvas,
  RadialMenu,
  wedgeAt,
  type MenuEvent,
  type MenuFrameInput,
  type MenuFsmState,
  type MenuInput,
  type MenuItem,
} from './menu.ts';
import type { PenStatus } from './pinch.ts';

const C = { x: 500, y: 500 };
const R = 100;

// An 8-item ring like the studio's, with a submenu, a disabled item, and a keep-open one.
const TREE: MenuItem[] = [
  { id: 'brush', children: [{ id: 'neon' }, { id: 'sparks' }, { id: 'ink' }] },
  { id: 'color', children: [{ id: 'red' }, { id: 'blue' }] },
  { id: 'size' },
  { id: 'eraser' },
  { id: 'undo', keepOpen: true },
  { id: 'redo', disabled: true },
  {
    id: 'clear',
    slots: 8,
    children: [
      { id: 'keep', slot: 6 },
      { id: 'clearAll', slot: 2 },
    ],
  },
  { id: 'more' },
];

/** A point `dist` radii from the center, toward wedge `i` of 8. */
const toward = (i: number, dist = 1): Vec2 => {
  const a = (i * Math.PI) / 4;
  return { x: C.x + Math.sin(a) * R * dist, y: C.y - Math.cos(a) * R * dist };
};

const open = (p: Vec2): MenuFrameInput => ({ palm: p, ratio: 1, pinched: false, fist: false });
const closing = (p: Vec2): MenuFrameInput => ({ palm: p, ratio: 0.3, pinched: false, fist: false });
const pinched = (p: Vec2): MenuFrameInput => ({ palm: p, ratio: 0.1, pinched: true, fist: false });
const fist = (p: Vec2): MenuFrameInput => ({ palm: p, ratio: 0.1, pinched: false, fist: true });
const lost: MenuFrameInput = { palm: null, ratio: Number.POSITIVE_INFINITY, pinched: false, fist: false };

function opened(tree: MenuItem[] = TREE): RadialMenu {
  const m = new RadialMenu();
  m.open(0, C, R, C, tree);
  return m;
}

/** Feeds `input` for `ms`, one frame every `dt` ms, from `from`. Returns [events, time after]. */
function hold(m: RadialMenu, from: number, ms: number, input: MenuFrameInput, dt: number): [MenuEvent[], number] {
  const events: MenuEvent[] = [];
  let t = from;
  for (; t < from + ms; t += dt) events.push(...m.update(t, input));
  return [events, t];
}

const chosen = (evs: MenuEvent[]) => evs.flatMap((e) => (e.type === 'choose' ? [e.id] : []));
const closed = (evs: MenuEvent[]) => evs.flatMap((e) => (e.type === 'close' ? [e.reason] : []));

describe('wedgeAt', () => {
  it('numbers wedges clockwise from the top', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((i) => wedgeAt(C, R, 8, toward(i), null))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(wedgeAt(C, R, 3, toward(2), null)).toBe(1); // right is the second of three
  });

  it('has a center band that is easier to stay in than to enter', () => {
    expect(wedgeAt(C, R, 8, toward(2, 0.3), null)).toBe('center');
    expect(wedgeAt(C, R, 8, toward(2, 0.4), null)).toBe(2);
    expect(wedgeAt(C, R, 8, toward(2, 0.4), 'center')).toBe('center');
    expect(wedgeAt(C, R, 8, toward(2, 0.5), 'center')).toBe(2);
  });

  it('keeps the highlight a few degrees past a wedge edge', () => {
    // 25° is past the 22.5° edge between wedges 0 and 1, but within the 10° hysteresis.
    const p = { x: C.x + Math.sin((25 * Math.PI) / 180) * R, y: C.y - Math.cos((25 * Math.PI) / 180) * R };
    expect(wedgeAt(C, R, 8, p, 0)).toBe(0);
    expect(wedgeAt(C, R, 8, p, null)).toBe(1);
  });

  it('treats a one-item ring as a single wedge', () => {
    expect(wedgeAt(C, R, 1, toward(5), null)).toBe(0);
  });
});

describe('levelLayout', () => {
  it('places items in order, or in their own slots', () => {
    expect(levelLayout([{ id: 'a' }, { id: 'b' }]).map((i) => i?.id)).toEqual(['a', 'b']);
    const clear = TREE[6]!;
    expect(levelLayout(clear.children!, clear.slots).map((i) => i?.id ?? null)).toEqual([
      null,
      null,
      'clearAll',
      null,
      null,
      null,
      'keep',
      null,
    ]);
  });
});

describe.each([33, 52])('RadialMenu at %i ms per frame', (dt) => {
  it('highlights the wedge the palm points to, and chooses it with a pinch', () => {
    const m = opened();
    const [pointing] = hold(m, 0, 200, open(toward(2)), dt);
    expect(pointing).toContainEqual({ type: 'highlight', target: 2 });
    const [evs] = hold(m, 200, 200, pinched(toward(2)), dt);
    expect(chosen(evs)).toEqual(['size']);
    expect(closed(evs)).toEqual(['chosen']);
    expect(m.isOpen).toBe(false);
  });

  it('chooses where the pinch began, however the palm drifts while the fingers close', () => {
    const m = opened();
    hold(m, 0, 200, open(toward(3)), dt);
    const [drift] = hold(m, 200, 150, closing(toward(1)), dt);
    expect(drift.some((e) => e.type === 'highlight')).toBe(false);
    const [evs] = hold(m, 350, 100, pinched(toward(1)), dt);
    expect(chosen(evs)).toEqual(['eraser']);
  });

  it('repeats a keep-open item only after the pinch is released', () => {
    const m = opened();
    hold(m, 0, 200, open(toward(4)), dt);
    const [first] = hold(m, 200, 600, pinched(toward(4)), dt);
    expect(chosen(first)).toEqual(['undo']);
    expect(m.isOpen).toBe(true);
    hold(m, 800, 200, open(toward(4)), dt);
    const [second] = hold(m, 1000, 200, pinched(toward(4)), dt);
    expect(chosen(second)).toEqual(['undo']);
  });

  it('opens submenus in place, goes back from the center, and closes from the top center', () => {
    const m = opened();
    hold(m, 0, 200, open(toward(0)), dt);
    const [into] = hold(m, 200, 150, pinched(toward(0)), dt);
    expect(into).toContainEqual({ type: 'level', path: ['brush'] });
    // Release, then point at the third of three brushes (bottom left).
    hold(m, 350, 200, open(toward(5)), dt);
    const [pick] = hold(m, 550, 150, pinched(toward(5)), dt);
    expect(chosen(pick)).toEqual(['ink']);

    const again = opened();
    hold(again, 0, 200, open(toward(1)), dt);
    hold(again, 200, 150, pinched(toward(1)), dt);
    expect(again.path).toEqual(['color']);
    hold(again, 350, 200, open(C), dt);
    const [back] = hold(again, 550, 150, pinched(C), dt);
    expect(back).toContainEqual({ type: 'level', path: [] });
    hold(again, 700, 200, open(C), dt);
    const [out] = hold(again, 900, 150, pinched(C), dt);
    expect(closed(out)).toEqual(['center']);
  });

  it("can't choose a disabled item or an empty wedge", () => {
    const m = opened();
    hold(m, 0, 200, open(toward(5)), dt);
    const [evs] = hold(m, 200, 200, pinched(toward(5)), dt);
    expect(chosen(evs)).toEqual([]);
    expect(m.isOpen).toBe(true);

    // Clear's confirm ring has only two items; the Clear wedge itself (left) is Keep.
    const c = opened();
    hold(c, 0, 200, open(toward(6)), dt);
    hold(c, 200, 150, pinched(toward(6)), dt);
    expect(c.path).toEqual(['clear']);
    hold(c, 350, 200, open(toward(6)), dt);
    const [inPlace] = hold(c, 550, 150, pinched(toward(6)), dt);
    expect(chosen(inPlace)).toEqual(['keep']);
  });

  it('closes on a fist held 150 ms, but not a brief one', () => {
    const m = opened();
    const [blip] = hold(m, 0, 100, fist(C), dt);
    hold(m, 100, 100, open(C), dt);
    expect(closed(blip)).toEqual([]);
    const [evs] = hold(m, 200, 300, fist(C), dt);
    expect(closed(evs)).toEqual(['fist']);
  });

  it('closes when the hand moves away or is lost, not on a brief excursion', () => {
    const m = opened();
    const [brief] = hold(m, 0, 250, open(toward(2, 2.5)), dt);
    expect(closed(brief)).toEqual([]);
    hold(m, 250, 100, open(C), dt);
    const [far] = hold(m, 350, 600, open(toward(2, 2.5)), dt);
    expect(closed(far)).toEqual(['far']);

    const gone = opened();
    const [evs] = hold(gone, 0, 700, lost, dt);
    expect(closed(evs)).toEqual(['lost']);
  });

  it('closes after resting in the center, but not while pointing at an item', () => {
    const pointing = opened();
    const [evs] = hold(pointing, 0, 7000, open(toward(3)), dt);
    expect(closed(evs)).toEqual([]);
    const resting = opened();
    const [idle] = hold(resting, 0, 7000, open(C), dt);
    expect(closed(idle)).toEqual(['idle']);
  });
});

describe('RadialMenu', () => {
  it('points relative to where the palm was when it opened', () => {
    const m = new RadialMenu();
    // The ring was moved in from the edge: 150 units right of the palm.
    m.open(0, C, R, { x: C.x - 150, y: C.y }, TREE);
    m.update(0, open({ x: C.x - 150, y: C.y - R }));
    expect(m.highlight).toBe(0);
    expect(m.pointer).toEqual({ x: C.x, y: C.y - R });
  });

  it('keeps the submenu when the items refresh, and leaves it if it disappears', () => {
    const m = opened();
    hold(m, 0, 200, open(toward(1)), 33);
    hold(m, 200, 150, pinched(toward(1)), 33);
    expect(m.setTree(TREE)).toEqual([]);
    expect(m.path).toEqual(['color']);
    expect(m.setTree(TREE.filter((i) => i.id !== 'color'))).toEqual([{ type: 'level', path: [] }]);
  });

  it('reports its layout and closes from outside', () => {
    const m = opened();
    expect(m.wedges.map((w) => w?.id)).toEqual(TREE.map((i) => i.id));
    expect(m.center).toEqual(C);
    expect(m.radius).toBe(R);
    expect(m.close()).toEqual([{ type: 'close', reason: 'cancel' }]);
    expect(m.close()).toEqual([]);
    expect(m.update(0, open(C))).toEqual([]);
  });
});

describe('MENU_TRANSITIONS', () => {
  const states: Array<Exclude<MenuFsmState, 'closed'>> = ['open', 'latched', 'awaitRelease'];
  const inputs: MenuInput[] = ['free', 'closing', 'pinched', 'fist', 'far', 'lost'];

  it('has exactly one row for every state, input, and confirmation', () => {
    for (const from of states) {
      for (const input of inputs) {
        for (const confirmed of [false, true]) {
          const rows = MENU_TRANSITIONS.filter(
            (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
          );
          expect(rows, `${from} ${input} ${String(confirmed)}`).toHaveLength(1);
          expect(findMenuTransition(from, input, confirmed)).toBe(rows[0]);
        }
      }
    }
  });

  it('chooses only on a pinch, and renders as a Mermaid diagram', () => {
    for (const r of MENU_TRANSITIONS.filter((row) => row.actions.includes('choose'))) expect(r.input).toBe('pinched');
    expect(menuFsmMermaid()).toContain('open --> latched: closing');
  });
});

// ---- controller ------------------------------------------------------------------

const SIZE = { width: 1333, height: 1000 };
const BOUNDS = { left: 0, top: 0, right: 1333, bottom: 1000 };

/** A hand whose palm center is at view point `v` (all palm points there). */
function handAt(v: Vec2): Vec3[] {
  return Array.from({ length: 21 }, () => ({ x: 1 - v.x, y: v.y, z: 0 }));
}

const frameOf = (t: number, hands: Array<[string, Vec3[]]>): HandFrame => ({
  frameId: t,
  captureTime: t,
  hands: hands.map(([key, landmarks]) => ({ key, handedness: 'Right', score: 1, landmarks })),
});

const pen = (state: 'hover' | 'drawing', ratio = 1): PenStatus => ({ state, ratio, fist: false });

const openGesture = (at: Vec2, handKey = 'a', palm = 0.15): InputEvent => ({
  type: 'gesture',
  t: 0,
  handKey,
  name: 'openMenu',
  at,
  palm,
});

describe('MenuController', () => {
  it('opens at the hand that asked, sized by its palm, and kept inside the visible area', () => {
    const c = new MenuController();
    const evs = c.update(
      frameOf(0, [['a', handAt({ x: 0.02, y: 0.5 })]]),
      SIZE,
      new Map(),
      [openGesture({ x: 0.02, y: 0.5 })],
      TREE,
      BOUNDS,
    );
    expect(evs).toEqual([{ type: 'open' }]);
    expect(c.handKey).toBe('a');
    expect(c.menu.radius).toBeCloseTo(0.15 * 1000 * DEFAULT_MENU.radiusPalms, 6);
    // 0.02 of the width is 27 canvas units: moved in to leave room for the ring.
    expect(c.menu.center.x).toBeCloseTo(c.menu.radius * DEFAULT_MENU.edgeMargin, 6);
    expect(c.menu.center.y).toBe(500);
  });

  it('ignores other gestures, and gestures while it is already open', () => {
    const c = new MenuController();
    const swipe: InputEvent = { type: 'gesture', t: 0, handKey: 'a', name: 'undo' };
    expect(c.update(frameOf(0, []), SIZE, new Map(), [swipe], TREE, BOUNDS)).toEqual([]);
    c.update(
      frameOf(0, [['a', handAt({ x: 0.5, y: 0.5 })]]),
      SIZE,
      new Map(),
      [openGesture({ x: 0.5, y: 0.5 })],
      TREE,
      BOUNDS,
    );
    const again = c.update(
      frameOf(33, [['a', handAt({ x: 0.5, y: 0.5 })]]),
      SIZE,
      new Map(),
      [openGesture({ x: 0.5, y: 0.5 })],
      TREE,
      BOUNDS,
    );
    expect(again.some((e) => e.type === 'open')).toBe(false);
  });

  it('holds back drawing while open, and the choosing hand until its pinch releases', () => {
    const c = new MenuController();
    const start: InputEvent = { type: 'strokeStart', t: 0, handKey: 'a', p: { x: 0, y: 0, depth: 1 } };
    const end: InputEvent = { type: 'strokeEnd', t: 0, handKey: 'a', reason: 'release' };
    const other: InputEvent = { ...start, handKey: 'b' };
    const center = { x: 0.5, y: 0.5 };
    const size = c.menu.config.radiusPalms * 0.15 * 1000;
    // Point right (wedge 2, "size") by moving the palm one ring radius.
    const right = { x: 0.5 + size / SIZE.width, y: 0.5 };
    c.update(frameOf(0, [['a', handAt(center)]]), SIZE, new Map(), [openGesture(center)], TREE, BOUNDS);
    expect(c.blocks(start)).toBe(true);
    expect(c.blocks(other)).toBe(true);
    expect(c.blocks(end)).toBe(false);
    for (let t = 33; t < 300; t += 33)
      c.update(frameOf(t, [['a', handAt(right)]]), SIZE, new Map([['a', pen('hover')]]), [], TREE, BOUNDS);
    const drawing = new Map([['a', pen('drawing', 0.1)]]);
    const evs = c.update(frameOf(300, [['a', handAt(right)]]), SIZE, drawing, [], TREE, BOUNDS);
    expect(chosen(evs)).toEqual(['size']);
    expect(c.isOpen).toBe(false);
    // Still pinched: the hand can't draw, and the gestures don't see it drawing.
    expect(c.blocks(start)).toBe(true);
    expect(c.blocks(other)).toBe(false);
    expect(c.visiblePens(drawing).size).toBe(0);
    c.update(frameOf(333, [['a', handAt(right)]]), SIZE, new Map([['a', pen('hover')]]), [], TREE, BOUNDS);
    expect(c.blocks(start)).toBe(false);
    expect(c.visiblePens(drawing)).toBe(drawing);
  });

  it('follows the hand when its key changes nearby, and closes when it is lost', () => {
    const c = new MenuController();
    const center = { x: 0.5, y: 0.5 };
    c.update(frameOf(0, [['a', handAt(center)]]), SIZE, new Map(), [openGesture(center)], TREE, BOUNDS);
    c.update(frameOf(33, [['b', handAt({ x: 0.52, y: 0.5 })]]), SIZE, new Map(), [], TREE, BOUNDS);
    expect(c.handKey).toBe('b');
    let evs: MenuEvent[] = [];
    for (let t = 66; t < 700; t += 33)
      evs.push(...c.update(frameOf(t, [['z', handAt({ x: 0.1, y: 0.1 })]]), SIZE, new Map(), [], TREE, BOUNDS));
    expect(closed(evs)).toEqual(['lost']);
    expect(c.handKey).toBeNull();
    evs = c.close();
    expect(evs).toEqual([]);
  });

  it('closes from outside', () => {
    const c = new MenuController();
    const center = { x: 0.5, y: 0.5 };
    c.update(frameOf(0, [['a', handAt(center)]]), SIZE, new Map(), [openGesture(center)], TREE, BOUNDS);
    expect(c.close(new Map([['a', pen('drawing')]]))).toEqual([{ type: 'close', reason: 'cancel' }]);
    expect(c.blocks({ type: 'strokeMove', t: 0, handKey: 'a', p: { x: 0, y: 0, depth: 1 } })).toBe(true);
  });

  it('finds the palm center in canvas units, mirrored', () => {
    expect(palmInCanvas(handAt({ x: 0.25, y: 0.5 }), SIZE)).toEqual({ x: 0.25 * 1333, y: 500 });
  });
});
