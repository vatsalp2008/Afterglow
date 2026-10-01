// What a hand does to the stroke besides its position: depth (closer is thicker and
// brighter) and the nib angle of the ribbon brush. One per hand, owned by PinchTracker.
//
// Depth is relative to the hand's usual size, learned while it isn't drawing, so wherever
// someone sits gives normal width and leaning in from there makes lines bolder. There is
// no calibration step (ADR 0007, ADR 0011).

import { landmarkAngleOnCanvas } from '../coords.ts';
import type { Vec3 } from '../types.ts';
import { dist, toUnits } from './geometry.ts';

export interface PenShapeConfig {
  /** How quickly the usual hand size follows the hand, ms. It only learns while not drawing. */
  baselineTauMs: number;
  /** depth = (size / usual size)^exponent, clamped to [minDepth, maxDepth]. */
  exponent: number;
  minDepth: number;
  maxDepth: number;
  /**
   * Hand size is the larger of palm length and knuckle width times this (palm length is
   * 1.56 knuckle widths at the median across the fixtures). Palm length shrinks when the
   * hand tips forward, knuckle width when it turns sideways; their larger stays steady.
   */
  knuckleScale: number;
  /** Below this knuckle width (in palm lengths) the hand is edge-on, and the nib keeps its last angle. */
  edgeOnSpan: number;
}

export const DEFAULT_PEN_SHAPE: PenShapeConfig = {
  baselineTauMs: 4000,
  exponent: 0.8,
  minDepth: 0.5,
  maxDepth: 2,
  knuckleScale: 1.56,
  edgeOnSpan: 0.3,
};

/** A hand's apparent size in frame heights (see PenShapeConfig.knuckleScale). */
export function handSize(landmarks: readonly Vec3[], aspect: number, knuckleScale: number): number {
  const u = (i: number) => toUnits(landmarks[i]!, aspect);
  return Math.max(dist(u(0), u(9)), knuckleScale * dist(u(5), u(17)));
}

const inView = (landmarks: readonly Vec3[]) => landmarks.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);

export class PenShape {
  private baseline: number | null = null;
  private samples = 0;
  private lastT: number | null = null;
  private angle: number | undefined;
  private readonly config: PenShapeConfig;

  constructor(config: PenShapeConfig = DEFAULT_PEN_SHAPE) {
    this.config = config;
  }

  /** This frame's depth and nib angle. While `drawing`, the usual size holds still. */
  update(landmarks: readonly Vec3[], aspect: number, t: number, drawing: boolean): { depth: number; angle?: number } {
    const c = this.config;
    const size = handSize(landmarks, aspect, c.knuckleScale);
    // Learn the usual size from whole hands only: a hand partly out of frame is partly guessed.
    if (!drawing && inView(landmarks)) {
      this.samples += 1;
      const dt = this.lastT === null ? 0 : Math.max(0, t - this.lastT);
      // A running mean at first, so a stroke right after the hand appears starts at normal width.
      const alpha = Math.max(1 / this.samples, 1 - Math.exp(-dt / c.baselineTauMs));
      this.baseline = this.baseline === null ? size : this.baseline + alpha * (size - this.baseline);
    }
    this.lastT = t;
    const depth =
      this.baseline === null ? 1 : Math.min(c.maxDepth, Math.max(c.minDepth, (size / this.baseline) ** c.exponent));

    const u = (i: number) => toUnits(landmarks[i]!, aspect);
    const palm = Math.max(dist(u(0), u(9)), 1e-6);
    if (dist(u(5), u(17)) / palm >= c.edgeOnSpan)
      this.angle = landmarkAngleOnCanvas(landmarks[5]!, landmarks[17]!, aspect);
    return this.angle === undefined ? { depth } : { depth, angle: this.angle };
  }
}
