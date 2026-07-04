import { ItemView } from 'obsidian';
import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';

import { TaskPanel } from './task-panel.ts';
import type { RunwayContext } from './context.ts';
import type { TaskPanelState } from './task-panel.ts';

export const VIEW_TYPE_LIST = 'runway-list';

/** Full-page task list: the shared TaskPanel at full density. */
export class RunwayListView extends ItemView {
  private readonly ctx: RunwayContext;
  private panel: TaskPanel | null = null;
  private pending: Partial<TaskPanelState> = {};

  constructor(leaf: WorkspaceLeaf, ctx: RunwayContext) {
    super(leaf);
    this.ctx = ctx;
  }

  getViewType(): string {
    return VIEW_TYPE_LIST;
  }

  getDisplayText(): string {
    return 'Runway';
  }

  getIcon(): string {
    return 'plane-takeoff';
  }

  getState(): Record<string, unknown> {
    return (this.panel ? this.panel.getState() : this.pending) as Record<string, unknown>;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (typeof state === 'object' && state !== null) {
      this.pending = state as Partial<TaskPanelState>;
      if (this.panel) this.mountPanel();
    }
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.mountPanel();
  }

  async onClose(): Promise<void> {
    this.panel?.unmount();
    this.panel = null;
  }

  private mountPanel(): void {
    this.panel?.unmount();
    this.contentEl.empty();
    this.panel = new TaskPanel(this.contentEl, this.ctx, this.pending, {
      compact: false,
      title: 'Runway',
      onStateChange: () => this.app.workspace.requestSaveLayout(),
    });
    this.panel.mount();
  }
}
