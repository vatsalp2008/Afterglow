import { Panel } from '@afterglow/ui';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import styles from './Overlay.module.css';
import { useStudioStore } from './store';

/** A touch screen with no mouse or trackpad: a phone or a tablet. */
const touchFirst = () => window.matchMedia('(pointer: coarse) and (not (any-pointer: fine))').matches;

/** True once `active` has held for `ms`. */
function useHeldFor(active: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setHeld(true), ms);
    return () => {
      clearTimeout(t);
      setHeld(false);
    };
  }, [active, ms]);
  return held;
}

export function Hint() {
  const s = useStudioStore(
    useShallow((st) => ({
      inputMode: st.inputMode,
      hasDrawn: st.hasDrawn,
      handCount: st.stats.hands.length,
      replaying: st.replaying,
      recordingVideo: st.recordingVideo,
      session: st.session,
      paused: st.paused,
      tool: st.tool,
      menuOpen: st.menu !== null,
      interrupted: st.interruption !== null,
      capturing: st.capturing !== null,
    })),
  );
  // After the first stroke, the hand-raising hint comes back only once the hand has been gone a while.
  const handGone = useHeldFor(s.inputMode === 'camera' && s.handCount === 0, 4000);
  // With hands, every hint names a gesture; the menu carries its own instructions.
  const hands = s.inputMode !== 'pointer';
  let text: string | null = null;
  const recording = s.recordingVideo || s.session !== null;
  if (s.menuOpen || s.interrupted || s.capturing) text = null;
  else if (s.session)
    text = s.session.scenario ? `Recording ${s.session.scenario}` : 'Recording session. Press R to stop.';
  else if (s.replaying)
    text = s.recordingVideo
      ? 'Recording your timelapse'
      : hands
        ? 'Replaying your session. Open the menu to stop.'
        : 'Replaying your session. Press Esc to stop.';
  else if (s.paused && hands) text = 'Hand drawing paused. Make a fist to resume.';
  else if (s.tool === 'erase')
    text = hands
      ? 'Eraser: pinch and move over lines to erase them. Pick a brush in the menu to draw.'
      : 'Eraser: drag over lines to erase them. Press E to draw again.';
  else if (s.inputMode === 'fixture') text = 'Replaying a recorded hand session';
  else if (!s.hasDrawn && s.inputMode === 'camera')
    text =
      s.handCount === 0
        ? 'Raise a hand so the camera can see it'
        : 'Pinch to draw. Hold up an open hand, fingers spread, for the menu.';
  else if (s.inputMode === 'camera' && handGone) text = 'Raise a hand so the camera can see it';
  else if (!s.hasDrawn) text = touchFirst() ? 'Drag a finger to paint' : 'Click and drag to paint. Press H for stats.';
  if (!text) return null;
  return (
    <p className={styles.hint} role="status">
      {recording && <span className={styles.rec} aria-hidden="true" />}
      {text}
    </p>
  );
}

export function Toast() {
  const toast = useStudioStore((s) => s.toast);
  // A toast is visible until its own timer marks it hidden; a newer toast restarts the cycle.
  const [hiddenId, setHiddenId] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setHiddenId(toast.id), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // The live region stays mounted so screen readers reliably announce each new message.
  return (
    <div className={styles.toastRegion} role="status" aria-live="polite">
      {toast && (
        <Panel key={toast.id} className={`${styles.toast} ${toast.id === hiddenId ? styles.hidden : ''}`}>
          {toast.text}
        </Panel>
      )}
    </div>
  );
}
