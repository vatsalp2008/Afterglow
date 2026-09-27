import { describe, expect, it } from 'vitest';
import { parseSessionRecording, SessionFormatError, SessionRecorder, type SessionRecording } from './session';
import type { HandFrame } from './types';

const landmarks = (x: number) => Array.from({ length: 21 }, (_, i) => ({ x: x + i * 1e-7, y: 0.123456789, z: -0.01 }));

function frame(frameId: number, captureTime: number, x = 0.5): HandFrame {
  return {
    frameId,
    captureTime,
    hands: [{ key: 'Right', handedness: 'Right', score: 0.98765, landmarks: landmarks(x) }],
  };
}

const meta = {
  userAgent: 'test',
  videoWidth: 640,
  videoHeight: 480,
  tracker: 'worker' as const,
  delegate: 'GPU' as const,
  recordedAt: '2026-09-28T00:00:00.000Z',
  scenario: '01-still-hand',
};

describe('SessionRecorder', () => {
  it('makes time and frame ids relative to the first frame and rounds values', () => {
    const r = new SessionRecorder();
    r.push(frame(40, 1000.04));
    r.push(frame(41, 1033.37));
    const rec = r.finish(meta);
    expect(rec.frames.map((f) => [f.frameId, f.captureTime])).toEqual([
      [0, 0],
      [1, 33.3],
    ]);
    const hand = rec.frames[0]!.hands[0]!;
    expect(hand.score).toBe(0.988);
    expect(hand.landmarks[0]).toEqual({ x: 0.5, y: 0.12346, z: -0.01 });
  });

  it('measures the tracking rate', () => {
    const r = new SessionRecorder();
    for (let i = 0; i <= 30; i++) r.push(frame(i, i * (1000 / 30)));
    expect(r.finish(meta).meta.fps).toBe(30);
    expect(r.frameCount).toBe(31);
  });

  it('reports zero fps for fewer than two frames and resets on clear', () => {
    const r = new SessionRecorder();
    expect(r.finish(meta).meta.fps).toBe(0);
    r.push(frame(3, 500));
    r.clear();
    r.push(frame(9, 900));
    expect(r.finish(meta).frames[0]).toMatchObject({ frameId: 0, captureTime: 0 });
  });
});

describe('parseSessionRecording', () => {
  const valid = (): SessionRecording => {
    const r = new SessionRecorder();
    r.push(frame(0, 0));
    r.push(frame(1, 33));
    return r.finish(meta);
  };

  it('round-trips a recording through JSON', () => {
    const rec = valid();
    expect(parseSessionRecording(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
  });

  it.each([
    ['a non-object', null, 'recording: expected an object'],
    ['a wrong version', { ...valid(), version: 2 }, 'version: expected 1'],
    ['a bad tracker', { ...valid(), meta: { ...meta, fps: 30, tracker: 'gpu' } }, 'meta.tracker'],
    [
      'decreasing times',
      { ...valid(), frames: [frame(0, 50), frame(1, 10)] },
      'frames[1].captureTime: expected non-decreasing',
    ],
    [
      'a short landmark list',
      { ...valid(), frames: [{ ...frame(0, 0), hands: [{ ...frame(0, 0).hands[0], landmarks: [] }] }] },
      'frames[0].hands[0].landmarks: expected 21 landmarks',
    ],
    [
      'a non-numeric coordinate',
      {
        ...valid(),
        frames: [
          {
            ...frame(0, 0),
            hands: [{ ...frame(0, 0).hands[0], landmarks: [{ x: 'a', y: 0, z: 0 }, ...landmarks(0).slice(1)] }],
          },
        ],
      },
      'frames[0].hands[0].landmarks[0].x: expected a finite number',
    ],
  ])('rejects %s', (_, input, message) => {
    expect(() => parseSessionRecording(input)).toThrow(SessionFormatError);
    expect(() => parseSessionRecording(input)).toThrow(message);
  });

  it('keeps optional notes', () => {
    const rec = valid();
    rec.meta.notes = 'dim room';
    expect(parseSessionRecording(JSON.parse(JSON.stringify(rec))).meta.notes).toBe('dim room');
  });
});
