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
    })),
  );
  let text: string | null = null;
  const recording = s.recordingVideo || s.session !== null;
  if (s.session) text = s.session.scenario ? `Recording ${s.session.scenario}` : 'Recording session. Press R to stop.';
  else if (s.replaying)
    text = s.recordingVideo ? 'Recording your timelapse' : 'Replaying your session. Press Esc to stop.';
  else if (s.paused && s.inputMode !== 'pointer') text = 'Hand drawing paused. Make a fist or press P to resume.';
  else if (s.inputMode === 'fixture') text = 'Replaying a recorded hand session';
  else if (!s.hasDrawn && s.inputMode === 'camera')
    text = s.handCount === 0 ? 'Raise a hand so the camera can see it' : 'Pinch your thumb and index finger to draw';
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
