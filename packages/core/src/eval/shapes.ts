// Scores shape snapping on labeled air-drawn strokes (ADR 0014): how often each shape
// snaps to the right clean shape, and how often a loose stroke snaps when it shouldn't.

import { DEFAULT_SNAP, recognizeShape, type SnapConfig } from '../stroke/snap/snap.ts';
import { pathLength } from '../stroke/snap/path.ts';
import type { ShapeKind, Stroke } from '../types.ts';
import type { LabeledItem } from './labeled.ts';

/** What snapping made of one prompt's stroke: a shape, or nothing. */
export type ShapeOutcome = ShapeKind | 'none';

export interface ShapeScore {
  /** For each label, how often each outcome happened. */
  confusion: Record<string, Partial<Record<ShapeOutcome, number>>>;
  /** Per shape: the share of its strokes snapped to it. */
  recall: Partial<Record<ShapeKind, number>>;
  /** Per shape: the share of snaps to it that were right. */
  precision: Partial<Record<ShapeKind, number>>;
  /** Share of shape prompts snapped to the right shape. */
  accuracy: number;
  /** Share of loose strokes that snapped (to anything). */
  falseSnaps: number;
  shapes: number;
  loose: number;
  /** Prompts drawn in more than one stroke; the longest stroke is scored. */
  multiStroke: number;
}

/** The stroke a prompt is judged by: the longest, when someone drew more than one. */
function mainStroke(strokes: readonly Stroke[]): Stroke | null {
  let best: Stroke | null = null;
  for (const s of strokes) if (!best || pathLength(s.points) > pathLength(best.points)) best = s;
  return best;
}

export function scoreShapes(items: readonly LabeledItem[], config: SnapConfig = DEFAULT_SNAP): ShapeScore {
  const confusion: ShapeScore['confusion'] = {};
  let shapes = 0;
  let correct = 0;
  let loose = 0;
  let falseSnaps = 0;
  let multiStroke = 0;
  const snappedTo: Partial<Record<ShapeKind, number>> = {};
  const rightTo: Partial<Record<ShapeKind, number>> = {};
  const labeled: Partial<Record<ShapeKind, number>> = {};
  for (const item of items) {
    const stroke = mainStroke(item.strokes);
    if (!stroke) continue;
    if (item.strokes.length > 1) multiStroke++;
    const outcome: ShapeOutcome = recognizeShape(stroke.points, config)?.shape ?? 'none';
    const row = (confusion[item.label] ??= {});
    row[outcome] = (row[outcome] ?? 0) + 1;
    if (outcome !== 'none') snappedTo[outcome] = (snappedTo[outcome] ?? 0) + 1;
    if (item.label === 'loose') {
      loose++;
      if (outcome !== 'none') falseSnaps++;
      continue;
    }
    const label = item.label as ShapeKind;
    shapes++;
    labeled[label] = (labeled[label] ?? 0) + 1;
    if (outcome === label) {
      correct++;
      rightTo[label] = (rightTo[label] ?? 0) + 1;
    }
  }
  const recall: ShapeScore['recall'] = {};
  for (const [label, n] of Object.entries(labeled) as Array<[ShapeKind, number]>)
    recall[label] = (rightTo[label] ?? 0) / n;
  const precision: ShapeScore['precision'] = {};
  for (const [shape, n] of Object.entries(snappedTo) as Array<[ShapeKind, number]>)
    precision[shape] = (rightTo[shape] ?? 0) / n;
  return {
    confusion,
    recall,
    precision,
    accuracy: shapes ? correct / shapes : 0,
    falseSnaps: loose ? falseSnaps / loose : 0,
    shapes,
    loose,
    multiStroke,
  };
}
