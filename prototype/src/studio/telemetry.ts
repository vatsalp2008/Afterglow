/** Fixed-size window of samples with percentile readout. */
export class RollingStats {
  private buf: number[] = [];

  constructor(private size = 120) {}

  push(v: number): void {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
  }

  percentile(p: number): number | null {
    if (this.buf.length === 0) return null;
    const sorted = [...this.buf].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
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
    while (this.stamps.length > 0 && now - this.stamps[0]! > 1000) this.stamps.shift();
  }

  rate(now: number): number {
    while (this.stamps.length > 0 && now - this.stamps[0]! > 1000) this.stamps.shift();
    return this.stamps.length;
  }
}
