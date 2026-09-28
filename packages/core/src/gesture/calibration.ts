// Per-user pinch calibration. The tuning on the recorded fixtures showed the
// start threshold works within a plateau for one person and camera, but people,
// cameras, and light differ; calibration measures the user's own open and
// pinched pinch-measure and places the thresholds between them.

import { DEFAULT_PINCH } from './pinch.ts';

export interface CalibrationResult {
  enter: number;
  exit: number;
  /** The fist gate for this user: off (0) when their pinch curls the other fingers. */
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
/** A pinch whose finger extension comes this close to the fist gate turns the gate off. */
export const FIST_GATE_MARGIN = 0.15;

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/**
 * `open` and `pinched` are pinch measures from each step; `pinchedExtension` is the
 * finger extension (fingerExtension) during the pinched step, if measured.
 */
export function calibratePinch(
  open: readonly number[],
  pinched: readonly number[],
  pinchedExtension: readonly number[] = [],
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
  // Some people pinch with the other fingers curled, as if holding a pen. The fist gate
  // would read that as a fist and never draw.
  const extension = pinchedExtension.filter(Number.isFinite);
  const curled = extension.length > 0 && percentile(extension, 10) < DEFAULT_PINCH.fistBelow + FIST_GATE_MARGIN;
  const fistBelow = curled ? 0 : DEFAULT_PINCH.fistBelow;
  return { ok: true, result: { enter, exit, fistBelow, openLevel, pinchedLevel } };
}
