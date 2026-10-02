import type { ReactNode, Ref } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  /** Accessible name, also shown as the tooltip. Include the shortcut, e.g. "Undo (Z)". */
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  /** For a button that shows and hides a panel: whether it's open, and the panel's id. */
  expanded?: boolean;
  controls?: string;
  ref?: Ref<HTMLButtonElement>;
  children: ReactNode;
}

export function IconButton({ label, onClick, pressed, disabled, expanded, controls, ref, children }: IconButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      className={styles.iconButton}
      data-tip={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-controls={controls}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
