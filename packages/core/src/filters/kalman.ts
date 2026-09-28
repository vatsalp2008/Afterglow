// 1D Kalman filter with a constant-velocity model (state: position, velocity).
// Process noise is white acceleration, so the filter follows steady motion
// without lag and smooths measurement noise.

import type { Filter } from './filter.ts';

export interface KalmanParams {
  /** Spectral density of the acceleration noise, in units²/s³. Larger = trusts measurements more. */
  processNoise: number;
  /** Measurement noise variance, in units². Larger = smoother. */
  measurementNoise: number;
}

// A setting that visibly smooths real hand motion (0.39 px vs 0.44 px raw on a still
// hand) at a clear lag cost (115 ms at speed). A constant-velocity model fits hand
// motion poorly: see docs/benchmarks.md.
export const DEFAULT_KALMAN: KalmanParams = { processNoise: 0.002, measurementNoise: 1e-4 };

export class KalmanFilter implements Filter {
  params: KalmanParams;
  private x = 0;
  private v = 0;
  private p00 = 0;
  private p01 = 0;
  private p11 = 0;
  private lastT: number | null = null;

  constructor(params: KalmanParams = DEFAULT_KALMAN) {
    this.params = params;
  }

  next(z: number, t: number): number {
    const { processNoise: q, measurementNoise: r } = this.params;
    if (this.lastT === null) {
      this.x = z;
      this.v = 0;
      this.p00 = r;
      this.p01 = 0;
      // Unknown initial velocity: a wide prior lets the first few samples set it.
      this.p11 = 1;
      this.lastT = t;
      return z;
    }
    const dt = (t - this.lastT) / 1000;
    if (dt <= 0) return this.x;
    this.lastT = t;

    // Predict: x' = F x, P' = F P Fᵀ + Q
    this.x += this.v * dt;
    const p00 = this.p00 + 2 * dt * this.p01 + dt * dt * this.p11 + (q * dt ** 3) / 3;
    const p01 = this.p01 + dt * this.p11 + (q * dt ** 2) / 2;
    const p11 = this.p11 + q * dt;

    // Update with the position measurement.
    const s = p00 + r;
    const k0 = p00 / s;
    const k1 = p01 / s;
    const y = z - this.x;
    this.x += k0 * y;
    this.v += k1 * y;
    this.p00 = (1 - k0) * p00;
    this.p01 = (1 - k0) * p01;
    this.p11 = p11 - k1 * p01;
    return this.x;
  }

  reset(): void {
    this.lastT = null;
  }
}
