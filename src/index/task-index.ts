import type { Task } from '../types.ts';

/**
 * Pure index core: tasks bucketed by file path, with a cached flat snapshot.
 * All vault/event wiring lives in the service; this stays trivially testable.
 */
export class TaskIndexCore {
  private readonly byPath = new Map<string, Task[]>();
  private readonly listeners = new Set<() => void>();
  private snapshot: Task[] | null = null;

  setFile(path: string, tasks: Task[]): void {
    if (tasks.length === 0) {
      if (!this.byPath.delete(path)) return;
    } else {
      this.byPath.set(path, tasks);
    }
    this.snapshot = null;
  }

  removeFile(path: string): void {
    if (this.byPath.delete(path)) this.snapshot = null;
  }

  renameFile(oldPath: string, newPath: string, folder: string): void {
    const tasks = this.byPath.get(oldPath);
    if (!tasks) return;
    this.byPath.delete(oldPath);
    this.byPath.set(
      newPath,
      tasks.map((task) => ({ ...task, path: newPath, folder })),
    );
    this.snapshot = null;
  }

  clear(): void {
    this.byPath.clear();
    this.snapshot = null;
  }

  all(): Task[] {
    if (this.snapshot === null) {
      this.snapshot = [...this.byPath.values()].flat();
    }
    return this.snapshot;
  }

  fileCount(): number {
    return this.byPath.size;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }
}
