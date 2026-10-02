// Loads the recorded sessions, their labels, and the labeled air-drawn sets from disk (Node only).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  parseLabeledSet,
  parseLabels,
  parseSessionRecording,
  type FixtureLabels,
  type LabeledKind,
  type LabeledSet,
  type SessionRecording,
} from '@afterglow/core';

const root = fileURLToPath(new URL('..', import.meta.url));

export function fixtureNames(): string[] {
  return readdirSync(`${root}sessions`)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export function loadFixture(name: string): SessionRecording {
  return parseSessionRecording(JSON.parse(readFileSync(`${root}sessions/${name}.json`, 'utf8')));
}

export function loadLabels(): FixtureLabels {
  return parseLabels(JSON.parse(readFileSync(`${root}labels.json`, 'utf8')));
}

/** The labeled sets recorded with ?record=shapes or ?record=doodles, in fixtures/shapes or fixtures/doodles. */
export function loadLabeledSets(kind: LabeledKind): Array<{ file: string; set: LabeledSet }> {
  const dir = `${root}${kind}`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const parsed = parseLabeledSet(readFileSync(`${dir}/${file}`, 'utf8'));
      if (!parsed.ok) throw new Error(`${kind}/${file}: ${parsed.problem}`);
      if (parsed.set.kind !== kind) throw new Error(`${kind}/${file} holds ${parsed.set.kind}`);
      return { file, set: parsed.set };
    });
}
