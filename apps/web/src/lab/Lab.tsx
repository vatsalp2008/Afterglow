// The Filter Lab: compare smoothing filters on the recorded hand sessions. Every
// number comes from the same replay and metrics as docs/benchmarks.md.

import {
  DEFAULT_FILTER_SPECS,
  filterRun,
  parseLabels,
  type FilterRun,
  type FilterSpec,
  type LabSignal,
  type SessionRecording,
} from '@afterglow/core';
import { Button, Panel } from '@afterglow/ui';
import { PALETTE } from '@afterglow/ui/tokens';
import { useEffect, useMemo, useState } from 'react';
import { Field, FilterParams, Slider } from '../app/Controls';
import { FILTER_LABELS } from '../app/filterLabels';
import { fixtureNames, loadFixture } from '../studio/fixtures';
import { LineSwatch, PathPlot, TimePlot, type LineStyle } from './charts';
import styles from './Lab.module.css';

// Loaded like the recordings, through Vite, and validated.
const labelFiles = import.meta.glob<unknown>('../../../../fixtures/labels.json', { eager: true, import: 'default' });
const labels = parseLabels(Object.values(labelFiles)[0] ?? {});

type Tuned = 'ema' | 'kalman' | 'oneEuro';
type Shown = 'none' | Tuned;
const TUNED: readonly Tuned[] = ['ema', 'kalman', 'oneEuro'];
const ALL: readonly Shown[] = ['none', ...TUNED];

// Distinct in hue, lightness, and dash, so no line depends on color alone.
const STYLES: Record<Shown, LineStyle> = {
  none: { color: 'rgba(233, 236, 245, 0.55)', width: 1 },
  ema: { color: PALETTE.ledCyan, width: 1.5 },
  kalman: { color: PALETTE.gelMagenta, width: 1.5, dash: '6 4' },
  oneEuro: { color: PALETTE.sodium, width: 2 },
};

const SIGNALS: Record<LabSignal, { label: string; unit: string }> = {
  penX: { label: 'Pen x', unit: 'px' },
  penY: { label: 'Pen y', unit: 'px' },
  pinch: { label: 'Pinch measure', unit: 'palm lengths' },
};

/** 'all', the labeled still stretch, or a span in ms that the Start slider moves. */
type WindowChoice = 'all' | 'still' | number;
const SPANS: readonly number[] = [5000, 2000, 1000];

const DEFAULT_SPECS: Record<Tuned, FilterSpec> = {
  ema: DEFAULT_FILTER_SPECS.ema,
  kalman: DEFAULT_FILTER_SPECS.kalman,
  oneEuro: DEFAULT_FILTER_SPECS.oneEuro,
};

function initialFixture(names: readonly string[]): string {
  const requested = new URLSearchParams(window.location.search).get('fixture');
  return requested && names.includes(requested) ? requested : '03-fast-zigzag';
}

