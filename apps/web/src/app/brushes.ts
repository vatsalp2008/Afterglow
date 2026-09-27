// Brush sizes are app settings, in canvas units (the frame is 1000 units tall).
export const SIZES = { s: 6, m: 11, l: 18 } as const;
export type SizeId = keyof typeof SIZES;
