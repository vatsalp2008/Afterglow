export const PALETTE = {
  night: '#141A33',
  fog: '#8A93B8',
  paper: '#E9ECF5',
  sodium: '#FFB547',
  tungsten: '#FFE3B0',
  ledCyan: '#5CE1E6',
  gelMagenta: '#FF4FA3',
  gelViolet: '#9D7BFF',
} as const;

export const BRUSH_COLORS = [
  { name: 'Sodium', hex: PALETTE.sodium },
  { name: 'Tungsten', hex: PALETTE.tungsten },
  { name: 'LED cyan', hex: PALETTE.ledCyan },
  { name: 'Magenta gel', hex: PALETTE.gelMagenta },
  { name: 'Violet gel', hex: PALETTE.gelViolet },
] as const;

export const SIZES = { s: 6, m: 11, l: 18 } as const;
export type SizeId = keyof typeof SIZES;
