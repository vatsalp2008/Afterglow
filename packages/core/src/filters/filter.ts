// Scalar signal filters. Every filter takes samples with explicit timestamps
// (ms), so irregular frame intervals are handled correctly.

export interface Filter {
  next(value: number, t: number): number;
  reset(): void;
}

export class PassThroughFilter implements Filter {
  next(value: number): number {
    return value;
  }

  reset(): void {
    // Stateless.
  }
}
