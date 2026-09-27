import type { CSSProperties, ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { BrushId } from '../core/types';
import type { Studio } from '../studio/studio';
import styles from './Dock.module.css';
import {
  ClearIcon,
  FadeIcon,
  FixIcon,
  InkIcon,
  MoonIcon,
  NeonIcon,
  PlayIcon,
  RecordIcon,
  RedoIcon,
  SparksIcon,
  StatsIcon,
  StillIcon,
  StopIcon,
  UndoIcon,
} from './icons';
import { useStudioStore } from './store';
import { BRUSH_COLORS, SIZES, type SizeId } from './tokens';

const BRUSHES: Array<{ id: BrushId; label: string; icon: ReactNode }> = [
  { id: 'neon', label: 'Neon', icon: <NeonIcon /> },
  { id: 'sparks', label: 'Sparks', icon: <SparksIcon /> },
  { id: 'ink', label: 'Ink, no glow', icon: <InkIcon /> },
];

const SIZE_LABELS: Record<SizeId, string> = { s: 'Thin', m: 'Medium', l: 'Thick' };

interface ToolProps {
  tip: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

function Tool({ tip, onClick, pressed, disabled, children }: ToolProps) {
  return (
    <button
      type="button"
      className={styles.tool}
      data-tip={tip}
      aria-label={tip}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

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
    <nav className={`${styles.dock} ${s.drawing ? styles.receded : ''}`} aria-label="Tools">
      <div className={styles.group} role="group" aria-label="Brush">
        {BRUSHES.map((b) => (
          <Tool key={b.id} tip={`${b.label} (B)`} pressed={s.brush === b.id} onClick={() => set({ brush: b.id })}>
            {b.icon}
          </Tool>
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
            data-tip={`${c.name} (${i + 1})`}
            aria-label={c.name}
            aria-pressed={s.color === c.hex}
            onClick={() => set({ color: c.hex })}
          />
        ))}
      </div>
      <Divider />
      <div className={styles.group} role="group" aria-label="Size">
        {(Object.keys(SIZES) as SizeId[]).map((id) => (
          <Tool key={id} tip={`${SIZE_LABELS[id]} ([ and ])`} pressed={s.size === id} onClick={() => set({ size: id })}>
            <span className={styles.dot} style={{ width: 4 + SIZES[id] * 0.5, height: 4 + SIZES[id] * 0.5 }} />
          </Tool>
        ))}
      </div>
      <Divider />
      <div className={styles.group}>
        <Tool
          tip={s.fade ? 'Strokes fade like a long exposure. Click to fix them (F)' : 'Strokes are fixed. Click to let them fade (F)'}
          onClick={() => set({ fade: !s.fade })}
        >
          {s.fade ? <FadeIcon /> : <FixIcon />}
        </Tool>
        {s.inputMode === 'camera' && (
          <Tool tip="Darkroom (D)" pressed={s.darkroom} onClick={() => set({ darkroom: !s.darkroom })}>
            <MoonIcon />
          </Tool>
        )}
      </div>
      <Divider />
      <div className={styles.group}>
        <Tool tip="Undo (Z)" disabled={!s.canUndo || s.replaying} onClick={() => studio.undo()}>
          <UndoIcon />
        </Tool>
        <Tool tip="Redo (Shift Z)" disabled={!s.canRedo || s.replaying} onClick={() => studio.redo()}>
          <RedoIcon />
        </Tool>
        <Tool tip="Clear, press twice (Delete)" disabled={s.strokeCount === 0 || s.replaying} onClick={() => studio.requestClear()}>
          <ClearIcon />
        </Tool>
      </div>
      <Divider />
      <div className={styles.group}>
        <Tool
          tip={s.replaying ? 'Stop replay (Esc)' : 'Replay as timelapse (T)'}
          pressed={s.replaying && !s.recording}
          disabled={s.strokeCount === 0 && !s.replaying}
          onClick={() => (s.replaying ? studio.stopReplay() : studio.startReplay())}
        >
          {s.replaying && !s.recording ? <StopIcon /> : <PlayIcon />}
        </Tool>
        <Tool tip="Save long exposure PNG (S)" disabled={s.strokeCount === 0} onClick={() => void studio.saveStill()}>
          <StillIcon />
        </Tool>
        <Tool
          tip={s.recording ? 'Stop recording (Esc)' : 'Record timelapse video (V)'}
          pressed={s.recording}
          disabled={s.strokeCount === 0 && !s.replaying}
          onClick={() => (s.replaying ? studio.stopReplay() : studio.startReplay(true))}
        >
          <span className={s.recording ? styles.recording : undefined}>
            <RecordIcon />
          </span>
        </Tool>
      </div>
      <Divider />
      <Tool tip="Stats (H)" pressed={s.hudOpen} onClick={() => set({ hudOpen: !s.hudOpen })}>
        <StatsIcon />
      </Tool>
    </nav>
  );
}
