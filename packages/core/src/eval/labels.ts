// Ground truth for the recorded fixtures (fixtures/labels.json).

import type { ToolGesture } from '../types.ts';

/** A tool gesture the person made, expected to be detected within `at` (ms). */
export interface ExpectedGesture {
  name: ToolGesture;
  at: [number, number];
}

export interface FixtureLabel {
  /** Expected number of strokes, or null when the count isn't exactly defined. */
  strokes: number | null;
  /** Number of distinct hands that should draw, when that's the requirement. */
  hands?: number;
  /** Pinched intervals in ms, or null when the fixture isn't labeled per frame. */
  pinched: Array<[number, number]> | null;
  /** An interval where the hand is held still, for measuring stationary jitter. */
  still?: [number, number];
  /**
   * The tool gestures made, in order; anything else detected is a false trigger. [] means
   * none were made. Absent or null when it isn't known which gestures were meant.
   */
  gestures?: ExpectedGesture[] | null;
  /** How the label was derived. */
  source: string;
}

export type FixtureLabels = Record<string, FixtureLabel>;

const TOOL_GESTURES: readonly ToolGesture[] = ['openMenu', 'pause', 'undo', 'redo', 'refine'];

export class LabelFormatError extends Error {
  override name = 'LabelFormatError';
}

function fail(path: string, expected: string): never {
  throw new LabelFormatError(`${path}: expected ${expected}`);
}

export function parseLabels(raw: unknown): FixtureLabels {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('labels', 'an object');
  const out: FixtureLabels = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) fail(name, 'an object');
    const v = value as Record<string, unknown>;
    const strokes = v['strokes'];
    if (strokes !== null && typeof strokes !== 'number') fail(`${name}.strokes`, 'a number or null');
    const pinched = v['pinched'];
    if (pinched !== null) {
      if (!Array.isArray(pinched)) fail(`${name}.pinched`, 'an array or null');
      pinched.forEach((iv: unknown, i) => {
        if (
          !Array.isArray(iv) ||
          iv.length !== 2 ||
          typeof iv[0] !== 'number' ||
          typeof iv[1] !== 'number' ||
          iv[0] > iv[1]
        ) {
          fail(`${name}.pinched[${String(i)}]`, 'a [start, end] pair');
        }
      });
    }
    const source = v['source'];
    if (typeof source !== 'string' || source.length === 0) fail(`${name}.source`, 'a description');
    const label: FixtureLabel = { strokes, pinched: pinched as FixtureLabel['pinched'], source };
    if (typeof v['hands'] === 'number') label.hands = v['hands'];
    const still = v['still'];
    if (still !== undefined) {
      if (!Array.isArray(still) || still.length !== 2 || typeof still[0] !== 'number' || typeof still[1] !== 'number') {
        fail(`${name}.still`, 'a [start, end] pair');
      }
      label.still = [still[0], still[1]];
    }
    const gestures = v['gestures'];
    if (gestures !== undefined && gestures !== null) {
      if (!Array.isArray(gestures)) fail(`${name}.gestures`, 'an array or null');
      label.gestures = gestures.map((g: unknown, i): ExpectedGesture => {
        const path = `${name}.gestures[${String(i)}]`;
        if (typeof g !== 'object' || g === null) fail(path, 'an object');
        const { name: gesture, at } = g as Record<string, unknown>;
        if (typeof gesture !== 'string' || !TOOL_GESTURES.includes(gesture as ToolGesture)) {
          fail(`${path}.name`, TOOL_GESTURES.join(' | '));
        }
        if (
          !Array.isArray(at) ||
          at.length !== 2 ||
          typeof at[0] !== 'number' ||
          typeof at[1] !== 'number' ||
          at[0] > at[1]
        ) {
          fail(`${path}.at`, 'a [start, end] pair');
        }
        return { name: gesture as ToolGesture, at: [at[0], at[1]] };
      });
    } else if (gestures === null) {
      label.gestures = null;
    }
    out[name] = label;
  }
  return out;
}
