// Pinch-to-draw, one state machine per hand key, driven by an explicit
// transition table (PEN_TRANSITIONS). The table is the behavior: update() looks
// up the row for (state, input, confirmed) and runs its actions, and the docs
// diagram is generated from the same table (penFsmMermaid).
//
// Frames where the fingers are already opening (the "releasing" state) are held
// back and dropped if the release is confirmed, so strokes don't end in a hook.
// A confirmed release lifts the pen ("lifted"); within rejoinMs, closing again
// resumes the same stroke. With rejoinMs = 0 the lifted state is passed through
// in the same frame.

import { landmarkToView } from '../coords.ts';
import { LM } from '../hand.ts';
import { dist, distToSegment, extension, toUnits } from './geometry.ts';
import type { HandFrame, HandKey, InputEvent, PenSample, PenState, Vec3 } from '../types.ts';

export interface PinchConfig {
  /** Start drawing when the pinch measure drops below this. */
  enter: number;
  /** Stop drawing when the pinch measure rises above this. */
  exit: number;
  /** Consecutive closed frames required to start a stroke. */
  enterFrames: number;
  /** Consecutive open frames required to end a stroke. */
  exitFrames: number;
  /** Minimum duration of the release as well, in ms (0 disables); frame counts alone vary with frame rate. */
  exitMs: number;
  /**
   * After a release, closing again within this window (ms) continues the same
   * stroke instead of starting a new one; 0 disables. The pen still lifts at once.
   */
  rejoinMs: number;
  /** Frames a hand may be missing before its stroke ends. */
  lossGraceFrames: number;
  /** Palm size (wrist to middle knuckle, frame-height units) that maps to depth 1. */
  neutralPalm: number;
  /**
   * Weight of the thumb-to-fingertip-segment distance in the pinch measure. 0 measures
   * fingertip to fingertip only; see pinchMeasure.
   */
  segmentWeight: number;
  /**
   * A hand whose middle, ring, and little fingers are all curled below this extension
   * is a fist, not a pinch (0 disables); see fingerExtension.
   */
  fistBelow: number;
}

// Tuned on the recorded fixtures with the evaluation harness (ADR 0005). The release is
// timed, not counted: the recordings run at 19 to 30 fps.
export const DEFAULT_PINCH: PinchConfig = {
  enter: 0.24,
  exit: 0.38,
  enterFrames: 2,
  exitFrames: 2,
  exitMs: 100,
  rejoinMs: 250,
  lossGraceFrames: 4,
  neutralPalm: 0.18,
  segmentWeight: 1.2,
  fistBelow: 1.4,
};

// ---- measures --------------------------------------------------------------

/** Thumb-tip to index-tip distance relative to palm length. Scale invariant. */
export function pinchRatio(landmarks: readonly Vec3[], aspect: number): number {
  const u = (i: number) => toUnits(landmarks[i]!, aspect);
  const palm = dist(u(LM.wrist), u(LM.middleMcp));
  if (palm < 1e-6) return Number.POSITIVE_INFINITY;
  return dist(u(LM.thumbTip), u(LM.indexTip)) / palm;
}

/**
 * The pinch measure: the smaller of the fingertip ratio and `segmentWeight` × the
 * thumb tip's distance to the index finger's last segment, the fingertip pad (both
 * relative to palm length). A thumb pressed against the pad reads as pinched even
 * when the two tip landmarks sit apart.
 *
 * Only the last segment counts. The middle segment also caught more low-light
 * pinches (fixture 07), but a relaxed hand rests its thumb there, and it drew for
 * 7.7 seconds on fixture 09 (ADR 0005).
 */
export function pinchMeasure(landmarks: readonly Vec3[], aspect: number, segmentWeight: number): number {
  const tip = pinchRatio(landmarks, aspect);
  if (segmentWeight <= 0 || !Number.isFinite(tip)) return tip;
  const u = (i: number) => toUnits(landmarks[i]!, aspect);
  const palm = dist(u(LM.wrist), u(LM.middleMcp));
  const segment = distToSegment(u(LM.thumbTip), u(7), u(LM.indexTip)) / palm;
  return Math.min(tip, segmentWeight * segment);
}

