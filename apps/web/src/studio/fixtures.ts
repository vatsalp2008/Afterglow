// Recorded sessions from fixtures/sessions, loaded on demand (each file is its
// own chunk, so nothing is downloaded unless a fixture is played).

import { parseSessionRecording, type SessionRecording } from '@afterglow/core';

const loaders = import.meta.glob<{ default: unknown }>('../../../../fixtures/sessions/*.json');

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.json$/, '');

export function fixtureNames(): string[] {
  return Object.keys(loaders).map(nameOf).sort();
}

export async function loadFixture(name: string): Promise<SessionRecording> {
  const entry = Object.entries(loaders).find(([path]) => nameOf(path) === name);
  if (!entry) throw new Error(`No fixture named "${name}"`);
  const mod = await entry[1]();
  return parseSessionRecording(mod.default);
}
