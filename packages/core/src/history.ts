// Stroke document with undo/redo via commands.

import type { Stroke } from './types.ts';

type Command = { kind: 'add'; stroke: Stroke } | { kind: 'clear'; removed: Stroke[] };

export class History {
  private items: Stroke[] = [];
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  /** Increments on every change, so observers can skip work when nothing changed. */
  version = 0;

  get strokes(): readonly Stroke[] {
    return this.items;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  add(stroke: Stroke): void {
    this.run({ kind: 'add', stroke });
  }

  clear(): void {
    if (this.items.length === 0) return;
    this.run({ kind: 'clear', removed: this.items });
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'add') this.items = this.items.filter((s) => s.id !== cmd.stroke.id);
    else this.items = cmd.removed;
    this.redoStack.push(cmd);
    this.version += 1;
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    this.apply(cmd);
    this.undoStack.push(cmd);
    return true;
  }

  private run(cmd: Command): void {
    this.apply(cmd);
    this.undoStack.push(cmd);
    this.redoStack = [];
  }

  private apply(cmd: Command): void {
    this.items = cmd.kind === 'add' ? [...this.items, cmd.stroke] : [];
    this.version += 1;
  }
}
