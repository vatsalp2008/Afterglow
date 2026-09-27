import type { BrushId } from '@afterglow/core';
import {
  BRUSH_COLORS,
  ClearIcon,
  FadeIcon,
  FixIcon,
  IconButton,
  InkIcon,
  MoonIcon,
  NeonIcon,
  Panel,
  PlayIcon,
  RecordIcon,
  RedoIcon,
  SparksIcon,
  StatsIcon,
  StillIcon,
  StopIcon,
  UndoIcon,
} from '@afterglow/ui';
import type { CSSProperties, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Studio } from '../studio/studio';
import { SIZES, type SizeId } from './brushes';
import styles from './Dock.module.css';
import { useStudioStore } from './store';

const BRUSHES: Array<{ id: BrushId; label: string; icon: ReactNode }> = [
  { id: 'neon', label: 'Neon', icon: <NeonIcon /> },
  { id: 'sparks', label: 'Sparks', icon: <SparksIcon /> },
  { id: 'ink', label: 'Ink, no glow', icon: <InkIcon /> },
];

const SIZE_LABELS: Record<SizeId, string> = { s: 'Thin', m: 'Medium', l: 'Thick' };

const Divider = () => <span className={styles.divider} aria-hidden="true" />;

export function Dock({ studio }: { studio: Studio }) {
  const s = useStudioStore(
    useShallow((st) => ({
      brush: st.brush,
      color: st.color,
      size: st.size,
      fade: st.fade,
      darkroom: st.darkroom,
      inputMode: st.inputMode,
      canUndo: st.canUndo,
      canRedo: st.canRedo,
      strokeCount: st.strokeCount,
      replaying: st.replaying,
      recording: st.recording,
      drawing: st.drawing,
      hudOpen: st.hudOpen,
    })),
  );
  const set = useStudioStore.setState;

  return (
    <Panel as="nav" className={`${styles.dock} ${s.drawing ? styles.receded : ''}`} aria-label="Tools">
      <div className={styles.group} role="group" aria-label="Brush">
        {BRUSHES.map((b) => (
          <IconButton key={b.id} label={`${b.label} (B)`} pressed={s.brush === b.id} onClick={() => set({ brush: b.id })}>
            {b.icon}
          </IconButton>
        ))}
      </div>
      <Divider />
      <div className={styles.group} role="group" aria-label="Color">
        {BRUSH_COLORS.map((c, i) => (
          <button
            key={c.hex}
            type="button"
            className={styles.swatch}
            style={{ '--swatch': c.hex } as CSSProperties}
            data-tip={`${c.name} (${String(i + 1)})`}
            aria-label={c.name}
            aria-pressed={s.color === c.hex}
            onClick={() => set({ color: c.hex })}
          />
        ))}
      </div>
      <Divider />
      <div className={styles.group} role="group" aria-label="Size">
        {(Object.keys(SIZES) as SizeId[]).map((id) => (
          <IconButton
            key={id}
            label={`${SIZE_LABELS[id]} ([ and ])`}
            pressed={s.size === id}
            onClick={() => set({ size: id })}
          >
            <span className={styles.dot} style={{ width: 4 + SIZES[id] * 0.5, height: 4 + SIZES[id] * 0.5 }} />
          </IconButton>
        ))}
      </div>
      <Divider />
      <div className={styles.group}>
        <IconButton
          label={
            s.fade
              ? 'Strokes fade like a long exposure. Click to fix them (F)'
              : 'Strokes are fixed. Click to let them fade (F)'
          }
          onClick={() => set({ fade: !s.fade })}
        >
          {s.fade ? <FadeIcon /> : <FixIcon />}
        </IconButton>
        {s.inputMode === 'camera' && (
          <IconButton label="Darkroom (D)" pressed={s.darkroom} onClick={() => set({ darkroom: !s.darkroom })}>
            <MoonIcon />
          </IconButton>
        )}
      </div>
      <Divider />
      <div className={styles.group}>
        <IconButton label="Undo (Z)" disabled={!s.canUndo || s.replaying} onClick={() => studio.undo()}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo (Shift Z)" disabled={!s.canRedo || s.replaying} onClick={() => studio.redo()}>
          <RedoIcon />
        </IconButton>
        <IconButton
          label="Clear, press twice (Delete)"
          disabled={s.strokeCount === 0 || s.replaying}
          onClick={() => studio.requestClear()}
        >
          <ClearIcon />
        </IconButton>
      </div>
      <Divider />
      <div className={styles.group}>
        <IconButton
          label={s.replaying ? 'Stop replay (Esc)' : 'Replay as timelapse (T)'}
          pressed={s.replaying && !s.recording}
          disabled={s.strokeCount === 0 && !s.replaying}
          onClick={() => (s.replaying ? studio.stopReplay() : studio.startReplay())}
        >
          {s.replaying && !s.recording ? <StopIcon /> : <PlayIcon />}
        </IconButton>
        <IconButton label="Save long exposure PNG (S)" disabled={s.strokeCount === 0} onClick={() => void studio.saveStill()}>
          <StillIcon />
        </IconButton>
        <IconButton
          label={s.recording ? 'Stop recording (Esc)' : 'Record timelapse video (V)'}
          pressed={s.recording}
          disabled={s.strokeCount === 0 && !s.replaying}
          onClick={() => (s.replaying ? studio.stopReplay() : studio.startReplay(true))}
        >
          <span className={s.recording ? styles.recording : undefined}>
            <RecordIcon />
          </span>
        </IconButton>
      </div>
      <Divider />
      <IconButton label="Stats (H)" pressed={s.hudOpen} onClick={() => set({ hudOpen: !s.hudOpen })}>
        <StatsIcon />
      </IconButton>
    </Panel>
  );
}
