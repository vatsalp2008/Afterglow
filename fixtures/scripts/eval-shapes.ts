// Scores shape snapping on the labeled air-drawn shapes in fixtures/shapes (ADR 0014).
//
//   pnpm --filter @afterglow/fixtures eval:shapes          scoreboard for the current defaults
//   pnpm --filter @afterglow/fixtures eval:shapes --tune   sweep the thresholds that trade snaps for false snaps
//   add --json for machine-readable output

import {
  DEFAULT_SNAP,
  SHAPE_KINDS,
  scoreShapes,
  type LabeledItem,
  type ShapeScore,
  type SnapConfig,
} from '@afterglow/core';
import { loadLabeledSets } from '../src/load.ts';

const args = new Set(process.argv.slice(2));
const sets = loadLabeledSets('shapes');
if (sets.length === 0) {
  console.error('No labeled shapes yet: record some with ?record=shapes and put them in fixtures/shapes.');
  process.exit(1);
}
const items: LabeledItem[] = sets.flatMap((s) => s.set.items);
const pct = (v: number | undefined) => (v === undefined ? '  n/a' : `${(v * 100).toFixed(0).padStart(4)}%`);

/** False snaps are the cost that matters with snapping on by default: at most this many. */
const MAX_FALSE_SNAPS = 0.05;

function report(score: ShapeScore, title: string): void {
  console.log(`\n${title}`);
  console.log(
    `${String(score.shapes)} shapes, ${String(score.loose)} loose strokes, from ${String(sets.length)} set(s) (${sets.map((s) => s.set.person).join(', ')})`,
  );
  if (score.multiStroke)
    console.log(`${String(score.multiStroke)} prompts were drawn in several strokes (longest scored)`);
  const outcomes = [...SHAPE_KINDS, 'none'] as const;
  console.log(`\n${'drawn'.padEnd(10)}${outcomes.map((o) => o.padStart(10)).join('')}`);
  for (const label of [...SHAPE_KINDS, 'loose']) {
    const row = score.confusion[label];
    if (!row) continue;
    console.log(`${label.padEnd(10)}${outcomes.map((o) => String(row[o] ?? '').padStart(10)).join('')}`);
  }
  console.log(`\n${'shape'.padEnd(10)}${'recall'.padStart(8)}${'precision'.padStart(11)}`);
  for (const shape of SHAPE_KINDS) {
    console.log(
      `${shape.padEnd(10)}${pct(score.recall[shape]).padStart(8)}${pct(score.precision[shape]).padStart(11)}`,
    );
  }
  console.log(`\nshapes snapped right ${pct(score.accuracy)}   loose strokes snapped ${pct(score.falseSnaps)}`);
}

if (args.has('--tune')) {
  const grid: Array<Partial<SnapConfig>> = [];
  for (const minScore of [0.74, 0.77, 0.8, 0.83, 0.86])
    for (const ellipseResidual of [0.09, 0.12, 0.15])
      for (const closeGap of [0.15, 0.2, 0.25, 0.3])
        for (const straightness of [0.93, 0.95, 0.97]) grid.push({ minScore, ellipseResidual, closeGap, straightness });
  const results = grid
    .map((patch) => ({ patch, score: scoreShapes(items, { ...DEFAULT_SNAP, ...patch }) }))
    .filter((r) => r.score.falseSnaps <= MAX_FALSE_SNAPS)
    .sort((a, b) => b.score.accuracy - a.score.accuracy || a.score.falseSnaps - b.score.falseSnaps);
  if (args.has('--json')) console.log(JSON.stringify(results.slice(0, 10), null, 2));
  else {
    console.log(`Best settings with at most ${pct(MAX_FALSE_SNAPS).trim()} false snaps:`);
    for (const r of results.slice(0, 8)) {
      console.log(`${pct(r.score.accuracy)} right, ${pct(r.score.falseSnaps)} false  ${JSON.stringify(r.patch)}`);
    }
  }
} else {
  const score = scoreShapes(items);
  if (args.has('--json')) console.log(JSON.stringify(score, null, 2));
  else report(score, 'Shape snapping with the current defaults');
}
