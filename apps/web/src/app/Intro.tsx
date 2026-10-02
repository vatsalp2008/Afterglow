import { Button } from '@afterglow/ui';
import type { Studio } from '../studio/studio';
import styles from './Intro.module.css';
import { useStudioStore, type StartError } from './store';

const ERROR_COPY: Record<StartError, string> = {
  denied: 'Camera access is blocked. Allow it from the camera icon in the address bar, then try again.',
  notFound: 'No camera was found. Connect one and try again.',
  inUse: 'Your camera is being used by another app. Close it and try again.',
  unsupported: 'This browser can’t use the camera here. Try a current version of Chrome, Edge, or Firefox.',
  model: 'Hand tracking didn’t load. Check your connection and try again.',
  fixture: 'That recorded session couldn’t be loaded. Check the fixture name in the address bar.',
  unknown: 'The camera couldn’t start. Try again, or paint without the camera for now.',
};

export function Intro({ studio }: { studio: Studio }) {
  const phase = useStudioStore((s) => s.phase);
  const loading = useStudioStore((s) => s.loadingMessage);
  const error = useStudioStore((s) => s.error);
  const starting = phase === 'starting';

  return (
    <div className={styles.intro}>
      <main className={styles.card}>
        <p className={styles.tag}>Prototype</p>
        <h1 className={styles.title}>Afterglow</h1>
        <p className={styles.lede}>Paint with light, using nothing but your hands.</p>
        <p className={styles.body}>
          Pinch your thumb and index finger together to draw, and open them to lift the pen. Bring your hand closer to
          the camera for a brighter, thicker line.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {ERROR_COPY[error]}
          </p>
        )}
        {starting && loading && (
          <p className={styles.status} role="status">
            {loading}
          </p>
        )}

        <div className={styles.actions}>
          <Button onClick={() => void studio.startCamera()} disabled={starting}>
            {error ? 'Try again' : 'Start painting'}
          </Button>
          <Button variant="secondary" onClick={() => studio.startPointer()} disabled={starting}>
            Paint without the camera
          </Button>
        </div>

        <p className={styles.privacy}>
          Your camera feed is processed on this device and never uploaded. Works best in Chrome or Edge, in a dim room.
        </p>
      </main>
    </div>
  );
}

export function Unsupported() {
  return (
    <div className={styles.intro}>
      <main className={styles.card}>
        <h1 className={styles.title}>Afterglow</h1>
        <p className={styles.lede}>This browser can’t run the light renderer.</p>
        <p className={styles.body}>
          Afterglow needs WebGL2. Try a current version of Chrome, Edge, or Firefox on a laptop or desktop, and make
          sure hardware acceleration is turned on.
        </p>
      </main>
    </div>
  );
}
