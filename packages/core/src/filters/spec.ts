// A serializable description of a filter, so pipelines, the evaluation harness,
// and the Filter Lab can swap filters and share settings.

import { DEFAULT_EMA, EmaFilter, type EmaParams } from './ema.ts';
import { PassThroughFilter, type Filter } from './filter.ts';
import { DEFAULT_KALMAN, KalmanFilter, type KalmanParams } from './kalman.ts';
import { DEFAULT_ONE_EURO, OneEuroFilter, type OneEuroParams } from './oneEuro.ts';

export type FilterSpec =
  | { kind: 'none' }
  | ({ kind: 'ema' } & EmaParams)
  | ({ kind: 'kalman' } & KalmanParams)
  | ({ kind: 'oneEuro' } & OneEuroParams);

export type FilterKind = FilterSpec['kind'];

export const DEFAULT_FILTER_SPECS: { readonly [K in FilterKind]: Extract<FilterSpec, { kind: K }> } = {
  none: { kind: 'none' },
  ema: { kind: 'ema', ...DEFAULT_EMA },
  kalman: { kind: 'kalman', ...DEFAULT_KALMAN },
  oneEuro: { kind: 'oneEuro', ...DEFAULT_ONE_EURO },
};

export function createFilter(spec: FilterSpec): Filter {
  switch (spec.kind) {
    case 'none':
      return new PassThroughFilter();
    case 'ema':
      return new EmaFilter({ tauMs: spec.tauMs });
    case 'kalman':
      return new KalmanFilter({ processNoise: spec.processNoise, measurementNoise: spec.measurementNoise });
    case 'oneEuro':
      return new OneEuroFilter({ minCutoff: spec.minCutoff, beta: spec.beta, dCutoff: spec.dCutoff });
  }
}
