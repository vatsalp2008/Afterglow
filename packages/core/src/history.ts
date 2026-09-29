// Stroke document with undo/redo via commands.

import type { Stroke } from './types.ts';

type Command =
  | { kind: 'add'; stroke: Stroke }
  | { kind: 'clear'; removed: Stroke[] }
  | { kind: 'replace'; removed: Stroke[]; added: Stroke[]; group: string | null };

const ids = (strokes: readonly Stroke[]) => new Set(strokes.map((s) => s.id));

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

  /**
   * Swaps strokes for others, as the eraser does. Consecutive calls with the same
   * `group` (one erase gesture) merge into a single undo step: pieces made and erased
   * again within the gesture never reach the undo history.
   */
  replace(removed: readonly Stroke[], added: readonly Stroke[], group: string | null = null): void {
    if (removed.length === 0 && added.length === 0) return;
    const top = this.undoStack[this.undoStack.length - 1];
    if (group !== null && top?.kind === 'replace' && top.group === group && this.redoStack.length === 0) {
      this.swap(removed, added);
      const gone = ids(removed);
      const pieces = ids(top.added);
      top.removed = [...top.removed, ...removed.filter((s) => !pieces.has(s.id))];
      top.added = [...top.added.filter((s) => !gone.has(s.id)), ...added];
      return;
    }
    this.run({ kind: 'replace', removed: [...removed], added: [...added], group });
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    if (cmd.kind === 'add') this.set(this.items.filter((s) => s.id !== cmd.stroke.id));
    else if (cmd.kind === 'clear') this.set(cmd.removed);
    else this.swap(cmd.added, cmd.removed);
    this.redoStack.push(cmd);
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
    if (cmd.kind === 'add') this.set([...this.items, cmd.stroke]);
    else if (cmd.kind === 'clear') this.set([]);
    else this.swap(cmd.removed, cmd.added);
  }

  private swap(out: readonly Stroke[], into: readonly Stroke[]): void {
    const gone = ids(out);
    this.set([...this.items.filter((s) => !gone.has(s.id)), ...into]);
  }

  private set(items: Stroke[]): void {
    this.items = items;
    this.version += 1;
  }
}
