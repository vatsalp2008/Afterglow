/** Evenly spaced round tick values (steps of 1, 2, or 5 times a power of ten) inside [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  if (max === min) return [min];
  const rough = (max - min) / Math.max(1, target);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  // Round the rough step to the nearest of 1, 2, 5, 10 on a log scale (the thresholds are their geometric means).
  const r = rough / magnitude;
  const step = magnitude * (r >= Math.sqrt(50) ? 10 : r >= Math.sqrt(10) ? 5 : r >= Math.sqrt(2) ? 2 : 1);
  const out: number[] = [];
  for (let i = Math.ceil(min / step); i * step <= max + step * 1e-9; i++) {
    // Rounded to the step's precision, so 0.1 + 0.2 prints as 0.3.
    out.push(Number((i * step).toFixed(Math.max(0, -Math.floor(Math.log10(step))))));
  }
  return out;
}

/** [min, max] of the values, widened by `pad` of the range on each side (and around a single value). */
export function paddedExtent(values: readonly number[], pad = 0.05): [number, number] | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo > hi) return null;
  const margin = hi > lo ? (hi - lo) * pad : Math.max(Math.abs(lo) * pad, 1e-3);
  return [lo - margin, hi + margin];
}
