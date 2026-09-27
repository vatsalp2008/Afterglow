// Timelapse: remaps a session's stroke times so drawing plays back faster and
// idle gaps are compressed, while strokes drawn at the same time (two hands)
// stay simultaneous.

import type { Stroke } from './types';

export interface TimelineOptions {
  speed: number;
  /** Longest pause kept between bursts of drawing, in playback ms. */
  maxGapMs: number;
  leadInMs: number;
  tailMs: number;
}

export const DEFAULT_TIMELINE: TimelineOptions = { speed: 1.5, maxGapMs: 350, leadInMs: 400, tailMs: 1200 };

export interface Timeline {
  strokes: Stroke[];
  duration: number;
}

interface Span {
  start: number;
  end: number;
  out: number;
}

function firstT(s: Stroke): number {
  return s.points[0]?.t ?? s.createdAt;
}

function lastT(s: Stroke): number {
  return s.points[s.points.length - 1]?.t ?? s.createdAt;
}

export function buildTimeline(
  strokes: readonly Stroke[],
  opts: TimelineOptions = DEFAULT_TIMELINE,
  idPrefix = 'replay:',
): Timeline {
  const drawn = strokes.filter((s) => s.points.length > 0);
  if (drawn.length === 0) return { strokes: [], duration: 0 };

  // Merge overlapping drawing intervals into spans.
  const intervals = drawn.map((s) => ({ start: firstT(s), end: lastT(s) })).sort((a, b) => a.start - b.start);
  const spans: Span[] = [];
  let out = opts.leadInMs;
  for (const iv of intervals) {
    const last = spans[spans.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
      continue;
    }
    if (last) out = last.out + (last.end - last.start) / opts.speed + Math.min((iv.start - last.end) / opts.speed, opts.maxGapMs);
    spans.push({ start: iv.start, end: iv.end, out });
  }

  const map = (t: number): number => {
    let span = spans[0]!;
    for (const s of spans) if (s.start <= t) span = s;
    return span.out + (t - span.start) / opts.speed;
  };

  const remapped = drawn.map((s) => ({
    ...s,
    id: idPrefix + s.id,
    createdAt: map(firstT(s)),
    points: s.points.map((p) => ({ ...p, t: map(p.t) })),
  }));
  const end = Math.max(...remapped.map(lastT));
  return { strokes: remapped, duration: end + opts.tailMs };
}

export interface TimelineSample {
  complete: Stroke[];
  /** Strokes being drawn at the playhead, truncated to it. */
  active: Stroke[];
}

export function sampleTimeline(tl: Timeline, playhead: number): TimelineSample {
  const complete: Stroke[] = [];
  const active: Stroke[] = [];
  for (const s of tl.strokes) {
    if (lastT(s) <= playhead) complete.push(s);
    else if (firstT(s) <= playhead) {
      let n = 0;
      while (n < s.points.length && s.points[n]!.t <= playhead) n++;
      active.push({ ...s, points: s.points.slice(0, n) });
    }
  }
  return { complete, active };
}
