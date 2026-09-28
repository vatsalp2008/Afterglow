import { useEffect, useRef, useState } from 'react';
import { Studio } from '../studio/studio';
import styles from './App.module.css';
import { CalibrationOffer, CalibrationPanel } from './Calibration';
import { Dock } from './Dock';
import { FixtureCapture } from './FixtureCapture';
import { Hud } from './Hud';
import { Intro, Unsupported } from './Intro';
import { Hint, Toast } from './Overlay';
import { useShortcuts } from './shortcuts';
import { useStudioStore } from './store';
import { TrackerBench } from './TrackerBench';

// Developer tools: ?fixture=<name>[&loop], ?record=fixtures, ?bench=tracker
const params = new URLSearchParams(location.search);
const fixture = params.get('fixture');

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorsRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // null until mounted; false if the renderer couldn't start (no WebGL2).
  const [studio, setStudio] = useState<Studio | false | null>(null);
  const phase = useStudioStore((s) => s.phase);
  const inputMode = useStudioStore((s) => s.inputMode);
  const calibrationOpen = useStudioStore((s) => s.calibrationOpen);
  const offerCalibration = useStudioStore((s) => !s.calibrated && !s.calibrationOffered);

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
          <Dock studio={studio} />
          <Hud studio={studio} />
          {inputMode === 'camera' && calibrationOpen && <CalibrationPanel studio={studio} />}
          {inputMode === 'camera' && !calibrationOpen && offerCalibration && <CalibrationOffer />}
          {params.get('record') === 'fixtures' && <FixtureCapture studio={studio} />}
          {params.get('bench') === 'tracker' && <TrackerBench studio={studio} />}
        </>
      )}
      <Toast />
    </div>
  );
}
