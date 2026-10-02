import { IconButton, Panel, SaveIcon } from '@afterglow/ui';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { Studio } from '../studio/studio';
import { command, isEnabled } from './commands';
import styles from './SaveMenu.module.css';
import type { StudioState } from './store';

const ITEMS = ['still', 'svg', 'drawing:save', 'drawing:open'];

/**
 * The dock's save and open list: the image, the vector image, and the drawing file.
 * Esc or clicking elsewhere closes it, and focus goes back to its button.
 */
export function SaveMenu({ studio, s }: { studio: Studio; s: StudioState }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLButtonElement>(`[id="${id}"] button:not(:disabled)`)?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    // Captured, so Esc closes the list without also stopping a replay.
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, id]);

  // Up and down move between the items.
  const onListKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };

  return (
    <span
      ref={wrap}
      className={styles.wrap}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <IconButton ref={button} label="Save and open" expanded={open} controls={id} onClick={() => setOpen(!open)}>
        <SaveIcon />
      </IconButton>
      {open && (
        <Panel className={styles.list} id={id} role="group" aria-label="Save and open" onKeyDown={onListKey}>
          {ITEMS.map((itemId) => {
            const c = command(itemId);
            return (
              <button
                key={itemId}
                type="button"
                className={styles.item}
                disabled={!isEnabled(c, s)}
                onClick={() => {
                  setOpen(false);
                  c.run(studio, s);
                }}
              >
                {c.icon(s)}
                <span>{c.label(s)}</span>
                {c.key && <kbd className={styles.key}>{c.key}</kbd>}
              </button>
            );
          })}
        </Panel>
      )}
    </span>
  );
}
