// A rate limit per client, in memory: a few refines a minute and a few dozen a day keep
// one person (or script) from spending the whole quota. A single server instance holds
// the counts; a deployment with several would need a shared store (Phase 7).

export interface RateLimitConfig {
  perMinute: number;
  perDay: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = { perMinute: 6, perDay: 60 };

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private readonly config: RateLimitConfig;
  private readonly now: () => number;

  constructor(config: RateLimitConfig = DEFAULT_RATE_LIMIT, now: () => number = () => Date.now()) {
    this.config = config;
    this.now = now;
  }

  /** Counts a request; returns 0 if allowed, else the seconds until one would be. */
  take(client: string): number {
    const t = this.now();
    const recent = (this.hits.get(client) ?? []).filter((h) => t - h < DAY);
    const lastMinute = recent.filter((h) => t - h < MINUTE);
    if (lastMinute.length >= this.config.perMinute) return Math.ceil((lastMinute[0]! + MINUTE - t) / 1000);
    if (recent.length >= this.config.perDay) return Math.ceil((recent[0]! + DAY - t) / 1000);
    recent.push(t);
    this.hits.set(client, recent);
    return 0;
  }
}
