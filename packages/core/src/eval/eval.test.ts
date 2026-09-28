import { describe, expect, it } from 'vitest';
import type { SessionRecording } from '../session.ts';
import type { InputEvent, Vec3 } from '../types.ts';
import { LabelFormatError, parseLabels } from './labels.ts';
import {
  drawingHands,
  estimateLag,
  jitterRms,
  median,
  releaseLatencies,
  scoreFixture,
  scorePenState,
  strokeCount,
  type TrackPoint,
} from './metrics.ts';
import { DEFAULT_PIPELINE, penTrack, replaySession, type Replay } from './pipeline.ts';

function replay(drawing: Array<[number, boolean]>, events: InputEvent[] = [], durationMs = 100): Replay {
  return { events, frames: drawing.map(([t, d]) => ({ t, drawing: d, hands: [] })), durationMs };
}

const end = (t: number, handKey = 'hand-1'): InputEvent => ({ type: 'strokeEnd', t, handKey, reason: 'release' });
const start = (t: number, handKey = 'hand-1'): InputEvent => ({
  type: 'strokeStart',
  t,
  handKey,
  p: { x: 0, y: 0, depth: 1 },
});

describe('scorePenState', () => {
  it('weights agreement by time', () => {
    // Each frame's state holds until the next frame. Drawing on frames 20..50 covers
    // [20, 60); the label [30, 80] marks frames 30..80, covering [30, 90).
    // So tp = 30 ms, fp = 10 ms, fn = 30 ms.
    const frames = Array.from({ length: 11 }, (_, i): [number, boolean] => [i * 10, i * 10 >= 20 && i * 10 < 60]);
    const s = scorePenState(replay(frames), [[30, 80]]);
    expect(s.precision).toBeCloseTo(30 / 40, 9);
    expect(s.recall).toBeCloseTo(30 / 60, 9);
    expect(s.f1).toBeCloseTo((2 * 0.75 * 0.5) / 1.25, 9);
  });

  it('is perfect for a correctly silent replay', () => {
    expect(
      scorePenState(
        replay([
          [0, false],
          [50, false],
          [100, false],
        ]),
        [],
      ),
    ).toEqual({ precision: 1, recall: 1, f1: 1 });
  });
});

describe('stroke metrics', () => {
  it('count strokes and distinct drawing hands', () => {
    const r = replay([], [start(0), end(10), start(20, 'hand-2'), start(30)]);
    expect(strokeCount(r)).toBe(3);
    expect(drawingHands(r)).toBe(2);
  });

  it('measure release latency as time until the pen is up', () => {
    // Pen down over [0, 130), up from 130; a second pinch is still held at the end.
    const frames = Array.from({ length: 41 }, (_, i): [number, boolean] => [i * 10, i * 10 < 130 || i * 10 >= 200]);
    expect(
      releaseLatencies(replay(frames, [], 400), [
        [0, 100],
        [200, 400],
      ]),
    ).toEqual([30]);
  });

  it('report an early pen-up as negative latency, and skip pinches never drawn', () => {
    const frames = Array.from({ length: 41 }, (_, i): [number, boolean] => [i * 10, i * 10 < 80]);
    expect(releaseLatencies(replay(frames, [], 400), [[0, 100]])).toEqual([-20]);
    const silent = Array.from({ length: 41 }, (_, i): [number, boolean] => [i * 10, false]);
    expect(releaseLatencies(replay(silent, [], 400), [[0, 100]])).toEqual([]);
  });

  it('take a median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('score a fixture against its label', () => {
    const r = replay(
      Array.from({ length: 11 }, (_, i): [number, boolean] => [i * 100, i > 0]),
      [start(100), end(400), start(500)],
      1000,
    );
    const score = scoreFixture('x', r, { strokes: 1, pinched: [[100, 1000]], source: 'test' });
    expect(score).toMatchObject({ strokes: 2, expectedStrokes: 1, hands: 1 });
    // One extra stroke over 0.9 s of pinch: 66.7 broken strokes per minute.
    expect(score.brokenPerMinute).toBeCloseTo(60_000 / 900, 6);
    expect(scoreFixture('y', r, { strokes: null, pinched: null, source: 'test' })).toMatchObject({
      penState: null,
      releaseMs: null,
      brokenPerMinute: null,
    });
  });
});

