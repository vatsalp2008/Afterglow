// Small visuals for commands: a color swatch and a size dot.

import type { CSSProperties } from 'react';
import { SIZES, type SizeId } from './brushes';
import styles from './CommandIcons.module.css';

export const Swatch = ({ hex }: { hex: string }) => (
  <span className={styles.swatch} style={{ '--swatch': hex } as CSSProperties} aria-hidden="true" />
);

export const SizeDot = ({ size }: { size: SizeId }) => (
  <span
    className={styles.dot}
    style={{ width: 4 + SIZES[size] * 0.5, height: 4 + SIZES[size] * 0.5 }}
    aria-hidden="true"
  />
);
