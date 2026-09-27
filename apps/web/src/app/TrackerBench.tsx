import { Button, Panel } from '@afterglow/ui';
import { downloadJson, stamp } from '../studio/download';
import type { Studio } from '../studio/studio';
import styles from './DevPanels.module.css';
import { useStudioStore } from './store';

const ms = (v: number | null) => (v === null ? 'n/a' : v.toFixed(1));

/** Compares main-thread and worker tracking on the live camera (?bench=tracker). */
export function TrackerBench({ studio }: { studio: Studio }) {
  const bench = useStudioStore((s) => s.bench);
  const inputMode = useStudioStore((s) => s.inputMode);
  const running = bench?.status === 'running';

  return (
    <Panel as="section" className={styles.panel} aria-label="Tracker benchmark">
      <h2>Tracker benchmark</h2>
      <p className={styles.lede}>
        Alternates main-thread and worker tracking in four 10-second blocks on the live camera while rendering. Keep one
        hand in view the whole time.
      </p>
      {inputMode !== 'camera' ? (
        <p className={styles.lede}>Start painting with the camera first.</p>
      ) : (
        <div className={styles.actions}>
          <Button className={styles.small} disabled={running} onClick={() => void studio.runTrackerBench()}>
            {bench ? 'Run again' : 'Run benchmark'}
          </Button>
          {bench?.status === 'done' && (
            <Button
              variant="secondary"
              className={styles.small}
              onClick={() =>
                downloadJson(
                  { environment: studio.benchEnvironment(), blocks: bench.blocks },
                  `afterglow-tracker-bench-${stamp()}.json`,
                )
              }
            >
              Download results
            </Button>
          )}
        </div>
      )}
      {bench && (
        <p className={bench.status === 'error' ? styles.error : styles.status} role="status">
          {bench.status === 'error' ? `Failed: ${bench.error ?? 'unknown error'}` : bench.progress}
        </p>
      )}
      {bench && bench.blocks.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Tracker</th>
              <th>fps</th>
              <th>Latency p50/p95</th>
              <th>Main p95</th>
              <th>Render p95</th>
              <th>Slow</th>
            </tr>
          </thead>
          <tbody>
            {bench.blocks.map((b, i) => (
              <tr key={i}>
                <td>
                  {b.mode}, {b.delegate}
                </td>
                <td>{b.trackingFps.toFixed(1)}</td>
                <td>
                  {ms(b.latencyP50)} / {ms(b.latencyP95)}
                </td>
                <td>{ms(b.mainThreadP95)}</td>
                <td>{ms(b.renderFrameP95)}</td>
                <td>{(b.slowFrameShare * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
