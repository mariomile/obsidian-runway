import { PluginSettingTab, Setting } from 'obsidian';
import type { App } from 'obsidian';

import type RunwayPlugin from './main.ts';
import type { TaskGroup, TaskSort } from './types.ts';

export class RunwaySettingTab extends PluginSettingTab {
  private readonly plugin: RunwayPlugin;

  constructor(app: App, plugin: RunwayPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('One per line. Tasks in these folders are not indexed.')
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.excludeFolders.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludeFolders = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== '');
            await this.plugin.saveSettingsAndRescan();
          });
        text.inputEl.rows = 4;
      });

    new Setting(containerEl)
      .setName('Inbox folders')
      .setDesc('One per line. Tasks in these folders land in the Inbox section of the group-by-note view.')
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.inboxFolders.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.inboxFolders = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line !== '');
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 3;
      });

    new Setting(containerEl)
      .setName('"Upcoming" days in sidebar')
      .setDesc('Horizon of the Upcoming section in the sidebar (0 to hide it).')
      .addSlider((slider) =>
        slider
          .setLimits(0, 31, 1)
          .setValue(this.plugin.settings.sidebarUpcomingDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.sidebarUpcomingDays = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Agenda horizon')
      .setDesc('Future days shown as individual buckets in the Agenda grouping, before "Later".')
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.agendaHorizonDays)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.agendaHorizonDays = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Daily note folder')
      .setDesc('Default target for quick-add.')
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFolder).onChange(async (value) => {
          this.plugin.settings.dailyFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Daily note format')
      .setDesc('Supported tokens: DD, MM, YYYY.')
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFormat).onChange(async (value) => {
          this.plugin.settings.dailyFormat = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Quick-add heading')
      .setDesc('If present in the note, the task is inserted under this heading (e.g. "## Tasks"). Empty = end of note.')
      .addText((text) =>
        text.setValue(this.plugin.settings.quickAddHeading).onChange(async (value) => {
          this.plugin.settings.quickAddHeading = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Default sort')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ due: 'By due date', priority: 'By priority', path: 'By note' })
          .setValue(this.plugin.settings.defaultSort)
          .onChange(async (value) => {
            this.plugin.settings.defaultSort = value as TaskSort;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Default grouping')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            note: 'By note',
            none: 'None',
            date: 'By date',
            agenda: 'Agenda',
            priority: 'By priority',
            tag: 'By tag',
            folder: 'By folder',
          })
          .setValue(this.plugin.settings.defaultGroup)
          .onChange(async (value) => {
            this.plugin.settings.defaultGroup = value as TaskGroup;
            await this.plugin.saveSettings();
          }),
      );

    if (this.plugin.settings.savedViews.length > 0) {
      new Setting(containerEl).setName('Saved views').setHeading();
      for (const view of this.plugin.settings.savedViews) {
        new Setting(containerEl).setName(view.name).addExtraButton((button) =>
          button
            .setIcon('trash')
            .setTooltip('Delete view')
            .onClick(async () => {
              this.plugin.settings.savedViews = this.plugin.settings.savedViews.filter(
                (candidate) => candidate.name !== view.name,
              );
              await this.plugin.saveSettings();
              this.display();
            }),
        );
      }
    }
  }
}
