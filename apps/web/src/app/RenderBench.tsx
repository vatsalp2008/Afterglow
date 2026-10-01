import { Button, Panel } from '@afterglow/ui';
import { downloadJson, stamp } from '../studio/download';
import type { Studio } from '../studio/studio';
import styles from './DevPanels.module.css';
import { useStudioStore } from './store';

const ms = (v: number | null) => (v === null ? 'n/a' : v.toFixed(1));

/** Frame cost as the canvas fills, erase and live-stroke cost, and ink latency (?bench=render). */
export function RenderBench({ studio }: { studio: Studio }) {
  const bench = useStudioStore((s) => s.renderBench);
  const phase = useStudioStore((s) => s.phase);
  const running = bench?.status === 'running';
  const result = bench?.result;

  return (
    <Panel as="section" className={styles.panel} aria-label="Render benchmark">
      <h2>Render benchmark</h2>
      <p className={styles.lede}>
        Renders 0 to 1000 synthetic strokes, erases across 500, grows a live stroke, then measures ink latency while a
        recorded session draws. About 45 seconds. Clears the canvas.
      </p>
      {phase === 'studio' && (
        <div className={styles.actions}>
          <Button className={styles.small} disabled={running} onClick={() => void studio.runRenderBench()}>
            {bench ? 'Run again' : 'Run benchmark'}
          </Button>
          {result && (
            <Button
              variant="secondary"
              className={styles.small}
              onClick={() => downloadJson(result, `afterglow-render-bench-${stamp()}.json`)}
            >
              Download results
            </Button>
          )}
        </div>
      )}
      {bench && (
        <p className={bench.status === 'error' ? styles.error : styles.status} role="status">
          {bench.status === 'error' ? `Failed: ${bench.progress}` : bench.progress}
        </p>
      )}
      {result && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Strokes</th>
              <th>Frame p95</th>
              <th>CPU p95</th>
              <th>CPU+GPU p95</th>
              <th>Draws</th>
            </tr>
          </thead>
          <tbody>
            {result.scenes.map((s) => (
              <tr key={s.strokes}>
                <td>{s.strokes}</td>
                <td>{ms(s.intervalP95)}</td>
                <td>{ms(s.costP95)}</td>
                <td>{ms(s.syncedP95)}</td>
                <td>{s.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
