import { useEffect } from 'react';
import type { Studio } from '../studio/studio';
import styles from './DoodleGuess.module.css';
import { useStudioStore } from './store';

/** How long a guess stays before fading away unanswered. */
const SHOW_MS = 6000;

/**
 * The doodle model's quiet guess above what was drawn (ADR 0015). Pinching it, clicking
 * it, or pressing Y names the drawing; otherwise it fades away.
 */
export function DoodleGuess({ studio }: { studio: Studio }) {
  const guess = useStudioStore((s) => s.guess);
  useEffect(() => {
    if (!guess) return;
    const t = setTimeout(() => useStudioStore.setState({ guess: null }), SHOW_MS);
    return () => clearTimeout(t);
  }, [guess]);
  if (!guess) return null;
  return (
    <button
      type="button"
      className={styles.guess}
      style={{ left: guess.x, top: guess.y }}
      aria-label={`Name it ${guess.label} (Y)`}
      onClick={() => studio.acceptGuess()}
    >
      Looks like {/^[aeiou]/.test(guess.label) ? 'an' : 'a'} {guess.label}?
    </button>
  );
}