export function Lab() {
  const names = useMemo(() => fixtureNames(), []);
  const [name, setName] = useState(() => initialFixture(names));
  const [loaded, setLoaded] = useState<{ name: string; rec: SessionRecording } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signal, setSignal] = useState<LabSignal>('penX');
  const [specs, setSpecs] = useState(DEFAULT_SPECS);
  const [shown, setShown] = useState<Record<Shown, boolean>>({ none: true, ema: true, kalman: true, oneEuro: true });
  const [windowChoice, setWindowChoice] = useState<WindowChoice>('all');
  const [startMs, setStartMs] = useState(0);

  useEffect(() => {
    let live = true;
    loadFixture(name).then(
      (rec) => {
        if (live) setLoaded({ name, rec });
      },
      (err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      live = false;
    };
  }, [name]);

  const rec = loaded?.name === name ? loaded.rec : null;
  const still = labels[name]?.still ?? null;
  const raw = useMemo(() => rec && filterRun(rec, DEFAULT_FILTER_SPECS.none, signal, still), [rec, signal, still]);
  const ema = useMemo(
    () => rec && raw && filterRun(rec, specs.ema, signal, still, raw),
    [rec, raw, specs.ema, signal, still],
  );
  const kalman = useMemo(
    () => rec && raw && filterRun(rec, specs.kalman, signal, still, raw),
    [rec, raw, specs.kalman, signal, still],
  );
  const oneEuro = useMemo(
    () => rec && raw && filterRun(rec, specs.oneEuro, signal, still, raw),
    [rec, raw, specs.oneEuro, signal, still],
  );
  const runs: Record<Shown, FilterRun | null> = { none: raw, ema, kalman, oneEuro };

  const duration = rec?.frames[rec.frames.length - 1]?.captureTime ?? 0;
  const choice = windowChoice === 'still' && !still ? 'all' : windowChoice;
  const span = typeof choice === 'number' && choice < duration ? choice : null;
  const [from, to] =
    choice === 'still' && still
      ? still
      : span === null
        ? [0, duration]
        : [Math.min(startMs, duration - span), Math.min(startMs, duration - span) + span];
  const unit = SIGNALS[signal].unit;
  const pen = signal !== 'pinch';
  const jitterUnit = pen ? 'px' : '';
  const measuredOn = still
    ? `the still stretch, ${(still[0] / 1000).toFixed(1)} to ${(still[1] / 1000).toFixed(1)} s`
    : null;

  const series = <K extends 'signal' | 'path'>(key: K) =>
    ALL.flatMap((k) => {
      const run = runs[k];
      return run && shown[k] ? [{ id: k, label: FILTER_LABELS[k], style: STYLES[k], points: run[key] }] : [];
    });

  return (
    <main className={styles.lab}>
      <header className={styles.header}>
        <div>
          <h1>Filter Lab</h1>
          <p>
            Smoothing filters on recorded hand sessions. Jitter and lag are computed exactly as in the benchmarks:
            jitter on the pen point while the hand is held still, lag as the delay that best lines a filter up with the
            raw signal.
          </p>
        </div>
        <a className={styles.back} href={import.meta.env.BASE_URL}>
          Back to the studio
        </a>
      </header>

      <div className={styles.layout}>
        <Panel as="aside" className={styles.controls} aria-label="Lab controls">
          <Field label="Recording">
            <select
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setStartMs(0);
              }}
            >
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Signal">
            <select value={signal} onChange={(e) => setSignal(e.target.value as LabSignal)}>
              {(Object.keys(SIGNALS) as LabSignal[]).map((s) => (
                <option key={s} value={s}>
                  {SIGNALS[s].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Window">
            <select
              value={String(choice)}
              onChange={(e) => {
                const v = e.target.value;
                setWindowChoice(v === 'all' || v === 'still' ? v : Number(v));
              }}
            >
              <option value="all">Whole recording</option>
              {still && <option value="still">Still stretch</option>}
              {SPANS.map((ms) => (
                <option key={ms} value={String(ms)}>
                  {`${String(ms / 1000)} s`}
                </option>
              ))}
            </select>
          </Field>
          {span !== null && (
            <Slider
              label="Start"
              value={from}
              min={0}
              max={duration - span}
              step={50}
              format={(v) => `${(v / 1000).toFixed(2)} s`}
              onChange={setStartMs}
            />
          )}

          {TUNED.map((k) => (
            <fieldset key={k} className={styles.filter}>
              <legend>
                <LineSwatch style={STYLES[k]} />
                {FILTER_LABELS[k]}
              </legend>
              <FilterParams spec={specs[k]} onChange={(spec) => setSpecs((s) => ({ ...s, [k]: spec }))} />
            </fieldset>
          ))}
          <Button variant="secondary" onClick={() => setSpecs(DEFAULT_SPECS)}>
            Reset to the defaults
          </Button>
        </Panel>

        <section className={styles.results} aria-busy={!rec}>
          {error && (
            <p role="alert">
              Couldn’t load {name}: {error}
            </p>
          )}
          <table className={styles.readouts}>
            <caption>
              {pen ? 'Pen point' : 'Pinch measure'}.{' '}
              {measuredOn
                ? `Jitter on ${measuredOn}.`
                : 'Jitter needs a labeled still stretch, and this recording has none.'}{' '}
              Lag against raw over the whole recording; it needs the hand to move.
            </caption>
            <thead>
              <tr>
                <th scope="col">Show</th>
                <th scope="col">Filter</th>
                <th scope="col">Jitter{jitterUnit && ` (${jitterUnit})`}</th>
                <th scope="col">Lag (ms)</th>
              </tr>
            </thead>
            <tbody>
              {ALL.map((k) => {
                const run = runs[k];
                return (
                  <tr key={k}>
                    <td>
                      <input
                        type="checkbox"
                        checked={shown[k]}
                        aria-label={`Show ${FILTER_LABELS[k]}`}
                        onChange={(e) => setShown((s) => ({ ...s, [k]: e.target.checked }))}
                      />
                    </td>
                    <th scope="row">
                      <span className={styles.name}>
                        <LineSwatch style={STYLES[k]} />
                        {FILTER_LABELS[k]}
                      </span>
                    </th>
                    <td>{run ? (measuredOn ? run.jitter.toFixed(pen ? 2 : 4) : '–') : '…'}</td>
                    <td>{run ? String(run.lagMs) : '…'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {rec && (
            <>
              <figure className={styles.figure}>
                <figcaption>
                  {SIGNALS[signal].label} over time ({unit})
                </figcaption>
                <TimePlot
                  series={series('signal')}
                  from={from}
                  to={to}
                  yLabel={`${SIGNALS[signal].label} (${unit})`}
                  shade={still && { from: still[0], to: still[1], label: 'Jitter measured here' }}
                  label={`${SIGNALS[signal].label} over time for ${name}, raw and filtered`}
                />
              </figure>
              <figure className={styles.figure}>
                <figcaption>Pen path in the video frame</figcaption>
                <PathPlot
                  series={series('path')}
                  from={from}
                  to={to}
                  label={`Pen path for ${name}, raw and filtered`}
                />
              </figure>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
