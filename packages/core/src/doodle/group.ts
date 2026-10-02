// When to guess what someone drew (ADR 0015): the latest group of strokes, drawn close
// together in time, once it has settled.

import type { Stroke } from '../types.ts';

export interface DoodleGroupConfig {
  /** A stroke joins the group when it began within this long after the previous one ended (ms). */
  joinMs: number;
  /** A group has settled this long after its last stroke ended (ms). */
  settleMs: number;
}

export const DEFAULT_DOODLE_GROUP: DoodleGroupConfig = { joinMs: 2000, settleMs: 1500 };

const startOf = (s: Stroke) => s.points[0]?.t ?? s.createdAt;
const endOf = (s: Stroke) => s.points[s.points.length - 1]?.t ?? s.createdAt;

/**
 * The latest group: from the most recently drawn stroke back, while each stroke began
 * within `joinMs` of the one before it ending. Snapped shapes on their own aren't doodles,
 * so a group of only snapped shapes is empty.
 */
export function latestGroup(strokes: readonly Stroke[], config: DoodleGroupConfig = DEFAULT_DOODLE_GROUP): Stroke[] {
  const drawn = strokes.filter((s) => s.points.length > 0).sort((a, b) => startOf(a) - startOf(b));
  const group: Stroke[] = [];
  for (let i = drawn.length - 1; i >= 0; i--) {
    const s = drawn[i]!;
    const next = group[0];
    if (next && startOf(next) - endOf(s) > config.joinMs) break;
    group.unshift(s);
  }
  return group.every((s) => s.shape) ? [] : group;
}

/** Whether a group has settled by `now`. */
export function groupSettled(
  group: readonly Stroke[],
  now: number,
  config: DoodleGroupConfig = DEFAULT_DOODLE_GROUP,
): boolean {
  if (group.length === 0) return false;
  return now - Math.max(...group.map(endOf)) >= config.settleMs;
}

/** Identifies a group, so the same strokes aren't guessed twice. */
export const groupKey = (group: readonly Stroke[]): string => group.map((s) => s.id).join(',');
