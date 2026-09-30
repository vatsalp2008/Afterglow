// Tool gestures: hand poses that trigger commands instead of drawing.
//
//   open palm, fingers spread, held still 400 ms   -> openMenu
//   fist held 300 ms                                -> pause (the studio toggles it)
//   two fingers up, swiped left or right            -> undo or redo
//   both hands framing, thumbs together, 500 ms     -> refine
//
// One state machine covers all of them, driven by an explicit transition table
// (TOOL_TRANSITIONS) like the pen's. Each frame the hands are reduced to at most one
// candidate gesture. "holding" waits out the hold time, "active" is a fired gesture
// whose pose is still held (a held pose fires once; swipes fire while it's active),
// and "cooling" blocks everything for a moment after the pose ends, so the hand
// relaxing out of one gesture doesn't trigger another. Nothing fires while any hand
// is drawing. Thresholds were measured on fixtures 10 to 13 (ADR 0006).

import type { HandFrame, HandKey, InputEvent, Vec3 } from '../types.ts';
import { dist, extension, toUnits } from './geometry.ts';
import type { PenStatus } from './pinch.ts';

export type HandPose = 'openPalm' | 'fist' | 'twoFingers' | 'frameCorner' | 'none';

export interface ToolGestureConfig {
  /** A finger is extended at or above this extension (see `extension`)... */
  extended: number;
  /** ...and curled at or below this one. */
  curled: number;
  /**
   * A fist's index must be curled below this, as for the pen's fist gate: in a pinch the
   * index reaches out to the thumb even when the other fingers curl.
   */
  fistIndex: number;
  /** Open palm: minimum thumb spread and finger fan, in palm lengths. */
  palmThumbSpread: number;
  palmFan: number;
  /** Frame corner (an L of thumb and index): minimum thumb spread, and how steeply the index points up (degrees). */
  frameThumbSpread: number;
  frameIndexRise: number;
  /** Frame: the two thumb tips must be within this many palm lengths of each other. */
  frameThumbGap: number;
  /** How long each pose must be held before it fires, in ms. */
  openMenuMs: number;
  pauseMs: number;
  refineMs: number;
  /** Two fingers must be up this long before a swipe counts. */
  swipeArmMs: number;
  /**
   * A held open palm must stay within this many palm lengths of where the hold began, and
   * its thumb-to-index distance within stillShape palm lengths: a hand opening on its way
   * into a pinch isn't holding a pose.
   */
  stillPalms: number;
  stillShape: number;
  /** Swipe: horizontal travel in palm lengths, reached within swipeMaxMs of starting to move. */
  swipePalms: number;
  swipeMaxMs: number;
  /** Speed in palm lengths per second above which the hand counts as moving. */
  moveSpeed: number;
  /** A move the opposite way that starts within this long after a swipe ends is the hand returning. */
  returnMs: number;
  /** A pose missing for up to this long (misread frames) still counts as held. */
  gapMs: number;
  /** After a gesture's pose ends, nothing new starts for this long. */
  cooldownMs: number;
  /**
   * A hand with more landmarks than this outside the frame makes no gesture: MediaPipe
   * guesses the hidden part, often as curled fingers (fixture 05).
   */
  maxOutside: number;
}

export const DEFAULT_TOOL_GESTURES: ToolGestureConfig = {
  extended: 1.55,
  curled: 1.25,
  fistIndex: 1.1,
  palmThumbSpread: 0.8,
  palmFan: 1.15,
  frameThumbSpread: 0.7,
  frameIndexRise: 55,
  frameThumbGap: 1,
  openMenuMs: 400,
  pauseMs: 300,
  refineMs: 500,
  swipeArmMs: 100,
  stillPalms: 0.3,
  stillShape: 0.2,
  swipePalms: 1.5,
  swipeMaxMs: 500,
  moveSpeed: 1.5,
  returnMs: 1000,
  gapMs: 100,
  cooldownMs: 800,
  maxOutside: 2,
};

