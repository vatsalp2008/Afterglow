import type { FilterKind } from '@afterglow/core';

export const FILTER_LABELS: Record<FilterKind, string> = {
  none: 'None (raw)',
  ema: 'EMA',
  kalman: 'Kalman',
  oneEuro: 'One Euro',
};
