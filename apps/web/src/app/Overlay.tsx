import { Panel } from '@afterglow/ui';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import styles from './Overlay.module.css';
import { useStudioStore } from './store';

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
    })),
  );
  // With hands, every hint names a gesture; the menu carries its own instructions.
  const hands = s.inputMode !== 'pointer';
  let text: string | null = null;
  const recording = s.recordingVideo || s.session !== null;
  if (s.menuOpen) text = null;
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
  else if (!s.hasDrawn) text = 'Click and drag to paint. Press H for stats.';
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

const GESTURES: ReadonlyArray<[string, string]> = [
  ['Pinch thumb and index finger', 'Draw, or erase with the eraser picked'],
  ['Hold up an open hand, fingers spread', 'Open the menu'],
  ['In the menu, point your palm at an item and pinch', 'Choose it'],
  ['Make a fist', 'Pause or resume drawing, or close the menu'],
  ['Two fingers up, swipe left or right', 'Undo or redo'],
];

/** The gestures, shown the first time the camera is used and from the menu (More, Gestures). */
export function GesturesHelp() {
  const open = useStudioStore((s) => s.helpOpen);
  useEffect(() => {
    if (!open) return;
    // Hands can't click it away: it leaves on its own, or when the menu opens.
    const t = setTimeout(() => useStudioStore.setState({ helpOpen: false }), 15_000);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;
  return (
    <Panel as="section" className={styles.help} aria-label="Gestures">
      <h2>Gestures</h2>
      <dl>
        {GESTURES.map(([gesture, effect]) => (
          <div key={gesture}>
            <dt>{gesture}</dt>
            <dd>{effect}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
