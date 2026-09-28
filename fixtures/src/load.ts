// Loads the recorded sessions and their labels from disk (Node only).

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLabels, parseSessionRecording, type FixtureLabels, type SessionRecording } from '@afterglow/core';

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
