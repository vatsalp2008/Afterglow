import { CloseIcon, Panel } from '@afterglow/ui';
import { useShallow } from 'zustand/react/shallow';
import type { HandStat } from './store';
import styles from './Hud.module.css';
import { useStudioStore } from './store';

const ms = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v)} ms`);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PinchBar({ hand, enter, exit }: { hand: HandStat; enter: number; exit: number }) {
  const scale = 0.8;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className={styles.hand}>
      <div className={styles.handHead}>
        <span>{hand.key.replace('#', ' ')} hand</span>
        <span className={hand.state === 'drawing' ? styles.drawing : undefined}>{hand.state}</span>
      </div>
      <div className={styles.bar} aria-label={`Pinch ratio ${hand.ratio.toFixed(2)}`}>
        <div className={styles.fill} data-state={hand.state} style={{ width: pct(hand.ratio) }} />
        <div className={styles.mark} style={{ left: pct(enter) }} title="Enter threshold" />
        <div className={styles.mark} style={{ left: pct(exit) }} title="Exit threshold" />
      </div>
      <div className={styles.barLegend}>
        <span>pinch {hand.ratio.toFixed(2)}</span>
        <span>
          enter {enter.toFixed(2)}, exit {exit.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className={styles.slider}>
      <span className={styles.sliderHead}>
        <span>{label}</span>
        <span>{value.toFixed(step < 0.1 ? 2 : 1)}</span>
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

export function Hud() {
  const s = useStudioStore(
    useShallow((st) => ({
      open: st.hudOpen,
      stats: st.stats,
      inputMode: st.inputMode,
      strokeCount: st.strokeCount,
      pinch: st.pinch,
      oneEuro: st.oneEuro,
      showSkeleton: st.showSkeleton,
      showRaw: st.showRaw,
    })),
  );
  if (!s.open) return null;
  const set = useStudioStore.setState;
  const camera = s.inputMode === 'camera';
  const { stats } = s;
  const from = stats.hasCaptureTime ? 'Capture' : 'Frame callback';

  return (
    <Panel as="aside" className={styles.hud} aria-label="Stats">
      <header className={styles.header}>
        <h2>Stats</h2>
        <button type="button" className={styles.close} aria-label="Close stats" onClick={() => set({ hudOpen: false })}>
          <CloseIcon />
        </button>
      </header>

      <dl className={styles.rows}>
        <Row label="Render" value={`${stats.renderFps} fps`} />
        {camera && <Row label="Tracking" value={`${stats.trackingFps} fps, ${stats.delegate ?? 'n/a'}`} />}
        {camera && <Row label={`${from} to landmarks`} value={`${ms(stats.landmarkP50)} / ${ms(stats.landmarkP95)}`} />}
        {camera && <Row label={`${from} to render`} value={`${ms(stats.inkP50)} / ${ms(stats.inkP95)}`} />}
        <Row label="Strokes" value={String(s.strokeCount)} />
      </dl>

      {camera && (
        <>
          <section className={styles.section}>
            <h3>Pen</h3>
            {stats.hands.length === 0 && <p className={styles.muted}>No hand in view</p>}
            {stats.hands.map((h) => (
              <PinchBar key={h.key} hand={h} enter={s.pinch.enter} exit={s.pinch.exit} />
            ))}
            <Slider
              label="Pinch enter"
              value={s.pinch.enter}
              min={0.1}
              max={0.5}
              step={0.01}
              onChange={(v) => set({ pinch: { ...s.pinch, enter: v, exit: Math.max(s.pinch.exit, v + 0.03) } })}
            />
            <Slider
              label="Pinch exit"
              value={s.pinch.exit}
              min={0.15}
              max={0.7}
              step={0.01}
              onChange={(v) => set({ pinch: { ...s.pinch, exit: v, enter: Math.min(s.pinch.enter, v - 0.03) } })}
            />
          </section>

          <section className={styles.section}>
            <h3>One Euro filter</h3>
            <Slider
              label="Min cutoff (Hz)"
              value={s.oneEuro.minCutoff}
              min={0.1}
              max={5}
              step={0.1}
              onChange={(v) => set({ oneEuro: { ...s.oneEuro, minCutoff: v } })}
            />
            <Slider
              label="Beta"
              value={s.oneEuro.beta}
              min={0}
              max={40}
              step={0.5}
              onChange={(v) => set({ oneEuro: { ...s.oneEuro, beta: v } })}
            />
            <label className={styles.check}>
              <input type="checkbox" checked={s.showRaw} onChange={(e) => set({ showRaw: e.target.checked })} />
              Show raw signal next to the filtered pen
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={s.showSkeleton}
                onChange={(e) => set({ showSkeleton: e.target.checked })}
              />
              Show hand skeleton
            </label>
          </section>
        </>
      )}

      <p className={styles.note}>
        Values are p50 / p95 over the last 120 frames. Inference runs on the main thread. Render time is measured when
        the frame is submitted to the GPU, not when it reaches the display.
      </p>
    </Panel>
  );
}