// ---- hand shape --------------------------------------------------------------

export interface HandShape {
  /** Per-finger extension: about 2 when straight, under 1.2 when curled. */
  index: number;
  middle: number;
  ring: number;
  little: number;
  /** Thumb tip to index knuckle, in palm lengths: how far the thumb is spread. */
  thumbSpread: number;
  /** Index tip to little tip, in palm lengths: how far the fingers are fanned. */
  fan: number;
  /** How steeply the index finger points up, in degrees (90 is straight up, 0 sideways, negative down). */
  indexRise: number;
}

export function handShape(landmarks: readonly Vec3[], aspect: number): HandShape {
  const u = landmarks.map((p) => toUnits(p, aspect));
  const palm = Math.max(dist(u[0]!, u[9]!), 1e-6);
  const knuckle = u[5]!;
  const tip = u[8]!;
  return {
    index: extension(u, 8, 5),
    middle: extension(u, 12, 9),
    ring: extension(u, 16, 13),
    little: extension(u, 20, 17),
    thumbSpread: dist(u[4]!, knuckle) / palm,
    fan: dist(tip, u[20]!) / palm,
    // Image y grows downward.
    indexRise: (Math.atan2(knuckle.y - tip.y, Math.abs(tip.x - knuckle.x)) * 180) / Math.PI,
  };
}

export function classifyPose(s: HandShape, c: ToolGestureConfig = DEFAULT_TOOL_GESTURES): HandPose {
  const ext = (v: number) => v >= c.extended;
  const curl = (v: number) => v <= c.curled;
  const others = [s.middle, s.ring, s.little];
  if (ext(s.index) && others.every(ext) && s.thumbSpread >= c.palmThumbSpread && s.fan >= c.palmFan) {
    return 'openPalm';
  }
  if (s.index < c.fistIndex && others.every(curl)) return 'fist';
  if (ext(s.index) && ext(s.middle) && curl(s.ring) && curl(s.little)) return 'twoFingers';
  if (ext(s.index) && others.every(curl) && s.thumbSpread >= c.frameThumbSpread && s.indexRise >= c.frameIndexRise) {
    return 'frameCorner';
  }
  return 'none';
}

// ---- state machine -------------------------------------------------------------

export type ToolFsmState = 'ready' | 'holding' | 'active' | 'cooling';

/**
 * The frame's candidate, relative to the current one: **same** gesture on the same hands,
 * an **other** gesture (or the same one restarted), **none**, or a hand is **drawing**.
 */
export type ToolInput = 'same' | 'other' | 'none' | 'drawing';

export type ToolAction =
  | 'begin' // start holding the frame's candidate
  | 'activate' // the hold is complete: a held pose fires its gesture
  | 'track' // the pose is still held: swipes fire from here
  | 'cool' // the pose ended: start the cooldown
  | 'clear'; // forget the candidate

export interface ToolTransition {
  from: ToolFsmState;
  input: ToolInput;
  /** When set, the row applies only if the hold (holding) or the cooldown (cooling) is (or isn't) complete. */
  confirmed?: boolean;
  to: ToolFsmState;
  actions: readonly ToolAction[];
}

