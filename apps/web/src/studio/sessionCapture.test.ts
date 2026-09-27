import type { HandFrame } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from './scenarios';
import { SessionCapture } from './sessionCapture';

const ctx = {
  userAgent: 'test',
  recordedAt: '2026-09-28T00:00:00.000Z',
  videoWidth: 640,
  videoHeight: 480,
  tracker: 'worker' as const,
  delegate: 'GPU' as const,
};
const frame = (t: number): HandFrame => ({ frameId: t, captureTime: t, hands: [] });

describe('SessionCapture', () => {
  it('only records while active', () => {
    const c = new SessionCapture();
    c.push(frame(0));
    c.start();
    c.push(frame(10));
    c.push(frame(43));
    const { recording, fileName } = c.finish(ctx, 'afterglow-session');
    expect(recording.frames.map((f) => f.captureTime)).toEqual([0, 33]);
    expect(fileName).toBe('afterglow-session.json');
    c.push(frame(99));
    expect(c.frameCount).toBe(0);
  });

  it('names the file after the scenario and records its instruction', () => {
    const c = new SessionCapture();
    const scenario = SCENARIOS[3]!;
    c.start(scenario);
    c.push(frame(0));
    const { recording, fileName } = c.finish(ctx, 'unused');
    expect(fileName).toBe('04-pinch-on-off.json');
    expect(recording.meta).toMatchObject({ scenario: '04-pinch-on-off', notes: scenario.instruction });
  });
});

describe('SCENARIOS', () => {
  it('has 8 uniquely numbered fixtures', () => {
    expect(SCENARIOS).toHaveLength(8);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(8);
    SCENARIOS.forEach((s, i) => expect(s.id.startsWith(String(i + 1).padStart(2, '0'))).toBe(true));
  });
});
