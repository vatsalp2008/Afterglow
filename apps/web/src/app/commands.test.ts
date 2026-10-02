import { levelLayout } from '@afterglow/core';
import { describe, expect, it } from 'vitest';
import { command, isEnabled, menuEntry, menuTree } from './commands';
import { useStudioStore, type StudioState } from './store';

const state = (patch: Partial<StudioState> = {}): StudioState => ({ ...useStudioStore.getState(), ...patch });

describe('menuTree', () => {
  it('puts the eight tools in the ring, Undo at the bottom', () => {
    const tree = menuTree(state({ inputMode: 'camera' }));
    expect(levelLayout(tree).map((i) => i?.id)).toEqual([
      'menu:brush',
      'menu:color',
      'menu:size',
      'tool:erase',
      'undo',
      'redo',
      'menu:clear',
      'menu:more',
    ]);
  });

  it('keeps Undo and Redo open, and disables what has nothing to act on', () => {
    const empty = menuTree(state());
    const undo = empty.find((i) => i.id === 'undo')!;
    expect(undo).toMatchObject({ keepOpen: true, disabled: true });
    expect(empty.find((i) => i.id === 'menu:clear')?.disabled).toBe(true);
    const drawn = menuTree(state({ canUndo: true, strokeCount: 2 }));
    expect(drawn.find((i) => i.id === 'undo')?.disabled).toBe(false);
    expect(drawn.find((i) => i.id === 'menu:clear')?.disabled).toBe(false);
  });

  it('confirms a clear with Keep where Clear was and Clear everything opposite', () => {
    const clear = menuTree(state({ strokeCount: 1 })).find((i) => i.id === 'menu:clear')!;
    const wedges = levelLayout(clear.children!, clear.slots);
    // Clear is wedge 6 of the ring (left); its confirm ring keeps that wedge for Keep.
    expect(wedges[6]?.id).toBe('clear:keep');
    expect(wedges[2]?.id).toBe('clear');
  });

  it('saves the image, the vector image, the drawing file, and the video from More', () => {
    const save = (s: StudioState) =>
      menuTree(s)
        .find((i) => i.id === 'menu:more')!
        .children!.find((i) => i.id === 'menu:save')!;
    expect(save(state({ strokeCount: 1 })).children!.map((i) => i.id)).toEqual([
      'still',
      'svg',
      'drawing:save',
      'video',
    ]);
    expect(save(state({ strokeCount: 1 })).disabled).toBe(false);
    expect(save(state({ strokeCount: 0 })).disabled).toBe(true);
  });

  it('leaves opening a file to the mouse and keyboard', () => {
    const ids = (items: ReturnType<typeof menuTree>): string[] =>
      items.flatMap((i) => [i.id, ...ids(i.children ?? [])]);
    expect(ids(menuTree(state({ strokeCount: 1 })))).not.toContain('drawing:open');
  });

  it('offers only Stop during a replay', () => {
    expect(menuTree(state({ replaying: true })).map((i) => i.id)).toEqual(['stop']);
  });

  it('shows darkroom only with the camera', () => {
    const more = (s: StudioState) =>
      menuTree(s)
        .find((i) => i.id === 'menu:more')!
        .children!.map((i) => i.id);
    expect(more(state({ inputMode: 'camera' }))).toContain('darkroom');
    expect(more(state({ inputMode: 'fixture' }))).not.toContain('darkroom');
  });
});

describe('commands', () => {
  it('describe every menu item', () => {
    const s = state({ inputMode: 'camera', strokeCount: 1 });
    const all = (items: ReturnType<typeof menuTree>): string[] =>
      items.flatMap((i) => [i.id, ...all(i.children ?? [])]);
    const ids = all(menuTree(s));
    for (const id of ids) expect(menuEntry(id, s).label.length).toBeGreaterThan(0);
  });

  it('change the settings they name', () => {
    command('brush:sparks').run(null as never, state());
    expect(useStudioStore.getState()).toMatchObject({ brush: 'sparks', tool: 'draw' });
    command('tool:erase').run(null as never, useStudioStore.getState());
    expect(useStudioStore.getState().tool).toBe('erase');
    expect(command('tool:erase').label(useStudioStore.getState())).toBe('Draw');
    command('size:l').run(null as never, useStudioStore.getState());
    expect(useStudioStore.getState().size).toBe('l');
    expect(isEnabled(command('darkroom'), state({ inputMode: 'pointer' }))).toBe(false);
  });

  it('refuse unknown ids', () => {
    expect(() => command('nope')).toThrow('No command "nope"');
  });
});