export const TOOL_TRANSITIONS: readonly ToolTransition[] = [
  { from: 'ready', input: 'same', to: 'holding', actions: ['begin'] },
  { from: 'ready', input: 'other', to: 'holding', actions: ['begin'] },
  { from: 'ready', input: 'none', to: 'ready', actions: [] },
  { from: 'ready', input: 'drawing', to: 'ready', actions: [] },

  { from: 'holding', input: 'same', confirmed: true, to: 'active', actions: ['activate'] },
  { from: 'holding', input: 'same', confirmed: false, to: 'holding', actions: [] },
  { from: 'holding', input: 'other', to: 'holding', actions: ['begin'] },
  { from: 'holding', input: 'none', to: 'ready', actions: ['clear'] },
  { from: 'holding', input: 'drawing', to: 'ready', actions: ['clear'] },

  { from: 'active', input: 'same', to: 'active', actions: ['track'] },
  { from: 'active', input: 'other', to: 'cooling', actions: ['cool'] },
  { from: 'active', input: 'none', to: 'cooling', actions: ['cool'] },
  { from: 'active', input: 'drawing', to: 'ready', actions: ['clear'] },

  // "confirmed" here means the cooldown has run out.
  { from: 'cooling', input: 'same', confirmed: true, to: 'holding', actions: ['begin'] },
  { from: 'cooling', input: 'same', confirmed: false, to: 'cooling', actions: [] },
  { from: 'cooling', input: 'other', confirmed: true, to: 'holding', actions: ['begin'] },
  { from: 'cooling', input: 'other', confirmed: false, to: 'cooling', actions: [] },
  { from: 'cooling', input: 'none', confirmed: true, to: 'ready', actions: [] },
  { from: 'cooling', input: 'none', confirmed: false, to: 'cooling', actions: [] },
  { from: 'cooling', input: 'drawing', to: 'ready', actions: [] },
];

