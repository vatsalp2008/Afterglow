import { useEffect, useRef, useState } from 'react';
import { Studio } from '../studio/studio';
import styles from './App.module.css';
import { Dock } from './Dock';
import { FixtureCapture } from './FixtureCapture';
import { Hud } from './Hud';
import { InterruptionCard } from './InterruptionCard';
import { Intro, Unsupported } from './Intro';
import { GesturesHelp, Hint, Toast } from './Overlay';
import { RadialMenu } from './RadialMenu';
import { useShortcuts } from './shortcuts';
import { useStudioStore } from './store';
import { RenderBench } from './RenderBench';
import { TrackerBench } from './TrackerBench';

// Developer tools: ?fixture=<name>[&loop], ?record=fixtures, ?bench=tracker
const params = new URLSearchParams(location.search);
const fixture = params.get('fixture');

/**
 * Starts the camera without a click once permission was granted before, so a returning
 * visitor needs only their hands. The first visit still needs the button: browsers ask
 * for camera permission in response to it.
 */
async function startIfAllowed(studio: Studio): Promise<void> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' });
    if (status.state === 'granted' && useStudioStore.getState().phase === 'intro') await studio.startCamera();
  } catch {
    // Firefox doesn't know the "camera" permission name: wait for the button.
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorsRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // null until mounted; false if the renderer couldn't start (no WebGL2).
  const [studio, setStudio] = useState<Studio | false | null>(null);
  const phase = useStudioStore((s) => s.phase);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const cursors = cursorsRef.current;
    const video = videoRef.current;
    if (!canvas || !overlay || !cursors || !video) return;
    let instance: Studio | false;
    try {
      instance = new Studio({ canvas, overlay, cursors, video });
    } catch (err) {
      console.error('[app] could not start the renderer', err);
      instance = false;
    }
    // The studio owns WebGL and camera resources bound to these DOM nodes, so it
    // can only be created after mount; this runs once.
    setStudio(instance);
    if (instance && fixture) void instance.startFixture(fixture, params.has('loop'));
    else if (instance && !params.has('bench') && !params.has('record')) void startIfAllowed(instance);
    return () => {
      if (instance) instance.dispose();
    };
  }, []);

  useShortcuts(studio || null);

  return (
    <div className={`${styles.stage} ${phase === 'studio' ? styles.studio : ''}`}>
      <canvas ref={canvasRef} className={styles.gl} aria-label="Painting canvas" />
      <canvas ref={overlayRef} className={styles.overlay} aria-hidden="true" />
      <div ref={cursorsRef} aria-hidden="true" />
      <video ref={videoRef} className={styles.video} muted playsInline aria-hidden="true" />
      {studio === false && <Unsupported />}
      {studio && phase !== 'studio' && <Intro studio={studio} />}
      {studio && phase === 'studio' && (
        <>
          <Hint />
          <RadialMenu />
          <GesturesHelp />
          <Dock studio={studio} />
          <Hud studio={studio} />
          <InterruptionCard studio={studio} />
          {params.get('record') === 'fixtures' && <FixtureCapture studio={studio} />}
          {params.get('record') === 'guest' && <FixtureCapture studio={studio} guest />}
          {params.get('bench') === 'tracker' && <TrackerBench studio={studio} />}
          {params.get('bench') === 'render' && <RenderBench studio={studio} />}
        </>
      )}
      <Toast />
    </div>
  );
}
