// Plain SVG charts for the Filter Lab: no charting dependency. Lines break where
// the hand was lost, so gaps aren't drawn as straight jumps.

import type { SignalSample, TrackPoint } from '@afterglow/core';
import styles from './Lab.module.css';
import { niceTicks, paddedExtent } from './ticks';

export interface LineStyle {
  color: string;
  width: number;
  /** SVG stroke-dasharray, for telling lines apart without color. */
  dash?: string;
}

export interface Series<P> {
  id: string;
  label: string;
  style: LineStyle;
  points: readonly P[];
}

const GAP_MS = 150;

function linePath<P extends { t: number }>(points: readonly P[], x: (p: P) => number, y: (p: P) => number): string {
  let d = '';
  let prev: P | null = null;
  for (const p of points) {
    d += `${prev && p.t - prev.t <= GAP_MS ? 'L' : 'M'}${x(p).toFixed(1)},${y(p).toFixed(1)}`;
    prev = p;
  }
  return d;
}

const fmt = (v: number) => String(Number(v.toPrecision(6)));

const W = 880;
const H = 300;
const M = { left: 60, right: 16, top: 12, bottom: 40 };

export function TimePlot({
  series,
  from,
  to,
  yLabel,
  shade,
  label,
}: {
  series: ReadonlyArray<Series<SignalSample>>;
  from: number;
  to: number;
  yLabel: string;
  /** A highlighted time span (ms), e.g. where jitter is measured. */
  shade?: { from: number; to: number; label: string } | null;
  label: string;
}) {
  const visible = series.map((s) => ({ ...s, points: s.points.filter((p) => p.t >= from && p.t <= to) }));
  const [lo, hi] = paddedExtent(visible.flatMap((s) => s.points.map((p) => p.v))) ?? [0, 1];
  const span = Math.max(to - from, 1);
  const x = (t: number) => M.left + ((t - from) / span) * (W - M.left - M.right);
  const y = (v: number) => H - M.bottom - ((v - lo) / (hi - lo)) * (H - M.top - M.bottom);
  const yTicks = niceTicks(lo, hi, 5);
  const xTicks = niceTicks(from / 1000, to / 1000, 8);
  const shadeFrom = shade ? Math.max(shade.from, from) : 0;
  const shadeTo = shade ? Math.min(shade.to, to) : 0;

  return (
    <svg className={styles.chart} viewBox={`0 0 ${String(W)} ${String(H)}`} role="img" aria-label={label}>
      {shade && shadeTo > shadeFrom && (
        <g className={styles.shade}>
          <rect x={x(shadeFrom)} y={M.top} width={x(shadeTo) - x(shadeFrom)} height={H - M.top - M.bottom} />
          <text x={x(shadeFrom) + 6} y={M.top + 14}>
            {shade.label}
          </text>
        </g>
      )}
      <g className={styles.grid}>
        {yTicks.map((v) => (
          <line key={v} x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <g className={styles.axis}>
        {yTicks.map((v) => (
          <text key={v} x={M.left - 8} y={y(v) + 4} textAnchor="end">
            {fmt(v)}
          </text>
        ))}
        {xTicks.map((s) => (
          <text key={s} x={x(s * 1000)} y={H - M.bottom + 18} textAnchor="middle">
            {fmt(s)}
          </text>
        ))}
        <text x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle">
          Time (s)
        </text>
        <text transform={`translate(14 ${String((M.top + H - M.bottom) / 2)}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
      </g>
      <g clipPath="url(#lab-time-clip)">
        <clipPath id="lab-time-clip">
          <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} />
        </clipPath>
        {visible.map((s) => (
          <path
            key={s.id}
            d={linePath(
              s.points,
              (p) => x(p.t),
              (p) => y(p.v),
            )}
            fill="none"
            stroke={s.style.color}
            strokeWidth={s.style.width}
            strokeDasharray={s.style.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}

const PW = 880;
const PH = 360;
const PM = { left: 56, right: 16, top: 12, bottom: 40 };

/** The pen's path in the video frame, at equal scale in x and y (image y points down). */
export function PathPlot({
  series,
  from,
  to,
  label,
}: {
  series: ReadonlyArray<Series<TrackPoint>>;
  from: number;
  to: number;
  label: string;
}) {
  const visible = series.map((s) => ({ ...s, points: s.points.filter((p) => p.t >= from && p.t <= to) }));
  const xs = paddedExtent(
    visible.flatMap((s) => s.points.map((p) => p.x)),
    0.08,
  ) ?? [0, 1];
  const ys = paddedExtent(
    visible.flatMap((s) => s.points.map((p) => p.y)),
    0.08,
  ) ?? [0, 1];
  // Equal scale: widen whichever range is short for the plot's shape.
  const innerW = PW - PM.left - PM.right;
  const innerH = PH - PM.top - PM.bottom;
  const scale = Math.min(innerW / (xs[1] - xs[0]), innerH / (ys[1] - ys[0]));
  const cx = (xs[0] + xs[1]) / 2;
  const cy = (ys[0] + ys[1]) / 2;
  const x0 = cx - innerW / scale / 2;
  const y0 = cy - innerH / scale / 2;
  const x = (v: number) => PM.left + (v - x0) * scale;
  const y = (v: number) => PM.top + (v - y0) * scale;
  const xTicks = niceTicks(x0, x0 + innerW / scale, 8);
  const yTicks = niceTicks(y0, y0 + innerH / scale, 5);

  return (
    <svg className={styles.chart} viewBox={`0 0 ${String(PW)} ${String(PH)}`} role="img" aria-label={label}>
      <g className={styles.grid}>
        {xTicks.map((v) => (
          <line key={`x${String(v)}`} x1={x(v)} x2={x(v)} y1={PM.top} y2={PH - PM.bottom} />
        ))}
        {yTicks.map((v) => (
          <line key={`y${String(v)}`} x1={PM.left} x2={PW - PM.right} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <g className={styles.axis}>
        {xTicks.map((v) => (
          <text key={v} x={x(v)} y={PH - PM.bottom + 18} textAnchor="middle">
            {fmt(v)}
          </text>
        ))}
        {yTicks.map((v) => (
          <text key={v} x={PM.left - 8} y={y(v) + 4} textAnchor="end">
            {fmt(v)}
          </text>
        ))}
        <text x={(PM.left + PW - PM.right) / 2} y={PH - 4} textAnchor="middle">
          x (px, as seen in the mirror)
        </text>
        <text transform={`translate(14 ${String((PM.top + PH - PM.bottom) / 2)}) rotate(-90)`} textAnchor="middle">
          y (px)
        </text>
      </g>
      <g clipPath="url(#lab-path-clip)">
        <clipPath id="lab-path-clip">
          <rect x={PM.left} y={PM.top} width={innerW} height={innerH} />
        </clipPath>
        {visible.map((s) => (
          <path
            key={s.id}
            d={linePath(
              s.points,
              (p) => x(p.x),
              (p) => y(p.y),
            )}
            fill="none"
            stroke={s.style.color}
            strokeWidth={s.style.width}
            strokeDasharray={s.style.dash}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}

/** A short sample of a line's style, for legends. */
export function LineSwatch({ style }: { style: LineStyle }) {
  return (
    <svg className={styles.swatch} viewBox="0 0 28 10" aria-hidden="true">
      <line
        x1={2}
        x2={26}
        y1={5}
        y2={5}
        stroke={style.color}
        strokeWidth={style.width + 0.5}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
    </svg>
  );
}
