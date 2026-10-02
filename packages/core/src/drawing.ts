// A saved drawing (ADR 0012): the strokes in canvas space with their timing, so it can
// be opened again to keep painting or to replay as a timelapse. Files come from
// anywhere, so parsing checks every field and copies only the known ones.

import type { FrameSize } from './coords.ts';
import { BRUSH_IDS, SHAPE_KINDS, type BrushId, type ShapeKind, type Stroke, type StrokePoint } from './types.ts';

export const DRAWING_FORMAT = 'afterglow.drawing';
export const DRAWING_VERSION = 1;

/** What a file may hold. Far beyond a real session, small enough to open safely. */
export const DRAWING_LIMITS = {
  strokes: 10_000,
  pointsPerStroke: 20_000,
  points: 1_000_000,
  /** Canvas units, for frames and positions alike. */
  extent: 100_000,
  size: { min: 0.5, max: 200 },
};

export interface Drawing {
  format: typeof DRAWING_FORMAT;
  version: typeof DRAWING_VERSION;
  /** The canvas the strokes were drawn on. */
  frame: FrameSize;
  strokes: Stroke[];
}

export type DrawingProblem = 'notDrawing' | 'newerVersion' | 'tooLarge' | 'damaged';

export type ParsedDrawing = { ok: true; drawing: Drawing } | { ok: false; problem: DrawingProblem };

const round = (n: number, digits: number) => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

/** The drawing to save. Values are rounded well below what anyone can see, to keep files small. */
export function toDrawing(strokes: readonly Stroke[], frame: FrameSize): Drawing {
  return {
    format: DRAWING_FORMAT,
    version: DRAWING_VERSION,
    frame: { width: round(frame.width, 2), height: round(frame.height, 2) },
    strokes: strokes.map((s) => {
      const stroke: Stroke = {
        id: s.id,
        brush: s.brush,
        color: s.color,
        size: round(s.size, 2),
        createdAt: round(s.createdAt, 1),
        points: s.points.map((p) => {
          const point: StrokePoint = { x: round(p.x, 2), y: round(p.y, 2), depth: round(p.depth, 3), t: round(p.t, 1) };
          if (p.angle !== undefined) point.angle = round(p.angle, 4);
          return point;
        }),
      };
      if (s.shape) stroke.shape = s.shape;
      return stroke;
    }),
  };
}

class Damaged extends Error {}
class TooLarge extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function finite(v: unknown, limit = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) throw new Damaged();
  return v;
}

function readPoint(v: unknown): StrokePoint {
  if (!isObject(v)) throw new Damaged();
  const { extent } = DRAWING_LIMITS;
  const point: StrokePoint = {
    x: finite(v['x'], extent),
    y: finite(v['y'], extent),
    depth: finite(v['depth'], 100),
    t: finite(v['t']),
  };
  if (point.depth <= 0) throw new Damaged();
  if (v['angle'] !== undefined) point.angle = finite(v['angle'], 100);
  return point;
}

function readStroke(v: unknown): Stroke {
  if (!isObject(v) || !Array.isArray(v['points'])) throw new Damaged();
  const { id, brush, color } = v;
  if (typeof id !== 'string' || id.length > 200) throw new Damaged();
  if (!BRUSH_IDS.includes(brush as BrushId)) throw new Damaged();
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Damaged();
  const size = finite(v['size']);
  if (size < DRAWING_LIMITS.size.min || size > DRAWING_LIMITS.size.max) throw new Damaged();
  if (v['points'].length > DRAWING_LIMITS.pointsPerStroke) throw new TooLarge();
  const stroke: Stroke = {
    id,
    brush: brush as BrushId,
    color,
    size,
    createdAt: finite(v['createdAt']),
    points: v['points'].map(readPoint),
  };
  if (v['shape'] !== undefined) {
    if (!SHAPE_KINDS.includes(v['shape'] as ShapeKind)) throw new Damaged();
    stroke.shape = v['shape'] as ShapeKind;
  }
  return stroke;
}

/** Reads a drawing file, or says what's wrong with it. */
export function parseDrawing(text: string): ParsedDrawing {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'notDrawing' };
  }
  if (!isObject(data) || data['format'] !== DRAWING_FORMAT) return { ok: false, problem: 'notDrawing' };
  const version = data['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1)
    return { ok: false, problem: 'damaged' };
  if (version > DRAWING_VERSION) return { ok: false, problem: 'newerVersion' };
  try {
    const frame = data['frame'];
    const strokes = data['strokes'];
    if (!isObject(frame) || !Array.isArray(strokes)) throw new Damaged();
    const width = finite(frame['width'], DRAWING_LIMITS.extent);
    const height = finite(frame['height'], DRAWING_LIMITS.extent);
    if (width <= 0 || height <= 0) throw new Damaged();
    if (strokes.length > DRAWING_LIMITS.strokes) throw new TooLarge();
    let points = 0;
    for (const s of strokes) {
      if (isObject(s) && Array.isArray(s['points'])) points += s['points'].length;
    }
    if (points > DRAWING_LIMITS.points) throw new TooLarge();
    return {
      ok: true,
      drawing: {
        format: DRAWING_FORMAT,
        version: DRAWING_VERSION,
        frame: { width, height },
        strokes: strokes.map(readStroke),
      },
    };
  } catch (err) {
    if (err instanceof TooLarge) return { ok: false, problem: 'tooLarge' };
    if (err instanceof Damaged) return { ok: false, problem: 'damaged' };
    throw err;
  }
}

/**
 * Places a drawing on the current canvas, ready to swap in:
 * - scaled uniformly to fit the frame and centered, so a drawing made on a 4:3 camera
 *   keeps its shape on a 16:9 one;
 * - shifted in time so its newest point is `now`, so fading and replay work as if it had
 *   just been drawn, with its own pacing;
 * - with fresh ids, so its strokes can't be confused with ones still in the undo history.
 * Empty strokes are dropped.
 */
export function placeDrawing(drawing: Drawing, frame: FrameSize, now: number, createId: () => string): Stroke[] {
  const strokes = drawing.strokes.filter((s) => s.points.length > 0);
  const scale = Math.min(frame.width / drawing.frame.width, frame.height / drawing.frame.height);
  const dx = (frame.width - drawing.frame.width * scale) / 2;
  const dy = (frame.height - drawing.frame.height * scale) / 2;
  let newest = -Infinity;
  for (const s of strokes) for (const p of s.points) newest = Math.max(newest, p.t);
  const shift = Number.isFinite(newest) ? now - newest : 0;
  return strokes.map((s) => {
    const placed: Stroke = {
      id: createId(),
      brush: s.brush,
      color: s.color,
      size: s.size * scale,
      createdAt: s.createdAt + shift,
      points: s.points.map((p) => ({ ...p, x: p.x * scale + dx, y: p.y * scale + dy, t: p.t + shift })),
    };
    if (s.shape) placed.shape = s.shape;
    return placed;
  });
}
