// Metrics for scoring a replay against ground truth, and for comparing filters.

import type { ToolGesture } from '../types.ts';
import type { ExpectedGesture, FixtureLabel } from './labels.ts';
import type { Replay } from './pipeline.ts';

export interface PenStateScore {
  /** Share of drawing time that was really pinched. */
  precision: number;
  /** Share of pinched time that drew (for held pinches, the coverage). */
  recall: number;
  f1: number;
}

const inside = (t: number, ivs: ReadonlyArray<readonly [number, number]>) => ivs.some(([a, b]) => t >= a && t <= b);

/** Time-weighted per-frame agreement between the pen state and labeled pinch intervals. */
export function scorePenState(replay: Replay, pinched: ReadonlyArray<readonly [number, number]>): PenStateScore {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const frames = replay.frames;
  for (let i = 0; i < frames.length - 1; i++) {
    const f = frames[i]!;
    const dt = frames[i + 1]!.t - f.t;
    const truth = inside(f.t, pinched);
    if (f.drawing && truth) tp += dt;
    else if (f.drawing) fp += dt;
    else if (truth) fn += dt;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

export function strokeCount(replay: Replay): number {
  return replay.events.filter((e) => e.type === 'strokeStart').length;
}

export function drawingHands(replay: Replay): number {
  return new Set(replay.events.filter((e) => e.type === 'strokeStart').map((e) => e.handKey)).size;
}

/**
 * For each labeled release (an interval ending before the recording does), the time
 * from the release until the pen is actually up (ink stops). Negative when the pen
 * lifted early. Pinches the pipeline never drew are skipped; recall counts those.
 */
export function releaseLatencies(replay: Replay, pinched: ReadonlyArray<readonly [number, number]>): number[] {
  const out: number[] = [];
  for (const [start, end] of pinched) {
    if (end >= replay.durationMs - 1) continue;
    if (!replay.frames.some((f) => f.drawing && f.t >= start && f.t <= end)) continue;
    const up = replay.frames.find((f) => !f.drawing && f.t >= Math.max(start, end - 300));
    if (up) out.push(up.t - end);
  }
  return out;
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export interface DetectedGesture {
  name: ToolGesture;
  t: number;
}

export interface GestureScore {
  detected: DetectedGesture[];
  expected: number;
  /** Expected gestures detected within their window. */
  matched: number;
  /** Detected gestures that match nothing expected. */
  falseTriggers: DetectedGesture[];
}

export function detectedGestures(replay: Replay): DetectedGesture[] {
  return replay.events.flatMap((e) => (e.type === 'gesture' ? [{ name: e.name, t: e.t }] : []));
}

/** Matches each expected gesture to the first unmatched detection of the same name inside its window. */
export function scoreGestures(replay: Replay, expected: readonly ExpectedGesture[]): GestureScore {
  const detected = detectedGestures(replay);
  const used = new Set<number>();
  let matched = 0;
  for (const g of expected) {
    const i = detected.findIndex((d, j) => !used.has(j) && d.name === g.name && d.t >= g.at[0] && d.t <= g.at[1]);
    if (i >= 0) {
      used.add(i);
      matched++;
    }
  }
  return { detected, expected: expected.length, matched, falseTriggers: detected.filter((_, j) => !used.has(j)) };
}

export interface FixtureScore {
  name: string;
  strokes: number;
  expectedStrokes: number | null;
  hands: number;
  expectedHands: number | null;
  /** Precision, recall, and F1 of the pen state; null when the fixture isn't labeled per frame. */
  penState: PenStateScore | null;
  /** Median release latency in ms, when the fixture has labeled releases. */
  releaseMs: number | null;
  /** Extra strokes per minute of pinched time: strokes that break where one was expected. */
  brokenPerMinute: number | null;
  /** Tool gestures against the labeled ones; null when they aren't labeled. */
  gestures: GestureScore | null;
}

export function scoreFixture(name: string, replay: Replay, label: FixtureLabel): FixtureScore {
  const strokes = strokeCount(replay);
  const pinched = label.pinched;
  const pinchedMs = pinched?.reduce((sum, [a, b]) => sum + (b - a), 0) ?? 0;
  return {
    name,
    strokes,
    expectedStrokes: label.strokes,
    hands: drawingHands(replay),
    expectedHands: label.hands ?? null,
    penState: pinched ? scorePenState(replay, pinched) : null,
    releaseMs: pinched ? median(releaseLatencies(replay, pinched)) : null,
    brokenPerMinute:
      label.strokes !== null && pinchedMs > 0 ? (Math.max(0, strokes - label.strokes) * 60_000) / pinchedMs : null,
    gestures: label.gestures ? scoreGestures(replay, label.gestures) : null,
  };
}

// ---- filter metrics ----------------------------------------------------------

export interface TrackPoint {
  t: number;
  x: number;
  y: number;
}

/**
 * Stationary jitter: RMS distance from a centered moving average over `windowMs`
 * (the whole track is used if it's shorter than one window).
 * The moving average removes slow drift (a hand held "still" still sways), so what
 * remains is frame-to-frame noise.
 */
export function jitterRms(track: readonly TrackPoint[], windowMs = 1000): number {
  if (track.length === 0) return 0;
  // Only points whose whole window fits inside the track: a truncated window at the
  // ends would read steady drift as jitter.
  const first = track[0]!.t + windowMs / 2;
  const last = track[track.length - 1]!.t - windowMs / 2;
  const whole = first <= last;
  let sum = 0;
  let n = 0;
  let lo = 0;
  let hi = 0;
  let sx = 0;
  let sy = 0;
  for (const p of track) {
    while (hi < track.length && track[hi]!.t <= p.t + windowMs / 2) {
      sx += track[hi]!.x;
      sy += track[hi]!.y;
      hi++;
    }
    while (track[lo]!.t < p.t - windowMs / 2) {
      sx -= track[lo]!.x;
      sy -= track[lo]!.y;
      lo++;
    }
    if (whole && (p.t < first || p.t > last)) continue;
    const count = hi - lo;
    sum += (p.x - sx / count) ** 2 + (p.y - sy / count) ** 2;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

function interpolate(track: readonly TrackPoint[], t: number): TrackPoint | null {
  if (track.length === 0 || t < track[0]!.t || t > track[track.length - 1]!.t) return null;
  let i = 1;
  while (track[i]!.t < t) i++;
  const a = track[i - 1]!;
  const b = track[i]!;
  const w = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
}

/** The delay (ms) that best aligns `delayed` with `reference`: the shift minimizing mean squared error. */
export function estimateLag(
  reference: readonly TrackPoint[],
  delayed: readonly TrackPoint[],
  maxLagMs = 300,
  stepMs = 1,
): number {
  let best = 0;
  let bestErr = Number.POSITIVE_INFINITY;
  for (let lag = 0; lag <= maxLagMs; lag += stepMs) {
    let err = 0;
    let n = 0;
    for (const p of delayed) {
      const r = interpolate(reference, p.t - lag);
      if (!r) continue;
      err += (p.x - r.x) ** 2 + (p.y - r.y) ** 2;
      n++;
    }
    if (n > 0 && err / n < bestErr) {
      bestErr = err / n;
      best = lag;
    }
  }
  return best;
}
