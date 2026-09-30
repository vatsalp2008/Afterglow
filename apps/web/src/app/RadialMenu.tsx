// The gesture menu's ring. The studio decides what's highlighted and chosen (from the
// hand, in packages/core/src/gesture/menu.ts); this only draws the current level.

import { levelLayout, type MenuItem } from '@afterglow/core';
import type { CSSProperties } from 'react';
import { menuEntry, menuTree } from './commands';
import styles from './RadialMenu.module.css';
import { useStudioStore } from './store';

export function RadialMenu() {
  const state = useStudioStore();
  const menu = state.menu;
  if (!menu) return null;

  let items: MenuItem[] = menuTree(state);
  let slots = items.length;
  for (const id of menu.path) {
    const parent = items.find((i) => i.id === id);
    if (!parent?.children) break;
    slots = parent.slots ?? parent.children.length;
    items = parent.children;
  }
  const wedges = levelLayout(items, slots);
  const top = menu.path.length === 0;

  return (
    <div
      className={styles.menu}
      role="menu"
      aria-label="Gesture menu"
      style={{ left: menu.center.x, top: menu.center.y, '--r': `${String(menu.radius)}px` } as CSSProperties}
    >
      <div className={styles.hub} data-highlighted={menu.highlight === 'center'}>
        {top ? 'Close' : 'Back'}
      </div>
      {wedges.map((item, i) => {
        if (!item) return null;
        const entry = menuEntry(item.id, state);
        return (
          <div
            key={item.id}
            role="menuitem"
            aria-disabled={item.disabled ?? false}
            aria-label={entry.label}
            className={styles.item}
            data-highlighted={menu.highlight === i}
            data-pressed={entry.pressed}
            style={{ '--a': `${String((i * 360) / slots)}deg` } as CSSProperties}
          >
            <span className={styles.icon}>{entry.icon}</span>
            <span className={styles.label}>{entry.label}</span>
          </div>
        );
      })}
      <p className={styles.help}>
        {top ? 'Point your palm at an item and pinch. Make a fist to close.' : 'Pinch in the middle to go back.'}
      </p>
    </div>
  );
}
