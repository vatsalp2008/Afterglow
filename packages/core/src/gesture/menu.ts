// The radial gesture menu: a ring of items around the hand that opened it (an open palm
// held still). Point with the palm, pinch to choose. Driven by an explicit transition
// table (MENU_TRANSITIONS) like the pen and tool gestures; docs/gesture-fsm.md is
// generated from it (ADR 0009).
//
// The pointer is the palm center, not the pen point between the fingertips: the palm
// barely moves while the fingers close (0.02-0.05 ring radii in fixture 04, against up to
// 0.41 for the pen point). And the highlight freezes as soon as the fingers start to
// close, so drift during the pinch can't change the choice.

import { landmarkToView, viewToCanvas, type FrameSize, type Rect } from '../coords.ts';
import type { HandFrame, HandKey, InputEvent, Vec2, Vec3 } from '../types.ts';
import type { PenStatus } from './pinch.ts';

export interface MenuItem {
  id: string;
  /** A submenu, shown in place of the ring when chosen. */
  children?: MenuItem[];
  /** Wedges in this item's submenu; defaults to the number of children. */
  slots?: number;
  /** The wedge this item takes (0 at the top, then clockwise); defaults to its position in the list. */
  slot?: number;
  disabled?: boolean;
  /** Choosing it leaves the menu open, for repeatable actions like undo. */
  keepOpen?: boolean;
}

export interface MenuConfig {
  /** Ring radius in palm lengths of the opening hand, clamped to [minRadius, maxRadius] canvas units. */
  radiusPalms: number;
  minRadius: number;
  maxRadius: number;
  /** The ring is kept this many radii inside the visible edge, leaving room for the items. */
  edgeMargin: number;
  /** The center band (back, or close): entered within centerIn radii, left beyond centerOut. */
  centerIn: number;
  centerOut: number;
  /** Degrees past a wedge's edge before the highlight moves on. */
  hysteresisDeg: number;
  /** Below this pinch measure the fingers are closing, and the highlight freezes (the pen's release threshold). */
  freezeBelow: number;
  /** A fist held this long closes the menu. */
  fistMs: number;
  /** The pointer beyond farRadii radii for farMs closes the menu. */
  farRadii: number;
  farMs: number;
  /** The hand missing this long closes the menu. */
  lostMs: number;
  /** Resting in the center this long closes the menu. */
  idleMs: number;
}

export const DEFAULT_MENU: MenuConfig = {
  radiusPalms: 1.2,
  minRadius: 110,
  maxRadius: 280,
  edgeMargin: 1.35,
  centerIn: 0.35,
  centerOut: 0.45,
  hysteresisDeg: 10,
  freezeBelow: 0.4,
  fistMs: 150,
  farRadii: 2,
  farMs: 400,
  lostMs: 500,
  idleMs: 6000,
};

/** A wedge index (0 at the top, clockwise) or the center band. */
export type MenuTarget = number | 'center';

export type MenuCloseReason = 'fist' | 'far' | 'lost' | 'idle' | 'center' | 'chosen' | 'cancel';

export type MenuEvent =
  | { type: 'open' }
  | { type: 'highlight'; target: MenuTarget | null }
  | { type: 'level'; path: readonly string[] }
  | { type: 'choose'; id: string }
  | { type: 'close'; reason: MenuCloseReason };

// ---- geometry ------------------------------------------------------------------

/** Angle clockwise from the top (canvas y points down), in [0, 2π). */
function clockAngle(d: Vec2): number {
  const a = Math.atan2(d.x, -d.y);
  return a < 0 ? a + 2 * Math.PI : a;
}

/** The unsigned angle between two clock angles. */
function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/** Where wedge `i` of `slots` points, as a clock angle. */
export function wedgeAngle(i: number, slots: number): number {
  return (i * 2 * Math.PI) / slots;
}

