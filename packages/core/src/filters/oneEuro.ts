// One Euro filter (Casiez, Roussel, Vogel, CHI 2012).
// An adaptive low-pass filter: heavy smoothing when the signal is slow (kills
// jitter), light smoothing when it is fast (kills lag).

export interface OneEuroParams {
  /** Minimum cutoff frequency in Hz. Lower = less jitter at rest, more lag. */
  minCutoff: number;
  /** Speed coefficient. Higher = less lag during fast motion. */
  beta: number;
  /** Cutoff for the derivative estimate, in Hz. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1.2, beta: 8, dCutoff: 1 };

function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSec);
}

export class OneEuroFilter {
  private xHat: number | null = null;
  private dxHat = 0;
  private lastT: number | null = null;

  params: OneEuroParams;

  constructor(params: OneEuroParams = DEFAULT_ONE_EURO) {
    this.params = params;
  }

  /** @param t time in ms */
  next(value: number, t: number): number {
    if (this.xHat === null || this.lastT === null) {
      this.xHat = value;
      this.dxHat = 0;
      this.lastT = t;
      return value;
    }
    const dt = (t - this.lastT) / 1000;
    if (dt <= 0) return this.xHat;
    this.lastT = t;

    const dx = (value - this.xHat) / dt;
    this.dxHat += smoothingFactor(this.params.dCutoff, dt) * (dx - this.dxHat);
    const cutoff = this.params.minCutoff + this.params.beta * Math.abs(this.dxHat);
    this.xHat += smoothingFactor(cutoff, dt) * (value - this.xHat);
    return this.xHat;
  }

  reset(): void {
    this.xHat = null;
    this.dxHat = 0;
    this.lastT = null;
  }
}
