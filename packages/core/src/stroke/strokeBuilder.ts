// Turns InputEvents into Strokes, one open stroke per hand key.

import { viewToCanvas, type FrameSize } from '../coords.ts';
import type { BrushId, HandKey, InputEvent, PenSample, Stroke, StrokePoint } from '../types.ts';

export interface StrokeStyle {
  brush: BrushId;
  color: string;
  size: number;
}

/** Samples closer than this (canvas units) to the previous point are dropped. */
export const MIN_POINT_DISTANCE = 1.2;

export type BuildResult =
  | { kind: 'none' }
  | { kind: 'start'; stroke: Stroke }
  | { kind: 'move'; stroke: Stroke; from: StrokePoint; to: StrokePoint }
  | { kind: 'end'; stroke: Stroke };

function toPoint(p: PenSample, t: number, frame: FrameSize): StrokePoint {
  const c = viewToCanvas(p, frame);
  return { x: c.x, y: c.y, depth: p.depth, t };
}

export class StrokeBuilder {
  private active = new Map<HandKey, Stroke>();

  private readonly createId: () => string;

  constructor(createId: () => string) {
    this.createId = createId;
  }

  handle(ev: InputEvent, style: StrokeStyle, frame: FrameSize): BuildResult {
    switch (ev.type) {
      case 'hover':
        return { kind: 'none' };
      case 'strokeStart': {
        const stroke: Stroke = {
          id: this.createId(),
          brush: style.brush,
          color: style.color,
          size: style.size,
          points: [toPoint(ev.p, ev.t, frame)],
          createdAt: ev.t,
        };
        this.active.set(ev.handKey, stroke);
        return { kind: 'start', stroke };
      }
      case 'strokeMove': {
        const stroke = this.active.get(ev.handKey);
        if (!stroke) return { kind: 'none' };
        const from = stroke.points[stroke.points.length - 1]!;
        const to = toPoint(ev.p, ev.t, frame);
        if (Math.hypot(to.x - from.x, to.y - from.y) < MIN_POINT_DISTANCE) return { kind: 'none' };
        stroke.points.push(to);
        return { kind: 'move', stroke, from, to };
      }
      case 'strokeEnd': {
        const stroke = this.active.get(ev.handKey);
        if (!stroke) return { kind: 'none' };
        this.active.delete(ev.handKey);
        return { kind: 'end', stroke };
      }
    }
  }

  activeStrokes(): Stroke[] {
    return [...this.active.values()];
  }

  /** Closes every open stroke and returns them. */
  finishAll(): Stroke[] {
    const done = this.activeStrokes();
    this.active.clear();
    return done;
  }
}