export function findToolTransition(from: ToolFsmState, input: ToolInput, confirmed: boolean): ToolTransition {
  const row = TOOL_TRANSITIONS.find(
    (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
  );
  if (!row) throw new Error(`No tool transition from ${from} on ${input}`);
  return row;
}

/** The tool gesture table as a Mermaid state diagram (docs/gesture-fsm.md is generated from this). */
export function toolFsmMermaid(): string {
  const lines = ['stateDiagram-v2', '  [*] --> ready'];
  for (const r of TOOL_TRANSITIONS) {
    if (r.from === r.to && r.actions.length === 0) continue; // waiting self-loops
    const guard = r.confirmed === undefined ? '' : r.confirmed ? ' (confirmed)' : ' (not yet)';
    lines.push(`  ${r.from} --> ${r.to}: ${r.input}${guard}${r.actions.length ? ` / ${r.actions.join(', ')}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---- recognizer ----------------------------------------------------------------

type CandidateKind = 'openMenu' | 'pause' | 'refine' | 'swipe';

interface Candidate {
  kind: CandidateKind;
  /** The hands making it; two for the frame. */
  hands: HandKey[];
  /** In view space units (mirrored x, frame-height scale). */
  center: { x: number; y: number };
  /** Palm length in the same units. */
  palm: number;
  /** Thumb tip to index tip, in palm lengths (first hand). */
  opening: number;
}

interface Current extends Candidate {
  since: number;
  lastSeen: number;
  anchor: { x: number; y: number; opening: number };
}

interface Move {
  dir: -1 | 1;
  start: { t: number; x: number; y: number };
  fired: boolean;
  isReturn: boolean;
}

// Priority when several candidates are present and none is already being held.
const PRIORITY: readonly CandidateKind[] = ['refine', 'pause', 'openMenu', 'swipe'];

const sameHands = (a: readonly HandKey[], b: readonly HandKey[]) =>
  a.length === b.length && a.every((k, i) => k === b[i]);

export class ToolGestureTracker {
  config: ToolGestureConfig;
  private state: ToolFsmState = 'ready';
  private current: Current | null = null;
  private coolSince = 0;
  // Swipe tracking while two fingers are held.
  private prev: { t: number; x: number; y: number } | null = null;
  private move: Move | null = null;
  private lastSwipe: { dir: -1 | 1; end: number | null } | null = null;

  constructor(config: ToolGestureConfig = DEFAULT_TOOL_GESTURES) {
    this.config = config;
  }

  get fsmState(): ToolFsmState {
    return this.state;
  }

  /** Feed one frame of (filtered) hands, after the pen has seen it. `aspect` is frame width / height. */
  update(frame: HandFrame, aspect: number, pens: ReadonlyMap<HandKey, PenStatus>): InputEvent[] {
    const t = frame.captureTime;
    const events: InputEvent[] = [];
    const drawing = [...pens.values()].some((p) => p.state === 'drawing');
    const candidates = drawing ? [] : this.candidates(frame, aspect);
    const { input, candidate } = drawing
      ? { input: 'drawing' as const, candidate: null }
      : this.classify(candidates, t);
    // A misread frame can extend a hold but not complete it.
    const confirmed = this.state === 'holding' && !candidate ? false : this.confirmed(t);

    const row = findToolTransition(this.state, input, confirmed);
    for (const action of row.actions) {
      switch (action) {
        case 'begin':
          if (candidate) {
            this.current = {
              ...candidate,
              since: t,
              lastSeen: t,
              anchor: { ...candidate.center, opening: candidate.opening },
            };
            this.prev = null;
            this.move = null;
            this.lastSwipe = null;
          }
          break;
        case 'activate': {
          const c = this.current;
          if (c && c.kind !== 'swipe') {
            // Candidate centers are in view units scaled by the aspect in x.
            const at = { x: c.center.x / aspect, y: c.center.y };
            events.push({ type: 'gesture', t, handKey: c.hands[0]!, name: c.kind, at, palm: c.palm });
          }
          break;
        }
        case 'track':
          if (this.current?.kind === 'swipe' && candidate) this.trackSwipe(candidate, t, events);
          break;
        case 'cool':
          this.coolSince = this.current?.lastSeen ?? t;
          this.current = null;
          break;
        case 'clear':
          this.current = null;
          break;
      }
    }
    if (candidate && this.current && input === 'same') {
      this.current.lastSeen = t;
      this.current.center = candidate.center;
      this.current.palm = candidate.palm;
    }
    this.state = row.to;
    return events;
  }

  /**
   * After the menu closes: whatever pose is held now counts as used, so neither the palm
   * nor the fist that closed the menu fires again until the pose ends and the cooldown
   * passes. With no pose held, the cooldown starts now.
   */
  latch(frame: HandFrame, aspect: number): void {
    const t = frame.captureTime;
    const held = this.classify(this.candidates(frame, aspect), t).candidate;
    this.prev = null;
    this.move = null;
    this.lastSwipe = null;
    if (held) {
      this.current = { ...held, since: t, lastSeen: t, anchor: { ...held.center, opening: held.opening } };
      this.state = 'active';
    } else {
      this.current = null;
      this.coolSince = t;
      this.state = 'cooling';
    }
  }

  reset(): void {
    this.state = 'ready';
    this.current = null;
    this.prev = null;
    this.move = null;
    this.lastSwipe = null;
  }

  private confirmed(t: number): boolean {
    if (this.state === 'cooling') return t - this.coolSince >= this.config.cooldownMs;
    if (this.state === 'holding' && this.current) return t - this.current.since >= this.holdMs(this.current.kind);
    return false;
  }

  private holdMs(kind: CandidateKind): number {
    const c = this.config;
    return { openMenu: c.openMenuMs, pause: c.pauseMs, refine: c.refineMs, swipe: c.swipeArmMs }[kind];
  }

  /** Relates this frame's candidates to the current one, tolerating brief misreads. */
  private classify(candidates: Candidate[], t: number): { input: ToolInput; candidate: Candidate | null } {
    const cur = this.current;
    if (cur) {
      const same = candidates.find((c) => c.kind === cur.kind && sameHands(c.hands, cur.hands));
      if (same) {
        // A held open palm that wanders or changes shape restarts its hold from where it is now.
        const moved =
          this.state === 'holding' &&
          same.kind === 'openMenu' &&
          (Math.hypot(same.center.x - cur.anchor.x, same.center.y - cur.anchor.y) >
            this.config.stillPalms * same.palm ||
            Math.abs(same.opening - cur.anchor.opening) > this.config.stillShape);
        return { input: moved ? 'other' : 'same', candidate: same };
      }
      if (candidates.length === 0 && t - cur.lastSeen <= this.config.gapMs) return { input: 'same', candidate: null };
    }
    const next = PRIORITY.map((k) => candidates.find((c) => c.kind === k)).find((c) => c !== undefined);
    return next ? { input: 'other', candidate: next } : { input: 'none', candidate: null };
  }

  private candidates(frame: HandFrame, aspect: number): Candidate[] {
    const inView = (p: Vec3) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    const visible = frame.hands.filter((h) => h.landmarks.filter((p) => !inView(p)).length <= this.config.maxOutside);
    const hands = visible.map((h) => {
      const u = h.landmarks.map((p) => toUnits(p, aspect));
      const palm = Math.max(dist(u[0]!, u[9]!), 1e-6);
      let x = 0;
      let y = 0;
      for (const i of [0, 5, 9, 13, 17]) {
        x += u[i]!.x;
        y += u[i]!.y;
      }
      return {
        key: h.key,
        pose: classifyPose(handShape(h.landmarks, aspect), this.config),
        // View space: mirrored x.
        center: { x: aspect - x / 5, y: y / 5 },
        thumb: u[4]!,
        palm,
        opening: dist(u[4]!, u[8]!) / palm,
      };
    });
    const out: Candidate[] = [];
    const corners = hands.filter((h) => h.pose === 'frameCorner');
    for (let i = 0; i < corners.length; i++) {
      for (let j = i + 1; j < corners.length; j++) {
        const a = corners[i]!;
        const b = corners[j]!;
        const palm = (a.palm + b.palm) / 2;
        if (dist(a.thumb, b.thumb) > this.config.frameThumbGap * palm) continue;
        out.push({
          kind: 'refine',
          hands: [a.key, b.key].sort(),
          center: { x: (a.center.x + b.center.x) / 2, y: (a.center.y + b.center.y) / 2 },
          palm,
          opening: a.opening,
        });
      }
    }
    const kinds: Partial<Record<HandPose, CandidateKind>> = {
      openPalm: 'openMenu',
      fist: 'pause',
      twoFingers: 'swipe',
    };
    for (const h of hands) {
      const kind = kinds[h.pose];
      if (kind) out.push({ kind, hands: [h.key], center: h.center, palm: h.palm, opening: h.opening });
    }
    return out;
  }

  /**
   * Splits the two-finger hand's horizontal motion into moves and fires one gesture per
   * swipe: left (in the mirrored view, the user's left) is undo, right is redo.
   */
  private trackSwipe(c: Candidate, t: number, events: InputEvent[]): void {
    const cfg = this.config;
    const prev = this.prev;
    const here = { t, x: c.center.x, y: c.center.y };
    this.prev = here;
    if (!prev || t <= prev.t) return;
    const speed = ((here.x - prev.x) / c.palm / (t - prev.t)) * 1000;
    const moving = Math.abs(speed) > cfg.moveSpeed;
    const dir: -1 | 1 = speed < 0 ? -1 : 1;
    if (this.move && (!moving || this.move.dir !== dir)) {
      if (this.move.fired && this.lastSwipe) this.lastSwipe.end = prev.t;
      this.move = null;
    }
    if (!moving) return;
    if (!this.move) {
      const returning =
        this.lastSwipe !== null &&
        this.lastSwipe.dir !== dir &&
        (this.lastSwipe.end === null || prev.t < this.lastSwipe.end + cfg.returnMs);
      this.move = { dir, start: prev, fired: false, isReturn: returning };
    }
    const m = this.move;
    const dx = here.x - m.start.x;
    const dy = here.y - m.start.y;
    if (m.fired || m.isReturn || t - m.start.t > cfg.swipeMaxMs) return;
    if (Math.abs(dx) >= cfg.swipePalms * c.palm && Math.abs(dx) >= 2 * Math.abs(dy)) {
      m.fired = true;
      this.lastSwipe = { dir, end: null };
      events.push({ type: 'gesture', t, handKey: c.hands[0]!, name: dir < 0 ? 'undo' : 'redo' });
    }
  }
}
