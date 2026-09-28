import { parseSessionRecording } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios';

// Every committed fixture must parse and be internally consistent.
const files = import.meta.glob<{ default: unknown }>('../../../../fixtures/sessions/*.json', { eager: true });

describe('recorded fixtures', () => {
  for (const [path, mod] of Object.entries(files)) {
    it(`${path.slice(path.lastIndexOf('/') + 1)} is a valid session`, () => {
      const rec = parseSessionRecording(mod.default);
      expect(rec.frames.length).toBeGreaterThan(0);
      expect(rec.frames[0]?.captureTime).toBe(0);
      for (const f of rec.frames) {
        for (const h of f.hands) {
          for (const p of h.landmarks) {
            // MediaPipe may place occluded points slightly outside the image.
            expect(p.x).toBeGreaterThan(-0.5);
            expect(p.x).toBeLessThan(1.5);
            expect(p.y).toBeGreaterThan(-0.5);
            expect(p.y).toBeLessThan(1.5);
          }
        }
      }
    });
  }

  const names = Object.keys(files).map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length));

  it('names every recording after a scenario', () => {
    const ids = new Set(SCENARIOS.map((s) => s.id));
    for (const name of names) expect(ids.has(name), name).toBe(true);
  });

  it('has a recording for every Phase 1 scenario', () => {
    // Phase 2 scenarios (09 on) are recorded at the Phase 2 checkpoint.
    const phase1 = SCENARIOS.map((s) => s.id).filter((id) => Number(id.slice(0, 2)) <= 8);
    for (const id of phase1) expect(names).toContain(id);
  });

  it('finds the fixture directory', () => {
    // Guards against the glob path silently matching nothing after a move.
    expect(Object.keys(import.meta.glob('../../../../fixtures/sessions/README.md'))).toHaveLength(1);
  });
});
