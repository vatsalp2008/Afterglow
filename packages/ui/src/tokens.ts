// Design tokens. The interface is the dark of a night-time field; color comes
// only from light sources. Mirrors the CSS variables in tokens.css.

export const PALETTE = {
  night: '#141A33',
  nightDeep: '#0B0F22',
  fog: '#8A93B8',
  paper: '#E9ECF5',
  sodium: '#FFB547',
  tungsten: '#FFE3B0',
  ledCyan: '#5CE1E6',
  gelMagenta: '#FF4FA3',
  gelViolet: '#9D7BFF',
} as const;

/** The light colors offered for brushes, in shortcut order (keys 1 to 5). */
export const BRUSH_COLORS = [
  { name: 'Sodium', hex: PALETTE.sodium },
  { name: 'Tungsten', hex: PALETTE.tungsten },
  { name: 'LED cyan', hex: PALETTE.ledCyan },
  { name: 'Magenta gel', hex: PALETTE.gelMagenta },
  { name: 'Violet gel', hex: PALETTE.gelViolet },
] as const;
