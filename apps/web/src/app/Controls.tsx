import { DEFAULT_FILTER_SPECS, type FilterKind, type FilterSpec } from '@afterglow/core';
import type { ReactNode } from 'react';
import styles from './Controls.module.css';
import { FILTER_LABELS } from './filterLabels';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Formats the displayed value; defaults to 1 or 2 decimals depending on step. */
  format?: (v: number) => string;
}

export function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        <span>{format ? format(value) : value.toFixed(step < 0.1 ? 2 : 1)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const exp = (v: number) => (10 ** v).toExponential(1);

/** Parameter sliders for one filter, shared by the stats panel and the Filter Lab. */
export function FilterParams({ spec, onChange }: { spec: FilterSpec; onChange: (spec: FilterSpec) => void }) {
  switch (spec.kind) {
    case 'none':
      return null;
    case 'ema':
      return (
        <Slider
          label="Time constant"
          value={spec.tauMs}
          min={5}
          max={300}
          step={5}
          format={(v) => `${String(v)} ms`}
          onChange={(v) => onChange({ ...spec, tauMs: v })}
        />
      );
    case 'kalman':
      // Both parameters span orders of magnitude, so the sliders are logarithmic.
      return (
        <>
          <Slider
            label="Process noise"
            value={Math.log10(spec.processNoise)}
            min={-3}
            max={1}
            step={0.1}
            format={exp}
            onChange={(v) => onChange({ ...spec, processNoise: 10 ** v })}
          />
          <Slider
            label="Measurement noise"
            value={Math.log10(spec.measurementNoise)}
            min={-7}
            max={-3}
            step={0.1}
            format={exp}
            onChange={(v) => onChange({ ...spec, measurementNoise: 10 ** v })}
          />
        </>
      );
    case 'oneEuro':
      return (
        <>
          <Slider
            label="Min cutoff (Hz)"
            value={spec.minCutoff}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(v) => onChange({ ...spec, minCutoff: v })}
          />
          <Slider
            label="Beta"
            value={spec.beta}
            min={0}
            max={40}
            step={0.5}
            onChange={(v) => onChange({ ...spec, beta: v })}
          />
        </>
      );
  }
}

/** A filter picker plus its parameters. */
export function FilterControls({ spec, onChange }: { spec: FilterSpec; onChange: (spec: FilterSpec) => void }) {
  return (
    <>
      <Field label="Filter">
        <select value={spec.kind} onChange={(e) => onChange(DEFAULT_FILTER_SPECS[e.target.value as FilterKind])}>
          {(Object.keys(FILTER_LABELS) as FilterKind[]).map((k) => (
            <option key={k} value={k}>
              {FILTER_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <FilterParams spec={spec} onChange={onChange} />
    </>
  );
}
