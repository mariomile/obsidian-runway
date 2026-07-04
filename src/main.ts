import { Plugin } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';

import { createRunwayApi } from './api.ts';
import { DEFAULT_FILTER } from './core/query.ts';
import { TaskEditService } from './edits/task-edit.ts';
import { TaskIndexService } from './index/index-service.ts';
import { DEFAULT_SETTINGS, isExcludedPath, parseSettings } from './settings.ts';
import { RunwaySettingTab } from './settings-tab.ts';
import { QuickAddModal } from './ui/quick-add-modal.ts';
import { RunwayListView, VIEW_TYPE_LIST } from './ui/list-view.ts';
import { RunwaySidebarView, VIEW_TYPE_SIDEBAR } from './ui/sidebar-view.ts';
import type { RunwayApi } from './api.ts';
import type { RunwayContext } from './ui/context.ts';
import type { TaskPanelState } from './ui/task-panel.ts';
import type { DayKey, RunwaySettings } from './types.ts';

export default class RunwayPlugin extends Plugin {
  settings: RunwaySettings = structuredClone(DEFAULT_SETTINGS);
  /** Programmatic surface for agents (Exo) and sibling plugins. */
  api!: RunwayApi;
  private index!: TaskIndexService;
  private edits!: TaskEditService;

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
    await this.seedFromDailyNotesConfig();

    this.index = new TaskIndexService(this.app, (path) =>
      isExcludedPath(path, this.settings.excludeFolders),
    );
    this.edits = new TaskEditService(this.app, () => this.settings);
    this.index.start(this);
    this.api = createRunwayApi(this.index, this.edits, (day) => this.openForDay(day));

    const ctx = this.context();
    this.registerView(VIEW_TYPE_SIDEBAR, (leaf) => new RunwaySidebarView(leaf, ctx));
    this.registerView(VIEW_TYPE_LIST, (leaf) => new RunwayListView(leaf, ctx));

    this.addRibbonIcon('plane-takeoff', 'Runway: apri lista task', () => {
      void this.openListView();
    });

    this.addCommand({
      id: 'open-list',
      name: 'Apri lista task',
      callback: () => void this.openListView(),
    });
    this.addCommand({
      id: 'open-sidebar',
      name: 'Apri sidebar task',
      callback: () => void this.openSidebarView(),
    });
    this.addCommand({
      id: 'quick-add',
      name: 'Nuovo task (quick-add)',
      callback: () => new QuickAddModal(this.context()).open(),
    });

    this.addSettingTab(new RunwaySettingTab(this.app, this));
  }

  context(): RunwayContext {
    return {
      app: this.app,
      settings: this.settings,
      index: this.index,
      edits: this.edits,
      saveSettings: () => this.saveSettings(),
      openListView: () => this.openListView(),
    };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async saveSettingsAndRescan(): Promise<void> {
    await this.saveSettings();
    await this.index.rescan((path) => isExcludedPath(path, this.settings.excludeFolders));
  }

  async openListView(state?: Partial<TaskPanelState>): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_LIST)[0];
    const leaf = existing ?? this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_LIST, active: true, state: state ?? {} });
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Open the full list focused on a single day (Horizon cross-link / agent). */
  async openForDay(day: DayKey): Promise<void> {
    await this.openListView({
      filter: { ...structuredClone(DEFAULT_FILTER), exactDay: day },
      group: 'none',
    });
  }

  async openSidebarView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_SIDEBAR)[0];
    if (existing) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_SIDEBAR, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /**
   * First run only: mirror the core daily-notes config (folder/format) so the
   * quick-add default target agrees with the vault.
   */
  private async seedFromDailyNotesConfig(): Promise<void> {
    if ((await this.loadData()) !== null) return;
    try {
      const raw = await this.app.vault.adapter.read(
        `${this.app.vault.configDir}/daily-notes.json`,
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const config = parsed as Record<string, unknown>;
      if (typeof config.folder === 'string' && config.folder !== '') {
        this.settings.dailyFolder = config.folder;
      }
      if (typeof config.format === 'string' && config.format !== '') {
        this.settings.dailyFormat = config.format;
      }
      await this.saveSettings();
    } catch {
      // No daily-notes.json (or unreadable): the defaults stand.
    }
  }
}
