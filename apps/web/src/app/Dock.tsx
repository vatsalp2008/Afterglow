import { BRUSH_COLORS, ClearIcon, HelpIcon, IconButton, Panel, StatsIcon } from '@afterglow/ui';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Studio } from '../studio/studio';
import { SIZES, type SizeId } from './brushes';
import { BRUSHES, command, isEnabled } from './commands';
import styles from './Dock.module.css';
import { SaveMenu } from './SaveMenu';
import { useStudioStore, type StudioState } from './store';

const Divider = () => <span className={styles.divider} aria-hidden="true" />;

/** True for `ms` after the mouse (or a pen) last moved, or a finger last touched the screen. */
function useRecentPointer(ms: number): boolean {
  const [recent, setRecent] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = () => {
      setRecent(true);
      clearTimeout(timer);
      timer = setTimeout(() => setRecent(false), ms);
    };
    // A finger only moves while it's down, so for touch the touch itself counts.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') show();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') show();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      clearTimeout(timer);
    };
  }, [ms]);
  return recent;
}

/** A dock button for a command: its label with the shortcut, and its state. */
function CommandButton({
  id,
  studio,
  s,
  pressed = true,
}: {
  id: string;
  studio: Studio;
  s: StudioState;
  /** Toggles whose label names the action don't also show a pressed state. */
  pressed?: boolean;
}) {
  const c = command(id);
  return (
    <IconButton
      label={c.key ? `${c.label(s)} (${c.key})` : c.label(s)}
      pressed={pressed ? c.pressed?.(s) : undefined}
      disabled={!isEnabled(c, s)}
      onClick={() => c.run(studio, s)}
    >
      {c.icon(s)}
    </IconButton>
  );
}

/**
 * The tools for mouse and keyboard. With hands (camera or a recorded session) everything
 * is in the gesture menu, so the dock stays out of sight until the mouse moves or it has
 * keyboard focus.
 */
export function Dock({ studio }: { studio: Studio }) {
  const s = useStudioStore();
  const set = useStudioStore.setState;
  const recentPointer = useRecentPointer(3000);
  const hidden = s.inputMode !== 'pointer' && !recentPointer;

  return (
    <Panel
      as="nav"
      className={`${styles.dock} ${s.drawing ? styles.receded : ''} ${hidden ? styles.hidden : ''}`}
      aria-label="Tools"
      data-hidden={hidden}
    >
      <div className={styles.group} role="group" aria-label="Brush">
        {BRUSHES.map((b) => (
          <CommandButton key={b.id} id={`brush:${b.id}`} studio={studio} s={s} />
        ))}
        <CommandButton id="tool:erase" studio={studio} s={s} />
      </div>
      <Divider />
      <div className={styles.group} role="group" aria-label="Color">
        {BRUSH_COLORS.map((c, i) => {
          const cmd = command(`color:${c.hex}`);
          return (
            <button
              key={c.hex}
              type="button"
              className={styles.swatch}
              style={{ '--swatch': c.hex } as CSSProperties}
              data-tip={`${c.name} (${String(i + 1)})`}
              aria-label={c.name}
              aria-pressed={cmd.pressed?.(s)}
              onClick={() => cmd.run(studio, s)}
            />
          );
        })}
      </div>
      <Divider />
      <div className={styles.group} role="group" aria-label="Size">
        {(Object.keys(SIZES) as SizeId[]).map((id) => (
          <CommandButton key={id} id={`size:${id}`} studio={studio} s={s} />
        ))}
      </div>
      <Divider />
      <div className={styles.group}>
        <CommandButton id="fade" studio={studio} s={s} pressed={false} />
        {s.inputMode === 'camera' && <CommandButton id="darkroom" studio={studio} s={s} pressed={false} />}
      </div>
      <Divider />
      <div className={styles.group}>
        <CommandButton id="undo" studio={studio} s={s} />
        <CommandButton id="redo" studio={studio} s={s} />
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
        <CommandButton id={s.replaying && !s.recordingVideo ? 'stop' : 'replay'} studio={studio} s={s} />
        <span className={s.recordingVideo ? styles.recording : undefined}>
          <CommandButton id={s.recordingVideo ? 'stop' : 'video'} studio={studio} s={s} />
        </span>
        <SaveMenu studio={studio} s={s} />
      </div>
      <Divider />
      <IconButton label="Help (?)" pressed={s.helpOpen} onClick={() => set({ helpOpen: !s.helpOpen })}>
        <HelpIcon />
      </IconButton>
      <IconButton label="Stats (H)" pressed={s.hudOpen} onClick={() => set({ hudOpen: !s.hudOpen })}>
        <StatsIcon />
      </IconButton>
    </Panel>
  );
}
