import type { App } from 'obsidian';

import type { TaskEditService } from '../edits/task-edit.ts';
import type { TaskIndexService } from '../index/index-service.ts';
import type { RunwaySettings } from '../types.ts';

/** Everything a Runway view needs, injected by the plugin. */
export interface RunwayContext {
  app: App;
  settings: RunwaySettings;
  index: TaskIndexService;
  edits: TaskEditService;
  saveSettings(): Promise<void>;
  openListView(): Promise<void>;
  onQuickAdd(): void;
}