describe('filter metrics', () => {
  const track = (fn: (t: number) => [number, number]): TrackPoint[] =>
    Array.from({ length: 300 }, (_, i) => {
      const t = i * 33;
      const [x, y] = fn(t);
      return { t, x, y };
    });

  it('measure no jitter on a still or slowly drifting track', () => {
    expect(jitterRms(track(() => [10, 10]))).toBe(0);
    expect(jitterRms(track((t) => [t / 1000, 0]))).toBeLessThan(1e-9);
  });

  it('measure frame-to-frame noise as RMS pixels', () => {
    const noisy = track((t) => [Math.round(t / 33) % 2 ? 1 : -1, 0]);
    expect(jitterRms(noisy)).toBeCloseTo(1, 1);
  });

  it('recover a known delay', () => {
    const wave = (t: number): [number, number] => [100 * Math.sin((2 * Math.PI * t) / 1000), 0];
    expect(
      estimateLag(
        track(wave),
        track((t) => wave(t - 40)),
      ),
    ).toBe(40);
    expect(estimateLag(track(wave), track(wave))).toBe(0);
  });
});

describe('parseLabels', () => {
  it('accepts well-formed labels', () => {
    const labels = parseLabels({
      a: { strokes: 1, pinched: [[0, 10]], source: 'derived' },
      b: { strokes: null, hands: 2, pinched: null, source: 'observed' },
      c: { strokes: 0, pinched: [], still: [100, 900], source: 'still' },
    });
    expect(labels['b']).toEqual({ strokes: null, hands: 2, pinched: null, source: 'observed' });
    expect(labels['c']?.still).toEqual([100, 900]);
  });

  it.each([
    [[], 'labels: expected an object'],
    [{ a: { strokes: '1', pinched: null, source: 's' } }, 'a.strokes'],
    [{ a: { strokes: 1, pinched: [[5, 1]], source: 's' } }, 'a.pinched[0]'],
    [{ a: { strokes: 1, pinched: null, source: '' } }, 'a.source'],
    [{ a: { strokes: 0, pinched: [], still: [1], source: 's' } }, 'a.still'],
  ])('rejects %j', (raw, message) => {
    expect(() => parseLabels(raw)).toThrow(LabelFormatError);
    expect(() => parseLabels(raw)).toThrow(message);
  });
});

describe('replaySession', () => {
  // A pinched hand held still for 10 frames (fingertip ratio 0.1 against a palm of 0.2).
  const lm: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.7, z: 0 };
  lm[4] = { x: 0.49, y: 0.4, z: 0 };
  lm[8] = { x: 0.51, y: 0.4, z: 0 };
  for (const tip of [12, 16, 20]) lm[tip] = { x: 0.5, y: 0.3, z: 0 }; // extended: not a fist
  const rec: SessionRecording = {
    version: 1,
    meta: {
      userAgent: 'test',
      videoWidth: 480,
      videoHeight: 480,
      fps: 30,
      tracker: 'worker',
      delegate: 'GPU',
      recordedAt: '2026-09-28T00:00:00.000Z',
    },
    frames: Array.from({ length: 10 }, (_, i) => ({
      frameId: i,
      captureTime: i * 33,
      hands: [{ key: 'Left', handedness: 'Left' as const, score: 1, landmarks: lm }],
    })),
  };

  it('runs identity, filter, and pinch, and closes the stroke at the end', () => {
    const r = replaySession(rec, DEFAULT_PIPELINE);
    expect(strokeCount(r)).toBe(1);
    expect(r.events[r.events.length - 1]).toMatchObject({ type: 'strokeEnd', handKey: 'hand-1', t: 297 });
    expect(r.frames.filter((f) => f.drawing)).toHaveLength(9);
    expect(r.durationMs).toBe(297);
  });

  it('keeps the tracker keys when identity is disabled', () => {
    const r = replaySession(rec, { ...DEFAULT_PIPELINE, identity: null });
    expect(r.events.find((e) => e.type === 'strokeStart')?.handKey).toBe('Left');
  });

  it('exposes the pen track in video pixels', () => {
    const track = penTrack(replaySession(rec), 480, 480);
    expect(track).toHaveLength(10);
    // Mirrored view space: the midpoint of the tips (x = 0.5) stays at the center.
    expect(track[0]).toEqual({ t: 0, x: 240, y: 192 });
  });
});
