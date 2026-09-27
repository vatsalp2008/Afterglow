import type { HTMLAttributes } from 'react';
import styles from './Panel.module.css';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'aside' | 'nav' | 'section';
}

/** A translucent, blurred surface for floating UI over the canvas. */
export function Panel({ as: Tag = 'div', className, ...rest }: PanelProps) {
  return <Tag className={[styles.panel, className].filter(Boolean).join(' ')} {...rest} />;
}
