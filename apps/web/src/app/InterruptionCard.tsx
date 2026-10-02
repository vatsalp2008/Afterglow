import { Button, Panel } from '@afterglow/ui';
import { useEffect, useId } from 'react';
import type { Studio } from '../studio/studio';
import { ERROR_COPY } from './errorCopy';
import styles from './InterruptionCard.module.css';
import { useStudioStore } from './store';

/**
 * Shown when the camera or hand tracking stops mid-session (ADR 0013): the drawing is
 * kept, and either can be reconnected, or painting carries on without the camera.
 */
export function InterruptionCard({ studio }: { studio: Studio }) {
  const interruption = useStudioStore((s) => s.interruption);
  const title = useId();
  const body = useId();
  const kind = interruption?.kind;

  // Hands can't press these, so the keyboard is ready to.
  useEffect(() => {
    if (kind) document.getElementById(title)?.parentElement?.querySelector('button')?.focus();
  }, [kind, title]);

  if (!interruption) return null;
  const camera = interruption.kind === 'camera';
  return (
    <Panel as="section" className={styles.card} role="alertdialog" aria-labelledby={title} aria-describedby={body}>
      <h2 id={title}>{camera ? 'The camera stopped' : 'Hand tracking stopped'}</h2>
      <p id={body}>
        {camera
          ? 'It may have been unplugged, or another app may be using it. Your drawing is safe.'
          : 'The hand tracker stopped responding. Your drawing is safe.'}
      </p>
      {interruption.error && (
        <p className={styles.error} role="alert">
          {ERROR_COPY[interruption.error]}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={() => void studio.reconnect()} disabled={interruption.reconnecting}>
          {interruption.reconnecting ? 'Reconnecting…' : camera ? 'Reconnect camera' : 'Restart hand tracking'}
        </Button>
        <Button variant="secondary" onClick={() => studio.continueWithoutCamera()}>
          Keep painting without the camera
        </Button>
      </div>
    </Panel>
  );
}