/**
 * How extended the least-curled of the middle, ring, and little fingers is: tip-to-wrist
 * over knuckle-to-wrist. Extended fingers read about 1.8 to 2.4; a fist, about 0.7 to 1.3.
 * In a fist the thumb genuinely presses on the index finger, so pinch measures read
 * closed; this tells the two apart (fixture 11).
 */
export function fingerExtension(landmarks: readonly Vec3[], aspect: number): number {
  const u = landmarks.map((p) => toUnits(p, aspect));
  return Math.max(extension(u, 12, 9), extension(u, 16, 13), extension(u, 20, 17));
}

/** Apparent palm length in frame-height units: a proxy for distance to the camera. */
export function palmSize(landmarks: readonly Vec3[], aspect: number): number {
  const a = landmarks[LM.wrist]!;
  const b = landmarks[LM.middleMcp]!;
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

export function depthFactor(palm: number, neutralPalm: number): number {
  return Math.min(2, Math.max(0.5, (palm / neutralPalm) ** 0.8));
}

/** Pen position: midpoint of thumb and index tips, in view space. */
export function penSample(landmarks: readonly Vec3[], aspect: number, neutralPalm: number): PenSample {
  const a = landmarks[LM.thumbTip]!;
  const b = landmarks[LM.indexTip]!;
  const mid = landmarkToView({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  return { x: mid.x, y: mid.y, depth: depthFactor(palmSize(landmarks, aspect), neutralPalm) };
}

// ---- transition table ------------------------------------------------------

export type PenFsmState = 'hover' | 'pressing' | 'drawing' | 'releasing' | 'lifted' | 'gone';

/** closed: measure < enter; open: measure > exit; between: in the hysteresis band; lost: missing past the grace. */
export type PenInput = 'closed' | 'between' | 'open' | 'lost';

export type PenAction =
  | 'hover' // emit a hover event at the current position
  | 'start' // emit strokeStart
  | 'move' // emit strokeMove
  | 'hold' // keep this sample back: the fingers may be opening
  | 'flush' // emit the held samples as moves: it wasn't a release
  | 'drop' // discard the held samples: the fingers really opened
  | 'release' // end the stroke: emit strokeEnd(release)
  | 'lose'; // emit strokeEnd(handLost)

export interface PenTransition {
  from: PenFsmState;
  input: PenInput;
  /** When set, the row applies only if the pending state's confirmation is (or isn't) met. */
  confirmed?: boolean;
  to: PenFsmState;
  actions: readonly PenAction[];
}

export const PEN_TRANSITIONS: readonly PenTransition[] = [
  { from: 'hover', input: 'closed', confirmed: true, to: 'drawing', actions: ['start'] },
  { from: 'hover', input: 'closed', confirmed: false, to: 'pressing', actions: ['hover'] },
  { from: 'hover', input: 'between', to: 'hover', actions: ['hover'] },
  { from: 'hover', input: 'open', to: 'hover', actions: ['hover'] },
  { from: 'hover', input: 'lost', to: 'gone', actions: [] },

  { from: 'pressing', input: 'closed', confirmed: true, to: 'drawing', actions: ['start'] },
  { from: 'pressing', input: 'closed', confirmed: false, to: 'pressing', actions: ['hover'] },
  { from: 'pressing', input: 'between', to: 'hover', actions: ['hover'] },
  { from: 'pressing', input: 'open', to: 'hover', actions: ['hover'] },
  { from: 'pressing', input: 'lost', to: 'gone', actions: [] },

  { from: 'drawing', input: 'closed', to: 'drawing', actions: ['move'] },
  { from: 'drawing', input: 'between', to: 'drawing', actions: ['move'] },
  { from: 'drawing', input: 'open', confirmed: true, to: 'lifted', actions: ['drop'] },
  { from: 'drawing', input: 'open', confirmed: false, to: 'releasing', actions: ['hold'] },
  { from: 'drawing', input: 'lost', to: 'gone', actions: ['lose'] },

  { from: 'releasing', input: 'closed', to: 'drawing', actions: ['flush', 'move'] },
  { from: 'releasing', input: 'between', to: 'drawing', actions: ['flush', 'move'] },
  { from: 'releasing', input: 'open', confirmed: true, to: 'lifted', actions: ['drop'] },
  { from: 'releasing', input: 'open', confirmed: false, to: 'releasing', actions: ['hold'] },
  { from: 'releasing', input: 'lost', to: 'gone', actions: ['lose'] },

  // "confirmed" here means the rejoin window has run out.
  { from: 'lifted', input: 'closed', confirmed: false, to: 'drawing', actions: ['move'] },
  { from: 'lifted', input: 'closed', confirmed: true, to: 'pressing', actions: ['release', 'hover'] },
  { from: 'lifted', input: 'between', confirmed: false, to: 'lifted', actions: ['hover'] },
  { from: 'lifted', input: 'between', confirmed: true, to: 'hover', actions: ['release', 'hover'] },
  { from: 'lifted', input: 'open', confirmed: false, to: 'lifted', actions: ['hover'] },
  { from: 'lifted', input: 'open', confirmed: true, to: 'hover', actions: ['release', 'hover'] },
  { from: 'lifted', input: 'lost', to: 'gone', actions: ['lose'] },
];

export function findTransition(from: PenFsmState, input: PenInput, confirmed: boolean): PenTransition {
  const row = PEN_TRANSITIONS.find(
    (r) => r.from === from && r.input === input && (r.confirmed === undefined || r.confirmed === confirmed),
  );
  if (!row) throw new Error(`No pen transition from ${from} on ${input}`);
  return row;
}

/** The transition table as a Mermaid state diagram (docs/gesture-fsm.md is generated from this). */
export function penFsmMermaid(): string {
  const lines = ['stateDiagram-v2', '  [*] --> hover: hand appears'];
  for (const r of PEN_TRANSITIONS) {
    if (r.from === r.to && r.actions.every((a) => a === 'hover')) continue; // idle self-loops
    const guard = r.confirmed === undefined ? '' : r.confirmed ? ' (confirmed)' : ' (not yet)';
    const emits = r.actions.filter((a) => a !== 'hover');
    const target = r.to === 'gone' ? '[*]' : r.to;
    lines.push(`  ${r.from} --> ${target}: ${r.input}${guard}${emits.length ? ` / ${emits.join(', ')}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---- tracker ---------------------------------------------------------------

interface HandPen {
  state: PenFsmState;
  /** Consecutive frames in the current pending state (pressing or releasing). */
  run: number;
  /** When the current pending state began. */
  since: number;
  missing: number;
  ratio: number;
  fist: boolean;
  held: Array<{ t: number; p: PenSample }>;
}

export interface PenStatus {
  state: PenState;
  ratio: number;
  /** The hand is a fist, which never counts as a pinch. */
  fist: boolean;
}

export class PinchTracker {
  config: PinchConfig;
  private hands = new Map<HandKey, HandPen>();

  constructor(config: PinchConfig = DEFAULT_PINCH) {
    this.config = config;
  }

  /** Feed one frame of (filtered) hands. `aspect` is frame width / height. */
  update(frame: HandFrame, aspect: number): InputEvent[] {
    const events: InputEvent[] = [];
    const t = frame.captureTime;
    const { enter, exit, neutralPalm, segmentWeight, fistBelow } = this.config;
    const seen = new Set<HandKey>();

    for (const hand of frame.hands) {
      seen.add(hand.key);
      const ratio = pinchMeasure(hand.landmarks, aspect, segmentWeight);
      const fist = fistBelow > 0 && fingerExtension(hand.landmarks, aspect) < fistBelow;
      const p = penSample(hand.landmarks, aspect, neutralPalm);
      let h = this.hands.get(hand.key);
      if (!h) {
        h = { state: 'hover', run: 0, since: t, missing: 0, ratio, fist, held: [] };
        this.hands.set(hand.key, h);
      }
      h.missing = 0;
      h.ratio = ratio;
      h.fist = fist;
      const input: PenInput = fist || ratio > exit ? 'open' : ratio < enter ? 'closed' : 'between';
      this.step(hand.key, h, input, t, p, events);
    }

    for (const [key, h] of this.hands) {
      if (seen.has(key)) continue;
      h.missing += 1;
      if (h.missing > this.config.lossGraceFrames) this.step(key, h, 'lost', t, null, events);
    }
    return events;
  }

  status(): Map<HandKey, PenStatus> {
    const out = new Map<HandKey, PenStatus>();
    for (const [key, h] of this.hands) {
      const state: PenState = h.state === 'drawing' || h.state === 'releasing' ? 'drawing' : 'hover';
      out.set(key, { state, ratio: h.ratio, fist: h.fist });
    }
    return out;
  }

  /** Ends every open stroke, e.g. when tracking stops. */
  reset(t: number): InputEvent[] {
    const events: InputEvent[] = [];
    for (const [handKey, h] of this.hands) {
      if (h.state === 'drawing' || h.state === 'releasing' || h.state === 'lifted') {
        events.push({ type: 'strokeEnd', t, handKey, reason: 'handLost' });
      }
    }
    this.hands.clear();
    return events;
  }

  private confirmed(h: HandPen, input: PenInput, t: number): boolean {
    if (h.state === 'lifted') return t - h.since >= this.config.rejoinMs;
    if (input === 'closed' && (h.state === 'hover' || h.state === 'pressing')) {
      const run = h.state === 'pressing' ? h.run + 1 : 1;
      return run >= this.config.enterFrames;
    }
    if (input === 'open' && (h.state === 'drawing' || h.state === 'releasing')) {
      const run = h.state === 'releasing' ? h.run + 1 : 1;
      const since = h.state === 'releasing' ? h.since : t;
      return run >= this.config.exitFrames && t - since >= this.config.exitMs;
    }
    return false;
  }

  private step(
    handKey: HandKey,
    h: HandPen,
    input: PenInput,
    t: number,
    p: PenSample | null,
    events: InputEvent[],
  ): void {
    const row = findTransition(h.state, input, this.confirmed(h, input, t));
    for (const action of row.actions) {
      switch (action) {
        case 'hover':
          if (p) events.push({ type: 'hover', t, handKey, p });
          break;
        case 'start':
          if (p) events.push({ type: 'strokeStart', t, handKey, p });
          break;
        case 'move':
          if (p) events.push({ type: 'strokeMove', t, handKey, p });
          break;
        case 'hold':
          if (p) h.held.push({ t, p });
          break;
        case 'flush':
          for (const held of h.held) events.push({ type: 'strokeMove', t: held.t, handKey, p: held.p });
          h.held = [];
          break;
        case 'drop':
          h.held = [];
          break;
        case 'release':
          h.held = [];
          events.push({ type: 'strokeEnd', t, handKey, reason: 'release' });
          break;
        case 'lose':
          h.held = [];
          events.push({ type: 'strokeEnd', t, handKey, reason: 'handLost' });
          break;
      }
    }
    const pending = row.to === 'pressing' || row.to === 'releasing';
    if (row.to !== h.state) {
      h.run = pending ? 1 : 0;
      h.since = t;
    } else if (pending) {
      h.run += 1;
    }
    h.state = row.to;
    if (row.to === 'gone') this.hands.delete(handKey);
    // Without a rejoin window, a release completes in the same frame.
    if (row.to === 'lifted' && this.config.rejoinMs <= 0) this.step(handKey, h, input, t, p, events);
  }
}
