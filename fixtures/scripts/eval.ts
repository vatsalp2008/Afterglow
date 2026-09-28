// Scores the input pipeline against the recorded fixtures.
//
//   pnpm --filter @afterglow/fixtures eval             scoreboard for the current defaults
//   pnpm --filter @afterglow/fixtures eval --tune      sweep pinch settings
//   pnpm --filter @afterglow/fixtures eval --filters   jitter and lag per filter
//   add --json for machine-readable output

import {
  DEFAULT_FILTER_SPECS,
  DEFAULT_PIPELINE,
  estimateLag,
  jitterRms,
  penTrack,
  replaySession,
  scoreFixture,
  type FilterSpec,
  type FixtureScore,
  type PinchConfig,
  type PipelineConfig,
  type SessionRecording,
} from '@afterglow/core';
import { fixtureNames, loadFixture, loadLabels } from '../src/load.ts';

const args = new Set(process.argv.slice(2));
const asJson = args.has('--json');
const labels = loadLabels();
const fixtures = new Map<string, SessionRecording>(fixtureNames().map((n) => [n, loadFixture(n)]));

export interface Summary {
  strokeError: number;
  handErrors: number;
  meanF1: number;
  minRecall: number;
  releaseMs: number | null;
}

function scoreAll(config: PipelineConfig): { scores: FixtureScore[]; summary: Summary } {
  const scores = [...fixtures].map(([name, rec]) => scoreFixture(name, replaySession(rec, config), labels[name]!));
  const labeled = scores.filter((s) => s.penState);
  const releases = scores.flatMap((s) => (s.releaseMs === null ? [] : [s.releaseMs]));
  return {
    scores,
    summary: {
      strokeError: scores.reduce(
        (sum, s) => sum + (s.expectedStrokes === null ? 0 : Math.abs(s.strokes - s.expectedStrokes)),
        0,
      ),
      handErrors: scores.filter((s) => s.expectedHands !== null && s.hands !== s.expectedHands).length,
      meanF1: labeled.reduce((sum, s) => sum + s.penState!.f1, 0) / labeled.length,
      minRecall: Math.min(...labeled.map((s) => s.penState!.recall)),
      releaseMs: releases.length ? releases.reduce((a, b) => a + b, 0) / releases.length : null,
    },
  };
}

const f2 = (v: number | null | undefined) => (v === null || v === undefined ? '   -' : v.toFixed(2));
const ms = (v: number | null) => (v === null ? '    -' : `${v.toFixed(0).padStart(4)}ms`);

function describePinch(p: PinchConfig): string {
  return `enter ${String(p.enter)}, exit ${String(p.exit)}, frames ${String(p.enterFrames)}/${String(p.exitFrames)}, exitMs ${String(p.exitMs)}, segment ${String(p.segmentWeight)}`;
}

function describeFilter(f: FilterSpec): string {
  const { kind, ...params } = f;
  const entries = Object.entries(params).map(([k, v]) => `${k} ${String(v)}`);
  return entries.length ? `${kind} (${entries.join(', ')})` : kind;
}

function printScoreboard(config: PipelineConfig): void {
  const { scores, summary } = scoreAll(config);
  if (asJson) {
    console.log(JSON.stringify({ config, scores, summary }, null, 2));
    return;
  }
  console.log(`filter: ${describeFilter(config.filter)}\npinch:  ${describePinch(config.pinch)}\n`);
  console.log('fixture                 strokes  hands  precision  recall    F1   release  broken/min');
  for (const s of scores) {
    const strokes = `${String(s.strokes)} / ${s.expectedStrokes === null ? '-' : String(s.expectedStrokes)}`;
    const hands = s.expectedHands === null ? String(s.hands) : `${String(s.hands)} / ${String(s.expectedHands)}`;
    console.log(
      `${s.name.padEnd(24)}${strokes.padStart(7)}  ${hands.padStart(5)}  ${f2(s.penState?.precision).padStart(9)}  ${f2(s.penState?.recall).padStart(6)}  ${f2(s.penState?.f1).padStart(4)}  ${ms(s.releaseMs)}  ${s.brokenPerMinute === null ? '         -' : s.brokenPerMinute.toFixed(1).padStart(10)}`,
    );
  }
  console.log(
    `\nstroke errors ${String(summary.strokeError)}, hand errors ${String(summary.handErrors)}, mean F1 ${summary.meanF1.toFixed(3)}, lowest recall ${summary.minRecall.toFixed(2)}, mean release ${ms(summary.releaseMs).trim()}`,
  );
}

/** Lexicographic: fewest stroke and hand errors, then best mean F1, then fastest release. */
function better(a: Summary, b: Summary): number {
  return (
    a.strokeError + a.handErrors * 10 - (b.strokeError + b.handErrors * 10) ||
    b.meanF1 - a.meanF1 ||
    (a.releaseMs ?? 0) - (b.releaseMs ?? 0)
  );
}

