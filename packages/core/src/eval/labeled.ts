// Labeled sets of air-drawn strokes: shapes and doodles drawn in the studio to a prompt
// (?record=shapes, ?record=doodles), kept raw (never snapped), to measure shape snapping
// (ADR 0014) and the doodle model on the strokes people really make (ADR 0015).

import type { FrameSize } from '../coords.ts';
import { readDrawingParts, toDrawing } from '../drawing.ts';
import type { Stroke } from '../types.ts';

export const LABELED_FORMAT = 'afterglow.labeled';
export const LABELED_VERSION = 1;

export type LabeledKind = 'shapes' | 'doodles';

export interface LabeledItem {
  /** What the prompt asked for, e.g. "circle", "loose", "smiley face". */
  label: string;
  strokes: Stroke[];
}

export interface LabeledSet {
  format: typeof LABELED_FORMAT;
  version: typeof LABELED_VERSION;
  kind: LabeledKind;
  /** An anonymous id like "p1", never a name: fixtures are public. */
  person: string;
  /** ISO time the set was recorded. */
  recordedAt: string;
  frame: FrameSize;
  items: LabeledItem[];
}

const LABEL = /^[a-z][a-z ]{0,39}$/;
const PERSON = /^[a-z][a-z0-9]{0,7}$/;

export function toLabeledSet(
  kind: LabeledKind,
  person: string,
  recordedAt: string,
  frame: FrameSize,
  items: readonly LabeledItem[],
): LabeledSet {
  const rounded = toDrawing([], frame).frame;
  return {
    format: LABELED_FORMAT,
    version: LABELED_VERSION,
    kind,
    person,
    recordedAt,
    frame: rounded,
    items: items.map((item) => ({ label: item.label, strokes: toDrawing(item.strokes, frame).strokes })),
  };
}

export type ParsedLabeledSet = { ok: true; set: LabeledSet } | { ok: false; problem: string };

/** Reads a labeled set, checking its strokes as a drawing file's are checked. */
export function parseLabeledSet(text: string): ParsedLabeledSet {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'not JSON' };
  }
  if (typeof data !== 'object' || data === null) return { ok: false, problem: 'not an object' };
  const d = data as Record<string, unknown>;
  if (d['format'] !== LABELED_FORMAT) return { ok: false, problem: 'not a labeled set' };
  if (d['version'] !== LABELED_VERSION) return { ok: false, problem: `unknown version ${String(d['version'])}` };
  const kind = d['kind'];
  if (kind !== 'shapes' && kind !== 'doodles') return { ok: false, problem: 'unknown kind' };
  const person = d['person'];
  if (typeof person !== 'string' || !PERSON.test(person)) return { ok: false, problem: 'bad person id' };
  const recordedAt = d['recordedAt'];
  if (typeof recordedAt !== 'string') return { ok: false, problem: 'no recording time' };
  const items = d['items'];
  if (!Array.isArray(items)) return { ok: false, problem: 'no items' };
  let frame: FrameSize | null = null;
  const out: LabeledItem[] = [];
  for (const [i, item] of items.entries()) {
    if (typeof item !== 'object' || item === null) return { ok: false, problem: `item ${String(i)} is not an object` };
    const { label, strokes } = item as Record<string, unknown>;
    if (typeof label !== 'string' || !LABEL.test(label))
      return { ok: false, problem: `item ${String(i)} has a bad label` };
    const parts = readDrawingParts(d['frame'], strokes);
    if (!parts.ok) return { ok: false, problem: `item ${String(i)} is ${parts.problem}` };
    frame = parts.frame;
    out.push({ label, strokes: parts.strokes });
  }
  if (!frame) {
    const parts = readDrawingParts(d['frame'], []);
    if (!parts.ok) return { ok: false, problem: 'bad frame' };
    frame = parts.frame;
  }
  return {
    ok: true,
    set: { format: LABELED_FORMAT, version: LABELED_VERSION, kind, person, recordedAt, frame, items: out },
  };
}
