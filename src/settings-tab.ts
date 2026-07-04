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
      .setName('Cartelle escluse')
      .setDesc('Una per riga. I task in queste cartelle non vengono indicizzati.')
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
      .setName('Cartelle Inbox')
      .setDesc('Una per riga. I task in queste cartelle finiscono nella sezione Inbox del raggruppamento per nota.')
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
      .setName('Giorni "Prossimi" in sidebar')
      .setDesc('Orizzonte della sezione Upcoming nella sidebar (0 per nasconderla).')
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
      .setName('Cartella daily note')
      .setDesc('Destinazione di default del quick-add.')
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFolder).onChange(async (value) => {
          this.plugin.settings.dailyFolder = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Formato daily note')
      .setDesc('Token supportati: DD, MM, YYYY.')
      .addText((text) =>
        text.setValue(this.plugin.settings.dailyFormat).onChange(async (value) => {
          this.plugin.settings.dailyFormat = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Heading quick-add')
      .setDesc('Se presente nella nota, il task viene inserito sotto questo heading (es. "## Tasks"). Vuoto = fine nota.')
      .addText((text) =>
        text.setValue(this.plugin.settings.quickAddHeading).onChange(async (value) => {
          this.plugin.settings.quickAddHeading = value.trim();
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Ordinamento di default')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ due: 'Per scadenza', priority: 'Per priorità', path: 'Per nota' })
          .setValue(this.plugin.settings.defaultSort)
          .onChange(async (value) => {
            this.plugin.settings.defaultSort = value as TaskSort;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Raggruppamento di default')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            note: 'Per nota',
            none: 'Nessuno',
            date: 'Per data',
            priority: 'Per priorità',
            tag: 'Per tag',
            folder: 'Per cartella',
          })
          .setValue(this.plugin.settings.defaultGroup)
          .onChange(async (value) => {
            this.plugin.settings.defaultGroup = value as TaskGroup;
            await this.plugin.saveSettings();
          }),
      );

    if (this.plugin.settings.savedViews.length > 0) {
      new Setting(containerEl).setName('Viste salvate').setHeading();
      for (const view of this.plugin.settings.savedViews) {
        new Setting(containerEl).setName(view.name).addExtraButton((button) =>
          button
            .setIcon('trash')
            .setTooltip('Elimina vista')
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
