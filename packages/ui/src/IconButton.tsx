import type { ReactNode } from 'react';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  /** Accessible name, also shown as the tooltip. Include the shortcut, e.g. "Undo (Z)". */
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export function IconButton({ label, onClick, pressed, disabled, children }: IconButtonProps) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      data-tip={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
