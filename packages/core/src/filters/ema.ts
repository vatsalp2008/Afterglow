// Exponential moving average with a time constant instead of a fixed alpha:
// alpha = 1 - exp(-dt / tau), so the smoothing is the same at any frame rate.
// On a constant-speed ramp it lags by dt / (e^(dt/tau) - 1), which approaches
// tau as the sample interval dt shrinks.

import type { Filter } from './filter.ts';

export interface EmaParams {
  /** Time constant in ms. Larger = smoother and laggier. */
  tauMs: number;
}

export const DEFAULT_EMA: EmaParams = { tauMs: 60 };

export class EmaFilter implements Filter {
  params: EmaParams;
  private value: number | null = null;
  private lastT = 0;

  constructor(params: EmaParams = DEFAULT_EMA) {
    this.params = params;
  }

  next(value: number, t: number): number {
    if (this.value === null) {
      this.value = value;
      this.lastT = t;
      return value;
    }
    const dt = t - this.lastT;
    if (dt <= 0) return this.value;
    this.lastT = t;
    const alpha = this.params.tauMs > 0 ? 1 - Math.exp(-dt / this.params.tauMs) : 1;
    this.value += alpha * (value - this.value);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}
