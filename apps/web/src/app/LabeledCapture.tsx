import { Button, Panel } from '@afterglow/ui';
import type { LabeledItem, LabeledKind } from '@afterglow/core';
import { useEffect, useRef, useState } from 'react';
import { PROMPTS } from '../studio/labeledPrompts';
import { PERSON_ID } from '../studio/scenarios';
import type { Studio } from '../studio/studio';
import styles from './DevPanels.module.css';
import capture from './LabeledCapture.module.css';
import { useStudioStore } from './store';

/** Time to read the next prompt before drawing starts. */
const GAP_MS = 1800;

interface Run {
  index: number;
  phase: 'gap' | 'draw';
  endsAt: number;
}

const TITLES: Record<LabeledKind, string> = { shapes: 'Record shapes', doodles: 'Record doodles' };

const LEDES: Record<LabeledKind, string> = {
  shapes:
    'Draw each shape when it’s asked for, one stroke each, the way you naturally would. Loose prompts are things that shouldn’t snap. About 5 minutes.',
  doodles:
    'Draw each subject when it’s asked for, in as many strokes as you like, the way you would on paper. About 7 minutes.',
};

/**
 * Guided recording of a labeled set (?record=shapes, ?record=doodles): prompts one after
 * another, the canvas cleared between them, and strokes saved as drawn, without snapping.
 * Hands only once started, so nothing interrupts the drawing.
 */
export function LabeledCapture({ studio, kind }: { studio: Studio; kind: LabeledKind }) {
  const inputMode = useStudioStore((s) => s.inputMode);
  const prompts = PROMPTS[kind];
  const [person, setPerson] = useState('p1');
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(0);
  const [saved, setSaved] = useState<number | null>(null);
  const items = useRef<LabeledItem[]>([]);
  const snapBefore = useRef(true);

  useEffect(() => {
    if (!run) return;
    const finish = () => {
      studio.saveLabeledSet(kind, person, items.current);
      setSaved(items.current.length);
      studio.beginPrompt();
      useStudioStore.setState({ snap: snapBefore.current, capturing: null });
      setRun(null);
    };
    const timer = setInterval(() => {
      const t = performance.now();
      setNow(t);
      if (t < run.endsAt) return;
      const prompt = prompts[run.index];
      if (!prompt) return;
      if (run.phase === 'gap') {
        studio.beginPrompt();
        setRun({ index: run.index, phase: 'draw', endsAt: t + prompt.durationMs });
        return;
      }
      const strokes = studio.endPrompt();
      if (strokes.length > 0) items.current.push({ label: prompt.label, strokes });
      if (run.index + 1 >= prompts.length) finish();
      else setRun({ index: run.index + 1, phase: 'gap', endsAt: t + GAP_MS });
    }, 100);
    return () => clearInterval(timer);
  }, [run, studio, kind, person, prompts]);

  const start = (t: number) => {
    items.current = [];
    setSaved(null);
    snapBefore.current = useStudioStore.getState().snap;
    // Raw strokes: snapping would record what it made, not what was drawn.
    useStudioStore.setState({ snap: false, capturing: kind });
    setNow(t);
    setRun({ index: 0, phase: 'gap', endsAt: t + GAP_MS });
  };

  const stop = () => {
    if (run?.phase === 'draw') {
      const strokes = studio.endPrompt();
      const prompt = prompts[run.index];
      if (prompt && strokes.length > 0) items.current.push({ label: prompt.label, strokes });
    }
    if (items.current.length > 0) {
      studio.saveLabeledSet(kind, person, items.current);
      setSaved(items.current.length);
    }
    studio.beginPrompt();
    useStudioStore.setState({ snap: snapBefore.current, capturing: null });
    setRun(null);
  };

  const prompt = run ? prompts[run.index] : null;
  const secondsLeft = run ? Math.max(0, Math.ceil((run.endsAt - now) / 1000)) : 0;

  return (
    <>
      {run && prompt && (
        <div className={capture.banner} role="status">
          <p className={capture.progress}>
            {String(run.index + 1)} of {String(prompts.length)}
          </p>
          <p className={capture.prompt}>
            {run.phase === 'gap' ? 'Next: ' : 'Draw '}
            {prompt.text}
          </p>
          {run.phase === 'draw' && <p className={capture.progress}>{secondsLeft} s</p>}
        </div>
      )}
      <Panel as="section" className={styles.panel} aria-label={TITLES[kind]}>
        <h2>{TITLES[kind]}</h2>
        <p className={styles.lede}>
          {LEDES[kind]} The strokes save to your downloads; no video and no landmarks are kept.
        </p>
        <label className={styles.person}>
          <span>Person id</span>
          <input
            value={person}
            placeholder="p1"
            maxLength={8}
            autoComplete="off"
            disabled={run !== null}
            onChange={(e) => setPerson(e.target.value.trim().toLowerCase())}
          />
          <small>An id like p1, not a name: the recordings go in the project’s public repository.</small>
        </label>
        {inputMode === 'pointer' ? (
          <p className={styles.lede}>Start painting with the camera to record.</p>
        ) : (
          <div className={styles.actions}>
            {run ? (
              <Button variant="secondary" className={styles.small} onClick={stop}>
                Stop and save
              </Button>
            ) : (
              <Button className={styles.small} disabled={!PERSON_ID.test(person)} onClick={(e) => start(e.timeStamp)}>
                Start
              </Button>
            )}
            {saved !== null && <span className={styles.saved}>Saved {saved}</span>}
          </div>
        )}
      </Panel>
    </>
  );
}
