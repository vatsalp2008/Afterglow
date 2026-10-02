// Everything the studio can do, in one place: the gesture menu, the dock, and the
// keyboard shortcuts all run these commands, so their labels and effects can't drift
// apart. The menu tree is built from them too.

import type { BrushId, MenuItem } from '@afterglow/core';
import {
  BRUSH_COLORS,
  ClearIcon,
  EraserIcon,
  FadeIcon,
  FileIcon,
  FixIcon,
  HelpIcon,
  InkIcon,
  KeepIcon,
  MoonIcon,
  MoreIcon,
  NeonIcon,
  OpenIcon,
  PlayIcon,
  RecordIcon,
  RedoIcon,
  RibbonIcon,
  SaveIcon,
  SparksIcon,
  StillIcon,
  StopIcon,
  UndoIcon,
  VectorIcon,
} from '@afterglow/ui';
import type { ReactNode } from 'react';
import type { Studio } from '../studio/studio';
import { SIZES, type SizeId } from './brushes';
import { SizeDot, Swatch } from './CommandIcons';
import { useStudioStore, type StudioState } from './store';

export interface Command {
  id: string;
  label: (s: StudioState) => string;
  icon: (s: StudioState) => ReactNode;
  run: (studio: Studio, s: StudioState) => void;
  /** Keyboard shortcut, shown in the dock's labels. */
  key?: string;
  enabled?: (s: StudioState) => boolean;
  pressed?: (s: StudioState) => boolean;
  /** What to confirm after running it by gesture, from the new state. Defaults to the label. */
  done?: (s: StudioState) => string;
}

export const BRUSHES: Array<{ id: BrushId; label: string; icon: ReactNode }> = [
  { id: 'neon', label: 'Neon', icon: <NeonIcon /> },
  { id: 'sparks', label: 'Sparks', icon: <SparksIcon /> },
  { id: 'ribbon', label: 'Ribbon', icon: <RibbonIcon /> },
  { id: 'ink', label: 'Ink, no glow', icon: <InkIcon /> },
];

export const SIZE_LABELS: Record<SizeId, string> = { s: 'Thin', m: 'Medium', l: 'Thick' };

/** The modifier for Save and Open shortcuts, as the platform names it. */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? 'Cmd' : 'Ctrl';

const set = useStudioStore.setState;
const hasStrokes = (s: StudioState) => s.strokeCount > 0;

const list: Command[] = [
  ...BRUSHES.map((b): Command => ({
    id: `brush:${b.id}`,
    label: () => b.label,
    icon: () => b.icon,
    key: 'B',
    run: () => set({ brush: b.id, tool: 'draw' }),
    pressed: (s) => s.tool === 'draw' && s.brush === b.id,
  })),
  {
    id: 'tool:erase',
    label: (s) => (s.tool === 'erase' ? 'Draw' : 'Eraser'),
    icon: () => <EraserIcon />,
    key: 'E',
    run: (_, s) => set({ tool: s.tool === 'erase' ? 'draw' : 'erase' }),
    pressed: (s) => s.tool === 'erase',
    done: (s) => (s.tool === 'erase' ? 'Eraser: pinch over lines to erase them' : `Drawing with ${s.brush}`),
  },
  ...BRUSH_COLORS.map((c, i): Command => ({
    id: `color:${c.hex}`,
    label: () => c.name,
    icon: () => <Swatch hex={c.hex} />,
    key: String(i + 1),
    run: () => set({ color: c.hex, tool: 'draw' }),
    pressed: (s) => s.color === c.hex,
  })),
  ...(Object.keys(SIZES) as SizeId[]).map((id): Command => ({
    id: `size:${id}`,
    label: () => SIZE_LABELS[id],
    icon: () => <SizeDot size={id} />,
    key: '[ and ]',
    run: () => set({ size: id }),
    pressed: (s) => s.size === id,
  })),
  {
    id: 'undo',
    label: () => 'Undo',
    icon: () => <UndoIcon />,
    key: 'Z',
    run: (studio) => studio.undo(),
    enabled: (s) => s.canUndo && !s.replaying,
  },
  {
    id: 'redo',
    label: () => 'Redo',
    icon: () => <RedoIcon />,
    key: 'Shift Z',
    run: (studio) => studio.redo(),
    enabled: (s) => s.canRedo && !s.replaying,
  },
  {
    id: 'clear',
    label: () => 'Clear everything',
    icon: () => <ClearIcon />,
    run: (studio) => studio.clear(),
    enabled: (s) => hasStrokes(s) && !s.replaying,
    done: () => 'Canvas cleared. Undo brings it back.',
  },
  {
    id: 'clear:keep',
    label: () => 'Keep it',
    icon: () => <KeepIcon />,
    run: () => undefined,
    done: () => 'Kept',
  },
  {
    id: 'fade',
    label: (s) => (s.fade ? 'Keep strokes' : 'Let strokes fade'),
    icon: (s) => (s.fade ? <FixIcon /> : <FadeIcon />),
    key: 'F',
    run: (_, s) => set({ fade: !s.fade }),
    pressed: (s) => s.fade,
    done: (s) => (s.fade ? 'Strokes fade like a long exposure' : 'Strokes stay'),
  },
  {
    id: 'darkroom',
    label: (s) => (s.darkroom ? 'Darkroom off' : 'Darkroom on'),
    icon: () => <MoonIcon />,
    key: 'D',
    run: (_, s) => set({ darkroom: !s.darkroom }),
    enabled: (s) => s.inputMode === 'camera',
    pressed: (s) => s.darkroom,
    done: (s) => (s.darkroom ? 'Darkroom on' : 'Darkroom off'),
  },
  {
    id: 'replay',
    label: () => 'Replay as timelapse',
    icon: () => <PlayIcon />,
    key: 'T',
    run: (studio) => studio.startReplay(),
    enabled: hasStrokes,
    done: () => 'Replaying. Open the menu to stop.',
  },
  {
    id: 'still',
    label: () => 'Save image',
    icon: () => <StillIcon />,
    key: 'S',
    run: (studio) => void studio.saveStill(),
    enabled: hasStrokes,
    // saveStill confirms once the file is written.
    done: () => '',
  },
  {
    id: 'svg',
    label: () => 'Save vector image (SVG)',
    icon: () => <VectorIcon />,
    key: 'Shift S',
    run: (studio) => studio.saveSvg(),
    enabled: hasStrokes,
    done: () => '',
  },
  {
    id: 'drawing:save',
    label: () => 'Save drawing file',
    icon: () => <FileIcon />,
    key: `${MOD_KEY} S`,
    run: (studio) => studio.saveDrawing(),
    enabled: hasStrokes,
    done: () => '',
  },
  {
    // Not in the gesture menu: browsers only show a file picker after a click or a key.
    id: 'drawing:open',
    label: () => 'Open a drawing file',
    icon: () => <OpenIcon />,
    key: `${MOD_KEY} O`,
    run: (studio) => void studio.openDrawingFile(),
  },
  {
    id: 'video',
    label: () => 'Record timelapse video',
    icon: () => <RecordIcon />,
    key: 'V',
    run: (studio) => studio.startReplay(true),
    enabled: hasStrokes,
    done: () => 'Recording the timelapse. Open the menu to stop.',
  },
  {
    id: 'stop',
    label: (s) => (s.recordingVideo ? 'Stop recording' : 'Stop replay'),
    icon: () => <StopIcon />,
    key: 'Esc',
    run: (studio) => studio.stopReplay(),
    done: () => '',
  },
  {
    id: 'help',
    label: () => 'Help',
    icon: () => <HelpIcon />,
    run: () => set({ helpOpen: true }),
    done: () => '',
  },
];

