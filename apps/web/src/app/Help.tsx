import { CloseIcon, IconButton, Panel } from '@afterglow/ui';
import { useEffect } from 'react';
import { command } from './commands';
import styles from './Help.module.css';
import { useStudioStore } from './store';

const GESTURES: ReadonlyArray<[string, string]> = [
  ['Pinch thumb and index finger', 'Draw, or erase with the eraser picked'],
  ['Hold up an open hand, fingers spread', 'Open the menu'],
  ['In the menu, point your palm at an item and pinch', 'Choose it'],
  ['Make a fist', 'Pause or resume drawing, or close the menu'],
  ['Two fingers up, swipe left or right', 'Undo or redo'],
  ['Pinch a guess like “Looks like a cat?”', 'Name the drawing'],
];

// Keys come from the command registry where a command has one, so this list can't drift.
const key = (id: string) => command(id).key ?? '';
const KEYS: ReadonlyArray<{ keys: string; does: string; camera?: boolean }> = [
  { keys: key('brush:neon'), does: 'Next brush' },
  { keys: key('tool:erase'), does: 'Eraser, or back to drawing' },
  { keys: '1 to 5', does: 'Colors' },
  { keys: key('size:m'), does: 'Thinner or thicker' },
  { keys: `${key('undo')}, ${key('redo')}`, does: 'Undo, redo' },
  { keys: 'Delete twice', does: 'Clear everything' },
  { keys: key('fade'), does: 'Let strokes fade, or keep them' },
  { keys: key('snap'), does: 'Snap shapes on or off' },
  { keys: key('darkroom'), does: 'Darkroom on or off', camera: true },
  { keys: 'P', does: 'Pause or resume hand drawing', camera: true },
  { keys: key('replay'), does: 'Replay as a timelapse' },
  { keys: key('video'), does: 'Record a timelapse video' },
  { keys: key('stop'), does: 'Stop a replay or recording, or close this' },
  { keys: key('still'), does: 'Save image' },
  { keys: key('svg'), does: 'Save vector image' },
  { keys: key('drawing:save'), does: 'Save drawing file' },
  { keys: key('drawing:open'), does: 'Open a drawing file' },
  { keys: 'Y', does: 'Accept the doodle guess, naming the drawing' },
  { keys: 'H', does: 'Stats' },
  { keys: '?', does: 'This help' },
];

const close = () => useStudioStore.setState({ helpOpen: false });

/**
 * Gestures and keys: shown the first time the camera is used, from the gesture menu
 * (More, Help), the dock, or ?. Hands come first with the camera, keys without it.
 */
export function Help() {
  const open = useStudioStore((s) => s.helpOpen);
  const camera = useStudioStore((s) => s.inputMode === 'camera');
  const hands = useStudioStore((s) => s.inputMode !== 'pointer');
  useEffect(() => {
    if (!open || !hands) return;
    // Hands can't click it away: it leaves on its own, or when the menu opens.
    const t = setTimeout(close, 15_000);
    return () => clearTimeout(t);
  }, [open, hands]);
  if (!open) return null;

  const gestures = (
    <section key="hands" aria-label="Gestures">
      <h3>Hands</h3>
      <dl className={styles.gestures}>
        {GESTURES.map(([gesture, effect]) => (
          <div key={gesture}>
            <dt>{gesture}</dt>
            <dd>{effect}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
  const keys = (
    <section key="keys" aria-label="Keys">
      <h3>Keys</h3>
      <dl className={styles.keys}>
        {KEYS.filter((k) => camera || !k.camera).map((k) => (
          <div key={k.does}>
            <dt>
              <kbd>{k.keys}</kbd>
            </dt>
            <dd>{k.does}</dd>
          </div>
        ))}
      </dl>
    </section>
  );

  return (
    <Panel as="section" className={styles.help} aria-label="Help">
      <header>
        <h2>Help</h2>
        <IconButton label="Close help (?)" onClick={close}>
          <CloseIcon />
        </IconButton>
      </header>
      {hands ? [gestures, keys] : [keys, gestures]}
    </Panel>
  );
}
