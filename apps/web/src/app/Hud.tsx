import type { ToolGesture } from '@afterglow/core';
import { CAMERA_RESOLUTIONS, type CameraResolution } from '@afterglow/tracking';
import { CloseIcon, Panel } from '@afterglow/ui';
import { useShallow } from 'zustand/react/shallow';
import type { Studio } from '../studio/studio';
import type { HandStat } from './store';
import { Field, FilterControls, Slider } from './Controls';
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

const GESTURE_LABELS: Record<ToolGesture, string> = {
  openMenu: 'menu',
  pause: 'pause',
  undo: 'undo',
  redo: 'redo',
  refine: 'refine',
};

function gestureSummary(counts: Partial<Record<ToolGesture, number>>): string {
  const parts = (Object.keys(GESTURE_LABELS) as ToolGesture[]).flatMap((g) =>
    counts[g] ? [`${GESTURE_LABELS[g]} ${String(counts[g])}`] : [],
  );
  return parts.length ? parts.join(', ') : 'none yet';
}

const TRACKER_LABELS = { worker: 'worker', main: 'main thread', fixture: 'recorded session' } as const;

export function Hud({ studio }: { studio: Studio }) {
  const s = useStudioStore(
    useShallow((st) => ({
      open: st.hudOpen,
      stats: st.stats,
      inputMode: st.inputMode,
      strokeCount: st.strokeCount,
      gestures: st.gestures,
      pinch: st.pinch,
      filter: st.filter,
      showSkeleton: st.showSkeleton,
      showRaw: st.showRaw,
      debugView: st.debugView,
      cameras: st.cameras,
      cameraId: st.cameraId,
      resolution: st.resolution,
    })),
  );
  if (!s.open) return null;
  const set = useStudioStore.setState;
  const camera = s.inputMode === 'camera';
  const tracking = s.inputMode !== 'pointer';
  const { stats } = s;
  const from = stats.hasCaptureTime ? 'Capture' : 'Frame callback';
  const tracker = stats.tracker ? TRACKER_LABELS[stats.tracker] : 'n/a';
  const delegate = stats.delegate && stats.delegate !== 'none' ? `, ${stats.delegate}` : '';

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
        {tracking && <Row label="Tracking" value={`${stats.trackingFps} fps, ${tracker}${delegate}`} />}
        {camera && (
          <Row label="Main thread per frame" value={`${ms(stats.mainThreadP50)} / ${ms(stats.mainThreadP95)}`} />
        )}
        {tracking && (
          <Row label={`${from} to landmarks`} value={`${ms(stats.landmarkP50)} / ${ms(stats.landmarkP95)}`} />
        )}
        {tracking && (
          <Row
            label={`${s.inputMode === 'fixture' ? 'Recorded frame' : from} to ink on screen`}
            value={`${ms(stats.inkP50)} / ${ms(stats.inkP95)}`}
          />
        )}
        <Row label="Frame cost" value={`${ms(stats.frameP50)} / ${ms(stats.frameP95)}`} />
        <Row
          label="Draw calls"
          value={`${String(stats.drawCalls)}, ${(stats.triangles / 1000).toFixed(0)}k triangles`}
        />
        <Row label="GPU geometries" value={String(stats.geometries)} />
        {camera && (
          <Row
            label="Dropped frames"
            value={`camera ${String(stats.droppedFrames)}, tracker ${String(stats.skippedFrames)}`}
          />
        )}
        <Row label="Strokes" value={String(s.strokeCount)} />
        {stats.doodleMs !== null && <Row label="Doodle guess" value={ms(stats.doodleMs)} />}
        {tracking && <Row label="Gestures" value={gestureSummary(s.gestures)} />}
      </dl>

      {camera && (
        <section className={styles.section}>
          <h3>Camera</h3>
          <Field label="Device">
            <select
              value={s.cameraId ?? ''}
              onChange={(e) => {
                set({ cameraId: e.target.value });
                void studio.switchCamera({ deviceId: e.target.value, resolution: s.resolution });
              }}
            >
              {s.cameras.map((c) => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Resolution">
            <select
              value={s.resolution}
              onChange={(e) => {
                const resolution = e.target.value as CameraResolution;
                set({ resolution });
                void studio.switchCamera({ resolution, ...(s.cameraId ? { deviceId: s.cameraId } : {}) });
              }}
            >
              {(Object.keys(CAMERA_RESOLUTIONS) as CameraResolution[]).map((r) => (
                <option key={r} value={r}>
                  {r.replace('x', ' × ')}
                </option>
              ))}
            </select>
          </Field>
        </section>
      )}

      {tracking && (
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
            <h3>Smoothing</h3>
            <FilterControls spec={s.filter} onChange={(filter) => set({ filter })} />
            <label className={styles.check}>
              <input type="checkbox" checked={s.debugView} onChange={(e) => set({ debugView: e.target.checked })} />
              Debug view: natural video, skeleton, and raw signal
            </label>
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
            <a className={styles.link} href={`${import.meta.env.BASE_URL}lab/`}>
              Compare filters in the Filter Lab
            </a>
          </section>
        </>
      )}

      <p className={styles.note}>
        Values are p50 / p95 over the last 120 frames. {stats.tracker === 'worker' && 'Inference runs in a worker. '}
        {stats.tracker === 'main' && 'Inference runs on the main thread. '}
        Render time is measured when the frame is submitted to the GPU, not when it reaches the display.
      </p>
    </Panel>
  );
}
