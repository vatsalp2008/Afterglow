// Per-user pinch calibration. The tuning on the recorded fixtures showed the
// start threshold works within a plateau for one person and camera, but people,
// cameras, and light differ; calibration measures the user's own open and
// pinched pinch-measure and places the thresholds between them.

import { DEFAULT_PINCH } from './pinch.ts';

export interface CalibrationResult {
  enter: number;
  exit: number;
  /** The fist gate for this user: off (0) when their pinch reads as a fist. */
  fistBelow: number;
  /** The low end of the open-hand measure (20th percentile). */
  openLevel: number;
  /** The high end of the pinched measure (80th percentile). */
  pinchedLevel: number;
}

export type Calibration =
  { ok: true; result: CalibrationResult } | { ok: false; reason: 'tooFewSamples' | 'notSeparable' };

/** About half a second of tracking at 30 fps. */
export const MIN_CALIBRATION_SAMPLES = 15;
/** Below this gap between open and pinched, thresholds can't be placed reliably. */
export const MIN_CALIBRATION_GAP = 0.15;
/** If more than this share of a user's pinch reads as a fist, the fist gate is turned off for them. */
export const MAX_FIST_SHARE = 0.1;

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/**
 * `open` and `pinched` are pinch measures from each step; `pinchedFist` says, per sample of
 * the pinched step, whether the hand read as a fist under the default gate (readsAsFist).
 */
export function calibratePinch(
  open: readonly number[],
  pinched: readonly number[],
  pinchedFist: readonly boolean[] = [],
): Calibration {
  const openSamples = open.filter(Number.isFinite);
  const pinchedSamples = pinched.filter(Number.isFinite);
  if (openSamples.length < MIN_CALIBRATION_SAMPLES || pinchedSamples.length < MIN_CALIBRATION_SAMPLES) {
    return { ok: false, reason: 'tooFewSamples' };
  }
  const openLevel = percentile(openSamples, 20);
  const pinchedLevel = percentile(pinchedSamples, 80);
  const gap = openLevel - pinchedLevel;
  if (gap < MIN_CALIBRATION_GAP) return { ok: false, reason: 'notSeparable' };
  const enter = Math.min(0.4, pinchedLevel + 0.3 * gap);
  const exit = Math.min(0.6, Math.max(enter + 0.06, pinchedLevel + 0.5 * gap));
  // A pinch the fist gate would block (an unusually curled index) turns the gate off
  // for this user rather than never drawing.
  const fistShare = pinchedFist.length ? pinchedFist.filter(Boolean).length / pinchedFist.length : 0;
  const fistBelow = fistShare > MAX_FIST_SHARE ? 0 : DEFAULT_PINCH.fistBelow;
  return { ok: true, result: { enter, exit, fistBelow, openLevel, pinchedLevel } };
}