function tune(): void {
  const grid: PinchConfig[] = [];
  for (const segmentWeight of [0, 1.2, 1.6, 2]) {
    for (const enter of [0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.25]) {
      for (const exit of [0.3, 0.35, 0.4, 0.45, 0.5]) {
        if (exit < enter + 0.08) continue;
        for (const rejoinMs of [0, 150, 250, 400]) {
          for (const exitFrames of [2, 3, 4]) {
            grid.push({ ...DEFAULT_PIPELINE.pinch, segmentWeight, enter, exit, exitFrames, exitMs: 0, rejoinMs });
          }
          // Time-based release instead of a frame count.
          for (const exitMs of [66, 100, 150]) {
            grid.push({ ...DEFAULT_PIPELINE.pinch, segmentWeight, enter, exit, exitFrames: 1, exitMs, rejoinMs });
          }
        }
      }
    }
  }
  const results = grid.map((pinch) => ({ pinch, summary: scoreAll({ ...DEFAULT_PIPELINE, pinch }).summary }));
  results.sort((a, b) => better(a.summary, b.summary));
  const key = (p: PinchConfig) => [p.segmentWeight, p.enter, p.exit, p.exitFrames, p.exitMs, p.rejoinMs].join('|');
  const byKey = new Map(results.map((r) => [key(r.pinch), r.summary]));
  // Stability: how many grid neighbors (one step in enter or exit) are just as good on errors.
  const enters = [0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.25];
  const exits = [0.3, 0.35, 0.4, 0.45, 0.5];
  const stability = (p: PinchConfig, s: Summary): string => {
    const ie = enters.indexOf(p.enter);
    const ix = exits.indexOf(p.exit);
    const neighbors = [
      [ie - 1, ix],
      [ie + 1, ix],
      [ie, ix - 1],
      [ie, ix + 1],
    ].flatMap(([a, b]) => {
      const e = enters[a!];
      const x = exits[b!];
      return e === undefined || x === undefined ? [] : [byKey.get(key({ ...p, enter: e, exit: x }))];
    });
    const same = neighbors.filter(
      (n) => n && n.strokeError + n.handErrors * 10 <= s.strokeError + s.handErrors * 10,
    ).length;
    return `${String(same)}/${String(neighbors.length)}`;
  };
  if (asJson) {
    console.log(JSON.stringify(results.slice(0, 25), null, 2));
    return;
  }
  console.log(`${String(grid.length)} configurations, best first (stable = neighbors with equally few errors)\n`);
  console.log('segment  enter  exit  release     rejoin  errors  mean F1  min recall  pen-up  stable');
  for (const { pinch, summary } of results.slice(0, 20)) {
    const release = pinch.exitMs > 0 ? `${String(pinch.exitMs)}ms` : `${String(pinch.exitFrames)} frames`;
    console.log(
      `${String(pinch.segmentWeight).padStart(7)}  ${pinch.enter.toFixed(2)}  ${pinch.exit.toFixed(2)}  ${release.padEnd(10)}  ${String(pinch.rejoinMs).padStart(6)}  ${String(summary.strokeError + summary.handErrors * 10).padStart(6)}  ${summary.meanF1.toFixed(3).padStart(7)}  ${summary.minRecall.toFixed(2).padStart(10)}  ${ms(summary.releaseMs)}  ${stability(pinch, summary).padStart(6)}`,
    );
  }
  const legacy = {
    ...DEFAULT_PIPELINE.pinch,
    segmentWeight: 0,
    enter: 0.25,
    exit: 0.35,
    exitFrames: 2,
    exitMs: 0,
    rejoinMs: 0,
  };
  const base = scoreAll({ ...DEFAULT_PIPELINE, pinch: legacy }).summary;
  console.log(
    `\nPhase 1 settings (tip only, 0.25/0.35, 2 frames): errors ${String(base.strokeError + base.handErrors * 10)}, mean F1 ${base.meanF1.toFixed(3)}, min recall ${base.minRecall.toFixed(2)}`,
  );
}

function filters(): void {
  const still = fixtures.get('01-still-hand')!;
  const [stillFrom, stillTo] = labels['01-still-hand']?.still ?? [0, Number.POSITIVE_INFINITY];
  const fast = fixtures.get('03-fast-zigzag')!;
  const track = (rec: SessionRecording, filter: FilterSpec) =>
    penTrack(replaySession(rec, { ...DEFAULT_PIPELINE, filter }), rec.meta.videoWidth, rec.meta.videoHeight);
  const stillTrack = (filter: FilterSpec) => track(still, filter).filter((p) => p.t >= stillFrom && p.t <= stillTo);
  const rawFast = track(fast, DEFAULT_FILTER_SPECS.none);
  const specs: FilterSpec[] = [
    DEFAULT_FILTER_SPECS.none,
    ...[20, 40, 60, 100].map((tauMs): FilterSpec => ({ kind: 'ema', tauMs })),
    ...[0.0005, 0.002, 0.01, 0.05].flatMap((processNoise) =>
      [1e-6, 1e-5, 1e-4].map((measurementNoise): FilterSpec => ({ kind: 'kalman', processNoise, measurementNoise })),
    ),
    ...[0.3, 0.6, 1.2].flatMap((minCutoff) =>
      [8, 16, 32].map((beta): FilterSpec => ({ kind: 'oneEuro', minCutoff, beta, dCutoff: 1 })),
    ),
  ];
  const rows = specs.map((spec) => ({
    spec,
    jitterPx: jitterRms(stillTrack(spec)),
    lagMs: estimateLag(rawFast, track(fast, spec)),
  }));
  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(
    `Pen-point jitter on 01-still-hand while held still (${String(stillFrom)}-${String(stillTo)} ms, RMS px at 640x480) and lag on 03-fast-zigzag (ms vs raw)\n`,
  );
  console.log('filter                                                      jitter px   lag ms');
  for (const r of rows) {
    console.log(
      `${describeFilter(r.spec).padEnd(60)}${r.jitterPx.toFixed(2).padStart(9)}  ${String(r.lagMs).padStart(7)}`,
    );
  }
}

if (args.has('--tune')) tune();
else if (args.has('--filters')) filters();
else printScoreboard(DEFAULT_PIPELINE);
