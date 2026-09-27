import { Button, Panel } from '@afterglow/ui';
import { useEffect, useState } from 'react';
import { SCENARIOS } from '../studio/scenarios';
import type { Studio } from '../studio/studio';
import styles from './DevPanels.module.css';
import { useStudioStore } from './store';

const COUNTDOWN_MS = 3000;

interface Run {
  id: string;
  phase: 'countdown' | 'recording';
  endsAt: number;
}

/** Guided recording of the fixture scenarios (?record=fixtures). */
export function FixtureCapture({ studio }: { studio: Studio }) {
  const inputMode = useStudioStore((s) => s.inputMode);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!run) return;
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t < run.endsAt) return;
      const scenario = SCENARIOS.find((s) => s.id === run.id);
      if (!scenario) return;
      if (run.phase === 'countdown') {
        studio.startSession(scenario);
        setRun({ id: run.id, phase: 'recording', endsAt: t + scenario.durationMs });
      } else {
        studio.stopSession();
        setSaved((prev) => new Set(prev).add(run.id));
        setRun(null);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [run, studio]);

  // Event timestamps share performance.now()'s timebase.
  const begin = (id: string, t: number) => {
    setNow(t);
    setRun({ id, phase: 'countdown', endsAt: t + COUNTDOWN_MS });
  };

  const cancel = () => {
    if (run?.phase === 'recording') studio.cancelSession();
    setRun(null);
  };

  return (
    <Panel as="section" className={styles.panel} aria-label="Record fixtures">
      <h2>Record fixtures</h2>
      <p className={styles.lede}>
        Each clip starts after a 3-second countdown and saves to your downloads with the right name. Only hand landmarks
        are saved, never video.
      </p>
      {inputMode !== 'camera' ? (
        <p className={styles.lede}>Start painting with the camera to record.</p>
      ) : (
        <ol className={styles.list}>
          {SCENARIOS.map((s) => {
            const active = run?.id === s.id;
            const secondsLeft = active ? Math.max(0, Math.ceil((run.endsAt - now) / 1000)) : 0;
            return (
              <li key={s.id} className={styles.item}>
                <h3>
                  {s.id.slice(0, 2)}. {s.title}
                </h3>
                <div className={styles.actions}>
                  {active ? (
                    <>
                      <span className={styles.status} role="status">
                        {run.phase === 'countdown'
                          ? `Starting in ${String(secondsLeft)}`
                          : `Recording, ${String(secondsLeft)} s`}
                      </span>
                      <Button variant="secondary" className={styles.small} onClick={cancel}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      {saved.has(s.id) && <span className={styles.saved}>Saved</span>}
                      <Button
                        variant="secondary"
                        className={styles.small}
                        disabled={run !== null}
                        onClick={(e) => begin(s.id, e.timeStamp)}
                      >
                        {saved.has(s.id) ? 'Again' : 'Record'}
                      </Button>
                    </>
                  )}
                </div>
                <p className={styles.instruction}>
                  {s.instruction} ({String(s.durationMs / 1000)} s)
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
