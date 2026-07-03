import type { App, CachedMetadata, Plugin, TAbstractFile, TFile } from 'obsidian';

import { parseTaskLine } from '../core/parse.ts';
import { topLevelFolder } from '../utils.ts';
import { TaskIndexCore } from './task-index.ts';
import type { Task } from '../types.ts';

const SCAN_CHUNK = 32;
const EMIT_DEBOUNCE_MS = 300;

function isMarkdownFile(file: TAbstractFile): file is TFile {
  return 'extension' in file && (file as TFile).extension === 'md';
}

/** Task lines of a file, straight from Obsidian's own list-item cache. */
export function extractTasks(path: string, content: string, cache: CachedMetadata): Task[] {
  const items = cache.listItems ?? [];
  if (items.length === 0) return [];
  const lines = content.split('\n');
  const folder = topLevelFolder(path);
  const tasks: Task[] = [];
  for (const item of items) {
    if (item.task === undefined) continue;
    const line = item.position.start.line;
    const rawText = lines[line];
    if (rawText === undefined) continue;
    const parsed = parseTaskLine(rawText);
    if (!parsed) continue;
    tasks.push({ ...parsed, path, line, rawText, folder });
  }
  return tasks;
}

/**
 * Keeps the TaskIndexCore in sync with the vault: chunked initial scan of
 * task-bearing files only (the list-item cache is a free pre-filter), then
 * incremental per-file updates from metadataCache/vault events.
 */
export class TaskIndexService {
  private readonly app: App;
  private isExcluded: (path: string) => boolean;
  readonly core = new TaskIndexCore();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ready = false;

  constructor(app: App, isExcluded: (path: string) => boolean) {
    this.app = app;
    this.isExcluded = isExcluded;
  }

  all(): Task[] {
    return this.core.all();
  }

  isReady(): boolean {
    return this.ready;
  }

  subscribe(listener: () => void): () => void {
    return this.core.subscribe(listener);
  }

  start(plugin: Plugin): void {
    plugin.registerEvent(
      this.app.metadataCache.on('changed', (file, data, cache) => {
        if (this.isExcluded(file.path)) return;
        this.core.setFile(file.path, extractTasks(file.path, data, cache));
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('delete', (file) => {
        if (!isMarkdownFile(file)) return;
        this.core.removeFile(file.path);
        this.queueNotify();
      }),
    );
    plugin.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (!isMarkdownFile(file)) return;
        if (this.isExcluded(file.path)) {
          this.core.removeFile(oldPath);
        } else {
          this.core.renameFile(oldPath, file.path, topLevelFolder(file.path));
          // A move out of an excluded folder needs a real read; cheap and rare.
          if (!this.core.all().some((task) => task.path === file.path)) {
            void this.indexFile(file);
          }
        }
        this.queueNotify();
      }),
    );
    plugin.register(() => {
      if (this.timer !== null) clearTimeout(this.timer);
    });
    this.app.workspace.onLayoutReady(() => {
      void this.initialScan();
    });
  }

  /** Swap the exclusion predicate (settings change) and rebuild. */
  async rescan(isExcluded: (path: string) => boolean): Promise<void> {
    this.isExcluded = isExcluded;
    this.core.clear();
    await this.initialScan();
  }

  private async indexFile(file: TFile): Promise<void> {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return;
    const content = await this.app.vault.cachedRead(file);
    this.core.setFile(file.path, extractTasks(file.path, content, cache));
  }

  private async initialScan(): Promise<void> {
    const taskFiles: TFile[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.isExcluded(file.path)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const hasTasks = cache?.listItems?.some((item) => item.task !== undefined) ?? false;
      if (hasTasks) taskFiles.push(file);
    }
    for (let i = 0; i < taskFiles.length; i += SCAN_CHUNK) {
      const chunk = taskFiles.slice(i, i + SCAN_CHUNK);
      await Promise.all(chunk.map((file) => this.indexFile(file)));
    }
    this.ready = true;
    this.core.notify();
  }

  private queueNotify(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.core.notify();
    }, EMIT_DEBOUNCE_MS);
  }
}
