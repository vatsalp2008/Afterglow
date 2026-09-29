// Calibration checked against real data: thresholds calibrated from a recording's
// own open and pinched moments must reproduce its labeled strokes.

import {
  calibratePinch,
  DEFAULT_PIPELINE,
  readsAsFist,
  replaySession,
  scoreFixture,
  type PipelineConfig,
} from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { loadFixture, loadLabels } from './load.ts';

describe('calibration on 04-pinch-on-off', () => {
  const rec = loadFixture('04-pinch-on-off');
  const label = loadLabels()['04-pinch-on-off']!;
  const pinched = label.pinched ?? [];
  // The pinch measure the state machine sees (filtered), split by the labels; 200 ms
  // around each transition is left out, as a user would be settling there.
  const replay = replaySession(rec, DEFAULT_PIPELINE);
  const near = (t: number) => pinched.some(([a, b]) => Math.abs(t - a) < 200 || Math.abs(t - b) < 200);
  const inside = (t: number) => pinched.some(([a, b]) => t >= a && t <= b);
  const samples = replay.frames.filter((f) => f.hands[0] && !near(f.t));
  const open = samples.filter((f) => !inside(f.t)).map((f) => f.hands[0]!.ratio);
  const closed = samples.filter((f) => inside(f.t)).map((f) => f.hands[0]!.ratio);
  const aspect = rec.meta.videoWidth / rec.meta.videoHeight;
  const closedFist = rec.frames
    .filter((f) => f.hands[0] && inside(f.captureTime) && !near(f.captureTime))
    .map((f) => readsAsFist(f.hands[0]!.landmarks, aspect));

  it('finds separable levels, and keeps the fist gate for a pinch that never reads as a fist', () => {
    expect(closedFist.some(Boolean)).toBe(false);
    const c = calibratePinch(open, closed, closedFist);
    expect(c.ok && c.result.fistBelow).toBe(DEFAULT_PIPELINE.pinch.fistBelow);
  });

  it('reproduces the labeled strokes with calibrated thresholds', () => {
    const c = calibratePinch(open, closed, closedFist);
    if (!c.ok) throw new Error(c.reason);
    const config: PipelineConfig = { ...DEFAULT_PIPELINE, pinch: { ...DEFAULT_PIPELINE.pinch, ...c.result } };
    const score = scoreFixture('04-pinch-on-off', replaySession(rec, config), label);
    expect(score.strokes).toBe(7);
    expect(score.penState?.recall).toBeGreaterThanOrEqual(0.85);
    // The same thresholds must not draw on an open hand.
    const still = scoreFixture(
      '01-still-hand',
      replaySession(loadFixture('01-still-hand'), config),
      loadLabels()['01-still-hand']!,
    );
    expect(still.strokes).toBe(0);
  });
});
