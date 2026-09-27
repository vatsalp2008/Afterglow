import { useEffect } from 'react';
import type { BrushId } from '../core/types';
import type { Studio } from '../studio/studio';
import { useStudioStore } from './store';
import { BRUSH_COLORS, type SizeId } from './tokens';

const BRUSH_ORDER: BrushId[] = ['neon', 'sparks', 'ink'];
const SIZE_ORDER: SizeId[] = ['s', 'm', 'l'];

export function useShortcuts(studio: Studio | null): void {
  useEffect(() => {
    if (!studio) return;
    const onKey = (e: KeyboardEvent) => {
      const s = useStudioStore.getState();
      if (s.phase !== 'studio' || e.target instanceof HTMLInputElement) return;
      const set = useStudioStore.setState;
      const key = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;

      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) studio.redo();
        else studio.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        studio.redo();
        return;
      }
      if (mod || e.altKey) return;

      const colorIndex = Number(key) - 1;
      const color = BRUSH_COLORS[colorIndex];
      if (color) {
        set({ color: color.hex });
        return;
      }
      switch (key) {
        case 'b':
          set({ brush: BRUSH_ORDER[(BRUSH_ORDER.indexOf(s.brush) + 1) % BRUSH_ORDER.length]! });
          break;
        case '[':
          set({ size: SIZE_ORDER[Math.max(0, SIZE_ORDER.indexOf(s.size) - 1)]! });
          break;
        case ']':
          set({ size: SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, SIZE_ORDER.indexOf(s.size) + 1)]! });
          break;
        case 'f':
          set({ fade: !s.fade });
          break;
        case 'd':
          if (s.inputMode === 'camera') set({ darkroom: !s.darkroom });
          break;
        case 'h':
          set({ hudOpen: !s.hudOpen });
          break;
        case 't':
          if (s.replaying) studio.stopReplay();
          else studio.startReplay();
          break;
        case 'v':
          if (s.replaying) studio.stopReplay();
          else studio.startReplay(true);
          break;
        case 's':
          void studio.saveStill();
          break;
        case 'backspace':
        case 'delete':
          e.preventDefault();
          studio.requestClear();
          break;
        case 'escape':
          studio.stopReplay();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio]);
}
