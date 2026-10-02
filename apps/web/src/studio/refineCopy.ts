// What the studio says when Refine can't finish (ADR 0016): calm, and what to do next.

export type RefineProblem =
  'rateLimited' | 'notConfigured' | 'timeout' | 'invalidOutput' | 'unavailable' | 'offline' | 'badImage';

export const REFINE_PROBLEM_COPY: Record<RefineProblem, string> = {
  rateLimited: 'Refine is resting for a minute. Try again soon.',
  notConfigured: 'Refine isn’t set up on this server yet.',
  timeout: 'Refine took too long. Try again.',
  invalidOutput: 'Refine couldn’t make sense of this one. Try again, or add a little more.',
  unavailable: 'Refine couldn’t reach its model. Try again in a moment.',
  offline: 'Refine needs an internet connection.',
  badImage: 'This drawing couldn’t be sent to Refine.',
};

/** The problem behind a failed /refine response, from its error field or status. */
export function refineProblem(status: number, error: unknown): RefineProblem {
  if (error === 'tooLarge' || error === 'badImage') return 'badImage';
  if (typeof error === 'string' && error in REFINE_PROBLEM_COPY) return error as RefineProblem;
  if (status === 429) return 'rateLimited';
  if (status === 503) return 'notConfigured';
  if (status === 504) return 'timeout';
  // No API at all (a dev server without it, say) answers 404 or a proxy error.
  return status === 404 || status === 500 ? 'notConfigured' : 'unavailable';
}
