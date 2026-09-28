// Golden replays: every recorded session runs through the default input pipeline,
// and the resulting strokes are compared with a committed snapshot in golden/.
// A behavior change shows up as a reviewable diff; update with `vitest -u`.
//
// Correctness is asserted separately against the labels. Fixtures the pipeline
// doesn't handle yet are expected failures (it.fails), so fixing one flips its
// test red and forces the record to be updated.

import { DEFAULT_PIPELINE, replaySession, scoreFixture, type InputEvent } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { fixtureNames, loadFixture, loadLabels } from './load.ts';

interface StrokeSummary {
  hand: string;
  startMs: number;
  endMs: number;
  end: 'release' | 'handLost';
}

function strokes(events: readonly InputEvent[]): StrokeSummary[] {
  const open = new Map<string, number>();
  const out: StrokeSummary[] = [];
  for (const e of events) {
    if (e.type === 'strokeStart') open.set(e.handKey, e.t);
    if (e.type === 'strokeEnd') {
      const start = open.get(e.handKey);
      if (start === undefined) continue;
      open.delete(e.handKey);
      out.push({ hand: e.handKey, startMs: Math.round(start), endMs: Math.round(e.t), end: e.reason });
    }
  }
  return out;
}

const labels = loadLabels();
const round = (v: number) => Math.round(v * 1000) / 1000;

function run(name: string) {
  const replay = replaySession(loadFixture(name), DEFAULT_PIPELINE);
  const score = scoreFixture(name, replay, labels[name]!);
  return { replay, score };
}

describe('golden replays', () => {
  it.each(fixtureNames())('%s matches its snapshot', async (name) => {
    const { replay, score } = run(name);
    const golden = {
      strokes: strokes(replay.events),
      penState: score.penState && {
        precision: round(score.penState.precision),
        recall: round(score.penState.recall),
      },
    };
    await expect(`${JSON.stringify(golden, null, 2)}\n`).toMatchFileSnapshot(`../golden/${name}.json`);
  });
});

describe('correct results', () => {
  const clean = ['01-still-hand', '02-slow-circles', '03-fast-zigzag', '04-pinch-on-off', '05-hand-leaves-frame'];
  const noPinch = ['01-still-hand', '09-relaxed-hand', '10-open-palm', '11-fist', '12-swipes', '13-frame'];

  it.each(clean)('%s produces exactly the labeled strokes', (name) => {
    expect(run(name).score.strokes).toBe(labels[name]?.strokes);
  });

  it.each([...clean, '14-low-light-2'].filter((n) => labels[n]?.pinched?.length))(
    '%s draws at least 85%% of pinched time',
    (name) => {
      expect(run(name).score.penState?.recall).toBeGreaterThanOrEqual(0.85);
    },
  );

  it.each(noPinch)('never draws on %s', (name) => {
    const { score } = run(name);
    expect(score.strokes).toBe(0);
    expect(score.penState?.precision).toBe(1);
  });

  it('06-two-hands draws with exactly two hands', () => {
    expect(run('06-two-hands').score.hands).toBe(2);
  });
});

// Known gaps. Each should pass one day; until then it's an expected failure.
describe('known gaps', () => {
  it.fails('07-low-light draws its held pinch as one stroke', () => {
    expect(run('07-low-light').score.strokes).toBe(1);
  });

  it.fails('07-low-light draws at least 85% of pinched time', () => {
    expect(run('07-low-light').score.penState?.recall).toBeGreaterThanOrEqual(0.85);
  });

  it.fails('08-rotated-hand draws its held pinch as one stroke', () => {
    expect(run('08-rotated-hand').score.strokes).toBe(1);
  });

  it.fails('08-rotated-hand draws at least 85% of pinched time', () => {
    expect(run('08-rotated-hand').score.penState?.recall).toBeGreaterThanOrEqual(0.85);
  });

  it.fails('14-low-light-2 draws its held pinch as one stroke', () => {
    expect(run('14-low-light-2').score.strokes).toBe(1);
  });

  it.fails('15-rotated-hand-2 draws at least 85% of pinched time', () => {
    expect(run('15-rotated-hand-2').score.penState?.recall).toBeGreaterThanOrEqual(0.85);
  });
});
