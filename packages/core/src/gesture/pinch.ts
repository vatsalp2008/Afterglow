// Pinch-to-draw state machine, one instance per hand key.
//
//   hover --(ratio < enter for N frames)--> drawing     emits strokeStart
//   drawing --(ratio > exit for N frames)--> hover      emits strokeEnd(release)
//   any --(hand missing > grace frames)--> removed      emits strokeEnd(handLost) if drawing
//
// Frames where the fingers are already opening (ratio > exit, not yet confirmed)
// are held back and dropped on release, so strokes don't end with a hook.

import { landmarkToView } from '../coords.ts';
import { LM } from '../hand.ts';
import type { HandFrame, HandKey, InputEvent, PenSample, PenState, Vec3 } from '../types.ts';

export interface PinchConfig {
  /** Enter drawing when the pinch ratio drops below this. */
  enter: number;
  /** Leave drawing when the pinch ratio rises above this. */
  exit: number;
  /** Consecutive frames required to change state. */
  confirmFrames: number;
  /** Frames a hand may be missing before its stroke ends. */
  lossGraceFrames: number;
  /** Palm size (wrist to middle knuckle, frame-height units) that maps to depth 1. */
  neutralPalm: number;
}

export const DEFAULT_PINCH: PinchConfig = {
  enter: 0.25,
  exit: 0.35,
  confirmFrames: 2,
  lossGraceFrames: 4,
  neutralPalm: 0.18,
};

function dist(a: Vec3, b: Vec3, aspect: number): number {
  // Landmark x is normalized by width, y by height; z is roughly x-scaled.
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y, (a.z - b.z) * aspect);
}

/** Thumb-to-index distance relative to palm length. Scale invariant. */
export function pinchRatio(landmarks: readonly Vec3[], aspect: number): number {
  const palm = dist(landmarks[LM.wrist]!, landmarks[LM.middleMcp]!, aspect);
  if (palm < 1e-6) return Number.POSITIVE_INFINITY;
  return dist(landmarks[LM.thumbTip]!, landmarks[LM.indexTip]!, aspect) / palm;
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

interface HandPen {
  state: 'hover' | 'drawing';
  counter: number;
  missing: number;
  ratio: number;
  pendingExit: Array<{ t: number; p: PenSample }>;
}

export interface PenStatus {
  state: PenState;
  ratio: number;
}

export class PinchTracker {
  private hands = new Map<HandKey, HandPen>();

  config: PinchConfig;

  constructor(config: PinchConfig = DEFAULT_PINCH) {
    this.config = config;
  }

  /** Feed one frame of (filtered) hands. `aspect` is frame width / height. */
  update(frame: HandFrame, aspect: number): InputEvent[] {
    const events: InputEvent[] = [];
    const t = frame.captureTime;
    const { enter, exit, confirmFrames, lossGraceFrames, neutralPalm } = this.config;
    const seen = new Set<HandKey>();

    for (const hand of frame.hands) {
      const handKey = hand.key;
      seen.add(handKey);
      const ratio = pinchRatio(hand.landmarks, aspect);
      const p = penSample(hand.landmarks, aspect, neutralPalm);
      let h = this.hands.get(handKey);
      if (!h) {
        h = { state: 'hover', counter: 0, missing: 0, ratio, pendingExit: [] };
        this.hands.set(handKey, h);
      }
      h.missing = 0;
      h.ratio = ratio;

      if (h.state === 'hover') {
        h.counter = ratio < enter ? h.counter + 1 : 0;
        if (h.counter >= confirmFrames) {
          h.state = 'drawing';
          h.counter = 0;
          events.push({ type: 'strokeStart', t, handKey, p });
        } else {
          events.push({ type: 'hover', t, handKey, p });
        }
        continue;
      }

      if (ratio > exit) {
        h.counter += 1;
        if (h.counter >= confirmFrames) {
          h.state = 'hover';
          h.counter = 0;
          h.pendingExit = [];
          events.push({ type: 'strokeEnd', t, handKey, reason: 'release' });
          events.push({ type: 'hover', t, handKey, p });
        } else {
          h.pendingExit.push({ t, p });
        }
        continue;
      }

      for (const held of h.pendingExit) events.push({ type: 'strokeMove', t: held.t, handKey, p: held.p });
      h.pendingExit = [];
      h.counter = 0;
      events.push({ type: 'strokeMove', t, handKey, p });
    }

    for (const [handKey, h] of this.hands) {
      if (seen.has(handKey)) continue;
      h.missing += 1;
      if (h.missing > lossGraceFrames) {
        if (h.state === 'drawing') events.push({ type: 'strokeEnd', t, handKey, reason: 'handLost' });
        this.hands.delete(handKey);
      }
    }
    return events;
  }

  status(): Map<HandKey, PenStatus> {
    const out = new Map<HandKey, PenStatus>();
    for (const [key, h] of this.hands) out.set(key, { state: h.state, ratio: h.ratio });
    return out;
  }

  /** Ends every open stroke, e.g. when tracking stops. */
  reset(t: number): InputEvent[] {
    const events: InputEvent[] = [];
    for (const [handKey, h] of this.hands) {
      if (h.state === 'drawing') events.push({ type: 'strokeEnd', t, handKey, reason: 'handLost' });
    }
    this.hands.clear();
    return events;
  }
}
