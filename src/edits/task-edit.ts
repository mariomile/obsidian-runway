import { Notice } from 'obsidian';
import type { App, TFile } from 'obsidian';

import { applyLineEdit } from '../core/line-edit.ts';
import { parseTaskLine } from '../core/parse.ts';
import {
  removeDateField,
  rewriteDate,
  rewriteDescription,
  rewritePriority,
  transitionStatus,
} from '../core/serialize.ts';
import { todayKey } from '../dates.ts';
import { appendTaskLine, applyDailyTemplate, dailyNotePath } from './daily-note.ts';
import type { LineRef } from '../core/line-edit.ts';
import type { DateEmoji, DayKey, Priority, RunwaySettings, TaskStatus } from '../types.ts';

export interface TaskRef extends LineRef {
  path: string;
}

interface EditOptions {
  /** Suppress per-edit Notices (undo re-application reports once). */
  silent?: boolean;
}

/** All write paths of the plugin: guarded line edits + quick-add appends. */
export class TaskEditService {
  private readonly app: App;
  private readonly getSettings: () => RunwaySettings;

  constructor(app: App, getSettings: () => RunwaySettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  async openAtLine(ref: TaskRef): Promise<void> {
    const file = this.app.vault.getFileByPath(ref.path);
    if (!file) return;
    await this.app.workspace.getLeaf().openFile(file, { eState: { line: ref.line } });
  }

  /**
   * Status transition from a view. Recurring tasks are opened at the line
   * instead: creating the next occurrence needs a recurrence engine, and a
   * blind toggle would corrupt the series.
   */
  async setStatus(ref: TaskRef, target: Exclude<TaskStatus, 'unknown'>): Promise<boolean> {
    const parsed = parseTaskLine(ref.rawText);
    if (!parsed || parsed.status === 'unknown') return false;
    if (target === 'done' && ref.rawText.includes('🔁')) {
      new Notice('Runway: i task ricorrenti si completano dal file — te lo apro.');
      await this.openAtLine(ref);
      return false;
    }
    return this.editLine(ref, (line) => transitionStatus(line, target, todayKey()));
  }

  /** Rewrite one date field; success Notice carries a 10s undo. */
  async reschedule(
    ref: TaskRef,
    date: DayKey,
    emoji: DateEmoji = '📅',
    options?: EditOptions,
  ): Promise<boolean> {
    const parsed = parseTaskLine(ref.rawText);
    const oldDate = emoji === '📅' ? parsed?.due : parsed?.scheduled;
    const changed = await this.editLine(ref, (line) => rewriteDate(line, emoji, date), options);
    if (changed && !options?.silent) {
      this.noticeWithUndo(ref, emoji, date, oldDate);
    }
    return changed;
  }

  async clearDate(ref: TaskRef, emoji: DateEmoji = '📅'): Promise<boolean> {
    return this.editLine(ref, (line) => removeDateField(line, emoji));
  }

  async setPriority(ref: TaskRef, priority: Priority | null): Promise<boolean> {
    return this.editLine(ref, (line) => rewritePriority(line, priority));
  }

  async editDescription(ref: TaskRef, text: string): Promise<boolean> {
    return this.editLine(ref, (line) => rewriteDescription(line, text));
  }

  /**
   * Append `- [ ] body` to `targetPath` (default: today's daily note,
   * created from the daily template when missing). Returns the target path.
   */
  async quickAdd(body: string, targetPath?: string): Promise<string | null> {
    const settings = this.getSettings();
    const today = todayKey();
    const path = targetPath ?? dailyNotePath(settings, today);
    const file = await this.ensureFile(path, today);
    if (!file) {
      new Notice(`Runway: impossibile creare "${path}".`);
      return null;
    }
    const taskLine = `- [ ] ${body.trim()}`;
    await this.app.vault.process(file, (content) =>
      appendTaskLine(content, taskLine, settings.quickAddHeading),
    );
    return path;
  }

  private async ensureFile(path: string, today: DayKey): Promise<TFile | null> {
    const existing = this.app.vault.getFileByPath(path);
    if (existing) return existing;
    const settings = this.getSettings();
    const isDaily = path === dailyNotePath(settings, today);
    let content = '';
    if (isDaily) {
      content = applyDailyTemplate(
        await this.readDailyTemplate(),
        today,
        path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, ''),
      );
    }
    const slash = path.lastIndexOf('/');
    if (slash > 0) {
      const folder = path.slice(0, slash);
      if (this.app.vault.getFolderByPath(folder) === null) {
        await this.app.vault.createFolder(folder);
      }
    }
    try {
      return await this.app.vault.create(path, content);
    } catch {
      return this.app.vault.getFileByPath(path);
    }
  }

  private async readDailyTemplate(): Promise<string> {
    try {
      const raw = await this.app.vault.adapter.read(
        `${this.app.vault.configDir}/daily-notes.json`,
      );
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return '';
      const templatePath = (parsed as Record<string, unknown>).template;
      if (typeof templatePath !== 'string' || templatePath === '') return '';
      const file =
        this.app.vault.getFileByPath(templatePath) ??
        this.app.vault.getFileByPath(`${templatePath}.md`) ??
        this.app.metadataCache.getFirstLinkpathDest(templatePath, '');
      if (!file) return '';
      return await this.app.vault.cachedRead(file);
    } catch {
      return '';
    }
  }

  private async editLine(
    ref: TaskRef,
    transform: (line: string) => string,
    options?: EditOptions,
  ): Promise<boolean> {
    const file = this.app.vault.getFileByPath(ref.path);
    if (!file) {
      if (!options?.silent) new Notice('Runway: file non trovato.');
      return false;
    }
    let changed = false;
    await this.app.vault.process(file, (content) => {
      const result = applyLineEdit(content, ref, transform);
      changed = result.changed;
      return result.content;
    });
    if (!changed && !options?.silent) {
      new Notice('Runway: il task è cambiato nel frattempo — riprova.');
    }
    return changed;
  }

  /** Success Notice with a 10s "Annulla" that re-applies the old date through the same guards. */
  private noticeWithUndo(
    ref: TaskRef,
    emoji: DateEmoji,
    newDate: DayKey,
    oldDate: DayKey | undefined,
  ): void {
    const fragment = document.createDocumentFragment();
    fragment.createSpan({ text: `Runway: task spostato al ${newDate}. ` });
    if (oldDate === undefined) {
      new Notice(fragment, 10_000);
      return;
    }
    const undo = fragment.createEl('a', { text: 'Annulla' });
    const notice = new Notice(fragment, 10_000);
    undo.addEventListener('click', () => {
      notice.hide();
      const movedRef: TaskRef = { ...ref, rawText: rewriteDate(ref.rawText, emoji, newDate) };
      void this.reschedule(movedRef, oldDate, emoji, { silent: true }).then((ok) => {
        new Notice(
          ok ? `Runway: ripristinato al ${oldDate}.` : 'Runway: annullamento non riuscito.',
        );
      });
    });
  }
}
