// Brush sizes are app settings, in canvas units (the frame is 1000 units tall).
export const SIZES = { s: 6, m: 11, l: 18 } as const;
/** Eraser radius per size setting, in canvas units: wider than the brush, so erasing is forgiving. */
export const ERASER_RADII = { s: 12, m: 22, l: 38 } as const;
export type SizeId = keyof typeof SIZES;