/** The wedge (or the center band) at point `p`, with hysteresis against the previous target. */
export function wedgeAt(
  center: Vec2,
  radius: number,
  slots: number,
  p: Vec2,
  prev: MenuTarget | null,
  config: Pick<MenuConfig, 'centerIn' | 'centerOut' | 'hysteresisDeg'> = DEFAULT_MENU,
): MenuTarget {
  const d = { x: p.x - center.x, y: p.y - center.y };
  const dist = Math.hypot(d.x, d.y) / radius;
  if (dist < config.centerIn || (prev === 'center' && dist < config.centerOut)) return 'center';
  if (slots <= 1) return 0;
  const angle = clockAngle(d);
  const half = Math.PI / slots;
  if (
    typeof prev === 'number' &&
    angleBetween(angle, wedgeAngle(prev, slots)) <= half + (config.hysteresisDeg * Math.PI) / 180
  ) {
    return prev;
  }
  return Math.round(angle / (2 * half)) % slots;
}

/** The items of a menu level placed in their wedges. */
export function levelLayout(items: readonly MenuItem[], slots = items.length): Array<MenuItem | null> {
  const wedges: Array<MenuItem | null> = Array.from({ length: Math.max(1, slots) }, () => null);
  items.forEach((item, i) => {
    const slot = item.slot ?? i;
    if (slot >= 0 && slot < wedges.length) wedges[slot] = item;
  });
  return wedges;
}

// ---- state machine -------------------------------------------------------------

export type MenuFsmState = 'open' | 'latched' | 'awaitRelease' | 'closed';

/**
 * What the menu hand is doing: **free** (open hand, in reach), fingers **closing**
 * (the pinch measure below freezeBelow), **pinched**, a **fist**, **far** from the
 * ring, or **lost**.
 */
export type MenuInput = 'free' | 'closing' | 'pinched' | 'fist' | 'far' | 'lost';

export type MenuAction =
  | 'point' // update the highlight
  | 'choose' // act on the highlighted item
  | 'close';

export interface MenuTransition {
  from: Exclude<MenuFsmState, 'closed'>;
  input: MenuInput;
  /**
   * When set, the row applies only if the input has (or hasn't) lasted long enough:
   * fistMs, farMs, or lostMs; for free, idleMs resting in the center.
   */
  confirmed?: boolean;
  to: MenuFsmState;
  actions: readonly MenuAction[];
}

const closers = (from: 'open' | 'latched' | 'awaitRelease'): MenuTransition[] =>
  (['fist', 'far', 'lost'] as const).flatMap((input) => [
    { from, input, confirmed: true, to: 'closed' as const, actions: ['close' as const] },
    { from, input, confirmed: false, to: from, actions: [] },
  ]);

export const MENU_TRANSITIONS: readonly MenuTransition[] = [
  { from: 'open', input: 'free', confirmed: false, to: 'open', actions: ['point'] },
  { from: 'open', input: 'free', confirmed: true, to: 'closed', actions: ['close'] },
  // The fingers start closing: the highlight freezes where it was the frame before.
  { from: 'open', input: 'closing', to: 'latched', actions: [] },
  { from: 'open', input: 'pinched', to: 'awaitRelease', actions: ['point', 'choose'] },
  ...closers('open'),

  { from: 'latched', input: 'free', to: 'open', actions: ['point'] },
  { from: 'latched', input: 'closing', to: 'latched', actions: [] },
  { from: 'latched', input: 'pinched', to: 'awaitRelease', actions: ['choose'] },
  ...closers('latched'),

  // After a choice that keeps the menu open, the pinch must release before the next one.
  { from: 'awaitRelease', input: 'free', to: 'open', actions: ['point'] },
  { from: 'awaitRelease', input: 'closing', to: 'awaitRelease', actions: [] },
  { from: 'awaitRelease', input: 'pinched', to: 'awaitRelease', actions: [] },
  ...closers('awaitRelease'),
];

