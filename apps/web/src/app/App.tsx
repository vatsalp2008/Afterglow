import { useEffect, useRef, useState } from 'react';
import { Studio } from '../studio/studio';
import styles from './App.module.css';
import { Dock } from './Dock';
import { Hud } from './Hud';
import { Intro, Unsupported } from './Intro';
import { Hint, Toast } from './Overlay';
import { useShortcuts } from './shortcuts';
import { useStudioStore } from './store';

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorsRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [studio, setStudio] = useState<Studio | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const phase = useStudioStore((s) => s.phase);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const cursors = cursorsRef.current;
    const video = videoRef.current;
    if (!canvas || !overlay || !cursors || !video) return;
    let instance: Studio;
    try {
      instance = new Studio({ canvas, overlay, cursors, video });
    } catch (err) {
      console.error('[app] could not start the renderer', err);
      setUnsupported(true);
      return;
    }
    setStudio(instance);
    return () => instance.dispose();
  }, []);

  useShortcuts(studio);

  return (
    <div className={`${styles.stage} ${phase === 'studio' ? styles.studio : ''}`}>
      <canvas ref={canvasRef} className={styles.gl} aria-label="Painting canvas" />
      <canvas ref={overlayRef} className={styles.overlay} aria-hidden="true" />
      <div ref={cursorsRef} aria-hidden="true" />
      <video ref={videoRef} className={styles.video} muted playsInline aria-hidden="true" />
      {unsupported && <Unsupported />}
      {studio && phase !== 'studio' && <Intro studio={studio} />}
      {studio && phase === 'studio' && (
        <>
          <Hint />
          <Dock studio={studio} />
          <Hud />
        </>
      )}
      <Toast />
    </div>
  );
}
