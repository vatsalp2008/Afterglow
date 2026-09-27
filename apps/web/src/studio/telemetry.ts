/** The p-th percentile (nearest rank) of `values`, or null when empty. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

/** Fixed-size window of samples with percentile readout. */
export class RollingStats {
  private buf: number[] = [];

  constructor(private size = 120) {}

  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
  }

  percentile(p: number): number | null {
    return percentile(this.buf, p);
  }

  clear(): void {
    this.buf = [];
  }
}

/** Events per second over the last second. */
export class RateCounter {
  private stamps: number[] = [];

  tick(now: number): void {
    this.stamps.push(now);
    this.trim(now);
  }

  rate(now: number): number {
    this.trim(now);
    return this.stamps.length;
  }

  private trim(now: number): void {
    while (this.stamps.length > 0 && now - this.stamps[0]! > 1000) this.stamps.shift();
  }
}
