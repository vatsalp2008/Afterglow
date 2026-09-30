import { useEffect } from 'react';
import type { BrushId } from '@afterglow/core';
import { BRUSH_COLORS } from '@afterglow/ui/tokens';
import type { Studio } from '../studio/studio';
import { command, isEnabled } from './commands';
import { useStudioStore } from './store';
import type { SizeId } from './brushes';

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

      // Keys run the same commands as the dock and the gesture menu.
      const run = (id: string) => {
        const c = command(id);
        if (isEnabled(c, s)) c.run(studio, s);
      };
      if (key === 'z') {
        e.preventDefault();
        run(e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        run('redo');
        return;
      }
      if (mod || e.altKey) return;

      const colorIndex = Number(key) - 1;
      const color = BRUSH_COLORS[colorIndex];
      if (color) {
        run(`color:${color.hex}`);
        return;
      }
      switch (key) {
        case 'b':
          // Back from the eraser, B returns to the current brush before cycling.
          set(
            s.tool === 'erase'
              ? { tool: 'draw' }
              : { brush: BRUSH_ORDER[(BRUSH_ORDER.indexOf(s.brush) + 1) % BRUSH_ORDER.length]! },
          );
          break;
        case 'e':
          run('tool:erase');
          break;
        case '[':
          set({ size: SIZE_ORDER[Math.max(0, SIZE_ORDER.indexOf(s.size) - 1)]! });
          break;
        case ']':
          set({ size: SIZE_ORDER[Math.min(SIZE_ORDER.length - 1, SIZE_ORDER.indexOf(s.size) + 1)]! });
          break;
        case 'f':
          run('fade');
          break;
        case 'd':
          run('darkroom');
          break;
        case 'h':
          set({ hudOpen: !s.hudOpen });
          break;
        case 't':
          run(s.replaying ? 'stop' : 'replay');
          break;
        case 'v':
          run(s.replaying ? 'stop' : 'video');
          break;
        case 's':
          run('still');
          break;
        case 'r':
          studio.toggleSessionRecording();
          break;
        case 'p':
          if (s.inputMode !== 'pointer') studio.togglePause();
          break;
        case 'backspace':
        case 'delete':
          e.preventDefault();
          studio.requestClear();
          break;
        case 'escape':
          run('stop');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio]);
}
