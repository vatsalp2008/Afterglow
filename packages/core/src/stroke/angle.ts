// Axial angles: the direction of a pen nib, where θ and θ + π are the same line.

/** The smallest turn from one axial angle to another, in (−π/2, π/2]. */
export function axialDelta(from: number, to: number): number {
  let d = (to - from) % Math.PI;
  if (d > Math.PI / 2) d -= Math.PI;
  else if (d <= -Math.PI / 2) d += Math.PI;
  return d;
}

/** Interpolates between axial angles the short way round. */
export function lerpAxial(a: number, b: number, u: number): number {
  return a + axialDelta(a, b) * u;
}

/**
 * Picks θ, θ + π, or θ − π for each angle, whichever is nearest the one before, so a
 * sequence never jumps by half a turn (which would flip a nib's sides and draw a false twist).
 */
export function unwrapAxial(angles: readonly number[]): number[] {
  const out: number[] = [];
  for (const a of angles) {
    const prev = out[out.length - 1];
    out.push(prev === undefined ? a : prev + axialDelta(prev, a));
  }
  return out;
}
