// Filter comparison for the Filter Lab: the same replay and metrics as the
// benchmarks (docs/benchmarks.md), for any fixture, signal, and filter settings.

import type { FilterSpec } from '../filters/spec.ts';
import type { SessionRecording } from '../session.ts';
import { estimateLag, jitterRms, type TrackPoint } from './metrics.ts';
import { DEFAULT_PIPELINE, penTrack, replaySession, type PipelineConfig } from './pipeline.ts';

/** What the Lab plots over time: the pen point's x or y (px), or the pinch measure (palm lengths). */
export type LabSignal = 'penX' | 'penY' | 'pinch';

export interface SignalSample {
  t: number;
  v: number;
}

export interface FilterRun {
  spec: FilterSpec;
  /** The pen point per frame, in px of the recorded video. */
  path: TrackPoint[];
  /** The chosen signal per frame. */
  signal: SignalSample[];
  /**
   * RMS jitter over `still` (or the whole recording): of the pen point in px for the pen
   * signals, as in the benchmarks; of the pinch measure for the pinch signal.
   */
  jitter: number;
  /** Delay that best aligns this run with the raw one, in ms (0 for the raw run). */
  lagMs: number;
}

const within = <T extends { t: number }>(xs: readonly T[], still: readonly [number, number] | null) =>
  still ? xs.filter((p) => p.t >= still[0] && p.t <= still[1]) : xs;

const asTrack = (signal: readonly SignalSample[]): TrackPoint[] => signal.map((s) => ({ t: s.t, x: s.v, y: 0 }));

/**
 * Replays `rec` with `spec` and measures it. Pass the raw run (filter `none`) as `raw`
 * to measure lag against it.
 */
export function filterRun(
  rec: SessionRecording,
  spec: FilterSpec,
  signal: LabSignal,
  still: readonly [number, number] | null,
  raw: FilterRun | null = null,
  base: PipelineConfig = DEFAULT_PIPELINE,
): FilterRun {
  const replay = replaySession(rec, { ...base, filter: spec });
  const path = penTrack(replay, rec.meta.videoWidth, rec.meta.videoHeight);
  const series: SignalSample[] =
    signal === 'pinch'
      ? replay.frames.flatMap((f) => {
          const ratio = f.hands[0]?.ratio;
          return ratio !== undefined && Number.isFinite(ratio) ? [{ t: f.t, v: ratio }] : [];
        })
      : path.map((p) => ({ t: p.t, v: signal === 'penX' ? p.x : p.y }));
  const pen = signal !== 'pinch';
  const jitter = pen ? jitterRms(within(path, still)) : jitterRms(asTrack(within(series, still)));
  let lagMs = 0;
  if (raw) lagMs = pen ? estimateLag(raw.path, path) : estimateLag(asTrack(raw.signal), asTrack(series));
  return { spec, path, signal: series, jitter, lagMs };
}