export function findMenuTransition(
  from: Exclude<MenuFsmState, 'closed'>,
  input: MenuInput,
  confirmed: boolean,
): MenuTransition {
  const row = MENU_TRANSITIONS.find(
    (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
  );
  if (!row) throw new Error(`No menu transition from ${from} on ${input}`);
  return row;
}

/** The menu table as a Mermaid state diagram (docs/gesture-fsm.md is generated from this). */
export function menuFsmMermaid(): string {
  const lines = ['stateDiagram-v2', '  [*] --> open: open palm held'];
  for (const r of MENU_TRANSITIONS) {
    if (r.from === r.to && r.actions.length === 0) continue; // waiting self-loops
    const guard = r.confirmed === undefined ? '' : r.confirmed ? ' (confirmed)' : ' (not yet)';
    const target = r.to === 'closed' ? '[*]' : r.to;
    lines.push(`  ${r.from} --> ${target}: ${r.input}${guard}${r.actions.length ? ` / ${r.actions.join(', ')}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

export interface MenuFrameInput {
  /** The menu hand's palm center (canvas units), or null when it isn't seen. */
  palm: Vec2 | null;
  /** Its pinch measure (PenStatus.ratio). */
  ratio: number;
  /** Its pinch is confirmed (the pen is down). */
  pinched: boolean;
  fist: boolean;
}

export class RadialMenu {
  config: MenuConfig;
  private fsm: MenuFsmState = 'closed';
  private tree: MenuItem[] = [];
  private levelPath: string[] = [];
  private target: MenuTarget | null = null;
  private ringCenter: Vec2 = { x: 0, y: 0 };
  private ringRadius = 1;
  private anchor: Vec2 = { x: 0, y: 0 };
  private lastPointer: Vec2 | null = null;
  // When the current input began (for fist, far, lost), and since when the pointer has rested in the center.
  private input: MenuInput | null = null;
  private inputSince = 0;
  private centerSince: number | null = null;

  constructor(config: MenuConfig = DEFAULT_MENU) {
    this.config = config;
  }

  get state(): MenuFsmState {
    return this.fsm;
  }

  get isOpen(): boolean {
    return this.fsm !== 'closed';
  }

  get center(): Vec2 {
    return this.ringCenter;
  }

  get radius(): number {
    return this.ringRadius;
  }

  /** Where the palm points, in canvas units, or null when it isn't seen. */
  get pointer(): Vec2 | null {
    return this.lastPointer;
  }

  get highlight(): MenuTarget | null {
    return this.target;
  }

  get path(): readonly string[] {
    return this.levelPath;
  }

  /** The current level's wedges. */
  get wedges(): Array<MenuItem | null> {
    const { items, slots } = this.level();
    return levelLayout(items, slots);
  }

  /**
   * Opens the ring at `center` (canvas units). The pointer moves with the palm relative to
   * where it was at opening (`anchor`), so a ring shifted in from the screen edge still
   * starts with the pointer in its center.
   */
  open(t: number, center: Vec2, radius: number, anchor: Vec2, tree: MenuItem[]): MenuEvent[] {
    this.fsm = 'open';
    this.tree = tree;
    this.levelPath = [];
    this.target = null;
    this.ringCenter = center;
    this.ringRadius = radius;
    this.anchor = anchor;
    this.lastPointer = center;
    this.input = null;
    this.inputSince = t;
    this.centerSince = t;
    return [{ type: 'open' }];
  }

  /** Replaces the items (say, Undo became available), staying in the current submenu if it still exists. */
  setTree(tree: MenuItem[]): MenuEvent[] {
    this.tree = tree;
    let level = tree;
    const kept: string[] = [];
    for (const id of this.levelPath) {
      const item = level.find((i) => i.id === id && i.children);
      if (!item?.children) break;
      kept.push(id);
      level = item.children;
    }
    if (kept.length === this.levelPath.length) return [];
    this.levelPath = kept;
    this.target = null;
    return [{ type: 'level', path: this.levelPath }];
  }

  close(reason: MenuCloseReason = 'cancel'): MenuEvent[] {
    if (!this.isOpen) return [];
    this.fsm = 'closed';
    this.target = null;
    this.lastPointer = null;
    return [{ type: 'close', reason }];
  }

  update(t: number, frame: MenuFrameInput): MenuEvent[] {
    if (this.fsm === 'closed') return [];
    const events: MenuEvent[] = [];
    const pointer = frame.palm && {
      x: this.ringCenter.x + frame.palm.x - this.anchor.x,
      y: this.ringCenter.y + frame.palm.y - this.anchor.y,
    };
    if (pointer) this.lastPointer = pointer;
    const input = this.classify(pointer, frame);
    if (input !== this.input) {
      this.input = input;
      this.inputSince = t;
    }
    const row = findMenuTransition(this.fsm, input, this.confirmed(t, input));
    for (const action of row.actions) {
      if (action === 'point' && pointer) this.point(t, pointer, events);
      if (action === 'choose') this.choose(events);
      if (action === 'close') events.push(...this.close(this.closeReason(input)));
    }
    // choose() may have closed the menu already.
    if (this.isOpen) this.fsm = row.to;
    return events;
  }

  private level(): { items: MenuItem[]; slots: number } {
    let items = this.tree;
    let slots = items.length;
    for (const id of this.levelPath) {
      const item = items.find((i) => i.id === id);
      if (!item?.children) break;
      items = item.children;
      slots = item.slots ?? item.children.length;
    }
    return { items, slots };
  }

  private classify(pointer: Vec2 | null, frame: MenuFrameInput): MenuInput {
    if (!pointer) return 'lost';
    if (frame.fist) return 'fist';
    const dist = Math.hypot(pointer.x - this.ringCenter.x, pointer.y - this.ringCenter.y);
    if (dist > this.config.farRadii * this.ringRadius) return 'far';
    if (frame.pinched) return 'pinched';
    if (frame.ratio < this.config.freezeBelow) return 'closing';
    return 'free';
  }

  private confirmed(t: number, input: MenuInput): boolean {
    const c = this.config;
    const held = t - this.inputSince;
    switch (input) {
      case 'fist':
        return held >= c.fistMs;
      case 'far':
        return held >= c.farMs;
      case 'lost':
        return held >= c.lostMs;
      case 'free':
        return this.target === 'center' && this.centerSince !== null && t - this.centerSince >= c.idleMs;
      default:
        return false;
    }
  }

  private closeReason(input: MenuInput): MenuCloseReason {
    return input === 'fist' || input === 'far' || input === 'lost' ? input : 'idle';
  }

  private point(t: number, pointer: Vec2, events: MenuEvent[]): void {
    const next = wedgeAt(this.ringCenter, this.ringRadius, this.level().slots, pointer, this.target, this.config);
    if (next === 'center') this.centerSince ??= t;
    else this.centerSince = null;
    if (next !== this.target) {
      this.target = next;
      events.push({ type: 'highlight', target: next });
    }
  }

  private choose(events: MenuEvent[]): void {
    const target = this.target;
    if (target === null) return;
    if (target === 'center') {
      if (this.levelPath.length === 0) {
        events.push(...this.close('center'));
        return;
      }
      this.levelPath = this.levelPath.slice(0, -1);
      this.target = null;
      events.push({ type: 'level', path: this.levelPath });
      return;
    }
    const item = this.wedges[target];
    if (!item || item.disabled) return;
    if (item.children) {
      this.levelPath = [...this.levelPath, item.id];
      this.target = null;
      events.push({ type: 'level', path: this.levelPath });
      return;
    }
    events.push({ type: 'choose', id: item.id });
    if (!item.keepOpen) events.push(...this.close('chosen'));
  }
}

// ---- binding to hands ------------------------------------------------------------

const PALM_POINTS = [0, 5, 9, 13, 17];

/** A hand's palm center in canvas units (view space, so mirrored like everything the user sees). */
export function palmInCanvas(landmarks: readonly Vec3[], frame: FrameSize): Vec2 {
  let x = 0;
  let y = 0;
  for (const i of PALM_POINTS) {
    const v = landmarkToView(landmarks[i]!);
    x += v.x;
    y += v.y;
  }
  return viewToCanvas({ x: x / PALM_POINTS.length, y: y / PALM_POINTS.length }, frame);
}

/**
 * Connects the menu to the tracked hands: opens it on an openMenu gesture at that hand,
 * feeds it the hand's palm and pinch each frame, follows the hand if its key changes,
 * and says which pen events to hold back so choosing never draws.
 */
export class MenuController {
  readonly menu: RadialMenu;
  private hand: HandKey | null = null;
  private lastPalm: Vec2 | null = null;
  /** Hands whose pinch chose something, ignored for drawing until the pinch releases. */
  private waiting = new Set<HandKey>();

  constructor(config: MenuConfig = DEFAULT_MENU) {
    this.menu = new RadialMenu(config);
  }

  get isOpen(): boolean {
    return this.menu.isOpen;
  }

  get handKey(): HandKey | null {
    return this.hand;
  }

  /**
   * Whether to drop a pen event: every stroke start and move while the menu is open, and
   * those of a hand whose choosing pinch hasn't released yet. Ends and hovers pass.
   */
  blocks(ev: InputEvent): boolean {
    if (ev.type !== 'strokeStart' && ev.type !== 'strokeMove') return false;
    return this.menu.isOpen || this.waiting.has(ev.handKey);
  }

  /** The pens as the tool gestures should see them: a waiting hand isn't drawing. */
  visiblePens(pens: ReadonlyMap<HandKey, PenStatus>): ReadonlyMap<HandKey, PenStatus> {
    if (this.waiting.size === 0) return pens;
    return new Map([...pens].filter(([key]) => !this.waiting.has(key)));
  }

  /**
   * Call once per frame, after the pen and the tool gestures have seen it. `gestures` are
   * the tool gesture events of this frame; `bounds` is the visible part of the canvas.
   */
  update(
    frame: HandFrame,
    size: FrameSize,
    pens: ReadonlyMap<HandKey, PenStatus>,
    gestures: readonly InputEvent[],
    tree: MenuItem[],
    bounds: Rect,
  ): MenuEvent[] {
    const t = frame.captureTime;
    for (const key of this.waiting) if (pens.get(key)?.state !== 'drawing') this.waiting.delete(key);

    if (!this.menu.isOpen) {
      const open = gestures.find((g) => g.type === 'gesture' && g.name === 'openMenu');
      if (open?.type !== 'gesture' || !open.at || !open.palm) return [];
      const c = this.menu.config;
      const anchor = viewToCanvas(open.at, size);
      const radius = Math.min(c.maxRadius, Math.max(c.minRadius, open.palm * size.height * c.radiusPalms));
      const m = radius * c.edgeMargin;
      const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
      const center = {
        x: clamp(anchor.x, bounds.left + m, bounds.right - m),
        y: clamp(anchor.y, bounds.top + m, bounds.bottom - m),
      };
      this.hand = open.handKey;
      this.lastPalm = anchor;
      return this.menu.open(t, center, radius, anchor, tree);
    }

    this.menu.setTree(tree);
    const hand = this.findHand(frame, size);
    const pen = hand ? pens.get(hand.key) : undefined;
    const events = this.menu.update(t, {
      palm: hand?.palm ?? null,
      ratio: pen?.ratio ?? Number.POSITIVE_INFINITY,
      pinched: pen?.state === 'drawing',
      fist: pen?.fist ?? false,
    });
    // The update may have closed it (read through state: isOpen was narrowed above).
    if (this.menu.state === 'closed') this.finish(pens);
    return events;
  }

  /** Closes the menu from outside (camera switch, playback ending). */
  close(pens: ReadonlyMap<HandKey, PenStatus> = new Map()): MenuEvent[] {
    const events = this.menu.close('cancel');
    this.finish(pens);
    return events;
  }

  private finish(pens: ReadonlyMap<HandKey, PenStatus>): void {
    if (this.hand && pens.get(this.hand)?.state === 'drawing') this.waiting.add(this.hand);
    this.hand = null;
    this.lastPalm = null;
  }

  /** The menu hand, or the hand nearest where it was (within a ring radius) if its key changed. */
  private findHand(frame: HandFrame, size: FrameSize): { key: HandKey; palm: Vec2 } | null {
    const hands = frame.hands.map((h) => ({ key: h.key, palm: palmInCanvas(h.landmarks, size) }));
    let hand = hands.find((h) => h.key === this.hand) ?? null;
    if (!hand && this.lastPalm) {
      const last = this.lastPalm;
      const near = hands
        .map((h) => ({ h, d: Math.hypot(h.palm.x - last.x, h.palm.y - last.y) }))
        .filter(({ d }) => d <= this.menu.radius)
        .sort((a, b) => a.d - b.d)[0];
      hand = near?.h ?? null;
      if (hand) this.hand = hand.key;
    }
    if (hand) this.lastPalm = hand.palm;
    return hand;
  }
}
