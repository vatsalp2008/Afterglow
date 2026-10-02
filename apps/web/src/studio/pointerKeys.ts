// Which pen a pointer event drives. Hands get their keys from HandIdentity; everything
// pointed with sits under POINTER_KEY.

export const POINTER_KEY = 'pointer';

/** True for pens driven by a mouse, a stylus, or a finger on the screen, not a tracked hand. */
export const isPointerKey = (key: string): boolean => key === POINTER_KEY || key.startsWith(`${POINTER_KEY}:`);

/**
 * The mouse and a stylus share one pen. Each finger touching the screen gets its own, so
 * several fingers paint several strokes at once, like two hands do.
 */
export function pointerKey(e: { pointerType: string; pointerId: number }): string {
  return e.pointerType === 'touch' ? `${POINTER_KEY}:touch:${String(e.pointerId)}` : POINTER_KEY;
}
