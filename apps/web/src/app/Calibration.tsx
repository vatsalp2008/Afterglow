import { calibratePinch, type Calibration } from '@afterglow/core';
import { Button, Panel } from '@afterglow/ui';
import { useEffect, useRef, useState } from 'react';
import type { Studio } from '../studio/studio';
import styles from './Calibration.module.css';
import { markCalibrationOffered, savePinchCalibration, useStudioStore } from './store';

const SETTLE_MS = 1000;
const SAMPLE_MS = 2000;

type Step =
  { kind: 'intro' } | { kind: 'open' | 'pinch'; sampling: boolean } | { kind: 'result'; calibration: Calibration };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const FAILURE: Record<'tooFewSamples' | 'notSeparable', string> = {
  tooFewSamples: 'Your hand wasn’t in view long enough. Keep one hand in front of the camera for the whole time.',
  notSeparable:
    'Your open hand and your pinch looked too similar to tell apart. Try brighter light, or turn your palm toward the camera.',
};

/** A 5-second guided measurement of the user's open hand and pinch. */
export function CalibrationPanel({ studio }: { studio: Studio }) {
  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const cancelled = useRef(false);
  const close = () => {
    cancelled.current = true;
    studio.endCalibration();
    markCalibrationOffered();
    useStudioStore.setState({ calibrationOpen: false });
  };

  useEffect(
    () => () => {
      cancelled.current = true;
      studio.endCalibration();
    },
    [studio],
  );

  // Read through a function: cancelling flips the ref while run() is awaiting.
  const isCancelled = () => cancelled.current;
  const run = async () => {
    cancelled.current = false;
    const measure = async (kind: 'open' | 'pinch') => {
      setStep({ kind, sampling: false });
      await sleep(SETTLE_MS);
      if (isCancelled()) return { measures: [], extensions: [] };
      setStep({ kind, sampling: true });
      return studio.sampleMeasures(SAMPLE_MS);
    };
    const open = await measure('open');
    const pinched = await measure('pinch');
    studio.endCalibration();
    if (!isCancelled()) {
      const calibration = calibratePinch(open.measures, pinched.measures, pinched.extensions);
      setStep({ kind: 'result', calibration });
    }
  };

  return (
    <div className={styles.backdrop}>
      <Panel as="section" className={styles.panel} aria-label="Calibrate pinch" aria-live="polite">
        <h2>Calibrate your pinch</h2>
        {step.kind === 'intro' && (
          <>
            <p>
              Takes about 5 seconds. Hold one hand up to the camera; first open, then pinched. Nothing is drawn while
              calibrating.
            </p>
            <div className={styles.actions}>
              <Button onClick={() => void run()}>Start</Button>
              <Button variant="secondary" onClick={close}>
                Not now
              </Button>
            </div>
          </>
        )}
        {(step.kind === 'open' || step.kind === 'pinch') && (
          <>
            <p className={styles.instruction}>
              {step.kind === 'open'
                ? 'Hold your hand open, fingers apart.'
                : 'Now pinch your thumb and index finger together, and hold.'}
            </p>
            <p className={styles.status}>{step.sampling ? 'Measuring…' : 'Get ready…'}</p>
          </>
        )}
        {step.kind === 'result' &&
          (step.calibration.ok ? (
            <>
              <p>
                Your pinch reads {step.calibration.result.pinchedLevel.toFixed(2)} and your open hand{' '}
                {step.calibration.result.openLevel.toFixed(2)}. The pen will go down below{' '}
                {step.calibration.result.enter.toFixed(2)} and lift above {step.calibration.result.exit.toFixed(2)}.
                {step.calibration.result.fistBelow === 0 &&
                  ' Your pinch curls your other fingers like a fist, so a fist won’t pause drawing.'}
              </p>
              <div className={styles.actions}>
                <Button
                  onClick={() => {
                    if (step.calibration.ok) savePinchCalibration(step.calibration.result);
                    close();
                  }}
                >
                  Save
                </Button>
                <Button variant="secondary" onClick={() => void run()}>
                  Try again
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>{FAILURE[step.calibration.reason]}</p>
              <div className={styles.actions}>
                <Button onClick={() => void run()}>Try again</Button>
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
              </div>
            </>
          ))}
      </Panel>
    </div>
  );
}

/** A one-time offer to calibrate, shown the first time the camera starts. */
export function CalibrationOffer() {
  return (
    <Panel as="section" className={styles.offer} aria-label="Calibration offer">
      <p>Calibrate the pinch for your hand? It takes about 5 seconds.</p>
      <div className={styles.actions}>
        <Button className={styles.small} onClick={() => useStudioStore.setState({ calibrationOpen: true })}>
          Calibrate
        </Button>
        <Button variant="secondary" className={styles.small} onClick={markCalibrationOffered}>
          Not now
        </Button>
      </div>
    </Panel>
  );
}
