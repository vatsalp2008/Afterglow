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

  it('has a recording for every scenario', () => {
    const names = Object.keys(files).map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length));
    expect(names.sort()).toEqual(SCENARIOS.map((s) => s.id));
  });

  it('finds the fixture directory', () => {
    // Guards against the glob path silently matching nothing after a move.
    expect(Object.keys(import.meta.glob('../../../../fixtures/sessions/README.md'))).toHaveLength(1);
  });
});