const byId = new Map(list.map((c) => [c.id, c]));

export function command(id: string): Command {
  const c = byId.get(id);
  if (!c) throw new Error(`No command "${id}"`);
  return c;
}

export const isEnabled = (c: Command, s: StudioState) => c.enabled?.(s) ?? true;

/** Runs a command chosen by gesture and confirms it with a toast. */
export function runByGesture(id: string, studio: Studio, showToast: (text: string) => void): void {
  const c = command(id);
  const before = useStudioStore.getState();
  if (!isEnabled(c, before)) return;
  c.run(studio, before);
  const text = c.done ? c.done(useStudioStore.getState()) : c.label(before);
  if (text) showToast(text);
}

// ---- the gesture menu ------------------------------------------------------------

const SUBMENUS: Record<string, { label: string; icon: (s: StudioState) => ReactNode }> = {
  'menu:brush': { label: 'Brush', icon: (s) => BRUSHES.find((b) => b.id === s.brush)?.icon },
  'menu:color': { label: 'Color', icon: (s) => <Swatch hex={s.color} /> },
  'menu:size': { label: 'Size', icon: (s) => <SizeDot size={s.size} /> },
  'menu:clear': { label: 'Clear', icon: () => <ClearIcon /> },
  'menu:more': { label: 'More', icon: () => <MoreIcon /> },
  'menu:save': { label: 'Save', icon: () => <SaveIcon /> },
};

/** How a menu item looks: a submenu or a command. */
export function menuEntry(id: string, s: StudioState): { label: string; icon: ReactNode; pressed: boolean } {
  const sub = SUBMENUS[id];
  if (sub) return { label: sub.label, icon: sub.icon(s), pressed: false };
  const c = command(id);
  return { label: c.label(s), icon: c.icon(s), pressed: c.pressed?.(s) ?? false };
}

const item = (id: string, s: StudioState, extra: Partial<MenuItem> = {}): MenuItem => {
  const c = command(id);
  return { id, disabled: !isEnabled(c, s), ...extra };
};

/**
 * The ring, clockwise from the top: Brush, Color, Size, Eraser, Undo (at the bottom),
 * Redo, Clear, More. During a replay it holds one item, Stop. Clear's confirmation puts
 * "Keep it" where Clear was and "Clear everything" opposite, so a second pinch in place
 * can't clear by accident (ADR 0009).
 */
export function menuTree(s: StudioState): MenuItem[] {
  if (s.replaying) return [item('stop', s)];
  return [
    { id: 'menu:brush', children: BRUSHES.map((b) => item(`brush:${b.id}`, s)) },
    { id: 'menu:color', children: BRUSH_COLORS.map((c) => item(`color:${c.hex}`, s)) },
    { id: 'menu:size', children: (Object.keys(SIZES) as SizeId[]).map((id) => item(`size:${id}`, s)) },
    item('tool:erase', s),
    item('undo', s, { keepOpen: true }),
    item('redo', s, { keepOpen: true }),
    {
      id: 'menu:clear',
      disabled: !hasStrokes(s),
      slots: 8,
      children: [item('clear:keep', s, { slot: 6 }), item('clear', s, { slot: 2 })],
    },
    {
      id: 'menu:more',
      children: [
        item('fade', s),
        ...(s.inputMode === 'camera' ? [item('darkroom', s)] : []),
        item('replay', s),
        {
          id: 'menu:save',
          disabled: !hasStrokes(s),
          children: [item('still', s), item('svg', s), item('drawing:save', s), item('video', s)],
        },
        item('help', s),
      ],
    },
  ];
}
