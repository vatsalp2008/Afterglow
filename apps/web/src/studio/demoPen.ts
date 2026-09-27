// Decorative input source for the intro screen: a virtual light pen tracing
// parametric loops. Its strokes go straight to the renderer and are never part
// of the user's session.

import type { BrushId, InputEvent, PenSample } from '@afterglow/core';
import { PALETTE } from '@afterglow/ui/tokens';

interface Figure {
  path: (u: number) => { x: number; y: number };
  durationMs: number;
  color: string;
  brush: BrushId;
}

const TAU = Math.PI * 2;

const FIGURES: Figure[] = [
  {
    // Loop-de-loop ribbon
    path: (u) => ({ x: 0.58 + 0.3 * u + 0.05 * Math.cos(u * TAU * 4), y: 0.5 + 0.12 * Math.sin(u * TAU * 4) - 0.08 * Math.sin(u * Math.PI) }),
    durationMs: 3400,
    color: PALETTE.sodium,
    brush: 'neon',
  },
  {
    // Figure eight
    path: (u) => ({ x: 0.74 + 0.15 * Math.sin(u * TAU), y: 0.5 + 0.16 * Math.sin(u * TAU * 2) }),
    durationMs: 3000,
    color: PALETTE.ledCyan,
    brush: 'neon',
  },
  {
    // Opening spiral
    path: (u) => {
      const r = 0.02 + 0.2 * u;
      return { x: 0.74 + r * Math.cos(u * TAU * 2.5) * 0.75, y: 0.5 + r * Math.sin(u * TAU * 2.5) };
    },
    durationMs: 3200,
    color: PALETTE.gelMagenta,
    brush: 'sparks',
  },
  {
    // Rose
    path: (u) => {
      const a = u * TAU;
      const r = 0.17 * Math.cos(3 * a);
      return { x: 0.74 + r * Math.cos(a) * 0.75, y: 0.5 + r * Math.sin(a) };
    },
    durationMs: 3600,
    color: PALETTE.gelViolet,
    brush: 'neon',
  },
];

const GAP_MS = 500;
const KEY = 'demo';

function sample(fig: Figure, u: number): PenSample {
  const p = fig.path(u);
  return { x: p.x, y: p.y, depth: 1 + 0.35 * Math.sin(u * TAU * 2) };
}

export class DemoPen {
  private index = 0;
  private startedAt: number | null = null;
  private drawing = false;
  private lastU = 0;

  constructor(private startAt: number) {}

  get figure(): Figure {
    return FIGURES[this.index % FIGURES.length]!;
  }

  update(now: number): InputEvent[] {
    if (now < this.startAt) return [];
    const fig = this.figure;
    if (this.startedAt === null) {
      this.startedAt = now;
      this.drawing = true;
      this.lastU = 0;
      return [{ type: 'strokeStart', t: now, handKey: KEY, p: sample(fig, 0) }];
    }
    const elapsed = now - this.startedAt;
    if (this.drawing) {
      const u = Math.min(1, elapsed / fig.durationMs);
      // Sample at ~60 Hz even when frames are slow, so figures keep their shape.
      const from = this.lastU;
      const steps = Math.max(1, Math.ceil(((u - from) * fig.durationMs) / 16));
      const events: InputEvent[] = [];
      for (let i = 1; i <= steps; i++) {
        const ui = from + ((u - from) * i) / steps;
        events.push({ type: 'strokeMove', t: now - (u - ui) * fig.durationMs, handKey: KEY, p: sample(fig, ui) });
      }
      this.lastU = u;
      if (u >= 1) {
        this.drawing = false;
        events.push({ type: 'strokeEnd', t: now, handKey: KEY, reason: 'release' });
      }
      return events;
    }
    if (elapsed > fig.durationMs + GAP_MS) {
      this.index += 1;
      this.startedAt = null;
    }
    return [];
  }

  /** Every figure fully drawn at once, for reduced motion. */
  static staticEvents(t: number): Array<{ figure: Figure; events: InputEvent[] }> {
    return FIGURES.slice(0, 2).map((figure) => {
      const events: InputEvent[] = [{ type: 'strokeStart', t, handKey: KEY, p: sample(figure, 0) }];
      for (let i = 1; i <= 200; i++) events.push({ type: 'strokeMove', t, handKey: KEY, p: sample(figure, i / 200) });
      events.push({ type: 'strokeEnd', t, handKey: KEY, reason: 'release' });
      return { figure, events };
    });
  }
}
